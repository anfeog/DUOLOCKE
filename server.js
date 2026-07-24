import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { db, runMigrations } from './src/db.js';
import {
  TOTAL_BADGES,
  BADGES_PER_CHECKPOINT,
  TOTAL_CHECKPOINTS,
  checkpointStatus,
  badgeGate,
  computeFinish,
} from './src/rules.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;

app.set('trust proxy', 1);
app.use(express.json({ limit: '16kb' }));
// En Render cacheamos una hora; en local sin cache para ver los cambios al vuelo.
const isProd = process.env.NODE_ENV === 'production' || Boolean(process.env.RENDER);
app.use(express.static(path.join(__dirname, 'public'), { maxAge: isProd ? '1h' : 0 }));

// ---------------------------------------------------------------- PINs / auth

const PINS = {
  salda: process.env.PIN_SALDA,
  andres: process.env.PIN_ANDRES,
};

// Un PIN corto en una web publica se revienta a fuerza bruta en segundos,
// asi que limitamos los intentos fallidos por IP.
const MAX_FAILS = 8;
const FAIL_WINDOW_MS = 15 * 60 * 1000;
const fails = new Map();

function tooManyAttempts(ip) {
  const entry = fails.get(ip);
  if (!entry) return false;
  if (Date.now() - entry.first > FAIL_WINDOW_MS) {
    fails.delete(ip);
    return false;
  }
  return entry.count >= MAX_FAILS;
}

function registerFail(ip) {
  const entry = fails.get(ip);
  if (!entry || Date.now() - entry.first > FAIL_WINDOW_MS) {
    fails.set(ip, { count: 1, first: Date.now() });
  } else {
    entry.count += 1;
  }
}

function checkPin(slug, pin) {
  const expected = PINS[slug];
  if (!expected) return false;
  return typeof pin === 'string' && pin.trim().toLowerCase() === expected.trim().toLowerCase();
}

/** Middleware: exige identidad + PIN validos. Deja req.auth = { slug }. */
function requireAuth(req, res, next) {
  const ip = req.ip || 'unknown';
  if (tooManyAttempts(ip)) {
    return res.status(429).json({ error: 'Demasiados intentos fallidos. Espera 15 minutos.' });
  }
  const slug = String(req.get('x-duo-player') || req.body?.player || '').toLowerCase();
  const pin = req.get('x-duo-pin') ?? req.body?.pin;
  if (!checkPin(slug, pin)) {
    registerFail(ip);
    return res.status(401).json({ error: 'Identidad o PIN incorrectos.' });
  }
  fails.delete(ip);
  req.auth = { slug };
  next();
}

// ------------------------------------------------------------------- helpers

async function loadPlayers() {
  const res = await db.execute(
    'SELECT id, slug, name, lives, badges, battle_points, avatar FROM players ORDER BY id'
  );
  return res.rows.map((r) => ({
    id: Number(r.id),
    slug: String(r.slug),
    name: String(r.name),
    lives: Number(r.lives),
    badges: Number(r.badges),
    battle_points: Number(r.battle_points),
    avatar: r.avatar ? String(r.avatar) : null,
  }));
}

const VALID_AVATARS = new Set(['avatar1', 'avatar2', 'avatar3', 'avatar4', 'avatar5', 'avatar6']);

async function loadCheckpoints() {
  const res = await db.execute('SELECT number, winner_id, score, resolved_at FROM checkpoints');
  const map = new Map();
  for (const r of res.rows) {
    map.set(Number(r.number), {
      winner_id: r.winner_id === null ? null : Number(r.winner_id),
      score: r.score ? String(r.score) : null,
      resolved_at: r.resolved_at ? String(r.resolved_at) : null,
    });
  }
  return map;
}

async function logEvent(playerId, type, note) {
  await db.execute({
    sql: 'INSERT INTO events (player_id, type, note) VALUES (?, ?, ?)',
    args: [playerId, type, note || null],
  });
}

