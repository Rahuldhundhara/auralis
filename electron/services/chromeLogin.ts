import { app } from 'electron';
import { execFile, execFileSync, spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import type { SessionState } from '../../shared/types';
import { ytm } from './ytm';

/**
 * Opens a real Chrome window for Google sign-in, using a dedicated Chrome
 * profile that belongs to Auralis.
 *
 * The user's normal Chrome profile is never opened, copied or modified. Chrome
 * 136+ blocks remote debugging against the default Chrome data directory, and
 * its app-bound cookie encryption cannot be read outside that directory. A
 * dedicated, non-default data directory is explicitly supported by Chrome, so
 * Auralis can read only the YouTube cookies from its own login profile.
 *
 * Google rejects the account step with "This browser or app may not be secure"
 * when Chrome has a DevTools port open. The sign-in window therefore runs as a
 * plain Chrome instance. Auralis watches the window title until Google's
 * redirect lands on YouTube Music, closes that Chrome, then starts a short
 * headless Chrome on the same profile only to read the stored cookies through
 * CDP. Google never sees a debuggable browser during the sign-in itself.
 *
 * The user signs in on Google's real page; Auralis never sees the password.
 */

const AUTH_COOKIE_NAMES = ['SAPISID', '__Secure-3PAPISID', '__Secure-1PAPISID', 'SID'];
const LOGIN_TIMEOUT_MS = 5 * 60_000;
const TITLE_POLL_MS = 1000;

const CHROME_EXECUTABLES = [
  path.join(process.env.PROGRAMFILES || 'C:\\Program Files', 'Google', 'Chrome', 'Application', 'chrome.exe'),
  path.join(
    process.env['PROGRAMFILES(X86)'] || 'C:\\Program Files (x86)',
    'Google',
    'Chrome',
    'Application',
    'chrome.exe',
  ),
  path.join(process.env.LOCALAPPDATA || '', 'Google', 'Chrome', 'Application', 'chrome.exe'),
];

interface CdpCookie {
  name?: string;
  value?: string;
  domain?: string;
}

interface ActiveLogin {
  /** Current Chrome process: the sign-in window, then the cookie reader. */
  child: ChildProcess;
  profile: string;
  cancelled: boolean;
  /** True when Chrome could not be started at all. */
  failed: boolean;
  promise: Promise<SessionState>;
}

let active: ActiveLogin | null = null;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function findChrome(): string | null {
  return CHROME_EXECUTABLES.find((candidate) => fs.existsSync(candidate)) || null;
}

export function chromeLoginProfileDir(): string {
  return path.join(app.getPath('userData'), 'chrome-login');
}

function chromeUserDataDir(): string {
  return path.join(process.env.LOCALAPPDATA || '', 'Google', 'Chrome', 'User Data');
}

function readJson(file: string): any {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

/** Reads only the signed-in account hint from Chrome's profile metadata. */
function chromeAccountHint(): string | undefined {
  try {
    const state = readJson(path.join(chromeUserDataDir(), 'Local State'));
    const info = state?.profile?.info_cache;
    if (!info || typeof info !== 'object') return undefined;
    const lastUsed = typeof state?.profile?.last_used === 'string' ? state.profile.last_used : '';
    const candidates = [
      lastUsed ? info[lastUsed]?.user_name : undefined,
      ...Object.values(info).map((entry: any) => entry?.user_name),
    ];
    const email = candidates.find(
      (value): value is string => typeof value === 'string' && /^[^@\s]+@[^@\s]+$/.test(value),
    );
    return email;
  } catch {
    return undefined;
  }
}

function loginUrl(): string {
  // QA fixture: lets the mechanics probe open the post-login page directly
  // with disposable fake cookies. Only that one URL is accepted.
  if (process.env.AURALIS_QA_LOGIN_URL === 'https://music.youtube.com/') {
    return 'https://music.youtube.com/';
  }
  const url = new URL('https://accounts.google.com/ServiceLogin');
  url.searchParams.set('service', 'youtube');
  url.searchParams.set('continue', 'https://music.youtube.com/');
  url.searchParams.set('flowName', 'GlifWebSignIn');
  const email = chromeAccountHint();
  if (email) url.searchParams.set('login_hint', email);
  return url.toString();
}

function hasExited(child: ChildProcess): boolean {
  return child.exitCode !== null || child.signalCode !== null;
}

function waitForExit(child: ChildProcess, timeoutMs: number): Promise<boolean> {
  if (hasExited(child)) return Promise.resolve(true);
  return new Promise<boolean>((resolve) => {
    let settled = false;
    const finish = (value: boolean) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      child.off('exit', onExit);
      resolve(value);
    };
    const timer = setTimeout(() => finish(false), timeoutMs);
    const onExit = () => finish(true);
    child.once('exit', onExit);
  });
}

/** Reads the current tab title of the sign-in Chrome window. */
function chromeWindowTitle(pid: number): Promise<string> {
  return new Promise((resolve) => {
    execFile(
      'tasklist',
      ['/FI', `PID eq ${pid}`, '/V', '/FO', 'CSV', '/NH'],
      { windowsHide: true, timeout: 5000 },
      (error, stdout) => resolve(error ? '' : String(stdout)),
    );
  });
}

async function waitForYoutubeMusic(
  entry: ActiveLogin,
  child: ChildProcess,
  deadline: number,
): Promise<'signed-in' | 'closed' | 'timeout'> {
  while (Date.now() < deadline) {
    if (entry.cancelled || entry.failed || hasExited(child)) return 'closed';
    if (child.pid) {
      const output = await chromeWindowTitle(child.pid);
      if (/YouTube Music/i.test(output)) return 'signed-in';
    }
    await delay(TITLE_POLL_MS);
  }
  return 'timeout';
}

async function waitForDevTools(profile: string, child: ChildProcess, timeoutMs: number): Promise<number> {
  const file = path.join(profile, 'DevToolsActivePort');
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (hasExited(child)) {
      throw new Error('Chrome closed before the cookie reader opened.');
    }
    try {
      const port = Number(fs.readFileSync(file, 'utf8').split('\n')[0]);
      if (port > 0) return port;
    } catch {
      // Chrome has not written the port file yet.
    }
    await delay(150);
  }
  throw new Error('Google Chrome did not open the cookie reader.');
}

