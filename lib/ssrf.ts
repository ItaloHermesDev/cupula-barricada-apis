import { lookup } from "dns/promises";
import { isIP } from "net";

export class DestinationError extends Error {
  constructor() {
    super("Destino externo não permitido.");
    this.name = "DestinationError";
  }
}

export async function assertPublicHttpUrl(raw: string) {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new DestinationError();
  }

  if (url.protocol !== "https:" && url.protocol !== "http:") throw new DestinationError();
  if (url.username || url.password) throw new DestinationError();

  const hostname = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local") ||
    hostname.endsWith(".internal") ||
    hostname === "metadata.google.internal"
  ) {
    throw new DestinationError();
  }

  if (isIP(hostname)) {
    if (!isPublicAddress(hostname)) throw new DestinationError();
    return url;
  }

  const records = await lookup(hostname, { all: true, verbatim: true });
  if (records.length === 0 || records.some((record) => !isPublicAddress(record.address))) {
    throw new DestinationError();
  }

  return url;
}

function isPublicAddress(address: string) {
  const version = isIP(address);
  if (version === 4) return isPublicIpv4(address);
  if (version === 6) return isPublicIpv6(address);
  return false;
}

function isPublicIpv4(address: string) {
  const [a, b] = address.split(".").map(Number);
  if (a === 10 || a === 127 || a === 0) return false;
  if (a === 169 && b === 254) return false;
  if (a === 172 && b >= 16 && b <= 31) return false;
  if (a === 192 && b === 168) return false;
  if (a === 100 && b >= 64 && b <= 127) return false;
  if (a >= 224) return false;
  return true;
}

function isPublicIpv6(address: string) {
  const normalized = address.toLowerCase();
  if (normalized === "::1" || normalized === "::") return false;
  if (normalized.startsWith("fc") || normalized.startsWith("fd") || normalized.startsWith("fe80")) return false;
  if (normalized.startsWith("::ffff:")) return isPublicIpv4(normalized.slice(7));
  return true;
}
