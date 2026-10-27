import { nativeBridge } from './store';

const originalFetch = window.fetch.bind(window);
let installed = false;

function absolute(input: RequestInfo | URL): string {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.toString();
  return input.url;
}

function headersToObject(headers?: HeadersInit): Record<string, string> {
  const out: Record<string, string> = {};
  if (!headers) return out;
  new Headers(headers).forEach((value, key) => {
    out[key] = value;
  });
  return out;
}

function bodyToText(body: BodyInit | null | undefined): string | undefined {
  if (body == null) return undefined;
  if (typeof body === 'string') return body;
  if (body instanceof URLSearchParams) return body.toString();
  if (body instanceof ArrayBuffer) {
    return new TextDecoder().decode(new Uint8Array(body));
  }
  if (ArrayBuffer.isView(body)) {
    return new TextDecoder().decode(new Uint8Array(body.buffer, body.byteOffset, body.byteLength));
  }
  throw new Error('The Android network bridge only supports text request bodies.');
}

function isLocalOrigin(url: URL): boolean {
  return url.origin === location.origin || url.hostname === '127.0.0.1' || url.hostname === 'localhost';
}

/**
 * Remote fetches are sent through the native OkHttp proxy. This is what makes
 * the desktop Innertube code work inside a WebView without CORS problems.
 */
export function installFetchProxy() {
  if (installed) return;
  installed = true;
  window.fetch = (async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const urlText = absolute(input);
    let url: URL;
    try {
      url = new URL(urlText, location.href);
    } catch {
      return originalFetch(input as RequestInfo, init);
    }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return originalFetch(input as RequestInfo, init);
    }
    if (isLocalOrigin(url)) {
      return originalFetch(input as RequestInfo, init);
    }

    const request = input instanceof Request ? input : null;
    const method = (init.method || request?.method || 'GET').toUpperCase();
    const headers = new Headers(init.headers || request?.headers);
    let body = bodyToText(init.body);
    if (body === undefined && request && method !== 'GET' && method !== 'HEAD') {
      try {
        body = await request.clone().text();
      } catch {
        body = undefined;
      }
    }
    if (body !== undefined && !headers.has('content-type')) {
      headers.set('content-type', 'application/json');
    }

    const payload = JSON.stringify({
      url: url.toString(),
      method,
      headers: headersToObject(headers),
      body: body || '',
    });
    const response = await originalFetch('/__fetch', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: payload,
      signal: init.signal,
    });
    const bytes = await response.arrayBuffer();
    const responseHeaders = new Headers(response.headers);
    const responseBody =
      response.status === 204 || response.status === 205 || response.status === 304 ? null : bytes;
    return new Response(responseBody, {
      status: response.status,
      statusText: response.statusText,
      headers: responseHeaders,
    });
  }) as typeof window.fetch;
}

export async function nativeJson<T>(path: string, payload: unknown = {}): Promise<T> {
  const response = await originalFetch(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const text = await response.text();
  if (!response.ok) throw new Error(text || `Request failed (${response.status})`);
  return (text ? JSON.parse(text) : {}) as T;
}

export async function nativeJsonGet<T>(path: string): Promise<T> {
  const response = await originalFetch(path, { method: 'GET' });
  const text = await response.text();
  if (!response.ok) throw new Error(text || `Request failed (${response.status})`);
  return (text ? JSON.parse(text) : {}) as T;
}

export function base64Url(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  for (let index = 0; index < bytes.length; index += 1) {
    binary += String.fromCharCode(bytes[index]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function mediaUrl(remote: string): string {
  return `/media?u=${base64Url(remote)}`;
}

export function localMediaUrl(path: string): string {
  return `/local?p=${encodeURIComponent(path)}`;
}

export function hasNativeBridge(): boolean {
  return Boolean(nativeBridge());
}

/** Reads an app-private or app-external audio file as an ArrayBuffer. */
export async function readLocalFile(path: string): Promise<ArrayBuffer> {
  const response = await originalFetch(localMediaUrl(path));
  if (!response.ok) throw new Error(`Could not read ${path}.`);
  return response.arrayBuffer();
}

/** Removes a file from one of the app's allowed directories. */
export async function deleteLocalFile(path: string): Promise<void> {
  if (!path) return;
  try {
    await nativeJson('/__native/delete', { path });
  } catch {
    // Deleting a file is best-effort.
  }
}