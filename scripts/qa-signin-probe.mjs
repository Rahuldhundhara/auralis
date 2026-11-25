import { _electron as electron } from 'playwright-core';
import { execFile, execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitFor(fn, timeoutMs, intervalMs = 500) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const value = await fn();
    if (value) return value;
    await sleep(intervalMs);
  }
  return null;
}

const chromeExe = [
  path.join(process.env.PROGRAMFILES || 'C:\\Program Files', 'Google', 'Chrome', 'Application', 'chrome.exe'),
  path.join(process.env['PROGRAMFILES(X86)'] || 'C:\\Program Files (x86)', 'Google', 'Chrome', 'Application', 'chrome.exe'),
  path.join(process.env.LOCALAPPDATA || '', 'Google', 'Chrome', 'Application', 'chrome.exe'),
].find((candidate) => fs.existsSync(candidate));

if (!chromeExe) {
  console.error('[FAIL] Google Chrome is not installed');
  process.exit(1);
}

/** Lists the browser process of Auralis's dedicated Chrome login profile. */
function chromeLoginProcess(profileDir) {
  return new Promise((resolve) => {
    execFile(
      'powershell.exe',
      [
        '-NoProfile',
        '-Command',
        "Get-CimInstance Win32_Process -Filter \"Name='chrome.exe'\" | Where-Object { $_.CommandLine -like '*chrome-login*' -and $_.CommandLine -notlike '*--type=*' -and $_.CommandLine -notlike '*--headless*' } | Select-Object ProcessId,CommandLine | ConvertTo-Json -Compress",
      ],
      { windowsHide: true, timeout: 15000 },
      (error, stdout) => {
        if (error) return resolve([]);
        const text = String(stdout || '').trim();
        if (!text) return resolve([]);
        try {
          const parsed = JSON.parse(text);
          const items = Array.isArray(parsed) ? parsed : [parsed];
          const needle = profileDir.toLowerCase().replace(/\//g, '\\');
          resolve(items.filter((item) => String(item.CommandLine || '').toLowerCase().replace(/\//g, '\\').includes(needle)));
        } catch {
          resolve([]);
        }
      },
    );
  });
}

function chromeTitle(pid) {
  try {
    const output = execFileSync(
      'tasklist',
      ['/FI', `PID eq ${pid}`, '/V', '/FO', 'CSV', '/NH'],
      { encoding: 'utf8', windowsHide: true, timeout: 5000 },
    ).trim();
    const match = /,"([^"]*)"\s*$/.exec(output);
    return match ? match[1] : '';
  } catch {
    return '';
  }
}

function processAlive(pid) {
  try {
    const output = execFileSync(
      'tasklist',
      ['/FI', `PID eq ${pid}`, '/FO', 'CSV', '/NH'],
      { encoding: 'utf8', windowsHide: true, timeout: 5000 },
    );
    return output.includes(String(pid));
  } catch {
    return false;
  }
}

function killChrome(pid, force = false) {
  const args = force ? ['/PID', String(pid), '/T', '/F'] : ['/PID', String(pid)];
  try {
    execFileSync('taskkill', args, { windowsHide: true, timeout: 10000, stdio: 'ignore' });
  } catch {
    // Already gone.
  }
}

const helperScript = path.join(process.env.TEMP || '.', `auralis-window-shot-${process.pid}.ps1`);
fs.writeFileSync(
  helperScript,
  String.raw`
param([int]$PidArg, [string]$OutPath = '')
Add-Type -AssemblyName System.Drawing
$src = @"
using System;
using System.Text;
using System.Runtime.InteropServices;
public class WinCap {
  public delegate bool EnumProc(IntPtr hWnd, IntPtr lParam);
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc cb, IntPtr p);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hWnd);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetWindowText(IntPtr hWnd, StringBuilder s, int n);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint pid);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out RECT r);
  [DllImport("user32.dll")] public static extern bool PrintWindow(IntPtr hWnd, IntPtr hdc, uint flags);
  public struct RECT { public int Left, Top, Right, Bottom; }
}
"@
Add-Type -TypeDefinition $src
$script:hwnd = [IntPtr]::Zero
$script:title = ''
[WinCap]::EnumWindows({ param($h,$l)
  $sb = New-Object System.Text.StringBuilder 512
  [void][WinCap]::GetWindowText($h, $sb, 512)
  $p = 0
  [void][WinCap]::GetWindowThreadProcessId($h, [ref]$p)
  if ($p -eq $PidArg -and $sb.Length -gt 0 -and [WinCap]::IsWindowVisible($h)) {
    $script:hwnd = $h; $script:title = $sb.ToString()
  }
  return $true
}, [IntPtr]::Zero) | Out-Null
if ($script:hwnd -eq [IntPtr]::Zero) { '{"visible":false}' ; exit 0 }
$rect = New-Object WinCap+RECT
[void][WinCap]::GetWindowRect($script:hwnd, [ref]$rect)
$w = $rect.Right - $rect.Left; $hgt = $rect.Bottom - $rect.Top
$printed = $false
if ($OutPath -ne '' -and $w -gt 0 -and $hgt -gt 0) {
  $bmp = New-Object System.Drawing.Bitmap($w, $hgt)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $hdc = $g.GetHdc()
  $printed = [WinCap]::PrintWindow($script:hwnd, $hdc, 2)
  $g.ReleaseHdc($hdc); $g.Dispose()
  if ($printed) { $bmp.Save($OutPath, [System.Drawing.Imaging.ImageFormat]::Png) }
  $bmp.Dispose()
}
@{ visible=$true; title=$script:title; width=$w; height=$hgt; printed=$printed } | ConvertTo-Json -Compress
`,
  'utf8',
);

function windowState(pid, screenshotPath) {
  const args = ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', helperScript, '-PidArg', String(pid)];
  if (screenshotPath) args.push('-OutPath', screenshotPath);
  try {
    return JSON.parse(
      execFileSync('powershell.exe', args, { encoding: 'utf8', windowsHide: true, timeout: 20000 }).trim(),
    );
  } catch {
    return { visible: false };
  }
}

function cdpCall(wsUrl, method, params = {}, timeoutMs = 15000) {
  return new Promise((resolve) => {
    const socket = new WebSocket(wsUrl);
    const timer = setTimeout(() => {
      try {
        socket.close();
      } catch {
        // Already closed.
      }
      resolve(null);
    }, timeoutMs);
    socket.onopen = () => socket.send(JSON.stringify({ id: 1, method, params }));
    socket.onmessage = (event) => {
      try {
        const message = JSON.parse(String(event.data));
        if (message?.id !== 1) return;
        clearTimeout(timer);
        resolve(message.error ? null : message.result || {});
        socket.close();
      } catch {
        // Ignore malformed events.
      }
    };
    socket.onerror = () => {
      clearTimeout(timer);
      resolve(null);
    };
  });
}

/**
 * Seeds disposable, persistent fake auth cookies into the dedicated Chrome
 * profile. The mechanics probe only checks cookie capture and adoption; these
 * values cannot sign in to a real Google account.
 */
async function seedFakeCookies(profileDir) {
  fs.mkdirSync(profileDir, { recursive: true });
  const portFile = path.join(profileDir, 'DevToolsActivePort');
  fs.rmSync(portFile, { force: true });
  for (const lock of ['SingletonLock', 'SingletonCookie', 'SingletonSocket']) {
    fs.rmSync(path.join(profileDir, lock), { force: true });
  }
  const child = spawn(
    chromeExe,
    [
      `--user-data-dir=${profileDir}`,
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
  let port = 0;
  for (let i = 0; i < 200; i++) {
    try {
      port = Number(fs.readFileSync(portFile, 'utf8').split('\n')[0]);
      if (port) break;
    } catch {
      // Chrome is still starting.
    }
    await sleep(100);
  }
  if (!port) {
    killChrome(child.pid, true);
    throw new Error('headless Chrome did not expose DevTools while seeding cookies');
  }
  const version = await fetch(`http://127.0.0.1:${port}/json/version`).then((response) => response.json());
  const targets = await fetch(`http://127.0.0.1:${port}/json/list`).then((response) => response.json());
  const page = (Array.isArray(targets) ? targets : []).find((target) => target.type === 'page');
  if (!page?.webSocketDebuggerUrl) throw new Error('headless Chrome has no page target');
  const expires = Math.floor(Date.now() / 1000) + 3600;
  for (const [name, value] of [
    ['SID', 'qa-fake-sid'],
    ['SAPISID', 'qa-fake-sapisid'],
    ['__Secure-3PAPISID', 'qa-fake-3papisid'],
  ]) {
    const result = await cdpCall(page.webSocketDebuggerUrl, 'Network.setCookie', {
      name,
      value,
      url: 'https://music.youtube.com/',
      path: '/',
      secure: true,
      httpOnly: true,
      expires,
    });
    if (!result?.success) throw new Error(`could not seed fake cookie ${name}`);
  }
  await cdpCall(version.webSocketDebuggerUrl, 'Browser.close', {}, 4000);
  await waitFor(() => !processAlive(child.pid), 10000, 200);
  killChrome(child.pid, true);
}

function launchApp(userDataDir, extraEnv = {}) {
  const packagedExe = process.env.AURALIS_PACKAGED_EXE ? path.resolve(process.env.AURALIS_PACKAGED_EXE) : null;
  const launch = {
    cwd: process.cwd(),
    env: { ...process.env, AURALIS_FORCE_PROD: '1', AURALIS_SKIP_LOGIN: '1', ...extraEnv },
    timeout: 60000,
    args: [`--user-data-dir=${userDataDir}`],
  };
  if (packagedExe) launch.executablePath = packagedExe;
  else launch.args = ['.', `--user-data-dir=${userDataDir}`];
  return electron.launch(launch);
}

async function closeApp(app) {
  await app.close().catch(() => {});
  try {
    app.process().kill();
  } catch {
    // Already exited.
  }
  await sleep(1200);
}

fs.mkdirSync('qa/signin', { recursive: true });

const userDataDir = path.join(process.env.TEMP || '.', `auralis-signin-probe-${Date.now()}`);
fs.mkdirSync(userDataDir, { recursive: true });
const loginProfile = path.join(userDataDir, 'chrome-login');

const issues = [];
const normalise = (value) => (value || '').replace(/\s+/g, ' ').trim();

let app = await launchApp(userDataDir);

try {
  let page = await app.firstWindow({ timeout: 60000 });
  page.on('pageerror', (error) => issues.push(`[pageerror] ${error.message}`));
  await page.waitForSelector('.app-shell', { timeout: 60000 });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.waitForTimeout(1200);

  // 1. Discoverable account entry.
  const card = page.locator('.sidebar-account');
  await card.waitFor({ state: 'visible', timeout: 15000 });
  const cardText = normalise(await card.innerText());
  console.log('[sidebar card]', JSON.stringify(cardText));
  if (!/sign in/i.test(cardText)) issues.push('[sidebar] signed-out card does not say "Sign in"');
  if (!/connect your account/i.test(cardText)) issues.push('[sidebar] signed-out card missing helper copy');
  await page.screenshot({ path: 'qa/signin/01-sidebar-signed-out.png' });

  // 2. Minimum supported window: no horizontal overflow, card still visible.
  await page.setViewportSize({ width: 1024, height: 680 });
  await page.waitForTimeout(600);
  const layout = await page.evaluate(() => {
    const node = document.documentElement;
    return {
      innerWidth: window.innerWidth,
      scrollWidth: node.scrollWidth,
      card: (() => {
        const el = document.querySelector('.sidebar-account');
        if (!el) return null;
        const box = el.getBoundingClientRect();
        return { x: box.x, y: box.y, width: box.width, height: box.height };
      })(),
    };
  });
  console.log('[layout 1024x680]', JSON.stringify(layout));
  if (layout.scrollWidth > layout.innerWidth + 1) issues.push('[layout] horizontal overflow at 1024x680');
  if (!layout.card || layout.card.width < 40 || layout.card.height < 20) issues.push('[layout] account card collapsed at 1024x680');
  await page.screenshot({ path: 'qa/signin/02-sidebar-1024x680.png' });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.waitForTimeout(400);

  // 3. Clicking the card lands on Settings -> Account.
  await card.click();
  await page.waitForSelector('.settings-page', { timeout: 15000 });
  await page.waitForTimeout(700);
  const activeTab = normalise(await page.locator('.settings-nav-item.is-active').innerText());
  console.log('[active settings tab]', JSON.stringify(activeTab));
  if (!/account/i.test(activeTab)) issues.push(`[nav] sidebar card opened ${activeTab || 'no'} tab instead of Account`);
  const signIn = page.getByRole('button', { name: /Sign in with Google/i });
  if (!(await signIn.count())) issues.push('[account] Sign in with Google button missing');
  await page.screenshot({ path: 'qa/signin/03-account-tab.png' });

  // 4. Sign in opens a visible, plain Chrome window with no DevTools port.
  //    Google rejects account sign-in when Chrome is started with a debug port.
  await signIn.first().click();
  const loginProcess = await waitFor(async () => {
    const processes = await chromeLoginProcess(loginProfile);
    return processes[0] || null;
  }, 30000, 250);

  if (!loginProcess) {
    issues.push('[login] a real Chrome sign-in window did not open');
  } else {
    const command = String(loginProcess.CommandLine || '');
    const pid = Number(loginProcess.ProcessId);
    console.log('[chrome login]', JSON.stringify({ pid, command: command.slice(0, 500) }));
    if (!/accounts\.google\.com/i.test(command)) issues.push('[login] Chrome did not open the Google sign-in URL');
    if (!/--user-data-dir=.*chrome-login/i.test(command)) issues.push('[login] Chrome is not using the dedicated Auralis profile');
    if (/--user-data-dir=.*Google[\\/]+Chrome[\\/]+User Data/i.test(command)) {
      issues.push('[login] Chrome was pointed at the real Chrome profile');
    }
    if (/--remote-debugging-port/i.test(command)) {
      issues.push('[login] Chrome sign-in window has a DevTools port; Google will reject it');
    }
    if (/--headless/i.test(command)) issues.push('[login] sign-in window is headless; the user cannot sign in');

    // The visible window is the whole point: Google's page must render to the
    // user. Read its title from Win32 and prove it is a real visible window.
    let title = '';
    let state = { visible: false };
    const titleDeadline = Date.now() + 20000;
    while (Date.now() < titleDeadline) {
      title = chromeTitle(pid);
      if (/YouTube|Google/i.test(title) && !/^N\/A$/i.test(title)) {
        state = windowState(pid);
        if (state.visible) break;
      }
      await sleep(500);
    }
    console.log('[login title]', JSON.stringify(title), 'window', JSON.stringify(state));
    if (!state.visible) issues.push('[login] Chrome sign-in window is not visible to the user');
    if (!/YouTube|Google/i.test(title)) issues.push('[login] Chrome did not show the Google/YouTube sign-in page');
    if (/couldn.t sign you in|may not be secure|rejected/i.test(title)) {
      issues.push(`[login] Google rejected the browser: ${title}`);
    }
    if (title && !state.visible) {
      // windowsHide:true produces exactly this: a title in the process list
      // but no visible window.
      issues.push('[login] Chrome window exists but is hidden (windowsHide regression)');
    }

    windowState(pid, 'qa/signin/04-chrome-window.png');

    // 5. Closing the Chrome window without signing in cancels cleanly.
    killChrome(pid);
    const chromeClosed = await waitFor(() => !processAlive(pid), 15000, 250);
    if (!chromeClosed) {
      issues.push('[cancel] Chrome sign-in window did not close gracefully');
      killChrome(pid, true);
    }
  }

  const cancelNote = page.getByText(/Sign-in window closed before completing/i);
  await cancelNote.waitFor({ state: 'visible', timeout: 20000 }).catch(() => {});
  if (!(await cancelNote.count())) issues.push('[cancel] no toast after closing the Chrome sign-in window');
  await page.screenshot({ path: 'qa/signin/05-signin-cancelled.png' });
  await page.waitForTimeout(800);
  const afterCancel = normalise(await page.locator('.sidebar-account').innerText());
  if (!/sign in/i.test(afterCancel)) issues.push('[cancel] sidebar did not return to the signed-out state');

  // 6. Advanced cookie paste path stays reachable.
  const paste = page.getByRole('button', { name: /^Paste cookies$/i });
  if (await paste.count()) {
    await paste.first().click();
    await page.waitForSelector('.cookie-dialog', { timeout: 10000 });
    await page.locator('.cookie-dialog summary').click();
    await page.waitForSelector('.cookie-dialog textarea', { timeout: 10000 });
    await page.screenshot({ path: 'qa/signin/06-cookie-dialog.png' });
    await page.getByRole('button', { name: /^Cancel$/i }).click();
    await page.waitForTimeout(300);
  } else {
    issues.push('[account] Paste cookies button missing');
  }

  // 7. Sign-out clears the embedded login partition and the dedicated Chrome
  //    profile, so a later sign-in cannot silently reuse the old account.
  const seeded = await app.evaluate(async ({ session }) => {
    const loginSession = session.fromPartition('persist:auralis-login');
    await loginSession.cookies.set({
      url: 'https://music.youtube.com',
      name: 'AURALIS_QA_DUMMY',
      value: '1',
    });
    return (await loginSession.cookies.get({ name: 'AURALIS_QA_DUMMY' })).length;
  });
  if (!seeded) issues.push('[signout] could not seed a login-partition cookie');
  await page.evaluate(() => window.auralis.yt.clearSession());
  await page.waitForTimeout(500);
  const leftovers = await app.evaluate(async ({ session }) => {
    const cookies = await session.fromPartition('persist:auralis-login').cookies.get({});
    return cookies.map((cookie) => cookie.name);
  });
  if (leftovers.includes('AURALIS_QA_DUMMY')) issues.push('[signout] login-partition cookies survived sign out');
  const chromeProfileCleared = await waitFor(() => !fs.existsSync(loginProfile), 10000);
  if (!chromeProfileCleared) issues.push('[signout] dedicated Chrome login profile survived sign out');
  const afterSignOut = normalise(await page.locator('.sidebar-account').innerText());
  if (!/sign in/i.test(afterSignOut)) issues.push('[signout] app did not stay signed out');

  // 8. Mechanics probe with disposable fake cookies. This exercises the exact
  //    post-login path: title detection, graceful close, headless cookie read
  //    and app adoption. It cannot validate a real Google password/2FA login.
  await closeApp(app);
  app = null;

  await seedFakeCookies(loginProfile);
  app = await launchApp(userDataDir, { AURALIS_QA_LOGIN_URL: 'https://music.youtube.com/' });
  page = await app.firstWindow({ timeout: 60000 });
  page.on('pageerror', (error) => issues.push(`[pageerror] ${error.message}`));
  await page.waitForSelector('.app-shell', { timeout: 60000 });
  await page.waitForTimeout(1200);
  await page.locator('.sidebar-account').click();
  await page.waitForSelector('.settings-page', { timeout: 15000 });
  await page.waitForTimeout(500);
  await page.getByRole('button', { name: /Sign in with Google/i }).first().click();

  const mechanicsProcess = await waitFor(async () => {
    const processes = await chromeLoginProcess(loginProfile);
    return processes[0] || null;
  }, 20000, 200);
  if (!mechanicsProcess) {
    issues.push('[mechanics] Chrome did not open for the fake-cookie flow');
  } else {
    const command = String(mechanicsProcess.CommandLine || '');
    const pid = Number(mechanicsProcess.ProcessId);
    console.log('[mechanics chrome]', JSON.stringify({ pid, command: command.slice(0, 500) }));
    if (!/music\.youtube\.com/i.test(command)) issues.push('[mechanics] Chrome did not open the post-login page fixture');
    if (/--remote-debugging-port/i.test(command)) issues.push('[mechanics] visible Chrome has a DevTools port');
    if (/--headless/i.test(command)) issues.push('[mechanics] visible Chrome is headless');
    const mechanicWindow = windowState(pid);
    console.log('[mechanics window]', JSON.stringify(mechanicWindow));
    if (!mechanicWindow.visible) issues.push('[mechanics] visible Chrome window is hidden');
  }

  const successToast = page.getByText(/Signed in to YouTube Music/i);
  await successToast.waitFor({ state: 'visible', timeout: 60000 }).catch(() => {});
  if (!(await successToast.count())) issues.push('[mechanics] no success toast after cookie capture');
  const adopted = await page.evaluate(() => window.auralis.yt.session());
  console.log('[mechanics session]', JSON.stringify(adopted));
  if (!adopted?.hasCookies) issues.push('[mechanics] captured cookies were not adopted');
  const connected = normalise(await page.locator('.sidebar-account').innerText());
  console.log('[mechanics sidebar]', JSON.stringify(connected));
  if (!/youtube music connected/i.test(connected)) issues.push('[mechanics] sidebar did not switch to connected');
  await page.screenshot({ path: 'qa/signin/07-mechanics-signed-in.png' });

  const lingering = await chromeLoginProcess(loginProfile);
  if (lingering.length) issues.push('[mechanics] Chrome sign-in window stayed open after completion');

  await page.evaluate(() => window.auralis.yt.clearSession());
  await page.waitForTimeout(700);
  const clearedSession = await page.evaluate(() => window.auralis.yt.session());
  if (clearedSession?.hasCookies) issues.push('[mechanics] fake session survived sign out');
  const mechanicsProfileCleared = await waitFor(() => !fs.existsSync(loginProfile), 10000);
  if (!mechanicsProfileCleared) issues.push('[mechanics] dedicated Chrome profile survived sign-out');
} catch (error) {
  console.error('[FAIL]', error.message);
  issues.push(`[fail] ${error.message}`);
} finally {
  if (app) await closeApp(app);
  try {
    app?.process().kill();
  } catch {
    // Already exited.
  }
  fs.rmSync(userDataDir, { recursive: true, force: true });
  fs.rmSync(helperScript, { force: true });
}

console.log('[issues]', JSON.stringify(issues, null, 2));
process.exit(0);
