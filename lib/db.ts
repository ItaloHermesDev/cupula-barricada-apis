import "server-only";
import mysql, { type Pool, type ResultSetHeader, type RowDataPacket } from "mysql2/promise";

export class DatabaseError extends Error {
  constructor(message = "Falha ao acessar o banco de dados.") {
    super(message);
    this.name = "DatabaseError";
  }
}

export type SqlParam = string | number | null | Buffer;

const CREATE_USERS = `
  CREATE TABLE IF NOT EXISTS users (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT,
    name VARCHAR(120) NOT NULL,
    email VARCHAR(255) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY users_email_unique (email)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
`;

const CREATE_USER_PAGES = `
  CREATE TABLE IF NOT EXISTS user_pages (
    user_id INT UNSIGNED NOT NULL,
    page_key VARCHAR(64) NOT NULL,
    PRIMARY KEY (user_id, page_key),
    CONSTRAINT user_pages_user_fk FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
`;

const CREATE_APIS = `
  CREATE TABLE IF NOT EXISTS external_apis (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT,
    name VARCHAR(120) NOT NULL,
    description VARCHAR(500) NOT NULL DEFAULT '',
    base_url VARCHAR(500) NOT NULL,
    endpoint_path VARCHAR(500) NOT NULL DEFAULT '',
    method VARCHAR(10) NOT NULL,
    request_content_type VARCHAR(120) NOT NULL DEFAULT 'application/json',
    response_content_type VARCHAR(120) NOT NULL DEFAULT 'application/json',
    auth_type VARCHAR(20) NOT NULL DEFAULT 'none',
    credential_cipher TEXT NULL,
    credential_header VARCHAR(80) NULL,
    headers_json TEXT NOT NULL,
    query_json TEXT NOT NULL,
    path_json TEXT NOT NULL,
    body_template MEDIUMTEXT NULL,
    timeout_ms INT UNSIGNED NOT NULL DEFAULT 10000,
    active TINYINT(1) NOT NULL DEFAULT 1,
    config_version INT UNSIGNED NOT NULL DEFAULT 1,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
`;

const CREATE_BARRICADES = `
  CREATE TABLE IF NOT EXISTS barricades (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT,
    api_id INT UNSIGNED NOT NULL,
    name VARCHAR(120) NOT NULL,
    description VARCHAR(500) NOT NULL DEFAULT '',
    slug VARCHAR(180) NOT NULL,
    method VARCHAR(10) NOT NULL,
    token_hash CHAR(64) NOT NULL,
    token_prefix VARCHAR(16) NOT NULL,
    origins_json TEXT NOT NULL,
    daily_limit INT UNSIGNED NOT NULL DEFAULT 1000,
    minute_limit INT UNSIGNED NOT NULL DEFAULT 60,
    params_json TEXT NOT NULL,
    headers_json TEXT NOT NULL,
    response_template MEDIUMTEXT NULL,
    active TINYINT(1) NOT NULL DEFAULT 1,
    fallback_id INT UNSIGNED NULL,
    fallback_on VARCHAR(120) NOT NULL DEFAULT 'timeout,conexao,http_5xx,cota',
    idempotent TINYINT(1) NOT NULL DEFAULT 0,
    error_rules_json TEXT NULL,
    config_version INT UNSIGNED NOT NULL DEFAULT 1,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    last_used_at TIMESTAMP NULL,
    PRIMARY KEY (id),
    UNIQUE KEY barricades_slug_unique (slug),
    KEY barricades_api_idx (api_id),
    KEY barricades_fallback_idx (fallback_id),
    CONSTRAINT barricades_api_fk FOREIGN KEY (api_id) REFERENCES external_apis (id) ON DELETE RESTRICT
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
`;

const CREATE_SOURCES = `
  CREATE TABLE IF NOT EXISTS barricade_sources (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT,
    barricade_id INT UNSIGNED NOT NULL,
    api_id INT UNSIGNED NOT NULL,
    position INT UNSIGNED NOT NULL,
    response_template MEDIUMTEXT NULL,
    error_rules_json TEXT NULL,
    PRIMARY KEY (id),
    UNIQUE KEY barricade_sources_position (barricade_id, position),
    KEY barricade_sources_api_idx (api_id),
    CONSTRAINT barricade_sources_barricade_fk FOREIGN KEY (barricade_id) REFERENCES barricades (id) ON DELETE CASCADE,
    CONSTRAINT barricade_sources_api_fk FOREIGN KEY (api_id) REFERENCES external_apis (id) ON DELETE RESTRICT
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
`;