async function devToolsVersion(port: number): Promise<any> {
  const response = await fetch(`http://127.0.0.1:${port}/json/version`);
  if (!response.ok) throw new Error('Chrome DevTools is not ready.');
  return response.json();
}

function readCookies(webSocketDebuggerUrl: string): Promise<CdpCookie[]> {
  return new Promise<CdpCookie[]>((resolve, reject) => {
    const socket = new WebSocket(webSocketDebuggerUrl);
    let settled = false;
    const timer = setTimeout(() => finish(new Error('Chrome DevTools timed out.')), 10_000);
    const finish = (error?: unknown, cookies?: CdpCookie[]) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        socket.close();
      } catch {
        // Already closed.
      }
      if (error) reject(error instanceof Error ? error : new Error(String(error)));
      else resolve(cookies || []);
    };
    socket.onopen = () => {
      try {
        socket.send(JSON.stringify({ id: 1, method: 'Storage.getCookies', params: {} }));
      } catch (error) {
        finish(error);
      }
    };
    socket.onmessage = (event) => {
      try {
        const message = JSON.parse(String(event.data));
        if (message?.id !== 1) return;
        if (message.error) finish(new Error(message.error.message || 'Chrome DevTools error.'));
        else finish(undefined, Array.isArray(message.result?.cookies) ? message.result.cookies : []);
      } catch {
        // Ignore malformed events; the timeout handles a dead connection.
      }
    };
    socket.onerror = () => finish(new Error('Could not read cookies from Chrome.'));
  });
}

