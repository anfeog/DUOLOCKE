/* =============== Duolocke Z Jalmeida — cliente =============== */

const POLL_MS = 20000;
const STORE_PLAYER = 'duo.player';
const STORE_PIN = 'duo.pin';

const $ = (sel) => document.querySelector(sel);

let state = null;
let me = null;          // slug del jugador identificado, o null si es espectador
let pin = null;
let pollTimer = null;
let busy = false;

const AVATARS = ['avatar1', 'avatar2', 'avatar3', 'avatar4', 'avatar5', 'avatar6'];
const myPlayer = () => (state ? state.players.find((p) => p.slug === me) : null);

// Pokedex para el buscador del cementerio (se carga una vez).
let POKEDEX = [];
fetch('assets/data/pokemon.json')
  .then((r) => r.json())
  .then((data) => { POKEDEX = data; })
  .catch(() => {});
const pkmnIcon = (n) => `assets/sprites/pokemon/pkmn${n}.png`;

/* --------------------------------------------------------------- sonidos */
/* Efectos sacados del juego: faint (perder vida) y Medalla (gimnasio). */

const SND = {
  life: new Audio('assets/audio/life-lost.mp3'),
  badge: new Audio('assets/audio/badge.ogg'),
};
for (const a of Object.values(SND)) a.preload = 'auto';

let audioUnlocked = false;
function unlockAudio() {
  if (audioUnlocked) return;
  audioUnlocked = true;
  // Los navegadores solo dejan sonar tras un gesto del usuario.
  for (const a of Object.values(SND)) {
    a.play().then(() => { a.pause(); a.currentTime = 0; }).catch(() => {});
  }
}
document.addEventListener('pointerdown', unlockAudio, { once: true });

function playSound(key) {
  const a = SND[key];
  if (!a) return;
  try { a.currentTime = 0; a.play().catch(() => {}); } catch { /* ignore */ }
}

/* ---------------------------------------------------------------- API */