async function buildState() {
  const [challengeRes, players, checkpoints, eventsRes, deathsRes] = await Promise.all([
    db.execute('SELECT id, name, starting_lives, total_badges FROM challenge LIMIT 1'),
    loadPlayers(),
    loadCheckpoints(),
    db.execute(
      `SELECT e.id, e.type, e.note, e.created_at, p.slug, p.name
         FROM events e JOIN players p ON p.id = e.player_id
        ORDER BY e.id DESC LIMIT 25`
    ),
    db.execute(
      `SELECT d.id, d.dex, d.species, d.nickname, d.note, d.created_at, p.slug
         FROM deaths d JOIN players p ON p.id = d.player_id
        ORDER BY d.id DESC LIMIT 200`
    ),
  ]);

  const challenge = challengeRes.rows[0] || {};
  const startingLives = Number(challenge.starting_lives ?? process.env.STARTING_LIVES ?? 30);
  const resolved = new Set(checkpoints.keys());
  const finish = computeFinish(players, resolved);
  const byId = new Map(players.map((p) => [p.id, p]));

  const checkpointList = [];
  for (let n = 1; n <= TOTAL_CHECKPOINTS; n++) {
    const row = checkpoints.get(n);
    const winner = row?.winner_id != null ? byId.get(row.winner_id) : null;
    checkpointList.push({
      number: n,
      requiredBadges: n * BADGES_PER_CHECKPOINT,
      status: checkpointStatus(n, players, resolved),
      winner: winner ? winner.slug : null,
      winnerName: winner ? winner.name : null,
      score: row?.score ?? null,
    });
  }

  return {
    challenge: {
      name: String(challenge.name ?? 'Duolocke Z Jalmeida'),
      startingLives,
      totalBadges: Number(challenge.total_badges ?? TOTAL_BADGES),
      badgesPerCheckpoint: BADGES_PER_CHECKPOINT,
    },
    players: players.map((p) => {
      const gate = badgeGate(p, resolved, Boolean(finish));
      return {
        slug: p.slug,
        name: p.name,
        lives: p.lives,
        badges: p.badges,
        battlePoints: p.battle_points,
        avatar: p.avatar,
        canGainBadge: gate.allowed,
        blockReason: gate.allowed ? null : gate.reason,
        blockedByCheckpoint: gate.blockedByCheckpoint ?? null,
      };
    }),
    checkpoints: checkpointList,
    nextCheckpoint: checkpointList.find((c) => c.status !== 'done') ?? null,
    finish,
    events: eventsRes.rows.map((r) => ({
      id: Number(r.id),
      type: String(r.type),
      note: r.note ? String(r.note) : null,
      at: String(r.created_at),
      player: String(r.slug),
      playerName: String(r.name),
    })),
    deaths: deathsRes.rows.map((r) => ({
      id: Number(r.id),
      dex: r.dex != null ? Number(r.dex) : null,
      species: r.species ? String(r.species) : null,
      nickname: r.nickname ? String(r.nickname) : null,
      note: r.note ? String(r.note) : null,
      at: String(r.created_at),
      player: String(r.slug),
    })),
    serverTime: new Date().toISOString(),
  };
}

function wrap(handler) {
  return (req, res) => {
    handler(req, res).catch((err) => {
      console.error(err);
      res.status(500).json({ error: 'Error del servidor.' });
    });
  };
}

// -------------------------------------------------------------------- rutas

app.get('/health', (_req, res) => res.status(200).send('ok'));

app.get('/api/state', wrap(async (_req, res) => {
  res.json(await buildState());
}));

// Comprobar identidad + PIN (el cliente lo guarda en localStorage).
app.post('/api/auth', requireAuth, wrap(async (req, res) => {
  const players = await loadPlayers();
  const me = players.find((p) => p.slug === req.auth.slug);
  res.json({ ok: true, player: { slug: me.slug, name: me.name, avatar: me.avatar } });
}));