const CREATE_ROUTE_STATS = `
  CREATE TABLE IF NOT EXISTS barricade_api_stats (
    barricade_id INT UNSIGNED NOT NULL,
    api_id INT UNSIGNED NOT NULL,
    monthly_tokens BIGINT UNSIGNED NULL,
    requests_per_minute INT UNSIGNED NULL,
    subscription_name VARCHAR(120) NULL,
    subscription_price DECIMAL(12,2) NULL,
    calls BIGINT UNSIGNED NOT NULL DEFAULT 0,
    PRIMARY KEY (barricade_id, api_id),
    CONSTRAINT barricade_api_stats_barricade_fk FOREIGN KEY (barricade_id) REFERENCES barricades (id) ON DELETE CASCADE,
    CONSTRAINT barricade_api_stats_api_fk FOREIGN KEY (api_id) REFERENCES external_apis (id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
`;

const CREATE_LOGOS = `
  CREATE TABLE IF NOT EXISTS barricade_logos (
    barricade_id INT UNSIGNED NOT NULL,
    mime VARCHAR(40) NOT NULL,
    image MEDIUMBLOB NOT NULL,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (barricade_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
`;

const CREATE_USAGE = `
  CREATE TABLE IF NOT EXISTS usage_daily (
    barricade_id INT UNSIGNED NOT NULL,
    day_key DATE NOT NULL,
    received INT UNSIGNED NOT NULL DEFAULT 0,
    rejected INT UNSIGNED NOT NULL DEFAULT 0,
    executed INT UNSIGNED NOT NULL DEFAULT 0,
    fallback_used INT UNSIGNED NOT NULL DEFAULT 0,
    PRIMARY KEY (barricade_id, day_key)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
`;

const CREATE_MINUTES = `
  CREATE TABLE IF NOT EXISTS usage_minute (
    barricade_id INT UNSIGNED NOT NULL,
    bucket INT UNSIGNED NOT NULL,
    hits INT UNSIGNED NOT NULL DEFAULT 0,
    PRIMARY KEY (barricade_id, bucket)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
`;

const CREATE_LOGS = `
  CREATE TABLE IF NOT EXISTS call_logs (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    request_id CHAR(24) NOT NULL,
    barricade_id INT UNSIGNED NULL,
    processed_barricade_id INT UNSIGNED NULL,
    api_id INT UNSIGNED NULL,
    barricade_name VARCHAR(120) NOT NULL,
    processed_name VARCHAR(120) NOT NULL,
    api_name VARCHAR(120) NOT NULL,
    day_key DATE NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    method VARCHAR(10) NOT NULL,
    provider_status SMALLINT NULL,
    consumer_status SMALLINT NOT NULL,
    duration_ms INT UNSIGNED NOT NULL DEFAULT 0,
    outcome VARCHAR(32) NOT NULL,
    attempts TINYINT UNSIGNED NOT NULL DEFAULT 1,
    used_fallback TINYINT(1) NOT NULL DEFAULT 0,
    fallback_reason VARCHAR(160) NULL,
    failure_reason VARCHAR(500) NULL,
    counted TINYINT(1) NOT NULL DEFAULT 0,
    consumer_key VARCHAR(80) NULL,
    log_scope VARCHAR(16) NOT NULL DEFAULT 'geral',
    PRIMARY KEY (id),
    KEY call_logs_day_idx (day_key, id),
    KEY call_logs_barricade_idx (barricade_id, id),
    KEY call_logs_api_idx (api_id, id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
`;

const CREATE_TRACKERS = `
  CREATE TABLE IF NOT EXISTS trackers (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT,
    name VARCHAR(80) NOT NULL,
    public_key VARCHAR(80) NOT NULL,
    active TINYINT(1) NOT NULL DEFAULT 1,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY trackers_public_key_unique (public_key)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
`;

const CREATE_TRACK_EVENTS = `
  CREATE TABLE IF NOT EXISTS track_events (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    tracker_id INT UNSIGNED NOT NULL,
    session_id CHAR(32) NOT NULL,
    event_type VARCHAR(16) NOT NULL,
    page_url VARCHAR(2000) NOT NULL,
    button_text VARCHAR(160) NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY track_events_tracker_idx (tracker_id, id),
    KEY track_events_session_idx (tracker_id, session_id),
    CONSTRAINT track_events_tracker_fk FOREIGN KEY (tracker_id) REFERENCES trackers (id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
`;

const CREATE_DISPLAY_SOURCE = `
  CREATE TABLE IF NOT EXISTS exibicao_origem (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    barricade_id INT UNSIGNED NOT NULL,
    origem VARCHAR(16) NOT NULL,
    day_key DATE NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY exibicao_origem_barricade_idx (barricade_id, id),
    CONSTRAINT exibicao_origem_barricade_fk FOREIGN KEY (barricade_id) REFERENCES barricades (id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
`;