async function api(path, { method = 'GET', body } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (me && pin) {
    headers['x-duo-player'] = me;
    headers['x-duo-pin'] = pin;
  }
  const res = await fetch(path, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Algo falló.');
  return data;
}

async function refresh() {
  try {
    state = await api('/api/state');
    render();
    maybeAskAvatar();
    checkRivalNews();
    $('#sync').textContent = 'Actualizado ' + new Date().toLocaleTimeString('es-ES', {
      hour: '2-digit', minute: '2-digit',
    });
  } catch (err) {
    $('#sync').textContent = 'Sin conexión';
  }
}

/* ------------------------------------------------- avisos del rival */
// Compara el estado del rival con lo ultimo que vio este jugador y avisa.

function checkRivalNews() {
  if (!me || !state) return;
  const rival = state.players.find((p) => p.slug !== me);
  if (!rival) return;

  const key = `duo.seen.${me}`;
  const cur = { lives: rival.lives, badges: rival.badges, bp: rival.battlePoints };
  let prev = null;
  try { prev = JSON.parse(localStorage.getItem(key) || 'null'); } catch { prev = null; }

  if (prev) {
    const parts = [];
    const dl = cur.lives - prev.lives;
    if (dl < 0) parts.push(`perdió ${-dl} vida${-dl > 1 ? 's' : ''}`);
    else if (dl > 0) parts.push(`recuperó ${dl} vida${dl > 1 ? 's' : ''}`);
    const db = cur.badges - prev.badges;
    if (db > 0) parts.push(`+${db} medalla${db > 1 ? 's' : ''}`);
    else if (db < 0) parts.push(`−${-db} medalla${-db > 1 ? 's' : ''}`);
    const dp = cur.bp - prev.bp;
    if (dp > 0) parts.push(`ganó ${dp} combate${dp > 1 ? 's' : ''}`);

    if (parts.length) {
      const news = $('#news');
      news.innerHTML = `🔔 <span class="news-who">${rival.name}</span> ${parts.join(' · ')} <span style="opacity:.75;font-weight:400">desde tu última visita</span>`;
      news.classList.remove('hidden');
    }
  }
  // Guarda lo visto ahora para no repetir el aviso.
  localStorage.setItem(key, JSON.stringify(cur));
}

$('#news').addEventListener('click', () => $('#news').classList.add('hidden'));

function startPolling() {
  clearInterval(pollTimer);
  pollTimer = setInterval(refresh, POLL_MS);
}

document.addEventListener('visibilitychange', () => {
  if (!document.hidden) refresh();
});

/* ------------------------------------------------------------ identidad */

function showIdentity() {
  $('#identity').classList.remove('hidden');
  $('#app').classList.add('hidden');
}

function enterApp() {
  $('#identity').classList.add('hidden');
  $('#avatar-picker').classList.add('hidden');
  $('#app').classList.remove('hidden');
  $('#whoami').textContent = me
    ? `Eres ${me === 'salda' ? 'Salda' : 'Andres'} · cambiar`
    : 'Solo mirando · entrar';
  refresh();
  startPolling();
}

/* ------------------------------------------------------- selector avatar */

let avatarPickerOpen = false;
let selectedAvatar = null;

function openAvatarPicker() {
  avatarPickerOpen = true;
  selectedAvatar = myPlayer()?.avatar || null;
  const grid = $('#avatar-grid');
  grid.innerHTML = AVATARS.map((a) => `
    <button class="avatar-opt${a === selectedAvatar ? ' sel' : ''}" data-avatar="${a}">
      <img src="assets/sprites/avatars/${a}.png" alt="Personaje">
    </button>`).join('');
  grid.querySelectorAll('.avatar-opt').forEach((btn) => {
    btn.addEventListener('click', () => {
      selectedAvatar = btn.dataset.avatar;
      grid.querySelectorAll('.avatar-opt').forEach((b) => b.classList.remove('sel'));
      btn.classList.add('sel');
      $('#avatar-confirm').disabled = false;
    });
  });
  $('#avatar-q').textContent = `${me === 'salda' ? 'Salda' : 'Andres'}, elige tu personaje`;
  $('#avatar-confirm').disabled = !selectedAvatar;
  $('#avatar-error').textContent = '';
  $('#avatar-picker').classList.remove('hidden');
  $('#app').classList.add('hidden');
}

async function confirmAvatar() {
  if (!selectedAvatar) return;
  const btn = $('#avatar-confirm');
  btn.disabled = true;
  try {
    state = await api('/api/avatar', { method: 'POST', body: { avatar: selectedAvatar } });
    avatarPickerOpen = false;
    $('#avatar-picker').classList.add('hidden');
    $('#app').classList.remove('hidden');
    render();
  } catch (err) {
    $('#avatar-error').textContent = err.message;
    btn.disabled = false;
  }
}
$('#avatar-confirm').addEventListener('click', confirmAvatar);

// Primera vez que entra un jugador sin avatar -> le obliga a elegir.
function maybeAskAvatar() {
  if (!me || avatarPickerOpen) return;
  const mp = myPlayer();
  if (mp && !mp.avatar) openAvatarPicker();
}

let pendingSlug = null;

document.querySelectorAll('.who').forEach((btn) => {
  btn.addEventListener('click', () => {
    pendingSlug = btn.dataset.slug;
    $('#pin-who').textContent = btn.textContent;
    $('#pin-error').textContent = '';
    $('#pin-input').value = '';
    $('.identity-buttons').classList.add('hidden');
    $('#pin-form').classList.remove('hidden');
    $('#pin-input').focus();
  });
});

$('#pin-back').addEventListener('click', () => {
  $('#pin-form').classList.add('hidden');
  $('.identity-buttons').classList.remove('hidden');
});

$('#pin-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const value = $('#pin-input').value;
  if (!value) return;
  const btn = $('#pin-form button[type="submit"]');
  btn.disabled = true;
  try {
    me = pendingSlug;
    pin = value;
    await api('/api/auth', { method: 'POST', body: {} });
    localStorage.setItem(STORE_PLAYER, me);
    localStorage.setItem(STORE_PIN, pin);
    enterApp();
  } catch (err) {
    me = null;
    pin = null;
    $('#pin-error').textContent = err.message;
  } finally {
    btn.disabled = false;
  }
});

$('#spectator').addEventListener('click', () => {
  me = null;
  pin = null;
  localStorage.removeItem(STORE_PLAYER);
  localStorage.removeItem(STORE_PIN);
  enterApp();
});

$('#whoami').addEventListener('click', () => {
  $('#pin-form').classList.add('hidden');
  $('.identity-buttons').classList.remove('hidden');
  showIdentity();
});

$('#refresh').addEventListener('click', refresh);

/* --------------------------------------------------------------- modal */