// Elegir/cambiar avatar (uno de los 6 protagonistas del juego).
app.post('/api/avatar', requireAuth, wrap(async (req, res) => {
  const avatar = String(req.body?.avatar || '');
  if (!VALID_AVATARS.has(avatar)) {
    return res.status(400).json({ error: 'Avatar invalido.' });
  }
  const players = await loadPlayers();
  const me = players.find((p) => p.slug === req.auth.slug);
  await db.execute({ sql: 'UPDATE players SET avatar = ? WHERE id = ?', args: [avatar, me.id] });
  res.json(await buildState());
}));

// Vidas: delta -1 (perder) o +1 (devolver, por si te equivocaste).
app.post('/api/lives', requireAuth, wrap(async (req, res) => {
  const delta = Number(req.body?.delta);
  if (delta !== 1 && delta !== -1) {
    return res.status(400).json({ error: 'delta tiene que ser 1 o -1.' });
  }
  const note = typeof req.body?.note === 'string' ? req.body.note.slice(0, 200).trim() : '';
  // Datos del Pokemon caido (opcionales, solo al perder vida).
  const dex = Number.isInteger(Number(req.body?.dex)) ? Number(req.body.dex) : null;
  const species = typeof req.body?.species === 'string' ? req.body.species.slice(0, 40).trim() : '';
  const nickname = typeof req.body?.nickname === 'string' ? req.body.nickname.slice(0, 40).trim() : '';

  const players = await loadPlayers();
  const me = players.find((p) => p.slug === req.auth.slug);
  const challengeRes = await db.execute('SELECT starting_lives FROM challenge LIMIT 1');
  const startingLives = Number(
    challengeRes.rows[0]?.starting_lives ?? process.env.STARTING_LIVES ?? 30
  );

  const next = me.lives + delta;
  if (next < 0) return res.status(409).json({ error: 'Ya estas a 0 vidas.' });
  if (next > startingLives) {
    return res.status(409).json({ error: `No puedes pasar de ${startingLives} vidas.` });
  }

  await db.execute({ sql: 'UPDATE players SET lives = ? WHERE id = ?', args: [next, me.id] });

  if (delta === -1) {
    // Nota del historial: mote + especie si se indicaron.
    const label = [nickname, species && `(${species})`].filter(Boolean).join(' ');
    await logEvent(me.id, 'life_lost', label || note);
    if (species || nickname) {
      await db.execute({
        sql: 'INSERT INTO deaths (player_id, dex, species, nickname, note) VALUES (?, ?, ?, ?, ?)',
        args: [me.id, dex, species || null, nickname || null, note || null],
      });
    }
  } else {
    // Devolver una vida (correccion): quita la ultima muerte de ese jugador.
    await logEvent(me.id, 'life_restored', note);
    await db.execute({
      sql: 'DELETE FROM deaths WHERE id = (SELECT id FROM deaths WHERE player_id = ? ORDER BY id DESC LIMIT 1)',
      args: [me.id],
    });
  }
  res.json(await buildState());
}));

// Medallas: delta -1 o +1, con el bloqueo del combate cada 2 gimnasios.
app.post('/api/badges', requireAuth, wrap(async (req, res) => {
  const delta = Number(req.body?.delta);
  if (delta !== 1 && delta !== -1) {
    return res.status(400).json({ error: 'delta tiene que ser 1 o -1.' });
  }

  const players = await loadPlayers();
  const me = players.find((p) => p.slug === req.auth.slug);
  const checkpoints = await loadCheckpoints();
  const resolved = new Set(checkpoints.keys());
  const finish = computeFinish(players, resolved);

  if (delta === 1) {
    const gate = badgeGate(me, resolved, Boolean(finish));
    if (!gate.allowed) return res.status(409).json({ error: gate.reason });
  } else {
    if (me.badges <= 0) return res.status(409).json({ error: 'No tienes medallas que quitar.' });
    // Si el checkpoint de esta medalla ya se jugo, quitarla dejaria el historial incoherente.
    const cp = me.badges / BADGES_PER_CHECKPOINT;
    if (Number.isInteger(cp) && resolved.has(cp)) {
      return res.status(409).json({
        error: `No puedes quitar la medalla ${me.badges}: el combate ${cp} ya esta jugado. Borra antes el resultado del combate.`,
      });
    }
  }

  const next = me.badges + delta;
  await db.execute({ sql: 'UPDATE players SET badges = ? WHERE id = ?', args: [next, me.id] });
  await logEvent(me.id, delta === 1 ? 'badge' : 'badge_removed', `Gimnasio ${delta === 1 ? next : me.badges}`);
  res.json(await buildState());
}));

