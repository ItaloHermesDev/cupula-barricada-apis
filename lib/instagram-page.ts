import "server-only";

import { lookup } from "node:dns";
import https from "node:https";
import type { LookupFunction } from "node:net";

import { execute } from "@/lib/db";
import { assertPublicHttpUrl, DestinationError } from "@/lib/ssrf";

const MAX_BYTES = 1_500_000;
const MAX_HOPS = 4;
const MAX_LINES = 120;

export type InstagramPageCheck =
  | { ok: true; url: string; texts: string[]; aviso: string }
  | { ok: false; mensagem: string };

export type InstagramLookup =
  | { ok: true; usuario: string; existe: boolean }
  | { ok: false; erro: string; mensagem: string; status: number };

const HANDLE = /^[a-z0-9._]{1,30}$/;
const RESERVED_HANDLE = new Set(["p", "reel", "reels", "stories", "explore", "accounts", "direct", "tv", "about", "legal", "developer"]);
const PREVIEW_AGENTS = [
  "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)",
  "WhatsApp/2.21.16.20 A",
];
const EMBED_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

export async function lookupInstagramProfile(raw: string): Promise<InstagramLookup> {
  const usuario = readInstagramHandle(raw);
  if (!usuario) return { ok: false, erro: "perfil_invalido", mensagem: "Informe o @ ou a URL do perfil.", status: 400 };

  const page = new URL(`https://www.instagram.com/${usuario}/`);
  try {
    await assertPublicHttpUrl(page.toString());
  } catch (error) {
    if (error instanceof DestinationError) return { ok: false, erro: "perfil_invalido", mensagem: "Informe o @ ou a URL do perfil.", status: 400 };
  }

  const fetched = await fetchProfileHtml(page);
  if ("mensagem" in fetched) return { ok: false, erro: "indisponivel", mensagem: "Não foi possível confirmar se o perfil existe.", status: 502 };

  const existe = profileExists(fetched.html);
  if (existe === null) return { ok: false, erro: "indisponivel", mensagem: "Não foi possível confirmar se o perfil existe.", status: 502 };
  return { ok: true, usuario, existe };
}

export async function recordInstagramLookup(usuario: string, existe: boolean) {
  await execute("INSERT INTO instagram_consultas (usuario, existe) VALUES (?, ?)", [usuario, existe ? 1 : 0]);
}

export function readInstagramHandle(raw: string) {
  const trimmed = raw.trim();
  if (!trimmed || trimmed.length > 500) return null;
  const mention = trimmed.match(/^@([A-Za-z0-9._]{1,30})$/);
  if (mention) return normalizeHandle(mention[1]);
  if (/^[A-Za-z0-9._]{1,30}$/.test(trimmed)) return normalizeHandle(trimmed);

  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || url.username || url.password || !isInstagramHost(url.hostname)) return null;
  const segment = url.pathname.split("/").filter(Boolean)[0] ?? "";
  return normalizeHandle(segment);
}

function normalizeHandle(value: string) {
  const handle = value.toLowerCase();
  if (!HANDLE.test(handle) || RESERVED_HANDLE.has(handle)) return null;
  if (handle.startsWith(".") || handle.endsWith(".") || handle.includes("..")) return null;
  return handle;
}