const CREATE_FLAGS = `
  CREATE TABLE IF NOT EXISTS schema_flags (
    flag VARCHAR(64) NOT NULL,
    PRIMARY KEY (flag)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
`;

const BACKFILL_PAGES = `
  INSERT INTO user_pages (user_id, page_key)
  SELECT u.id, p.page_key
  FROM users u
  JOIN (
    SELECT 'painel' AS page_key
    UNION ALL
    SELECT 'usuarios'
  ) p
`;

let pool: Pool | null = null;
let schemaReady: Promise<void> | null = null;

function env(name: string) {
  const value = process.env[name];
  if (!value) {
    throw new DatabaseError(`Variável ${name} ausente.`);
  }
  return value;
}

export function getPool() {
  if (pool) return pool;

  const port = Number(process.env.DB_PORT ?? "3306");
  pool = mysql.createPool({
    host: env("DB_HOST"),
    port: Number.isInteger(port) ? port : 3306,
    user: env("DB_USER"),
    password: env("DB_PASSWORD"),
    database: env("DB_NAME"),
    waitForConnections: true,
    connectionLimit: 10,
    connectTimeout: 10_000,
    charset: "utf8mb4",
    timezone: "Z",
  });

  return pool;
}

export function ensureSchema() {
  if (!schemaReady) {
    schemaReady = (async () => {
      const db = getPool();
      await db.query(CREATE_USERS);
      await db.query(CREATE_USER_PAGES);
      const [countRows] = await db.query<RowDataPacket[]>(
        "SELECT COUNT(*) AS total FROM user_pages",
      );
      if (Number(countRows[0]?.total ?? 0) === 0) {
        await db.query(BACKFILL_PAGES);
      }
      await db.query(CREATE_APIS);
      await db.query(CREATE_BARRICADES);
      await ensureBarricadeColumns(db);
      await db.query(CREATE_SOURCES);
      await ensureColumn(db, "barricade_sources", "error_rules_json", "TEXT NULL");
      await db.query(CREATE_ROUTE_STATS);
      await ensureColumn(db, "barricade_api_stats", "subscription_name", "VARCHAR(120) NULL");
      await ensureColumn(db, "barricade_api_stats", "subscription_price", "DECIMAL(12,2) NULL");
      await ensureSignedDailyLimit(db);
      await db.query(CREATE_LOGOS);
      await db.query(CREATE_USAGE);
      await ensureColumn(db, "usage_daily", "internal_count", "INT UNSIGNED NOT NULL DEFAULT 0");
      await db.query(CREATE_MINUTES);
      await db.query(CREATE_LOGS);
      await ensureColumn(db, "call_logs", "log_scope", "VARCHAR(16) NOT NULL DEFAULT 'geral'");
      await ensureColumn(db, "call_logs", "error_json", "MEDIUMTEXT NULL");
      await ensureFailureReasonLength(db);
      await db.query(CREATE_FLAGS);
      const [flagRows] = await db.query<RowDataPacket[]>(
        "SELECT flag FROM schema_flags WHERE flag = 'grant_ops_pages_v1' LIMIT 1",
      );
      if (!flagRows[0]) {
        await db.query(
          "INSERT IGNORE INTO user_pages (user_id, page_key) SELECT user_id, 'apis' FROM user_pages WHERE page_key = 'painel'",
        );
        await db.query(
          "INSERT IGNORE INTO user_pages (user_id, page_key) SELECT user_id, 'barricadas' FROM user_pages WHERE page_key = 'painel'",
        );
        await db.query(
          "INSERT IGNORE INTO user_pages (user_id, page_key) SELECT user_id, 'historico' FROM user_pages WHERE page_key = 'painel'",
        );
        await db.query("INSERT INTO schema_flags (flag) VALUES ('grant_ops_pages_v1')");
      }
      const [painelRows] = await db.query<RowDataPacket[]>(
        "SELECT flag FROM schema_flags WHERE flag = 'grant_painel_nav_v1' LIMIT 1",
      );
      if (!painelRows[0]) {
        await db.query(
          "INSERT IGNORE INTO user_pages (user_id, page_key) SELECT user_id, 'painel' FROM user_pages WHERE page_key = 'barricadas'",
        );
        await db.query("INSERT INTO schema_flags (flag) VALUES ('grant_painel_nav_v1')");
      }
      const [statusRows] = await db.query<RowDataPacket[]>(
        "SELECT flag FROM schema_flags WHERE flag = 'grant_status_nav_v1' LIMIT 1",
      );
      if (!statusRows[0]) {
        await db.query(
          "INSERT IGNORE INTO user_pages (user_id, page_key) SELECT user_id, 'status' FROM user_pages WHERE page_key = 'barricadas'",
        );
        await db.query("INSERT INTO schema_flags (flag) VALUES ('grant_status_nav_v1')");
      }
      const [cotaRows] = await db.query<RowDataPacket[]>(
        "SELECT flag FROM schema_flags WHERE flag = 'fallback_cota_v1' LIMIT 1",
      );
      if (!cotaRows[0]) {
        await db.query(
          "UPDATE barricades SET fallback_on = CONCAT(fallback_on, ',cota') WHERE fallback_on <> '' AND fallback_on NOT LIKE '%cota%'",
        );
        await db.query("INSERT INTO schema_flags (flag) VALUES ('fallback_cota_v1')");
      }
      await db.query(CREATE_TRACKERS);
      await db.query(CREATE_TRACK_EVENTS);
      await db.query(CREATE_DISPLAY_SOURCE);
      await ensureColumn(db, "exibicao_origem", "day_key", "DATE NULL");
      const [trilhaRows] = await db.query<RowDataPacket[]>(
        "SELECT flag FROM schema_flags WHERE flag = 'grant_trilha_nav_v1' LIMIT 1",
      );
      if (!trilhaRows[0]) {
        await db.query(
          "INSERT IGNORE INTO user_pages (user_id, page_key) SELECT DISTINCT user_id, 'trilha' FROM user_pages WHERE page_key IN ('painel', 'barricadas')",
        );
        await db.query("INSERT INTO schema_flags (flag) VALUES ('grant_trilha_nav_v1')");
      }
    })().catch((error: unknown) => {
      schemaReady = null;
      console.error("Falha ao preparar o banco", error);
      throw new DatabaseError();
    });
  }

  return schemaReady;
}

