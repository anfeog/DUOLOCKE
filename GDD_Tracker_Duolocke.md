# GDD — Duolocke Z Jalmeida

> **Este documento está dirigido a Claude Code.** Léelo completo antes de escribir una sola línea. Cada sección tiene instrucciones que debes seguir al pie de la letra.

## 1. Resumen del proyecto

Aplicación web llamada **Duolocke Z Jalmeida** para llevar el registro compartido de un Duolocke de Pokémon Z entre 2 jugadores. Muestra en tiempo real, para ambos:

- **Vidas restantes** de cada jugador (número inicial configurable al crear el reto).
- **Progreso de medallas** de cada jugador (0–12 gimnasios de Pokémon Z).
- **Marcador de combates** (1 punto por cada batalla ganada en los checkpoints de Showdown).

No es un overlay para stream: es un marcador consultable desde el celular, pensado para que ambos jugadores lo abran cuando quieran y actualicen su propio estado.

## 2. Stack técnico (infraestructura ya existente)

| Pieza | Servicio | Notas |
|---|---|---|
| Hosting web + API | **Render** (free tier) | Un solo Web Service. Frontend estático servido por el mismo backend para no gastar dos servicios. |
| Base de datos | **Turso** (libSQL/SQLite) | Ya se tiene cuenta; crear una DB nueva `duolocke` en la misma org. |
| Keep-alive | **UptimeRobot** | Ya se tiene cuenta; añadir un monitor HTTP al endpoint `/health` del servicio de Render cada 5 min para evitar el cold start del free tier. |

Backend: **Node.js + Express** con `@libsql/client` para Turso. Frontend: HTML/CSS/JS vanilla servido como estático desde el mismo Express. Al ser 2 usuarios y 3 datos, no necesita framework.

### Variables de entorno en Render
- `TURSO_DATABASE_URL`
- `TURSO_AUTH_TOKEN`
- `ADMIN_PIN_P1` / `ADMIN_PIN_P2` (ver sección de auth)

## 3. Modelo de datos (Turso)

```sql
CREATE TABLE challenge (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,               -- "Duolocke Z Jalmeida"
  starting_lives INTEGER NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE players (
  id INTEGER PRIMARY KEY,
  challenge_id INTEGER REFERENCES challenge(id),
  name TEXT NOT NULL,
  lives INTEGER NOT NULL,
  badges INTEGER NOT NULL DEFAULT 0,    -- 0..12
  battle_points INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE events (
  id INTEGER PRIMARY KEY,
  player_id INTEGER REFERENCES players(id),
  type TEXT NOT NULL,               -- 'life_lost' | 'badge' | 'battle_won' | 'undo'
  note TEXT,                        -- opcional: "murió Charmander vs líder 3"
  created_at TEXT DEFAULT (datetime('now'))
);
```

## 4. Autenticación (mínima)

- Sin registro de usuarios. La página muestra los dos jugadores; para modificar el estado de un jugador se pide su **PIN de 4 dígitos** (uno por jugador, almacenados en env vars).
- Ver el estado es público (cualquiera con el link puede mirar); modificar requiere PIN.

## 5. API (endpoints)

| Método | Ruta | Función |
|---|---|---|
| GET | `/health` | Para UptimeRobot. Devuelve 200. |
| GET | `/api/state` | Estado completo: ambos jugadores + últimos eventos. |
| POST | `/api/player/:id/life-lost` | Resta 1 vida (requiere PIN). Body opcional: `{ note }`. |
| POST | `/api/player/:id/badge` | Suma 1 medalla, máx 12 (requiere PIN). |
| POST | `/api/player/:id/battle-won` | Suma 1 punto de combate (requiere PIN). |
| POST | `/api/player/:id/undo` | Revierte el último evento de ese jugador (requiere PIN). |

Actualización en el cliente: **polling cada 15–30 s** sobre `/api/state`.

## 6. Assets — Sprites del juego (PRIORIDAD) vs IA (solo lo que falte)

### Extracción de sprites de Pokémon Z

**Contexto para Claude Code:** Pokémon Z está hecho en RPG Maker XP con Pokémon Essentials. Todos los assets gráficos del juego están en la carpeta `Graphics/` del directorio del juego, como archivos PNG normales sin cifrar. La estructura típica es:

