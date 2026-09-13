import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { securityHeaders } from '../config/security.ts';

// Use the same audited policy for Vite preview and the production web server.
const nginxQuote = (value: string) => value.replaceAll('\\', '\\\\').replaceAll('"', '\\"').replaceAll('$', '\\$');
await mkdir('build/fly', { recursive: true });
await writeFile('build/fly/security-headers.conf', Object.entries(securityHeaders)
  .map(([name, value]) => `add_header ${name} "${nginxQuote(value)}" always;`)
  .join('\n') + '\n');

// Precompress text assets so a small VM only has to read files after waking.
for (const entry of await readdir('dist/assets', { withFileTypes: true })) {
  if (!entry.isFile() || !/\.(?:js|css|json|svg)$/.test(entry.name)) continue;
  const file = join('dist/assets', entry.name);
  const bytes = await readFile(file);
  const compressed = gzipSync(bytes, { level: 9 });
  if (compressed.length < bytes.length) await writeFile(`${file}.gz`, compressed);
}
