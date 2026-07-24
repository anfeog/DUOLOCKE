// Reglas del Duolocke. Sin dependencias: se usa en el server y se refleja en el cliente.

export const TOTAL_BADGES = 12;
export const BADGES_PER_CHECKPOINT = 2;
export const TOTAL_CHECKPOINTS = TOTAL_BADGES / BADGES_PER_CHECKPOINT; // 6

/**
 * Estado de un checkpoint (combate Bo3 cada 2 gimnasios).
 *  done    -> ya se jugo y se subio el resultado
 *  ready   -> ambos llegaron a las medallas necesarias, toca combatir
 *  waiting -> uno ya llego (esta bloqueado) y espera al otro
 *  locked  -> todavia queda camino
 */
export function checkpointStatus(number, players, resolved) {
  const required = number * BADGES_PER_CHECKPOINT;
  if (resolved.has(number)) return 'done';
  if (number > 1 && !resolved.has(number - 1)) return 'locked';
  const reached = players.filter((p) => p.badges >= required).length;
  if (reached === players.length) return 'ready';
  if (reached > 0) return 'waiting';
  return 'locked';
}

/** Puede este jugador marcar la siguiente medalla? */
export function badgeGate(player, resolved, finished) {
  if (finished) return { allowed: false, reason: 'El duolocke ya termino.' };
  if (player.lives <= 0) return { allowed: false, reason: 'Se quedo sin vidas.' };
  if (player.badges >= TOTAL_BADGES) return { allowed: false, reason: 'Ya tiene las 12 medallas.' };
  if (player.badges > 0 && player.badges % BADGES_PER_CHECKPOINT === 0) {
    const cp = player.badges / BADGES_PER_CHECKPOINT;
    if (!resolved.has(cp)) {
      return {
        allowed: false,
        reason: `No puedes avanzar: falta el combate ${cp} (Bo3). Subid el resultado para desbloquear.`,
        blockedByCheckpoint: cp,
      };
    }
  }
  return { allowed: true };
}

/** Resultado final del reto, o null si sigue en marcha. */
export function computeFinish(players, resolved) {
  const dead = players.filter((p) => p.lives <= 0);
  if (dead.length === players.length) {
    return { over: true, winner: null, reason: 'Los dos se quedaron sin vidas.' };
  }
  if (dead.length === 1) {
    const winner = players.find((p) => p.lives > 0);
    return {
      over: true,
      winner: winner.slug,
      reason: `${dead[0].name} se quedo sin vidas.`,
    };
  }

  const allBadges = players.every((p) => p.badges >= TOTAL_BADGES);
  const allCheckpoints = resolved.size >= TOTAL_CHECKPOINTS;
  if (allBadges && allCheckpoints) {
    const [a, b] = players;
    if (a.battle_points === b.battle_points) {
      return {
        over: true,
        winner: null,
        reason: `Empate a ${a.battle_points} puntos de combate: toca Bo3 final de desempate.`,
        tiebreak: true,
      };
    }
    const winner = a.battle_points > b.battle_points ? a : b;
    return {
      over: true,
      winner: winner.slug,
      reason: `12 medallas cada uno. Gana por puntos de combate (${Math.max(a.battle_points, b.battle_points)}-${Math.min(a.battle_points, b.battle_points)}).`,
    };
  }

  return null;
}
