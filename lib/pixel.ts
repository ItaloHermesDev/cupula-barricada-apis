export const TRACKER_KEY = /^px_[A-Za-z0-9_-]{20,80}$/;
export const SESSION_ID = /^[a-f0-9]{32}$/;

const SENSITIVE_QUERY = new Set([
  "token",
  "password",
  "senha",
  "passwd",
  "secret",
  "client_secret",
  "access_token",
  "refresh_token",
  "id_token",
  "code",
  "apikey",
  "api_key",
  "authorization",
]);

export function cleanTrackUrl(raw: string) {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  url.username = "";
  url.password = "";
  for (const name of [...url.searchParams.keys()]) {
    if (SENSITIVE_QUERY.has(name.toLowerCase())) url.searchParams.delete(name);
  }
  const value = url.toString();
  return value.length > 2000 ? value.slice(0, 2000) : value;
}

export function cleanButtonText(raw: unknown) {
  if (typeof raw !== "string") return null;
  const text = raw.replace(/[\u0000-\u001F\u007F]/g, " ").replace(/\s+/g, " ").trim().slice(0, 160);
  return text || null;
}

export type TrackPayload = {
  key: string;
  session: string;
  event: "pagina" | "clique";
  url: string;
  button: string | null;
};

export function parseTrackBody(raw: string): TrackPayload | null {
  if (raw.length === 0 || raw.length > 4096) return null;
  let data: { c?: unknown; s?: unknown; e?: unknown; u?: unknown; b?: unknown };
  try {
    data = JSON.parse(raw) as { c?: unknown; s?: unknown; e?: unknown; u?: unknown; b?: unknown };
  } catch {
    return null;
  }
  if (typeof data.c !== "string" || !TRACKER_KEY.test(data.c)) return null;
  if (typeof data.s !== "string" || !SESSION_ID.test(data.s)) return null;
  if (data.e !== "pagina" && data.e !== "clique") return null;
  if (typeof data.u !== "string") return null;
  const url = cleanTrackUrl(data.u);
  if (!url) return null;
  return {
    key: data.c,
    session: data.s,
    event: data.e,
    url,
    button: data.e === "clique" ? cleanButtonText(data.b) : null,
  };
}

