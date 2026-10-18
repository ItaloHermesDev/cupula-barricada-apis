import "server-only";
import { randomBytes } from "crypto";
import type { RowDataPacket } from "mysql2/promise";
import { execute, query } from "@/lib/db";
import { parseTrackBody, type TrackPayload } from "@/lib/pixel";

const hits = new Map<string, { n: number; reset: number }>();

type TrackerRow = RowDataPacket & {
  id: number;
  name: string;
  public_key: string;
  created_at: Date | string;
  events: number | string;
  sessions: number | string;
};

type EventRow = RowDataPacket & {
  id: number | string;
  tracker_id: number | string;
  session_id: string;
  event_type: string;
  page_url: string;
  button_text: string | null;
  created_at: Date | string;
};

export type TrackerItem = {
  id: number;
  name: string;
  publicKey: string;
  createdAt: Date | string;
  events: number;
  sessions: number;
};

export type TrackEventItem = {
  id: string;
  trackerId: number;
  sessionId: string;
  eventType: string;
  pageUrl: string;
  buttonText: string | null;
  createdAt: Date | string;
};

function allowed(bucketKey: string) {
  const now = Date.now();
  if (hits.size > 2000) {
    for (const [key, bucket] of hits) {
      if (bucket.reset < now) hits.delete(key);
    }
  }
  const current = hits.get(bucketKey);
  if (!current || current.reset < now) {
    hits.set(bucketKey, { n: 1, reset: now + 60_000 });
    return true;
  }
  if (current.n >= 240) return false;
  current.n += 1;
  return true;
}

function isDuplicate(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ER_DUP_ENTRY";
}

export async function createTracker(name: string) {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const publicKey = `px_${randomBytes(18).toString("base64url")}`;
    try {
      await execute("INSERT INTO trackers (name, public_key) VALUES (?, ?)", [name, publicKey]);
      return publicKey;
    } catch (error) {
      if (isDuplicate(error)) continue;
      throw error;
    }
  }
  throw new Error("Não foi possível gerar a chave da tag.");
}

export async function getTracker(id: number) {
  if (!Number.isInteger(id) || id <= 0) return null;
  const rows = await query<TrackerRow[]>(
    `SELECT t.id, t.name, t.public_key, t.created_at,
        COUNT(e.id) AS events,
        COUNT(DISTINCT e.session_id) AS sessions
     FROM trackers t
     LEFT JOIN track_events e ON e.tracker_id = t.id
     WHERE t.id = ?
     GROUP BY t.id, t.name, t.public_key, t.created_at
     LIMIT 1`,
    [id],
  );
  const row = rows[0];
  if (!row) return null;
  return {
    id: Number(row.id),
    name: row.name,
    publicKey: row.public_key,
    createdAt: row.created_at,
    events: Number(row.events),
    sessions: Number(row.sessions),
  };
}

export async function listTrackers() {
  const rows = await query<TrackerRow[]>(
    `SELECT t.id, t.name, t.public_key, t.created_at,
        COUNT(e.id) AS events,
        COUNT(DISTINCT e.session_id) AS sessions
     FROM trackers t
     LEFT JOIN track_events e ON e.tracker_id = t.id
     GROUP BY t.id, t.name, t.public_key, t.created_at
     ORDER BY t.id DESC`,
  );
  return rows.map((row) => ({
    id: Number(row.id),
    name: row.name,
    publicKey: row.public_key,
    createdAt: row.created_at,
    events: Number(row.events),
    sessions: Number(row.sessions),
  }));
}

export async function listTrackEvents(trackerId: number, limit = 200) {
  const size = Number.isInteger(limit) && limit > 0 && limit <= 500 ? limit : 200;
  const rows = await query<EventRow[]>(
    `SELECT id, tracker_id, session_id, event_type, page_url, button_text, created_at
     FROM track_events
     WHERE tracker_id = ?
     ORDER BY id DESC
     LIMIT ${size}`,
    [trackerId],
  );
  return rows.map((row) => ({
    id: String(row.id),
    trackerId: Number(row.tracker_id),
    sessionId: row.session_id,
    eventType: row.event_type,
    pageUrl: row.page_url,
    buttonText: row.button_text,
    createdAt: row.created_at,
  }));
}

export async function recordTrackEvent(payload: TrackPayload) {
  const rows = await query<RowDataPacket[]>(
    "SELECT id FROM trackers WHERE public_key = ? AND active = 1 LIMIT 1",
    [payload.key],
  );
  const trackerId = Number(rows[0]?.id ?? 0);
  if (!trackerId) return "unknown" as const;
  if (!allowed(`${trackerId}:${payload.session}`)) return "limited" as const;
  await execute(
    "INSERT INTO track_events (tracker_id, session_id, event_type, page_url, button_text) VALUES (?, ?, ?, ?, ?)",
    [trackerId, payload.session, payload.event, payload.url, payload.button],
  );
  return "ok" as const;
}

export function readTrackPayload(raw: string) {
  return parseTrackBody(raw);
}