async function gracefulClose(port: number): Promise<void> {
  try {
    const version = await devToolsVersion(port);
    if (!version?.webSocketDebuggerUrl) return;
    await new Promise<void>((resolve) => {
      const socket = new WebSocket(version.webSocketDebuggerUrl);
      const timer = setTimeout(() => {
        try {
          socket.close();
        } catch {
          // Ignore.
        }
        resolve();
      }, 1500);
      socket.onopen = () => {
        try {
          socket.send(JSON.stringify({ id: 1, method: 'Browser.close', params: {} }));
        } catch {
          // Fall through to the taskkill fallback.
        }
      };
      socket.onmessage = () => {
        clearTimeout(timer);
        try {
          socket.close();
        } catch {
          // Ignore.
        }
        resolve();
      };
      socket.onerror = () => {
        clearTimeout(timer);
        resolve();
      };
    });
  } catch {
    // Fall through to taskkill.
  }
}

function taskkill(args: string[]): Promise<void> {
  return new Promise((resolve) => {
    execFile('taskkill', args, { windowsHide: true, timeout: 10000 }, () => resolve());
  });
}

/**
 * Force-closes a Chrome process tree. Used for the short-lived cookie reader
 * and for cancellation, where no further writes are expected.
 */
async function closeChrome(child: ChildProcess, port?: number): Promise<void> {
  if (hasExited(child)) return;
  if (port) await gracefulClose(port);
  await delay(350);
  if (!hasExited(child) && child.pid) {
    await taskkill(['/PID', String(child.pid), '/T', '/F']);
  }
}

/**
 * Closes the sign-in window without /F first, so Chrome flushes its cookie
 * database to disk. Force-kills only if the window refuses to close.
 */
async function closeLoginChrome(child: ChildProcess): Promise<void> {
  if (hasExited(child) || !child.pid) return;
  await taskkill(['/PID', String(child.pid)]);
  if (await waitForExit(child, 5000)) {
    await delay(400);
    return;
  }
  await taskkill(['/PID', String(child.pid), '/T', '/F']);
  await waitForExit(child, 3000);
}

function clearSingletonFiles(profile: string): void {
  fs.rmSync(path.join(profile, 'DevToolsActivePort'), { force: true });
  for (const lock of ['SingletonLock', 'SingletonCookie', 'SingletonSocket']) {
    fs.rmSync(path.join(profile, lock), { force: true });
  }
}

function spawnHeadless(chrome: string, profile: string): ChildProcess {
  clearSingletonFiles(profile);
  return spawn(
    chrome,
    [
      `--user-data-dir=${profile}`,
      '--profile-directory=Default',
      '--remote-debugging-port=0',
      '--headless=new',
      '--no-first-run',
      '--no-default-browser-check',
      '--noerrdialogs',
      '--disable-session-crashed-bubble',
      'about:blank',
    ],
    { stdio: 'ignore', windowsHide: true },
  );
}

/**
 * Reads the cookies stored in the dedicated profile after the sign-in window
 * has closed. This is the only part that uses CDP, and it never loads a Google
 * page.
 */
async function cookiesFromProfile(entry: ActiveLogin, chrome: string, profile: string): Promise<CdpCookie[]> {
  const child = spawnHeadless(chrome, profile);
  entry.child = child;
  let port: number | undefined;
  try {
    port = await waitForDevTools(profile, child, 15_000);
    const version = await devToolsVersion(port);
    return version?.webSocketDebuggerUrl ? await readCookies(version.webSocketDebuggerUrl) : [];
  } catch {
    return [];
  } finally {
    if (port) await gracefulClose(port);
    await closeChrome(child);
  }
}

function authValues(cookies: CdpCookie[]): Map<string, string> {
  const values = new Map<string, string>();
  for (const cookie of cookies) {
    if (!cookie?.name || !cookie?.value) continue;
    if (!String(cookie.domain || '').includes('youtube.com')) continue;
    values.set(cookie.name, cookie.value);
  }
  return values;
}

function hasAuthCookies(values: Map<string, string>): boolean {
  return AUTH_COOKIE_NAMES.some((name) => values.has(name));
}