function profileExists(html: string) {
  if (/property=["']og:description["']/i.test(html) || /"biography"\s*:/.test(html) || /<title[^>]*>[^<]*\(@[A-Za-z0-9._]+\)/i.test(html)) return true;
  if (readEmbedProfile(html)) return true;
  if (embedMissing(html)) return false;
  if (/"canonicalRouteName":"comet\.igweb\.PolarisErrorRoute"/.test(html) && /"show_lox_redesigned_404_page":true/.test(html)) return false;
  return null;
}

export async function readInstagramPage(raw: string): Promise<InstagramPageCheck> {
  const page = parseInstagramPage(raw);
  if (!page) return { ok: false, mensagem: "Informe uma URL https de uma página do Instagram." };

  try {
    await assertPublicHttpUrl(page.toString());
  } catch (error) {
    if (error instanceof DestinationError) return { ok: false, mensagem: "Esse endereço não pode ser lido daqui." };
  }

  const fetched = await fetchProfileHtml(page);
  if ("mensagem" in fetched) return { ok: false, mensagem: fetched.mensagem };

  const embed = readEmbedProfile(fetched.html);
  if (embed) return { ok: true, url: fetched.url, texts: embedTexts(embed), aviso: "" };

  const texts = extractTexts(fetched.html).filter((line) => line.toLowerCase() !== "instagram");
  if (profileUnavailable(fetched.html) || embedMissing(fetched.html)) {
    return {
      ok: true,
      url: fetched.url,
      texts: [],
      aviso: "O Instagram não disponibilizou esse perfil. A página pública veio como erro, sem nome, biografia ou posts.",
    };
  }
  const aviso = loginWall(fetched.html)
    ? "O Instagram devolveu a página de entrada. O HTML público não trouxe o texto do perfil."
    : texts.length === 0
      ? "O HTML público não trouxe o texto do perfil."
      : "";

  return { ok: true, url: fetched.url, texts, aviso };
}

function parseInstagramPage(raw: string) {
  const trimmed = raw.trim();
  if (!trimmed || trimmed.length > 500) return null;
  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || url.username || url.password) return null;
  if (!isInstagramHost(url.hostname)) return null;
  if (url.pathname === "/" || url.pathname === "") return null;
  const blocked = ["/accounts", "/direct", "/oauth", "/challenge", "/emails", "/privacy"];
  if (blocked.some((prefix) => url.pathname === prefix || url.pathname.startsWith(`${prefix}/`))) return null;
  url.hash = "";
  return url;
}

function isInstagramHost(hostname: string) {
  const host = hostname.replace(/\.$/, "").toLowerCase();
  return host === "instagram.com" || host === "www.instagram.com" || host === "m.instagram.com";
}

async function fetchProfileHtml(page: URL): Promise<{ url: string; html: string } | { mensagem: string }> {
  let unavailable: { url: string; html: string } | null = null;
  let failure: { mensagem: string } | null = null;
  for (const agent of PREVIEW_AGENTS) {
    const fetched = await fetchHtml(page, agent);
    if ("mensagem" in fetched) {
      failure = fetched;
      continue;
    }
    const existe = profileExists(fetched.html);
    if (existe === true) return fetched;
    if (existe === false) unavailable = fetched;
  }

  const embed = profileEmbedUrl(page);
  if (embed) {
    const fetched = await fetchHtml(embed, EMBED_AGENT);
    if ("mensagem" in fetched) {
      failure = failure ?? fetched;
    } else {
      const existe = profileExists(fetched.html);
      if (existe === true) return fetched;
      if (existe === false) unavailable = fetched;
    }
  }

  return unavailable ?? failure ?? { mensagem: "Não foi possível ler a página." };
}

function profileEmbedUrl(page: URL) {
  const [segment, second] = page.pathname.split("/").filter(Boolean);
  if (!segment || second === "embed" || !normalizeHandle(segment)) return null;
  return new URL(`https://www.instagram.com/${segment}/embed/`);
}

type EmbedProfile = {
  username: string;
  full_name?: string;
  followers_count?: number;
  posts_count?: number;
  pronouns?: string[];
  graphql_media?: { shortcode_media?: { edge_media_to_caption?: { edges?: { node?: { text?: string } }[] } } }[];
};

function readEmbedProfile(html: string) {
  if (!/"isProfileEmbed":true/.test(html)) return null;
  const match = html.match(/"contextJSON":"((?:\\.|[^"\\])*)"/);
  if (!match) return null;
  try {
    const encoded = JSON.parse(`"${match[1]}"`);
    const parsed = typeof encoded === "string" ? JSON.parse(encoded) as { context?: EmbedProfile } : null;
    const context = parsed?.context;
    if (!context || typeof context.username !== "string" || !normalizeHandle(context.username)) return null;
    return context;
  } catch {
    return null;
  }
}

function embedMissing(html: string) {
  return html.includes("XPolarisEmbedProfileController") && /"isProfileEmbed":false/.test(html) && /"contextJSON":null/.test(html);
}

function embedTexts(context: EmbedProfile) {
  const texts: string[] = [];
  const seen = new Set<string>();
  const push = (value: string) => {
    const line = value.replace(/\s+/g, " ").trim();
    if (!line || line.length > 500) return;
    const key = line.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    texts.push(line);
  };

  if (typeof context.full_name === "string") push(context.full_name);
  push(`@${context.username}`);
  if (typeof context.followers_count === "number") push(`${new Intl.NumberFormat("pt-BR").format(context.followers_count)} seguidores`);
  if (typeof context.posts_count === "number") push(`${new Intl.NumberFormat("pt-BR").format(context.posts_count)} posts`);
  if (Array.isArray(context.pronouns)) {
    for (const pronoun of context.pronouns) if (typeof pronoun === "string") push(pronoun);
  }
  for (const item of context.graphql_media ?? []) {
    if (texts.length >= MAX_LINES) break;
    push(item.shortcode_media?.edge_media_to_caption?.edges?.[0]?.node?.text ?? "");
  }
  return texts;
}