```
PokemonZ/
├── Graphics/
│   ├── Battlers/        ← sprites de batalla (front/back de cada Pokémon)
│   ├── Icons/           ← íconos pequeños de cada Pokémon (los del menú/equipo)
│   ├── Characters/      ← sprites overworld (personajes caminando)
│   ├── Pictures/        ← imágenes varias del juego (UI, fondos, logos)
│   ├── UI/              ← elementos de interfaz
│   └── ...
```

**Instrucción para Claude Code:** el usuario colocará la carpeta del juego Pokémon Z dentro del workspace. Cuando eso ocurra:

1. **Explorar** `Graphics/` y listar las subcarpetas disponibles.
2. **Buscar** los assets útiles para la app:
   - Ícono de Poké Ball (probablemente en `Graphics/Pictures/`, `Graphics/UI/` o `Graphics/Icons/`).
   - Íconos de medallas/insignias de gimnasio (buscar en `Graphics/Pictures/` o `Graphics/Badges/` o similar).
   - Sprites de los Pokémon iniciales o genéricos que sirvan de decoración.
   - Cualquier elemento de UI del juego (marcos, barras, fondos) que encaje con la estética.
3. **Copiar** los que sirvan al directorio de assets del proyecto (`/public/assets/sprites/`).
4. **Adaptar** tamaño si es necesario (recortar, escalar) con sharp o similar desde Node.

**Regla: usar sprites del juego siempre que existan.** Solo generar con IA lo que el juego no tenga — típicamente:
- El logo "Duolocke Z Jalmeida" (esto no existe en el juego).
- Avatares personalizados de los jugadores (si los quieren).
- Cualquier gráfico de UI específico del tracker que no tenga equivalente en los archivos del juego.

### Lo que SÍ necesita IA (prompts listos para generar)

Para lo que no exista en los sprites del juego, el usuario generará las imágenes con otra IA. Claude Code debe indicar exactamente qué falta y proporcionar el prompt listo. Estos son los que probablemente se necesiten:

**Logo "Duolocke Z Jalmeida":**
> Logo design for "DUOLOCKE Z JALMEIDA", retro pixel art video game style, bold arcade lettering with a subtle glitch effect, red white and dark navy color palette, a stylized letter Z with a lightning cut through it, small generic capsule ball icon integrated into the text, dark background, high contrast, clean vector-like edges, no photorealism, no official Pokemon characters or trademarks

**Avatares de jugadores (si no usan foto propia):**
> Retro pixel art avatar portrait of a young trainer, front-facing bust, [describir rasgos del jugador], dark navy background circle frame, 128x128, crisp pixel edges, generic original character

**Instrucción para Claude Code:** cuando detectes que un asset no está disponible en los archivos del juego y necesita generarse con IA, NO lo generes tú. En su lugar, muestra al usuario el prompt exacto y dile que lo genere con su IA de imágenes y coloque el resultado en `/public/assets/generated/`. Luego continúa con el desarrollo usando un placeholder hasta que el usuario lo suba.

## 7. Diseño visual

### Referencia

Inspirado en los HUD de Folagor en sus lockes (contadores de vidas con Poké Balls grandes y visibles, estética retro), pero adaptado a consulta en celular: menos decoración, más legibilidad.

### Paleta de colores

