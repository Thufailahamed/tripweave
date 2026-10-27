/**
 * Test-only D1 emulation on top of node:sqlite (real SQLite, same SQL dialect as D1). The real
 * migrations are applied, foreign keys are enforced, and the D1 100-bound-parameter limit is
 * simulated so repository code that would fail on D1 also fails here.
 * Never import this from Worker code.
 */
import { DatabaseSync } from "node:sqlite";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { D1ResultLike, D1StatementLike, Db } from "./db";

type SqlValue = string | number | bigint | null | Uint8Array;

class Statement implements D1StatementLike {
  private values: SqlValue[] = [];
  constructor(
    private readonly sqlite: DatabaseSync,
    private readonly sql: string,
  ) {}
  bind(...values: unknown[]): D1StatementLike {
    if (values.length > 100) throw new Error("D1_ERROR: too many SQL variables (limit 100)");
    for (const v of values) {
      if (v === undefined) throw new Error("D1_TYPE_ERROR: Type 'undefined' not supported for value 'undefined'");
    }
    this.values = values.map((v) => (typeof v === "boolean" ? (v ? 1 : 0) : (v as SqlValue)));
    return this;
  }
  async first<T = unknown>(): Promise<T | null> {
    const row = this.sqlite.prepare(this.sql).get(...this.values);
    return (row ? { ...row } : null) as T | null;
  }
  async all<T = unknown>(): Promise<D1ResultLike<T>> {
    const rows = this.sqlite.prepare(this.sql).all(...this.values).map((r) => ({ ...r }));
    return { results: rows as T[], success: true };
  }
  async run(): Promise<D1ResultLike> {
    const r = this.sqlite.prepare(this.sql).run(...this.values);
    return { success: true, meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) } };
  }
  runSync(): D1ResultLike {
    const r = this.sqlite.prepare(this.sql).run(...this.values);
    return { success: true, meta: { changes: Number(r.changes) } };
  }
  allSync(): D1ResultLike {
    const rows = this.sqlite.prepare(this.sql).all(...this.values).map((x) => ({ ...x }));
    return { success: true, results: rows };
  }
}

export class TestD1 implements Db {
  readonly sqlite: DatabaseSync;
  constructor() {
    this.sqlite = new DatabaseSync(":memory:");
    this.sqlite.exec("PRAGMA foreign_keys = ON");
  }
  prepare(sql: string): D1StatementLike {
    return new Statement(this.sqlite, sql);
  }
  /** D1 batches are atomic: all statements commit or none do. */
  async batch(statements: D1StatementLike[]): Promise<D1ResultLike[]> {
    this.sqlite.exec("BEGIN");
    try {
      const out: D1ResultLike[] = [];
      for (const s of statements) {
        const st = s as Statement;
        out.push(/^\s*(select|with)/i.test((st as unknown as { sql: string }).sql) ? st.allSync() : st.runSync());
      }
      this.sqlite.exec("COMMIT");
      return out;
    } catch (e) {
      this.sqlite.exec("ROLLBACK");
      throw e;
    }
  }
  exec(sql: string): void {
    this.sqlite.exec(sql);
  }
}

export function migrationsDir(): string {
  return join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "migrations");
}

export function applyMigrations(db: TestD1, dir = migrationsDir()): string[] {
  const files = readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort();
  for (const f of files) db.exec(readFileSync(join(dir, f), "utf8"));
  return files;
}

export function createTestDb(): TestD1 {
  const db = new TestD1();
  applyMigrations(db);
  return db;
}
