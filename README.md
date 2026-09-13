# Fiddy

A collection of interactive fidget toys and visual experiments. Squish jelly, stretch putty, and play with silk, light, and particles in your browser.

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

The Docker build uses the lockfile and builds from source. Only compiled HTML, the favicon, and assets enter the runtime image. Nginx runs as an unprivileged user on port 8080, with HTTPS at Fly's edge. `scripts/prepare-fly.ts` generates Nginx security headers from `config/security.ts` and precompresses text assets. The Docker build validates Nginx configuration before deployment. No database or persistent volume is needed.

To run the browser checks against Fly, set `QA_ORIGIN=https://fid.fly.dev` and `QA_ARTIFACTS=qa/artifacts/fly` before running the security and production smoke scripts above.
