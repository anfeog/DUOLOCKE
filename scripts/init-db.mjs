import 'dotenv/config';
import { db, SCHEMA, runMigrations } from '../src/db.js';

const STARTING_LIVES = Number(process.env.STARTING_LIVES ?? 30);
const CHALLENGE_NAME = 'Duolocke Z Jalmeida';
const PLAYERS = [
  { slug: 'salda', name: 'Salda' },
  { slug: 'andres', name: 'Andres' },
];

const reset = process.argv.includes('--reset');

for (const stmt of SCHEMA) {
  await db.execute(stmt);
}
await runMigrations();
console.log('Tablas creadas/verificadas.');

if (reset) {
  await db.execute('DELETE FROM deaths');
  await db.execute('DELETE FROM events');
  await db.execute('DELETE FROM checkpoints');
  await db.execute('DELETE FROM players');
  await db.execute('DELETE FROM challenge');
  console.log('Datos borrados (--reset).');
}

const existing = await db.execute('SELECT id FROM challenge LIMIT 1');
let challengeId;

if (existing.rows.length === 0) {
  await db.execute({
    sql: 'INSERT INTO challenge (id, name, starting_lives, total_badges) VALUES (1, ?, ?, 12)',
    args: [CHALLENGE_NAME, STARTING_LIVES],
  });
  challengeId = 1;
  console.log(`Reto creado: "${CHALLENGE_NAME}" con ${STARTING_LIVES} vidas.`);
} else {
  challengeId = Number(existing.rows[0].id);
  console.log('El reto ya existia, no se toca.');
}

for (const p of PLAYERS) {
  const found = await db.execute({
    sql: 'SELECT id FROM players WHERE slug = ?',
    args: [p.slug],
  });
  if (found.rows.length === 0) {
    await db.execute({
      sql: 'INSERT INTO players (challenge_id, slug, name, lives, badges, battle_points) VALUES (?, ?, ?, ?, 0, 0)',
      args: [challengeId, p.slug, p.name, STARTING_LIVES],
    });
    console.log(`Jugador creado: ${p.name} (${STARTING_LIVES} vidas)`);
  } else {
    console.log(`Jugador ${p.name} ya existia, no se toca.`);
  }
}

const state = await db.execute('SELECT slug, name, lives, badges, battle_points FROM players ORDER BY id');
console.table(state.rows);
process.exit(0);