// Resultado del combate Bo3 de un checkpoint. Lo puede subir cualquiera de los dos.
app.post('/api/checkpoint', requireAuth, wrap(async (req, res) => {
  const number = Number(req.body?.number);
  const winnerSlug = String(req.body?.winner || '').toLowerCase();
  const score = typeof req.body?.score === 'string' ? req.body.score.slice(0, 20).trim() : '';

  if (!Number.isInteger(number) || number < 1 || number > TOTAL_CHECKPOINTS) {
    return res.status(400).json({ error: 'Numero de combate invalido.' });
  }

  const players = await loadPlayers();
  const winner = players.find((p) => p.slug === winnerSlug);
  if (!winner) return res.status(400).json({ error: 'Ganador invalido.' });

  const checkpoints = await loadCheckpoints();
  const resolved = new Set(checkpoints.keys());
  if (resolved.has(number)) {
    return res.status(409).json({ error: `El combate ${number} ya tiene resultado.` });
  }

  const status = checkpointStatus(number, players, resolved);
  if (status !== 'ready') {
    const required = number * BADGES_PER_CHECKPOINT;
    return res.status(409).json({
      error: `El combate ${number} todavia no se puede jugar: hacen falta ${required} medallas de los dos.`,
    });
  }

  await db.execute({
    sql: 'INSERT INTO checkpoints (number, winner_id, score) VALUES (?, ?, ?)',
    args: [number, winner.id, score || null],
  });
  await db.execute({
    sql: 'UPDATE players SET battle_points = battle_points + 1 WHERE id = ?',
    args: [winner.id],
  });
  await logEvent(winner.id, 'battle_won', `Combate ${number}${score ? ` (${score})` : ''}`);

  res.json(await buildState());
}));

// Borrar el resultado de un combate (si se subio mal).
app.delete('/api/checkpoint/:number', requireAuth, wrap(async (req, res) => {
  const number = Number(req.params.number);
  if (!Number.isInteger(number) || number < 1 || number > TOTAL_CHECKPOINTS) {
    return res.status(400).json({ error: 'Numero de combate invalido.' });
  }
  const checkpoints = await loadCheckpoints();
  const row = checkpoints.get(number);
  if (!row) return res.status(404).json({ error: `El combate ${number} no tiene resultado.` });

  // Solo se puede deshacer el ultimo combate jugado.
  const last = Math.max(...checkpoints.keys());
  if (number !== last) {
    return res.status(409).json({ error: `Solo puedes borrar el ultimo combate jugado (el ${last}).` });
  }

  // Y solo si nadie ha avanzado mas alla de ese checkpoint.
  const players = await loadPlayers();
  const required = number * BADGES_PER_CHECKPOINT;
  const ahead = players.find((p) => p.badges > required);
  if (ahead) {
    return res.status(409).json({
      error: `${ahead.name} ya tiene ${ahead.badges} medallas. Quitad primero las medallas posteriores al combate ${number}.`,
    });
  }

  await db.execute({ sql: 'DELETE FROM checkpoints WHERE number = ?', args: [number] });
  if (row.winner_id != null) {
    await db.execute({
      sql: 'UPDATE players SET battle_points = MAX(battle_points - 1, 0) WHERE id = ?',
      args: [row.winner_id],
    });
    await logEvent(row.winner_id, 'battle_undone', `Resultado del combate ${number} borrado`);
  }
  res.json(await buildState());
}));

// Aplica migraciones pendientes antes de aceptar trafico.
runMigrations()
  .catch((err) => console.error('Fallo en migraciones:', err))
  .finally(() => {
    app.listen(PORT, () => {
      console.log(`Duolocke Z Jalmeida escuchando en http://localhost:${PORT}`);
    });
  });
