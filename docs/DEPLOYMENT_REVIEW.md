# Deployment review — September 12, 2026

This review covers the local production build. The app is a static client with no backend, accounts, analytics, or remote asset requests in the tested flows. The subsequent authorized Fly.io deployment is recorded below.

## Security

- `npm audit` found **0 known vulnerabilities**, including development dependencies. This is a point-in-time dependency check, not a guarantee against unknown vulnerabilities.
- Source and configuration review found no common secret patterns, environment files, or private keys in the deployable app. Environment files and key files are now excluded from Git.
- Query parameters resolve through the toy registry. Saved Starlight data has bounded lengths, validated numeric coordinates, and whitelisted presets. The browser probe verified malformed stored data and a hostile query update do not execute HTML or script.
- Production scripts, fonts, and connections are restricted to the same origin. Inline scripts, eval, embedded pages, objects, forms, and workers are blocked by the Content Security Policy. Inline **styles** remain allowed for React themes and canvas sizing.
- The production preview supplies CSP, anti-framing, `nosniff`, no-referrer, a restricted permissions policy, and same-origin opener isolation. Hashed assets get a year of immutable caching; HTML is revalidated.
- The security probe verified actual HTTP headers, MIME types, blocked inline-script execution, a blocked external connection, and local-only runtime requests. The deliberate blocked requests produce expected CSP console errors.

Policy source: `config/security.ts`. The build emits both an HTML policy and `dist/_headers`. Anti-framing requires the HTTP header: [`frame-ancestors` is not supported in a meta tag](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy/frame-ancestors).

## Fixes and optimization

1. **Retired soft-body scenes leaked memory.** Before the fix, repeated Jelly visits retained approximately 10.6 MB and 54 DOM nodes per visit. Three r183 leaves listeners on its shared lighting lookup texture and fullscreen output geometry. Cleanup now disposes renderer-created textures and the output material before retiring the backend, clears scene references, and removes the device-loss callback. A small compatibility helper isolates the r183-specific output-material access; rerun lifecycle QA when upgrading Three.
2. **A delayed dialog close event could close a newly reopened collection.** The handler now checks the native dialog's current state. Repeated navigation exercises this path.
3. **WebGL toys downloaded the WebGPU implementation.** Renderer chunks are now separate. The classic WebGL renderer dependency shrank from about 1,165 kB to 568 kB raw, approximately **51% less renderer JavaScript**. The largest individual chunk is now 600 kB. Jelly still needs both renderer paths through its geometry helper; this change does not halve Jelly's initial download.

Approximate initial JavaScript, including the app shell: Jelly 416 kB gzip, slicing 235 kB, Starlight 232 kB, and the canvas field toys 82–84 kB. These are local compression estimates; the hosting server must enable gzip or Brotli. Fonts and CSS are additional.

## Validation and limits

- **244 unit tests pass.** TypeScript and the production build pass.
- Production browser checks **pass with zero runtime errors**: all 14 toys with WebGPU preferred, plus Jelly, slicing, and Starlight with WebGL forced. They exercise the collection, reset, audio toggle, rendering pause, slicing, touch cancellation, reduced motion, and renderer disposal against compiled assets under the production policy. Rapid switches during renderer setup also pass in both backends.
- The dedicated lifecycle check **passes in WebGPU and forced WebGL**, using garbage collection and 12 Jelly/field switches per backend without renderer instrumentation. After warm-up, both held at 288 DOM nodes and 188 listeners, with unchanged backing storage. Heap grew by about 0.8 MB across the final eight cycles while code warmed up, rather than retaining roughly 10.6 MB per visit.
- Desktop headless Chrome on this machine (NVIDIA RTX 4070 SUPER) shows smooth Jelly, slicing, and Starlight interaction. **ASCII Tide and Magnetic Dust are slower**: earlier medians were about 18 ms and 30 ms between animation frames, respectively. They remain optimization candidates, particularly on phones. Their appearance and simulation were not changed during this audit. These short synthetic runs are not a real-device frame-rate guarantee.
- Emulated mobile layout and touch checks do not replace a real iPhone Safari and Android Chrome test. Real-device frame rate, thermal behavior, audio, and browser-specific GPU behavior remain unverified.

Detailed local outputs: `qa/artifacts/deploy-tests-after.txt`, `deploy-build-after.txt`, `deploy-bundle-report.json`, `production-security-results.json`, `production-webgpu-results.json`, `production-webgl-results.json`, and `lifecycle-*-results.json`.

## Hosting setup

1. Build with `npm ci && npm run build`; publish **`dist/` only**. Use HTTPS. Do not expose the Vite development or preview server as the live service; [Vite documents preview as a local check](https://vite.dev/guide/static-deploy).
2. Confirm the host applies `dist/_headers`. Hosts that do not understand this file need equivalent HTTP configuration from `config/security.ts`. Cloudflare Pages documents [its `_headers` format](https://developers.cloudflare.com/pages/configuration/headers/); its rules apply to static responses, not arbitrary functions.
3. Verify the deployed HTML has CSP including `frame-ancestors 'none'`, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`, the permissions policy, and `Cross-Origin-Opener-Policy: same-origin`. Preserve correct JavaScript MIME types.
4. Enable gzip/Brotli, retain immutable caching for hashed `/assets/*`, and revalidate HTML. Verify a direct `/?toy=jelly` visit and one refresh after deployment.
5. Do a real-phone pass before a broad launch, with extra attention to ASCII Tide and Magnetic Dust. Hosting behavior and real phones are the remaining release checks; this review does not claim they have passed.

No broad dependency upgrades were made. The lockfile preserves the tested versions; later Three, Vite, and TypeScript releases should get a separate compatibility pass.

## Fly.io deployment

Deployed to **https://fid.fly.dev** in the personal Fly.io organization. `fid` was available, so no fallback name was needed.

- One shared CPU / 256 MB Machine in `iad`, deployed with `--ha=false`.
- Automatic stop when idle, automatic start for requests, and **zero minimum running Machines**. No volume or database.
- **Observed the Machine stop automatically with no manual stop command**, then return HTTP 200 and restart the same Machine on a fresh request. The cold-start check took approximately 9 seconds, including the follow-up status check. Evidence: `qa/artifacts/fly/idle-cycle.json`.
- A 26 MB runtime image containing Nginx and compiled static files. The container runs as the `nginx` user on port 8080; only `/tmp` is used for runtime files.
- Docker uses `npm ci` and the existing lockfile. Nginx configuration passed its syntax test during the image build. The Docker context uses an allowlist to exclude Git history, QA artifacts, local environment files, dependencies, and unrelated workspace files.
- Live HTTP redirects to HTTPS. The live security probe passes: CSP, anti-framing, MIME types, caching, script/connection blocking, and local-only asset requests. Compressed JavaScript is served successfully at the public URL.
- Live browser checks also pass with no runtime errors: all 14 toys with WebGPU preferred and the representative Jelly/slicing/Starlight set with WebGL forced, including mobile touch cancellation and reduced motion.
- Security policy is generated from the same `config/security.ts` used during the audit; Nginx does not depend on interpreting a `_headers` file.

Deployment configuration is in `fly.toml`, `Dockerfile`, and `deploy/nginx.conf`. Live browser results are saved separately under `qa/artifacts/fly/`.

Fly checks idle capacity [every few minutes](https://fly.io/docs/reference/fly-proxy-autostop-autostart/). Stopping is therefore not immediate after the last request. The next request wakes the existing Machine. Keep `--ha=false` when redeploying to preserve the single-Machine setup.