function confirmModal({ title, text, withNote = false, extraHTML = '', okLabel = 'Confirmar' }) {
  return new Promise((resolve) => {
    $('#modal-title').textContent = title;
    $('#modal-text').textContent = text;
    $('#modal-ok').textContent = okLabel;
    const note = $('#modal-note');
    note.value = '';
    note.classList.toggle('hidden', !withNote);
    $('#modal-extra').innerHTML = extraHTML;
    $('#modal').classList.remove('hidden');

    const close = (result) => {
      $('#modal').classList.add('hidden');
      $('#modal-ok').removeEventListener('click', ok);
      $('#modal-cancel').removeEventListener('click', cancel);
      resolve(result);
    };
    const ok = () => close({ confirmed: true, note: note.value.trim(), extra: $('#modal-extra') });
    const cancel = () => close({ confirmed: false });

    $('#modal-ok').addEventListener('click', ok);
    $('#modal-cancel').addEventListener('click', cancel);
  });
}

// Modal de perder vida: incluye buscador de Pokemon caido + mote.
function askLifeLoss(player) {
  return new Promise((resolve) => {
    $('#modal-title').textContent = 'Vas a quitar una vida';
    $('#modal-text').textContent = `Pasarás de ${player.lives} a ${player.lives - 1} vidas.`;
    $('#modal-ok').textContent = 'Quitar vida';
    $('#modal-note').classList.add('hidden');
    $('#modal-extra').innerHTML = `
      <div class="death-picker">
        <label>¿Qué Pokémon cayó? (opcional)</label>
        <div id="dp-selected" class="dp-selected"></div>
        <input id="dp-search" type="text" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="Busca: Charmander...">
        <div id="dp-results" class="dp-results"></div>
        <input id="dp-nick" type="text" maxlength="40" placeholder="Mote (opcional)">
      </div>`;
    $('#modal').classList.remove('hidden');

    const search = $('#dp-search');
    const results = $('#dp-results');
    const selBox = $('#dp-selected');
    let sel = { dex: null, species: null };

    const clearSelection = () => {
      sel = { dex: null, species: null };
      selBox.classList.remove('show');
      selBox.innerHTML = '';
    };

    const pick = (n, name) => {
      sel = { dex: n, species: name };
      selBox.innerHTML = `
        <img src="${pkmnIcon(n)}" alt="">
        <span class="sp-name">${name}</span>
        <button type="button" class="sp-clear" title="Quitar">✕</button>`;
      selBox.classList.add('show');
      selBox.querySelector('.sp-clear').addEventListener('click', () => {
        clearSelection();
        search.value = '';
        search.focus();
      });
      results.classList.remove('show');
      results.innerHTML = '';
      search.value = name;
    };

    search.addEventListener('input', () => {
      const q = search.value.trim().toLowerCase();
      if (q.length < 2) { results.classList.remove('show'); results.innerHTML = ''; return; }
      const hits = POKEDEX
        .filter((p) => p.name.toLowerCase().includes(q))
        .sort((a, b) => (a.name.toLowerCase().startsWith(q) ? 0 : 1) - (b.name.toLowerCase().startsWith(q) ? 0 : 1))
        .slice(0, 8);
      results.innerHTML = hits.map((p) => `
        <button type="button" class="dp-opt" data-n="${p.n}" data-name="${p.name}">
          <img src="${pkmnIcon(p.n)}" alt=""><span>${p.name}</span>
        </button>`).join('');
      results.classList.toggle('show', hits.length > 0);
      results.querySelectorAll('.dp-opt').forEach((b) => {
        b.addEventListener('click', () => pick(Number(b.dataset.n), b.dataset.name));
      });
    });

    const close = (result) => {
      $('#modal').classList.add('hidden');
      $('#modal-ok').removeEventListener('click', ok);
      $('#modal-cancel').removeEventListener('click', cancel);
      resolve(result);
    };
    const ok = () => close({
      confirmed: true,
      dex: sel.dex,
      species: sel.species,
      nickname: $('#dp-nick').value.trim(),
    });
    const cancel = () => close({ confirmed: false });
    $('#modal-ok').addEventListener('click', ok);
    $('#modal-cancel').addEventListener('click', cancel);
  });
}

let toastTimer = null;
function toast(msg, isError = false) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.toggle('err', isError);
  el.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.add('hidden'), 3400);
}

/* -------------------------------------------------------------- acciones */

