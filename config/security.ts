import type { Plugin } from 'vite';

// Inline styles are required by React themes and Three.js canvas sizing.
// Scripts remain same-origin only: no inline script or eval allowance.
export const contentSecurityPolicy = [
  "default-src 'none'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-src 'none'",
  "worker-src 'none'",
].join('; ');

export const securityHeaders = {
  'Content-Security-Policy': `${contentSecurityPolicy}; frame-ancestors 'none'`,
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'no-referrer',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
  'Cross-Origin-Opener-Policy': 'same-origin',
};

/** Build-only policy keeps Vite's local HMR separate from the deployed app. */
export function productionSecurity(): Plugin {
  return {
    name: 'production-security',
    apply: (_config, environment) => environment.command === 'build' || environment.isPreview === true,
    configurePreviewServer(server) {
      server.middlewares.use((request, response, next) => {
        for (const [name, value] of Object.entries(securityHeaders)) response.setHeader(name, value);
        const asset = request.url?.startsWith('/assets/');
        response.setHeader('Cache-Control', asset ? 'public, max-age=31536000, immutable' : 'no-cache');
        next();
      });
    },
    transformIndexHtml() {
      // frame-ancestors is supported only as an HTTP header.
      return [{ tag: 'meta', attrs: { 'http-equiv': 'Content-Security-Policy', content: contentSecurityPolicy }, injectTo: 'head-prepend' }];
    },
    generateBundle() {
      // Pages/Netlify-compatible output; other hosts need equivalent headers.
      this.emitFile({
        type: 'asset', fileName: '_headers',
        source: `/*\n${Object.entries(securityHeaders).map(([name, value]) => `  ${name}: ${value}`).join('\n')}\n\n/\n  Cache-Control: no-cache\n\n/index.html\n  Cache-Control: no-cache\n\n/assets/*\n  Cache-Control: public, max-age=31536000, immutable\n`,
      });
    },
  };
}
