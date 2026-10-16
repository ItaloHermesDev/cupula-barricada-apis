import "server-only";
import type { PoolConnection, ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { DatabaseError, ensureSchema, getPool, query } from "@/lib/db";
import { isPageKey, type PageKey } from "@/lib/pages";

interface UserRow extends RowDataPacket {
  id: number;
  name: string;
  email: string;
  password_hash: string;
}

interface PublicUserRow extends RowDataPacket {
  id: number;
  name: string;
  email: string;
}

interface PageRow extends RowDataPacket {
  page_key: string;
}

interface CountRow extends RowDataPacket {
  total: number;
}

interface UserListRow extends RowDataPacket {
  id: number;
  name: string;
  email: string;
  created_at: Date | string;
  page_key: string | null;
}

export type ListedUser = {
  id: string;
  name: string;
  email: string;
  createdAt: string;
  pages: PageKey[];
};

function formatDate(value: Date | string) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short" }).format(date);
}

export async function findUserByEmail(email: string) {
  const rows = await query<UserRow[]>(
    "SELECT id, name, email, password_hash FROM users WHERE email = ? LIMIT 1",
    [email],
  );
  return rows[0] ?? null;
}

export async function findUserById(id: string) {
  const numericId = Number(id);
  if (!Number.isInteger(numericId) || numericId <= 0) return null;

  const rows = await query<PublicUserRow[]>(
    "SELECT id, name, email FROM users WHERE id = ? LIMIT 1",
    [numericId],
  );
  return rows[0] ?? null;
}

export async function listPageKeysForUser(userId: number) {
  const rows = await query<PageRow[]>("SELECT page_key FROM user_pages WHERE user_id = ?", [
    userId,
  ]);
  return rows.map((row) => row.page_key).filter(isPageKey);
}

export async function countUsersWithPage(pageKey: PageKey) {
  const rows = await query<CountRow[]>(
    "SELECT COUNT(*) AS total FROM user_pages WHERE page_key = ?",
    [pageKey],
  );
  return Number(rows[0]?.total ?? 0);
}

export async function listUsersWithPages() {
  const rows = await query<UserListRow[]>(
    `SELECT u.id, u.name, u.email, u.created_at, up.page_key
     FROM users u
     LEFT JOIN user_pages up ON up.user_id = u.id
     ORDER BY u.name ASC, u.id ASC`,
  );

  const users = new Map<number, ListedUser>();

  for (const row of rows) {
    const current = users.get(row.id) ?? {
      id: String(row.id),
      name: row.name,
      email: row.email,
      createdAt: formatDate(row.created_at),
      pages: [],
    };

    if (row.page_key && isPageKey(row.page_key) && !current.pages.includes(row.page_key)) {
      current.pages.push(row.page_key);
    }

    users.set(row.id, current);
  }

  return [...users.values()];
}

async function withTransaction<T>(run: (connection: PoolConnection) => Promise<T>) {
  await ensureSchema();
  const connection = await getPool().getConnection();

  try {
    await connection.beginTransaction();
    const result = await run(connection);
    await connection.commit();
    return result;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export async function createUserWithPages(input: {
  name: string;
  email: string;
  passwordHash: string;
  pages: PageKey[];
}) {
  return withTransaction(async (connection) => {
    const [result] = await connection.execute<ResultSetHeader>(
      "INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)",
      [input.name, input.email, input.passwordHash],
    );

    for (const page of input.pages) {
      await connection.execute("INSERT INTO user_pages (user_id, page_key) VALUES (?, ?)", [
        result.insertId,
        page,
      ]);
    }

    return result.insertId;
  });
}

export async function replaceUserPages(userId: number, pages: PageKey[]) {
  try {
    await withTransaction(async (connection) => {
      await connection.execute("DELETE FROM user_pages WHERE user_id = ?", [userId]);

      for (const page of pages) {
        await connection.execute("INSERT INTO user_pages (user_id, page_key) VALUES (?, ?)", [
          userId,
          page,
        ]);
      }
    });
  } catch (error) {
    console.error("Falha ao atualizar páginas", error);
    throw new DatabaseError();
  }
}
