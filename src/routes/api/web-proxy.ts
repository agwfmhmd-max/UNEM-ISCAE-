import { createFileRoute } from "@tanstack/react-router";

const PROXY_PATH = "/api/web-proxy";
const COOKIE_PREFIX = "__unempx_";
const MAX_HTML_SIZE = 8 * 1024 * 1024;

function b64url(value: string): string {
  return Buffer.from(value, "utf8").toString("base64url");
}

function safeTarget(raw: string | null): URL | null {
  if (!raw) return null;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (!/^https?:$/.test(url.protocol)) return null;
  const host = url.hostname.toLowerCase();
  if (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host === "127.0.0.1" ||
    host === "::1" ||
    host === "0.0.0.0" ||
    host === "[::1]" ||
    /^10\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[0-1])\./.test(host) ||
    /^169\.254\./.test(host) ||
    host === "metadata.google.internal" ||
    host.endsWith(".internal")
  ) return null;
  return url;
}

function proxyUrl(target: URL): string {
  return `${PROXY_PATH}?url=${encodeURIComponent(target.href)}`;
}

function shouldProxyUrl(value: string): boolean {
  const v = value.trim();
  return !!v && !/^(?:#|data:|blob:|javascript:|mailto:|tel:|sms:|about:|chrome:|file:)/i.test(v);
}

function rewriteOne(value: string, base: URL): string {
  if (!shouldProxyUrl(value)) return value;
  try {
    const resolved = new URL(value, base);
    if (!/^https?:$/.test(resolved.protocol)) return value;
    return proxyUrl(resolved);
  } catch {
    return value;
  }
}

function rewriteSrcset(value: string, base: URL): string {
  return value.split(",").map((part) => {
    const m = part.trim().match(/^(\S+)(.*)$/);
    if (!m) return part;
    return `${rewriteOne(m[1], base)}${m[2]}`;
  }).join(", ");
}

function rewriteCssUrls(value: string, base: URL): string {
  return value.replace(/url\(\s*(["']?)([^"')]+)\1\s*\)/gi, (_m, quote, raw) => {
    return `url(${quote}${rewriteOne(raw, base)}${quote})`;
  });
}

function rewriteHtml(html: string, base: URL): string {
  let out = html.replace(/(<(?:a|area|link|script|img|iframe|frame|source|video|audio|track|object|embed|input|form|button|meta|image)\b[^>]*?)\s(href|src|action|poster|data|formaction|content)\s*=\s*(["'])(.*?)\3/gis,
    (_m, prefix, attr, quote, value) => {
      let next = value;
      if (attr.toLowerCase() === "content" && /^\s*\d+\s*;/i.test(value)) {
        next = value.replace(/^(\s*\d+\s*;\s*)(.*)$/is, (_x, delay, url) => `${delay}${rewriteOne(url, base)}`);
      } else {
        next = rewriteOne(value, base);
      }
      return `${prefix} ${attr}=${quote}${next}${quote}`;
    });

  out = out.replace(/\s(srcset|imagesrcset)\s*=\s*(["'])(.*?)\2/gis,
    (_m, attr, quote, value) => ` ${attr}=${quote}${rewriteSrcset(value, base)}${quote}`);
  out = out.replace(/\sstyle\s*=\s*(["'])(.*?)\1/gis,
    (_m, quote, value) => ` style=${quote}${rewriteCssUrls(value, base)}${quote}`);
  out = out.replace(/<style\b([^>]*)>([\s\S]*?)<\/style>/gi,
    (_m, attrs, css) => `<style${attrs}>${rewriteCssUrls(css, base)}</style>`);

  const bridge = `\n<script data-unem-proxy-bridge>(function(){\n` +
`const BASE=${JSON.stringify(base.href)};\n` +
`const PROXY=${JSON.stringify(PROXY_PATH)};\n` +
`function p(u){try{const x=new URL(u,BASE);return /^https?:$/.test(x.protocol)?PROXY+'?url='+encodeURIComponent(x.href):u}catch(e){return u}}\n` +
`const of=window.fetch;if(of)window.fetch=function(i,o){try{if(typeof i==='string'){i=p(i)}else if(i&&i.url){i=new Request(p(i.url),i)}}catch(e){}return of.call(this,i,o)};\n` +
`const xo=XMLHttpRequest.prototype.open;XMLHttpRequest.prototype.open=function(m,u,a,b,c){return xo.call(this,m,p(u),a,b,c)};\n` +
`const so=HTMLFormElement.prototype.submit;HTMLFormElement.prototype.submit=function(){try{this.action=p(this.action||BASE)}catch(e){}return so.call(this)};\n` +
`document.addEventListener('submit',function(e){try{const f=e.target;if(f&&f.action)f.action=p(f.action)}catch(x){}} ,true);\n` +
`document.addEventListener('click',function(e){try{const a=e.target.closest&&e.target.closest('a[href]');if(a){const h=a.getAttribute('href');if(h&&/^https?:/i.test(new URL(h,BASE).protocol)){a.setAttribute('href',p(h))}}}catch(x){}} ,true);\n` +
`const ow=window.open;window.open=function(u,n,s){return ow.call(window,p(u),n,s)};\n` +
`})();</script>`;

  if (/<\/body>/i.test(out)) out = out.replace(/<\/body>/i, bridge + "</body>");
  else out += bridge;
  return out;
}

function getCookieHeader(request: Request, host: string): string {
  const encodedHost = b64url(host);
  const prefix = `${COOKIE_PREFIX}${encodedHost}_`;
  const raw = request.headers.get("cookie") ?? "";
  return raw.split(";").map(x => x.trim()).filter(Boolean).map(pair => {
    const i = pair.indexOf("=");
    if (i < 1) return null;
    const name = pair.slice(0, i);
    const value = pair.slice(i + 1);
    if (!name.startsWith(prefix)) return null;
    try { return `${decodeURIComponent(name.slice(prefix.length))}=${value}`; } catch { return null; }
  }).filter(Boolean).join("; ");
}

function parseSetCookie(headers: Headers, host: string): string[] {
  const values = typeof (headers as Headers & { getSetCookie?: () => string[] }).getSetCookie === "function"
    ? (headers as Headers & { getSetCookie: () => string[] }).getSetCookie()
    : (headers.get("set-cookie") ? [headers.get("set-cookie") as string] : []);
  const encodedHost = b64url(host);
  return values.flatMap((line) => {
    const first = line.split(";", 1)[0];
    const i = first.indexOf("=");
    if (i < 1) return [];
    const name = first.slice(0, i).trim();
    const value = first.slice(i + 1).trim();
    if (!name) return [];
    const proxyName = `${COOKIE_PREFIX}${encodedHost}_${encodeURIComponent(name)}`;
    const attrs = line.split(";").slice(1).map(x => x.trim()).filter(x => !/^domain=/i.test(x) && !/^path=/i.test(x) && !/^samesite=/i.test(x) && !/^secure$/i.test(x) && !/^httponly$/i.test(x));
    const maxAge = attrs.find(x => /^max-age=/i.test(x));
    return [`${proxyName}=${value}; Path=${PROXY_PATH}; SameSite=Lax; Secure${maxAge ? `; ${maxAge}` : ""}`];
  });
}

function copiedResponseHeaders(source: Response): Headers {
  const headers = new Headers();
  source.headers.forEach((value, key) => {
    if (["content-security-policy", "content-security-policy-report-only", "x-frame-options", "content-length", "content-encoding", "transfer-encoding", "set-cookie", "location"].includes(key.toLowerCase())) return;
    headers.set(key, value);
  });
  return headers;
}

async function handleProxy({ request }: { request: Request }): Promise<Response> {
  const requestUrl = new URL(request.url);
  const target = safeTarget(requestUrl.searchParams.get("url"));
  if (!target) return new Response("رابط الموقع غير صالح أو غير مسموح به.", { status: 400 });

  const headers = new Headers();
  request.headers.forEach((value, key) => {
    if (["host", "content-length", "connection", "accept-encoding", "cookie"].includes(key.toLowerCase())) return;
    headers.set(key, value);
  });
  const cookieHeader = getCookieHeader(request, target.hostname);
  if (cookieHeader) headers.set("cookie", cookieHeader);
  headers.set("accept-encoding", "identity");
  headers.set("x-forwarded-host", target.host);

  let upstream: Response;
  try {
    upstream = await fetch(target.href, {
      method: request.method,
      headers,
      body: ["GET", "HEAD"].includes(request.method) ? undefined : request.body,
      redirect: "manual",
    });
  } catch (error) {
    console.error("web proxy fetch failed", error);
    return new Response("تعذر الاتصال بالموقع المطلوب.", { status: 502 });
  }

  const responseHeaders = copiedResponseHeaders(upstream);
  const setCookies = parseSetCookie(upstream.headers, target.hostname);
  for (const cookie of setCookies) responseHeaders.append("set-cookie", cookie);

  const location = upstream.headers.get("location");
  if (location) {
    const next = new URL(location, target.href);
    responseHeaders.set("location", proxyUrl(next));
  }

  const contentType = upstream.headers.get("content-type") ?? "";
  if (contentType.includes("text/html") && upstream.status >= 200 && upstream.status < 300) {
    const text = await upstream.text();
    if (new TextEncoder().encode(text).byteLength > MAX_HTML_SIZE) {
      return new Response(text, { status: upstream.status, headers: responseHeaders });
    }
    responseHeaders.set("content-type", "text/html; charset=utf-8");
    return new Response(rewriteHtml(text, target), { status: upstream.status, headers: responseHeaders });
  }

  return new Response(upstream.body, { status: upstream.status, headers: responseHeaders });
}

export const Route = createFileRoute("/api/web-proxy")({
  server: {
    handlers: {
      GET: handleProxy,
      HEAD: handleProxy,
      POST: handleProxy,
      PUT: handleProxy,
      PATCH: handleProxy,
      DELETE: handleProxy,
      OPTIONS: handleProxy,
    },
  },
});
