# Duolocke Z Jalmeida

Marcador compartido del Duolocke de **Pokémon Z** entre **Salda** y **Andres**.
Se abre desde el móvil, cada uno actualiza su estado y el otro lo ve al refrescar.

- 30 vidas por jugador
- 12 medallas (Gimnasio 1 → 12)
- Combate Bo3 cada 2 gimnasios: **nadie avanza hasta subir el resultado**
- 1 punto de combate para el ganador de cada Bo3

## Cómo se usa

1. Abres el link → **¿Quién eres?** → botón `SALDA` o `ANDRES` → PIN.
   El PIN se guarda en el móvil, solo se pide una vez. También hay **Solo mirar** (sin PIN, sin poder tocar nada).
   La **primera vez** que entra cada uno elige su **personaje** entre los 6 protagonistas
   seleccionables de Pokémon Z (chico/chica en 3 tonos). El avatar aparece en su tarjeta y lo
   puede cambiar tocando su propio personaje (✎).
2. **Vidas:** tocas una Poké Ball. Si está llena te pregunta *"vas a quitar una vida"* y puedes dejar una nota
   ("murió Fletchling vs rival ruta 4"). Si tocas una gris te pregunta *"vas a poner una vida"* (para corregir errores).
3. **Medallas:** tocas la siguiente medalla → *"¿Ganaste el Gimnasio N?"*. Tocando la última conseguida la quitas.
4. **Combates:** al llegar a 2, 4, 6, 8, 10 o 12 medallas te sale el cartel de bloqueo.
   Cuando los dos llegáis, aparece el botón **Subir resultado del combate N** → eliges ganador y opcionalmente el marcador (`2-1`).
   Eso desbloquea a los dos y le da 1 punto al ganador.
5. **Fin:** el primero que llegue a 0 vidas pierde. Si los dos acabáis las 12 medallas, gana quien tenga más puntos de
   combate; si hay empate, la app avisa de que toca Bo3 de desempate.

Cada uno solo puede tocar su propia tarjeta. La página se refresca sola cada 20 s (y al volver a ella).

**Sonidos** (del propio juego): al perder una vida suena el *faint*, y al conseguir un gimnasio suena
el jingle de medalla. Los navegadores solo dejan sonar tras el primer toque en la página.

**Cementerio**: al quitar una vida puedes buscar el Pokémon que cayó (buscador con los 1018 sprites
del juego) y ponerle su mote. Aparece en la sección ☠ Cementerio, una columna por jugador. Si devuelves
una vida por error, se borra la última muerte de ese jugador.

**Avisos del rival**: cuando abres o refrescas, si el otro jugador cambió algo desde tu última visita
(perdió vidas, ganó medallas o combates), sale un aviso azul arriba (se cierra al tocarlo).

**Instalable (PWA)**: desde Chrome (menú → *Instalar app* / *Añadir a pantalla de inicio*) se añade como
app con icono de Poké Ball y se abre a pantalla completa. Funciona con service worker (`sw.js` + `manifest.json`).

## Estructura

```
server.js              Express + API
src/db.js              cliente Turso + esquema SQL
src/rules.js           reglas del reto (bloqueo por combate, fin del duolocke)
scripts/init-db.mjs    crea tablas y siembra el reto
public/                frontend (HTML/CSS/JS vanilla, mobile-first)
public/assets/sprites/ sprites sacados del juego
```

### Sprites

Extraídos de `Pokemon Z V2.18/Graphics/` (esa carpeta **no** se sube al repo, está en `.gitignore`):

| Asset | Origen |
|---|---|
| `ball.png` | `Graphics/Icons/item267.png` (icono de Poké Ball) |
| `badges/badge01..12.png` | `Graphics/Transitions/getBadge0..11.png` (las 12 medallas reales del juego) |
| `avatars/avatar1..6.png` | `Graphics/Characters/trainer000..005.png` (los 6 protagonistas seleccionables) |
| `pokemon/pkmn{n}.png` | `Graphics/Icons/icon{NNN}.png` recortado al 1er frame (1018 iconos para el cementerio) |
| `data/pokemon.json` | `PBS/pokemon.txt` (nombres + nº de cada especie para el buscador) |
| `audio/life-lost.mp3` | `Audio/SE/faint.mp3` (sonido de debilitar) |
| `audio/badge.ogg` | `Audio/ME/Medalla.ogg` (jingle de medalla) |

La paleta de colores también sale del juego: los paneles azul pizarra `#313B47` y el acento naranja
`#FF6B10` son los del menú de pausa (DP Pause Menu) y sus windowskins.

Las medallas apagadas y las vidas gastadas son la misma imagen con `filter: grayscale(1)`.

**No hizo falta generar nada con IA**: el único asset que no existe en el juego es el logo, y está resuelto con
tipografía *Press Start 2P*. Si en algún momento queréis un logo de imagen, este es el prompt:

> Logo design for "DUOLOCKE Z JALMEIDA", retro pixel art video game style, bold arcade lettering with a subtle glitch
> effect, red white and dark navy color palette, a stylized letter Z with a lightning cut through it, small generic
> capsule ball icon integrated into the text, dark background, high contrast, clean vector-like edges, no photorealism,
> no official Pokemon characters or trademarks

Se guardaría en `public/assets/generated/logo.png` y se cambiaría el `<h1 class="logo-text">` por un `<img>`.

## Local

```bash
npm install
npm run init-db
npm start
```

`http://localhost:3000`. Variables en `.env` (no se sube al repo).

Para empezar el reto de cero borrando todo:

```bash
npm run init-db -- --reset
```

## API

| Método | Ruta | Qué hace |
|---|---|---|
| GET | `/health` | 200 `ok` (para UptimeRobot) |
| GET | `/api/state` | estado completo: jugadores, combates, historial |
| POST | `/api/auth` | comprueba identidad + PIN |
| POST | `/api/avatar` | `{ avatar: "avatar1".."avatar6" }` |
| POST | `/api/lives` | `{ delta: -1 \| 1, dex?, species?, nickname?, note? }` (los últimos, para el cementerio) |
| POST | `/api/badges` | `{ delta: -1 \| 1 }` |
| POST | `/api/checkpoint` | `{ number, winner, score? }` |
| DELETE | `/api/checkpoint/:n` | borra el resultado del último combate |

Todo lo que modifica pide las cabeceras `x-duo-player` y `x-duo-pin`. Ocho fallos de PIN por IP bloquean 15 minutos.

## Despliegue en Render

1. Subir esto a un repo de GitHub (sin `.env` ni la carpeta del juego, ya están ignorados).
2. Render → **New Web Service** → conectar el repo.
   - Build: `npm install`
   - Start: `node server.js`
   - Health check path: `/health`
3. Environment → añadir:

   | Variable | Valor |
   |---|---|
   | `TURSO_DATABASE_URL` | `libsql://duolocke-anfeog.aws-us-east-1.turso.io` |
   | `TURSO_AUTH_TOKEN` | el token de Turso |
   | `PIN_SALDA` | `salda` |
   | `PIN_ANDRES` | `andres` |
   | `NODE_ENV` | `production` |
   | `STARTING_LIVES` | `30` |

4. UptimeRobot → monitor HTTP a `https://<servicio>.onrender.com/health` cada 5 min (evita el cold start del free tier).
5. Compartir el link con los dos móviles.

Las tablas ya están creadas y sembradas en Turso, así que Render no necesita ejecutar nada más.