export function pixelSource() {
  return `(() => {
  var script = document.currentScript;
  if (!script) return;
  var key = script.getAttribute("data-chave") || "";
  if (!/^px_[A-Za-z0-9_-]{20,80}$/.test(key)) return;
  var endpoint = String(script.src || "").replace(/\\/script(?:\\?.*)?$/, "");
  if (!endpoint || endpoint === script.src) return;

  var storageKey = "cb_trilha_sessao";
  var root = window.__cbTrilha || (window.__cbTrilha = { sid: "", hooked: false, senders: [] });

  function randomId() {
    var bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    var hex = "";
    for (var i = 0; i < bytes.length; i += 1) hex += (bytes[i] + 256).toString(16).slice(1);
    return hex;
  }

  function readCookie() {
    var match = document.cookie.match(/(?:^|; )cb_trilha_sessao=([a-f0-9]{32})(?:;|$)/);
    return match ? match[1] : "";
  }

  function persist(id) {
    try { sessionStorage.setItem(storageKey, id); } catch (error) {}
    try {
      var secure = location.protocol === "https:" ? "; Secure" : "";
      document.cookie = storageKey + "=" + id + "; path=/; SameSite=Lax" + secure;
    } catch (error) {}
  }

  function sessionId() {
    if (/^[a-f0-9]{32}$/.test(root.sid)) return root.sid;
    var stored = "";
    try { stored = sessionStorage.getItem(storageKey) || ""; } catch (error) {}
    if (!/^[a-f0-9]{32}$/.test(stored)) stored = readCookie();
    if (!/^[a-f0-9]{32}$/.test(stored)) stored = randomId();
    persist(stored);
    root.sid = stored;
    return stored;
  }

  function safeHref() {
    try {
      var url = new URL(location.href);
      ["token", "password", "senha", "passwd", "secret", "client_secret", "access_token", "refresh_token", "id_token", "code", "apikey", "api_key", "authorization"].forEach(function (name) {
        url.searchParams.delete(name);
      });
      url.username = "";
      url.password = "";
      return url.toString().slice(0, 2000);
    } catch (error) {
      return "";
    }
  }

  function send(eventName, button) {
    var href = safeHref();
    if (!href) return;
    var body = JSON.stringify({ c: key, s: sessionId(), e: eventName, u: href, b: button || "" });
    try {
      if (navigator.sendBeacon && navigator.sendBeacon(endpoint, new Blob([body], { type: "text/plain" }))) return;
    } catch (error) {}
    fetch(endpoint, {
      method: "POST",
      body: body,
      headers: { "Content-Type": "text/plain" },
      keepalive: true,
      mode: "cors",
      credentials: "omit",
    }).catch(function () {});
  }

  var sender = { last: "", send: send };
  root.senders.push(sender);

  function emitPage() {
    var href = safeHref();
    if (!href) return;
    root.senders.forEach(function (item) {
      if (item.last === href) return;
      item.last = href;
      item.send("pagina", "");
    });
  }

  function buttonOf(target) {
    var node = target && target.nodeType === 3 ? target.parentElement : target;
    if (!node || !node.closest) return null;
    return node.closest("button, [role='button'], input[type='button'], input[type='submit'], input[type='reset'], input[type='image']");
  }

  function buttonLabel(node) {
    var text = "";
    if (node.tagName === "INPUT") text = node.value || node.alt || "";
    else {
      try { text = node.innerText || ""; } catch (error) { text = node.textContent || ""; }
    }
    if (!text) text = node.getAttribute("aria-label") || "";
    return String(text).replace(/\\s+/g, " ").trim().slice(0, 160);
  }

  if (!root.hooked) {
    root.hooked = true;
    var push = history.pushState;
    var replace = history.replaceState;
    history.pushState = function () {
      var result = push.apply(this, arguments);
      emitPage();
      return result;
    };
    history.replaceState = function () {
      var result = replace.apply(this, arguments);
      emitPage();
      return result;
    };
    window.addEventListener("popstate", emitPage);
    window.addEventListener("hashchange", emitPage);
    document.addEventListener("click", function (event) {
      var node = buttonOf(event.target);
      if (!node) return;
      var label = buttonLabel(node);
      root.senders.forEach(function (item) { item.send("clique", label); });
    }, true);
  }

  var sid = sessionId();
  window.CupulaTrilha = window.CupulaTrilha || {};
  window.CupulaTrilha.sessao = function () { return sid; };
  emitPage();
})();
`;
}

export function trackerSnippet(origin: string, publicKey: string) {
  return `<script async src="${origin}/api/trilha/script" data-chave="${publicKey}"></script>`;
}

export function exampleHtml(origin: string, publicKey: string) {
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex">
  <title>Teste da trilha</title>
  <style>
    body { margin: 0; font-family: Georgia, serif; background: #f6f3ee; color: #1c1915; }
    main { max-width: 36rem; margin: 0 auto; padding: 3rem 1.25rem; }
    p { line-height: 1.5; }
    button, a { font: inherit; }
    button, .link {
      display: inline-flex; margin: 0.4rem 0.6rem 0.4rem 0; padding: 0.7rem 1rem;
      border-radius: 999px; border: 1px solid #1c1915; background: #1c1915; color: #fff;
      text-decoration: none; cursor: pointer;
    }
    .link { background: transparent; color: #1c1915; }
    code { font-family: ui-monospace, monospace; font-size: 0.85rem; }
  </style>
  <script src="${origin}/api/trilha/script" data-chave="${publicKey}"></script>
</head>
<body>
  <main>
    <h1>Página de teste</h1>
    <p>Esta página carrega a mesma tag da landpage. A sessão abaixo continua igual enquanto você navega neste site.</p>
    <p>Sessão: <code id="sessao">carregando…</code></p>
    <button type="button">Quero começar</button>
    <button type="button" id="planos">Ver planos</button>
    <a class="link" href="#duvidas">Dúvidas</a>
    <p id="duvidas">A URL muda no botão Ver planos e também neste link.</p>
  </main>
  <script>
    var tries = 0;
    var timer = setInterval(function () {
      tries += 1;
      if (!window.CupulaTrilha && tries < 30) return;
      clearInterval(timer);
      var el = document.getElementById("sessao");
      if (window.CupulaTrilha && el) el.textContent = window.CupulaTrilha.sessao();
    }, 100);
    document.getElementById("planos").addEventListener("click", function () {
      var url = new URL(location.href);
      url.searchParams.set("etapa", "planos");
      url.hash = "";
      history.pushState({}, "", url);
    });
  </script>
</body>
</html>`;
}