async function send(path, body, method = 'POST') {
  if (busy) return false;
  busy = true;
  try {
    state = await api(path, { method, body });
    render();
    return true;
  } catch (err) {
    toast(err.message, true);
    if (/PIN|Identidad/i.test(err.message)) showIdentity();
    return false;
  } finally {
    busy = false;
  }
}

async function onBallTap(index, player) {
  if (player.slug !== me) return;
  const filled = index < player.lives;
  const r = filled
    ? await askLifeLoss(player)
    : await confirmModal({
        title: 'Vas a poner una vida',
        text: `Pasarás de ${player.lives} a ${player.lives + 1} vidas. Úsalo solo si te equivocaste.`,
        okLabel: 'Poner vida',
      });
  if (!r.confirmed) return;
  const livesBefore = player.lives;
  const body = filled
    ? { delta: -1, dex: r.dex, species: r.species, nickname: r.nickname }
    : { delta: 1 };
  const ok = await send('/api/lives', body);
  if (ok && filled) {
    playSound('life');
    const ball = document.querySelector(`.card.me .ball[data-index="${livesBefore - 1}"]`);
    if (ball) {
      ball.classList.add('just-lost');
      setTimeout(() => ball.classList.remove('just-lost'), 400);
    }
  }
}

async function onBadgeTap(index, player) {
  if (player.slug !== me) return;
  const owned = index < player.badges;
  const isNext = index === player.badges;

  if (isNext && !player.canGainBadge) {
    toast(player.blockReason, true);
    return;
  }
  if (!owned && !isNext) {
    toast('Marca las medallas en orden.', true);
    return;
  }
  const isLastOwned = owned && index === player.badges - 1;
  if (owned && !isLastOwned) {
    toast('Solo puedes quitar la última medalla conseguida.', true);
    return;
  }

  const r = await confirmModal(
    isNext
      ? {
          title: `Medalla ${index + 1}`,
          text: `¿Ganaste el Gimnasio ${index + 1}?`,
          okLabel: 'Sí, conseguida',
        }
      : {
          title: `Quitar medalla ${index + 1}`,
          text: `Vas a quitarte la medalla del Gimnasio ${index + 1}.`,
          okLabel: 'Quitar',
        }
  );
  if (!r.confirmed) return;
  const ok = await send('/api/badges', { delta: isNext ? 1 : -1 });
  if (ok && isNext) playSound('badge');

  const fresh = state.players.find((p) => p.slug === me);
  if (isNext && fresh && !fresh.canGainBadge && fresh.blockedByCheckpoint) {
    toast(`¡Combate ${fresh.blockedByCheckpoint} desbloqueado! No puedes avanzar hasta jugarlo.`);
  }
}

async function onCheckpointSubmit(cp) {
  const [p1, p2] = state.players;
  const extraHTML = `
    <div class="winner-choice">
      <span style="font-size:13px;color:var(--muted)">¿Quién ganó el Bo3?</span>
      <button type="button" data-winner="${p1.slug}">${p1.name}</button>
      <button type="button" data-winner="${p2.slug}">${p2.name}</button>
    </div>
    <input id="cp-score" type="text" maxlength="10" placeholder="Resultado (opcional): 2-1">
  `;

  const modalPromise = confirmModal({
    title: `Combate ${cp.number}`,
    text: `Bo3 al llegar a ${cp.requiredBadges} medallas. El ganador se lleva 1 punto de combate.`,
    extraHTML,
    okLabel: 'Guardar resultado',
  });

  let winner = null;
  $('#modal-extra').querySelectorAll('[data-winner]').forEach((btn) => {
    btn.addEventListener('click', () => {
      winner = btn.dataset.winner;
      $('#modal-extra').querySelectorAll('[data-winner]').forEach((b) => b.classList.remove('sel'));
      btn.classList.add('sel');
    });
  });

  const scoreInput = $('#cp-score');

  const r = await modalPromise;
  if (!r.confirmed) return;
  if (!winner) {
    toast('Elige quién ganó el combate.', true);
    return;
  }
  await send('/api/checkpoint', {
    number: cp.number,
    winner,
    score: scoreInput?.value.trim() || '',
  });
}

async function onCheckpointUndo(cp) {
  const r = await confirmModal({
    title: `Borrar combate ${cp.number}`,
    text: `Se borrará el resultado (ganó ${cp.winnerName}) y se le quitará 1 punto de combate.`,
    okLabel: 'Borrar resultado',
  });
  if (!r.confirmed) return;
  await send(`/api/checkpoint/${cp.number}`, null, 'DELETE');
}

