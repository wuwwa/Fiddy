# Fiddy

A collection of interactive fidget toys and visual experiments. Squish jelly, stretch putty, and play with silk, light, and particles in your browser.

Each soft toy has its own locally hosted CC0 foley bank: short dry contacts, fabric movement, handling textures, or dough; the cutters use separate knife sounds. See [audio sources and preparation](docs/ASMR_AUDIO.md).

**Jelly awakens** is available on the development server at `/?toy=jelly&bonus=demo`. The sparkle button beside Jelly’s name turns Jelly into an expressive blue slime for a short visit. Its expressions, playful motion and surrounding starlight unfold whether you handle it or simply watch; there are no targets, scores or completion requirements. It grows sleepy and returns gently to ordinary Jelly. Sound and reduced motion follow the shared controls. The earlier material comparison is at `/?toy=jelly&bonus=materials`. Preview controls are omitted from production builds. Activation is manual; see [the bonus direction and plan](docs/BONUS_ROUNDS.md).

Butter (`?toy=butter`) imitates a slow-rise butter-stick squishy: a matte yellow block with navy SALTED BUTTER print, rounded edges, and shallow portion marks. Its foam compresses with limited sideways expansion; local dents linger and slowly recover after release. Hold to flatten, drag to stretch, then release and watch it rise. It supports the shared touch, keyboard, sound, and reset controls. See [the butter notes and follow-up ideas](docs/BUTTER.md).

Butter opens first when visiting the home page and stays first in the collection. Favorite toys appear next. Direct toy links still open the toy they name. Preferences stay on your device and play remains available when storage is blocked.

See [the product strategy](docs/PRODUCT_STRATEGY.md) for the adult, fidget-first direction, monetization research, and iPhone feasibility roadmap. See [daily-use validation](docs/DAILY_USE_REVIEW.md) for release evidence and the remaining physical-device and usability work.

Each toy opens with its primary behavior: Jelly and Dumpling lift and toss; Loop and Star stretch; Cushion compresses; Putty kneads; Dough folds and merges. The earlier movement selector has been removed. See [primary toy behaviors](docs/MOVEMENT_MODES.md) for implementation, validation and comparison criteria.

## Run locally

Requires Node.js 20.19+ or 22.12+ and npm.

```sh
git clone https://github.com/wuwwa/Fiddy.git
cd Fiddy
npm install
npm run dev
```

Open the local URL printed in your terminal.

## Production build and local review

```sh
npm ci
npm test
npm run build
npm run preview -- --port 4173 --strictPort
```

The compiled preview is at `http://127.0.0.1:4173/`. Deploy the contents of `dist/` to a static HTTPS host. Vite preview is only a local build check, not a production server.

The build includes a Content Security Policy and a `_headers` file for hosts that support it. See [the deployment review](docs/DEPLOYMENT_REVIEW.md) for security results, performance measurements, and the headers to verify on your host.

With the production preview running, these browser checks use installed Chrome (Windows default; set `CHROME_PATH` elsewhere):

```sh
node qa/security-smoke.mjs
node qa/production-smoke.mjs
node qa/production-smoke.mjs --webgl
node qa/lifecycle-smoke.mjs
node qa/lifecycle-smoke.mjs --webgl
```

Run them sequentially for useful performance readings. `QA_ORIGIN` can override the local preview URL. Results go to `qa/artifacts/`, which is excluded from Git and the production build.

## Fly.io

The Fly app is `fid`, at **https://fid.fly.dev**. Its configuration is in `fly.toml`.

```sh
fly deploy --remote-only --ha=false
fly status --app fid
fly machine list --app fid
```

Deploy with `--ha=false` to keep one Machine. It uses one shared CPU and 256 MB RAM in Ashburn, with `auto_stop_machines = 'stop'`, `auto_start_machines = true`, and `min_machines_running = 0`. Fly stops it when idle and starts it for requests; the first request after a stop can take longer. Once loaded, the toys run in the visitor's browser without keeping the server active.

The Docker build uses the lockfile and builds from source. Only compiled HTML, the favicon, assets, and recorded audio enter the runtime image. Nginx runs as an unprivileged user on port 8080, with HTTPS at Fly's edge. `scripts/prepare-fly.ts` generates Nginx security headers from `config/security.ts` and precompresses text assets. The Docker build validates Nginx configuration before deployment. No database or persistent volume is needed.

To run the browser checks against Fly, set `QA_ORIGIN=https://fid.fly.dev` and `QA_ARTIFACTS=qa/artifacts/fly` before running the security and production smoke scripts above.