async function runLogin(entry: ActiveLogin, chrome: string, child: ChildProcess, profile: string): Promise<SessionState> {
  const deadline = Date.now() + LOGIN_TIMEOUT_MS;
  try {
    const outcome = await waitForYoutubeMusic(entry, child, deadline);
    if (entry.cancelled) return ytm.session();

    // Google's redirect can land a fraction before the cookie store is flushed.
    if (outcome === 'signed-in') await delay(1500);
    await closeLoginChrome(child);
    if (entry.cancelled) return ytm.session();

    const cookies = await cookiesFromProfile(entry, chrome, profile);
    const values = authValues(cookies);
    if (hasAuthCookies(values)) {
      const cookie = [...values.entries()].map(([name, value]) => `${name}=${value}`).join('; ');
      const state = await ytm.setCookies(cookie);
      if (state.hasCookies) return state;
    }
    return ytm.session();
  } finally {
    await closeLoginChrome(child);
  }
}

export function openChromeLogin(): Promise<SessionState> {
  if (active) return active.promise;
  const chrome = findChrome();
  if (!chrome) return Promise.reject(new Error('Google Chrome is not installed.'));
  const profile = chromeLoginProfileDir();
  fs.mkdirSync(profile, { recursive: true });
  clearSingletonFiles(profile);

  const child = spawn(
    chrome,
    [
      `--user-data-dir=${profile}`,
      '--profile-directory=Default',
      '--no-first-run',
      '--no-default-browser-check',
      '--noerrdialogs',
      '--disable-session-crashed-bubble',
      '--disable-background-mode',
      '--window-size=760,840',
      '--new-window',
      loginUrl(),
    ],
    // Must stay visible: windowsHide makes Chrome create its window hidden,
    // which blocks the user from signing in at all.
    { stdio: 'ignore', windowsHide: false },
  );
  const entry: ActiveLogin = {
    child,
    profile,
    cancelled: false,
    failed: false,
    promise: Promise.resolve(ytm.session()),
  };
  child.once('error', () => {
    entry.failed = true;
  });
  active = entry;
  entry.promise = (async () => {
    try {
      return await runLogin(entry, chrome, child, profile);
    } catch (error) {
      console.warn('[auralis] Chrome sign-in failed', error);
      return ytm.session();
    } finally {
      if (active === entry) {
        await closeChrome(entry.child);
        active = null;
      }
    }
  })();
  return entry.promise;
}

export async function cancelChromeLogin(): Promise<void> {
  const entry = active;
  if (!entry) return;
  entry.cancelled = true;
  await closeChrome(entry.child);
  await entry.promise.catch(() => {});
}

/**
 * Clears the dedicated sign-in profile (never the user's Chrome data).
 * Called on sign-out so reopening the sign-in window does not silently
 * restore the previous account.
 */
export async function clearChromeLoginProfile(): Promise<void> {
  await cancelChromeLogin();
  const profile = chromeLoginProfileDir();
  const userData = app.getPath('userData');
  if (!profile.startsWith(userData) || path.basename(profile) !== 'chrome-login') return;
  for (let attempt = 0; attempt < 6; attempt++) {
    try {
      fs.rmSync(profile, { recursive: true, force: true });
    } catch {
      // Chrome may still be releasing the profile; retry briefly.
    }
    if (!fs.existsSync(profile)) return;
    await delay(250);
  }
}

/**
 * Synchronous best effort used during app shutdown: the async cancel path
 * cannot finish once Electron is already exiting, and an orphan Chrome window
 * would keep the dedicated profile locked.
 */
export function disposeChromeLogin(): void {
  const entry = active;
  if (!entry) return;
  active = null;
  entry.cancelled = true;
  try {
    entry.child.kill();
  } catch {
    // Already gone.
  }
  if (entry.child.pid && !hasExited(entry.child)) {
    try {
      execFileSync('taskkill', ['/PID', String(entry.child.pid), '/T', '/F'], {
        windowsHide: true,
        stdio: 'ignore',
      });
    } catch {
      // Already gone.
    }
  }
}