/* ------------------------------------------------------------- renderizado */

function timeAgo(iso) {
  const then = new Date(iso.replace(' ', 'T') + (iso.endsWith('Z') ? '' : 'Z'));
  const secs = Math.floor((Date.now() - then.getTime()) / 1000);
  if (secs < 60) return 'ahora';
  if (secs < 3600) return `hace ${Math.floor(secs / 60)} min`;
  if (secs < 86400) return `hace ${Math.floor(secs / 3600)} h`;
  return `hace ${Math.floor(secs / 86400)} d`;
}

function renderCard(el, player) {
  const total = state.challenge.startingLives;
  const isMe = player.slug === me;
  el.className = 'card' + (isMe ? ' me' : '') + (player.lives <= 0 ? ' dead' : '');

  const balls = Array.from({ length: total }, (_, i) => {
    const spent = i >= player.lives;
    return `<button class="ball${spent ? ' spent' : ''}" data-index="${i}" ${isMe ? '' : 'disabled'}>
      <img src="assets/sprites/ball.png" alt="">
    </button>`;
  }).join('');

  const badges = Array.from({ length: state.challenge.totalBadges }, (_, i) => {
    const owned = i < player.badges;
    const isNext = i === player.badges;
    const blocked = isNext && !player.canGainBadge && player.blockedByCheckpoint;
    const cls = [
      'badge',
      owned ? '' : 'locked',
      isNext && player.canGainBadge ? 'next' : '',
      blocked ? 'blocked' : '',
    ].filter(Boolean).join(' ');
    const n = String(i + 1).padStart(2, '0');
    return `<button class="${cls}" data-index="${i}" title="Gimnasio ${i + 1}" ${isMe ? '' : 'disabled'}>
      <img src="assets/sprites/badges/badge${n}.png" alt="Gimnasio ${i + 1}">
    </button>`;
  }).join('');

  const avatarImg = player.avatar
    ? `<img src="assets/sprites/avatars/${player.avatar}.png" alt="Personaje de ${player.name}">`
    : '';

  el.innerHTML = `
    <h2>${player.name}</h2>
    <div class="card-avatar${isMe ? ' editable' : ''}" title="${isMe ? 'Cambiar personaje' : ''}">${avatarImg}</div>

    <div class="section-label">VIDAS <span class="count">${player.lives}/${total}</span></div>
    <div class="lives">${balls}</div>

    <div class="section-label">MEDALLAS <span class="count">${player.badges}/${state.challenge.totalBadges}</span></div>
    <div class="badges">${badges}</div>

    ${player.blockReason && player.lives > 0 && player.badges < state.challenge.totalBadges
      ? `<div class="block-note">${player.blockReason}</div>` : ''}

    <div class="battle-points"><small>COMBATES</small>${player.battlePoints}</div>
  `;

  if (!isMe) return;
  el.querySelectorAll('.ball').forEach((b) => {
    b.addEventListener('click', () => onBallTap(Number(b.dataset.index), player));
  });
  el.querySelectorAll('.badge').forEach((b) => {
    b.addEventListener('click', () => onBadgeTap(Number(b.dataset.index), player));
  });
  const av = el.querySelector('.card-avatar.editable');
  if (av) av.addEventListener('click', () => openAvatarPicker());
}

function renderBanner() {
  const banner = $('#banner');
  const finish = state.finish;

  if (finish) {
    const winner = finish.winner
      ? state.players.find((p) => p.slug === finish.winner)
      : null;
    banner.className = 'banner win';
    banner.innerHTML = winner
      ? `🏆 DUOLOCKE TERMINADO<br>Gana ${winner.name}<br><span style="font-weight:400;font-size:12px">${finish.reason}</span>`
      : `DUOLOCKE TERMINADO<br><span style="font-weight:400;font-size:12px">${finish.reason}</span>`;
    return;
  }

  const cp = state.checkpoints.find((c) => c.status === 'ready' || c.status === 'waiting');
  if (!cp) {
    banner.classList.add('hidden');
    return;
  }
  banner.classList.remove('hidden');
  if (cp.status === 'ready') {
    banner.className = 'banner fight';
    banner.innerHTML = `⚔️ COMBATE ${cp.number} LISTO — Bo3 en Showdown<br>
      <span style="font-weight:400;font-size:12px">Nadie avanza hasta subir el resultado.</span>`;
  } else {
    const waiting = state.players.find((p) => p.badges < cp.requiredBadges);
    banner.className = 'banner wait';
    banner.innerHTML = `Combate ${cp.number} pendiente: falta que ${waiting.name} llegue a ${cp.requiredBadges} medallas.`;
  }
}