async function fetchHtml(start: URL, userAgent: string): Promise<{ url: string; html: string } | { mensagem: string }> {
  let current = start;
  for (let hop = 0; hop < MAX_HOPS; hop += 1) {
    if (!isInstagramHost(current.hostname)) return { mensagem: "A página saiu do Instagram no redirecionamento." };
    try {
      await assertPublicHttpUrl(current.toString());
    } catch (error) {
      if (error instanceof DestinationError) return { mensagem: "A página saiu do Instagram no redirecionamento." };
    }

    let response: InstagramResponse;
    try {
      response = await requestInstagram(current, userAgent);
    } catch (error) {
      if (error instanceof Error && error.name === "TimeoutError") return { mensagem: "O Instagram demorou demais para responder." };
      if (error instanceof Error && error.message === "grande") return { mensagem: "A página passou do tamanho que dá para ler aqui." };
      return { mensagem: "Não foi possível ler a página." };
    }

    if (response.status >= 300 && response.status < 400) {
      if (!response.location) return { mensagem: "O Instagram redirecionou sem informar o destino." };
      let next: URL;
      try {
        next = new URL(response.location, current);
      } catch {
        return { mensagem: "O Instagram redirecionou para um endereço inválido." };
      }
      if (next.protocol !== "https:" || !isInstagramHost(next.hostname)) {
        return { mensagem: "A página saiu do Instagram no redirecionamento." };
      }
      next.hash = "";
      current = next;
      continue;
    }

    if (response.status < 200 || response.status >= 300) return { mensagem: "O Instagram não entregou o HTML dessa página." };
    if (response.type && !/text\/html|text\/plain|application\/xhtml/i.test(response.type)) {
      return { mensagem: "A resposta não veio em HTML." };
    }

    return { url: current.toString(), html: new TextDecoder().decode(response.body) };
  }

  return { mensagem: "A página saiu do Instagram no redirecionamento." };
}

function extractTexts(html: string) {
  const texts: string[] = [];
  const seen = new Set<string>();
  const push = (value: string) => {
    const line = value.replace(/\s+/g, " ").trim();
    if (!usefulLine(line)) return;
    const key = line.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    texts.push(line);
  };

  push(decode(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? ""));
  for (const key of ["username", "full_name", "biography", "category_name"] as const) push(jsonString(html, key));
  for (const tag of html.match(/<meta\b[^>]*>/gi) ?? []) {
    const name = attr(tag, "property") || attr(tag, "name");
    if (!/^(description|og:title|og:description|twitter:title|twitter:description)$/i.test(name)) continue;
    push(decode(attr(tag, "content")));
  }

  const body = html
    .replace(/<script[\s\S]*?<\/script>/gi, "\n")
    .replace(/<style[\s\S]*?<\/style>/gi, "\n")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, "\n")
    .replace(/<[^>]+>/g, "\n");
  for (const line of decode(body).split(/\n+/)) {
    if (texts.length >= MAX_LINES) break;
    const clean = line.replace(/\s+/g, " ").trim();
    if (footerLine(clean)) break;
    push(clean);
  }

  return texts;
}

function profileUnavailable(html: string) {
  return /PolarisErrorRoute|show_lox_redesigned_404_page"\s*:\s*true/.test(html);
}