Extraer la paleta dominante de los propios sprites/UI del juego Pokémon Z para mantener coherencia. Como base de referencia:
- Fondo: oscuro (azul noche / carbón).
- Acentos: rojo Poké Ball (#EE1515) y blanco.
- Medallas: dorado.
- Contraste alto para leer rápido en celular.

Si los archivos del juego tienen una paleta distinta, priorizar esa.

### Tipografía

- Display/títulos: "Press Start 2P" o "Pixelify Sans" (Google Fonts) — pixel retro.
- Cuerpo/historial: "Inter" (Google Fonts) — legible en móvil.

### Layout (mobile-first)

```
┌─────────────────────────────┐
│    [LOGO DUOLOCKE Z JALMEIDA]    │
├──────────────┬──────────────┤
│  JUGADOR 1   │  JUGADOR 2   │
│  (avatar)    │  (avatar)    │
│              │              │
│  VIDAS       │  VIDAS       │
│  ●●●●●○○○   │  ●●●●●●●○   │  ← Poké Balls del juego (llenas/grises)
│  5 / 8       │  7 / 8       │
│              │              │
│  MEDALLAS    │  MEDALLAS    │
│  ▣▣▣▣□□...  │  ▣▣□□□□...  │  ← Medallas del juego (12 slots)
│  4 / 12      │  2 / 12      │
│              │              │
│  COMBATES: 3 │  COMBATES: 2 │
├──────────────┴──────────────┤
│  Próximo checkpoint: Gym 6  │
│  ── Historial reciente ──   │
│  • J1 perdió una vida (...) │
│  • J2 consiguió medalla 2   │
└─────────────────────────────┘
```

### Detalles de UI

- **Vidas:** fila de íconos de Poké Ball (extraídos del juego). Vida disponible = color normal; vida perdida = misma imagen en escala de grises (aplicar filtro CSS `grayscale(1) opacity(0.4)`). Animación breve (shake + desaturado) al perder una.
- **Medallas:** 12 slots usando los sprites de medallas/insignias del juego si existen. Conseguida = sprite normal; pendiente = silueta gris (misma técnica CSS).
- **Barra de checkpoint:** indica el próximo gimnasio donde se activa batalla (cada 2). Se resalta cuando ambos lo alcanzaron: "Checkpoint listo — toca Bo3".
- **Estado final:** si un jugador llega a 0 vidas, la app muestra "Duolocke terminado — gana [otro jugador]".

## 8. Flujo de uso típico

1. Jugador 1 pierde un Pokémon en su partida → abre la web en el cel → toca "− vida" en su tarjeta → mete su PIN → opcionalmente escribe nota ("murió Fletchling vs rival ruta 4") → el contador baja y el evento aparece en el historial.
2. Jugador 2 gana su cuarto gimnasio → "+ medalla" → PIN → la app detecta que ambos tienen ≥4 medallas → barra de checkpoint se ilumina: "Checkpoint 2 listo — Best of 3 en Showdown".
3. Tras el Bo3, cada partida ganada se registra con "+ combate" (1 punto por batalla ganada).
4. Si un jugador llega a 0 vidas → "Duolocke terminado — gana [otro jugador]".
5. Si ambos terminan con vida (12 medallas cada uno) y empatan en puntos → desempate Bo3 final.

## 9. Alcance

**MVP (hacer esto):**
- Estado de 2 jugadores fijos (vidas, medallas, puntos de combate).
- Botones de acción con PIN y historial con deshacer.
- Detección de checkpoint listo (cada 2 medallas ambos).
- Detección de fin de reto (0 vidas o ambos con 12 medallas + comparación de puntos).
- Responsive mobile-first.
- Assets extraídos de los sprites del juego donde sea posible.

**Fuera de alcance (NO hacer):**
- Registro de Pokémon individuales / caja de muertos.
- Cuentas de usuario, más de 2 jugadores, múltiples retos simultáneos.
- Integración con el juego o con Showdown.
- WebSockets / tiempo real estricto.
- Generar imágenes con IA — solo indicar al usuario qué generar y con qué prompt.

## 10. Checklist de despliegue

1. Crear DB `duolocke` en Turso → correr el SQL del modelo → sembrar `challenge` + 2 `players` con las vidas iniciales acordadas.
2. Repo con backend + frontend estático → conectar a Render como Web Service (build: `npm install`, start: `node server.js`).
3. Configurar env vars en Render (URL y token de Turso, PINs).
4. Añadir monitor en UptimeRobot → `https://<servicio>.onrender.com/health`, intervalo 5 min.
5. Probar desde ambos celulares (Chrome Android/iOS) y compartir el link.

## 11. Orden de ejecución para Claude Code

1. **Leer este GDD completo.**
2. **Explorar la carpeta del juego** (cuando el usuario la coloque en el workspace) → identificar y copiar sprites útiles.
3. **Listar qué assets faltan** → mostrar prompts de IA al usuario para que los genere.
4. **Crear la estructura del proyecto** (package.json, server.js, /public/).
5. **Implementar el backend** (Express + Turso + endpoints).
6. **Implementar el frontend** (HTML/CSS/JS vanilla, mobile-first).
7. **Integrar los sprites** del juego en el frontend.
8. **Probar localmente.**
9. **Preparar para deploy** en Render (Dockerfile o start script).
