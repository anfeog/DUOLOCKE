import { createClient } from '@libsql/client';

const url = process.env.TURSO_DATABASE_URL;
const authToken = process.env.TURSO_AUTH_TOKEN;

if (!url) {
  throw new Error('Falta TURSO_DATABASE_URL en el entorno');
}

export const db = createClient({ url, authToken });

export const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS challenge (
     id INTEGER PRIMARY KEY,
     name TEXT NOT NULL,
     starting_lives INTEGER NOT NULL,
     total_badges INTEGER NOT NULL DEFAULT 12,
     created_at TEXT DEFAULT (datetime('now'))
   )`,
  `CREATE TABLE IF NOT EXISTS players (
     id INTEGER PRIMARY KEY,
     challenge_id INTEGER REFERENCES challenge(id),
     slug TEXT NOT NULL UNIQUE,
     name TEXT NOT NULL,
     lives INTEGER NOT NULL,
     badges INTEGER NOT NULL DEFAULT 0,
     battle_points INTEGER NOT NULL DEFAULT 0,
     avatar TEXT
   )`,
  // Un checkpoint por cada 2 gimnasios (6 en total). Sin fila = todavia no jugado.
  `CREATE TABLE IF NOT EXISTS checkpoints (
     number INTEGER PRIMARY KEY,
     winner_id INTEGER REFERENCES players(id),
     score TEXT,
     resolved_at TEXT DEFAULT (datetime('now'))
   )`,
  `CREATE TABLE IF NOT EXISTS events (
     id INTEGER PRIMARY KEY,
     player_id INTEGER REFERENCES players(id),
     type TEXT NOT NULL,
     note TEXT,
     created_at TEXT DEFAULT (datetime('now'))
   )`,
  `CREATE INDEX IF NOT EXISTS idx_events_created ON events(created_at DESC)`,
];

// Migraciones para DBs que ya existian antes de anadir columnas nuevas.
// Se ejecutan ignorando el error "duplicate column" si ya estan aplicadas.
const MIGRATIONS = [
  `ALTER TABLE players ADD COLUMN avatar TEXT`,
];

export async function runMigrations() {
  for (const sql of MIGRATIONS) {
    try {
      await db.execute(sql);
    } catch (err) {
      if (!/duplicate column|already exists/i.test(String(err?.message))) throw err;
    }
  }
}