function loginWall(html: string) {
  const head = html.slice(0, 100_000);
  if (/property=["']og:description["']/i.test(head)) return false;
  if (/"biography"\s*:|"caption"\s*:/.test(html.slice(0, 500_000))) return false;
  return /loginForm|Log into Instagram|\/accounts\/login/i.test(head);
}

function jsonString(html: string, key: string) {
  const match = html.match(new RegExp(`"${key}"\\s*:\\s*"((?:\\\\.|[^"\\\\])*)"`));
  if (!match) return "";
  try {
    const value = JSON.parse(`"${match[1]}"`);
    return typeof value === "string" ? value : "";
  } catch {
    return "";
  }
}

function attr(tag: string, name: string) {
  const match = tag.match(new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)')`, "i"));
  return match?.[2] ?? match?.[3] ?? "";
}

const CHROME = new Set([
  "entrar",
  "cadastre-se",
  "log in",
  "sign up",
  "meta",
  "sobre",
  "blog",
  "carreiras",
  "ajuda",
  "api",
  "privacidade",
  "termos",
  "localizações",
  "localizacoes",
  "popular",
  "instagram lite",
  "meta ai",
  "threads",
  "posts",
  "reels",
  "marcados",
  "opções",
  "opcoes",
  "ícone de link",
  "icone de link",
  "abrir aplicativo",
  "clipe",
]);

function footerLine(line: string) {
  return /^mostrar mais posts\b/i.test(line) || /^©/.test(line) || /^portugu[eê]s \(brasil\)$/i.test(line);
}

function usefulLine(line: string) {
  if (line.length < 2 || line.length > 500) return false;
  if (/^https?:\/\//i.test(line)) return false;
  if (/^ícone de /i.test(line)) return false;
  if (CHROME.has(line.toLowerCase())) return false;
  return /[A-Za-zÀ-ÿ0-9]{2}/.test(line);
}

function decode(value: string) {
  return value
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => safeChar(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, num: string) => safeChar(Number(num)))
    .replace(/&nbsp;/gi, " ")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&amp;/gi, "&");
}

function safeChar(code: number) {
  if (!Number.isFinite(code) || code < 0 || code > 0x10ffff) return "";
  if (code < 32 && code !== 9 && code !== 10) return "";
  return String.fromCodePoint(code);
}

type InstagramResponse = { status: number; location: string; type: string; body: Buffer };

function requestInstagram(target: URL, userAgent: string) {
  return requestFamily(target, userAgent, 4).catch((error: unknown) => {
    if (!ipv4Unreachable(error)) throw error;
    return requestFamily(target, userAgent, 6);
  });
}

function ipv4Unreachable(error: unknown) {
  if (!(error instanceof Error) || !("code" in error)) return false;
  return ["ENETUNREACH", "EHOSTUNREACH", "EAFNOSUPPORT", "EADDRNOTAVAIL", "ENETDOWN"].includes(String(error.code));
}

function lookupFamily(ipFamily: 4 | 6): LookupFunction {
  return (hostname, options, callback) => {
    lookup(hostname, { family: ipFamily, all: true }, (error, addresses) => {
      if (error) {
        callback(error, "");
        return;
      }
      if (options.all) {
        callback(null, addresses);
        return;
      }
      const first = addresses[0];
      if (!first) {
        const missing = Object.assign(new Error(`getaddrinfo ENOTFOUND ${hostname}`), { code: "ENOTFOUND" });
        callback(missing, "");
        return;
      }
      callback(null, first.address, first.family);
    });
  };
}

function requestFamily(target: URL, userAgent: string, family: 4 | 6) {
  return new Promise<InstagramResponse>((resolve, reject) => {
    let settled = false;
    const finish = (error?: Error, value?: InstagramResponse) => {
      if (settled) return;
      settled = true;
      if (error) reject(error);
      else if (value) resolve(value);
    };

    const req = https.request(
      {
        hostname: target.hostname,
        path: `${target.pathname}${target.search}`,
        method: "GET",
        family,
        lookup: lookupFamily(family),
        headers: {
          accept: "text/html,application/xhtml+xml",
          "accept-language": "pt-BR,pt;q=0.9,en;q=0.8",
          "user-agent": userAgent,
        },
      },
      (res) => {
        const locationHeader = res.headers.location;
        const typeHeader = res.headers["content-type"];
        const location = Array.isArray(locationHeader) ? locationHeader[0] ?? "" : locationHeader ?? "";
        const type = Array.isArray(typeHeader) ? typeHeader[0] ?? "" : typeHeader ?? "";
        const status = res.statusCode ?? 0;
        if (status >= 300 && status < 400) {
          res.resume();
          finish(undefined, { status, location, type, body: Buffer.alloc(0) });
          return;
        }

        const chunks: Buffer[] = [];
        let total = 0;
        res.on("data", (chunk: Buffer) => {
          total += chunk.length;
          if (total > MAX_BYTES) {
            res.destroy();
            finish(new Error("grande"));
            return;
          }
          chunks.push(chunk);
        });
        res.on("end", () => {
          finish(undefined, { status, location, type, body: Buffer.concat(chunks) });
        });
        res.on("error", (error) => finish(error));
      },
    );

    req.setTimeout(12_000, () => {
      const error = new Error("timeout");
      error.name = "TimeoutError";
      req.destroy(error);
    });
    req.on("error", (error) => finish(error));
    req.end();
  });
}