async function ensureFailureReasonLength(db: Pool) {
  const [rows] = await db.query<RowDataPacket[]>(
    `SELECT CHARACTER_MAXIMUM_LENGTH AS length_limit FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'call_logs' AND COLUMN_NAME = 'failure_reason'`,
  );
  const limit = Number(rows[0]?.length_limit ?? 0);
  if (limit > 0 && limit < 500) {
    await db.query("ALTER TABLE call_logs MODIFY failure_reason VARCHAR(500) NULL");
  }
}

async function ensureSignedDailyLimit(db: Pool) {
  const [rows] = await db.query<RowDataPacket[]>(
    `SELECT COLUMN_TYPE AS column_type FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'barricades' AND COLUMN_NAME = 'daily_limit'`,
  );
  const columnType = String(rows[0]?.column_type ?? "");
  if (columnType.toLowerCase().includes("unsigned")) {
    await db.query("ALTER TABLE barricades MODIFY daily_limit INT NOT NULL DEFAULT 1000");
  }
}

async function ensureBarricadeColumns(db: Pool) {
  const columns: [string, string][] = [
    ["token_cipher", "TEXT NULL"],
    ["health_enabled", "TINYINT(1) NOT NULL DEFAULT 0"],
    ["health_ok", "TINYINT(1) NULL"],
    ["health_checked_at", "TIMESTAMP NULL"],
    ["health_latency_ms", "INT UNSIGNED NULL"],
    ["health_detail", "VARCHAR(160) NULL"],
    ["health_image", "TEXT NULL"],
    ["health_interval_minutes", "INT UNSIGNED NOT NULL DEFAULT 10"],
    ["error_rules_json", "TEXT NULL"],
  ];
  for (const [name, definition] of columns) {
    await ensureColumn(db, "barricades", name, definition);
  }
}

async function ensureColumn(db: Pool, table: string, name: string, definition: string) {
  const [rows] = await db.query<RowDataPacket[]>(
    `SELECT COUNT(*) AS total FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [table, name],
  );
  if (Number(rows[0]?.total ?? 0) === 0) {
    await db.query(`ALTER TABLE ${table} ADD COLUMN ${name} ${definition}`);
  }
}

function isDuplicate(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "ER_DUP_ENTRY"
  );
}

export async function query<T extends RowDataPacket[]>(sql: string, params: SqlParam[] = []) {
  await ensureSchema();

  try {
    const [rows] = await getPool().query<T>(sql, params);
    return rows;
  } catch (error) {
    console.error("Falha na consulta", error);
    throw new DatabaseError();
  }
}

export async function execute(sql: string, params: SqlParam[] = []) {
  await ensureSchema();

  try {
    const [result] = await getPool().execute<ResultSetHeader>(sql, params);
    return result;
  } catch (error) {
    if (isDuplicate(error)) throw error;
    console.error("Falha ao gravar no banco", error);
    throw new DatabaseError();
  }
}
