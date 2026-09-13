// Reuse the isolated browser, native input, and reporting harness.
process.argv.push('--putty');
await import('./turn-smoke.mjs');