function renderCheckpoints() {
  const box = $('#checkpoint-box');
  const labels = { done: 'jugado', ready: '¡listo!', waiting: 'espera', locked: '—' };

  const grid = state.checkpoints.map((c) => `
    <div class="cp ${c.status}" title="Al llegar a ${c.requiredBadges} medallas">
      <b>${c.number}</b>
      ${c.status === 'done' ? (c.winnerName ?? '') : labels[c.status]}
      ${c.status === 'done' && c.score ? `<br>${c.score}` : ''}
    </div>
  `).join('');

  const ready = state.checkpoints.find((c) => c.status === 'ready');
  const lastDone = [...state.checkpoints].reverse().find((c) => c.status === 'done');

  box.innerHTML = `
    <h2>COMBATES (cada 2 gimnasios)</h2>
    <div class="cp-grid">${grid}</div>
    <div id="cp-actions"></div>
  `;

  const actions = $('#cp-actions');
  if (me && ready) {
    const btn = document.createElement('button');
    btn.className = 'primary cp-action';
    btn.textContent = `Subir resultado del combate ${ready.number}`;
    btn.addEventListener('click', () => onCheckpointSubmit(ready));
    actions.appendChild(btn);
  }
  if (me && lastDone && !ready) {
    const btn = document.createElement('button');
    btn.className = 'ghost cp-action';
    btn.textContent = `Corregir combate ${lastDone.number} (ganó ${lastDone.winnerName})`;
    btn.addEventListener('click', () => onCheckpointUndo(lastDone));
    actions.appendChild(btn);
  }
}

function renderHistory() {
  const words = {
    life_lost: 'perdió una vida',
    life_restored: 'recuperó una vida',
    badge: 'consiguió una medalla',
    badge_removed: 'se quitó una medalla',
    battle_won: 'ganó el combate',
    battle_undone: 'borró un resultado',
  };
  $('#history-list').innerHTML = state.events.length
    ? state.events.map((e) => `
        <li class="ev-${e.type}">
          <span>
            <b>${e.playerName}</b> ${words[e.type] || e.type}
            ${e.note ? `<span class="note">${e.note}</span>` : ''}
          </span>
          <span class="when">${timeAgo(e.at)}</span>
        </li>`).join('')
    : '<li style="color:var(--muted)">Todavía no ha pasado nada.</li>';
}

function renderGraveyard() {
  const deaths = state.deaths || [];
  const section = $('#graveyard');
  if (deaths.length === 0) { section.classList.add('hidden'); return; }
  section.classList.remove('hidden');

  const cols = state.players.map((p) => {
    const mine = deaths.filter((d) => d.player === p.slug);
    const items = mine.length
      ? mine.map((d) => `
          <div class="grave-item">
            ${d.dex ? `<img src="${pkmnIcon(d.dex)}" alt="">` : ''}
            <div class="g-txt">
              <div class="g-nick">${d.nickname || d.species || '¿?'}</div>
              ${d.species && d.nickname ? `<div class="g-sp">${d.species}</div>` : ''}
            </div>
          </div>`).join('')
      : '<div class="grave-empty">Sin bajas 🎉</div>';
    return `
      <div class="grave-col">
        <h3>${p.name} <span class="cnt">· ${mine.length}</span></h3>
        ${items}
      </div>`;
  }).join('');

  $('#graveyard-cols').innerHTML = cols;
}

function render() {
  if (!state) return;
  const cards = document.querySelectorAll('.card');
  state.players.forEach((p, i) => renderCard(cards[i], p));
  renderBanner();
  renderCheckpoints();
  renderGraveyard();
  renderHistory();
}

/* ---------------------------------------------------------------- arranque */

(function boot() {
  const savedPlayer = localStorage.getItem(STORE_PLAYER);
  const savedPin = localStorage.getItem(STORE_PIN);
  if (savedPlayer && savedPin) {
    me = savedPlayer;
    pin = savedPin;
    enterApp();
  } else {
    showIdentity();
  }
})();

// Registrar el service worker (para instalar como app / offline).
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  });
}
