import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { loadFoley } from '../src/audio/foley.ts';
import { jellyProfile, cushionProfile, butterProfile, loopProfile, starProfile, dumplingProfile, puttyProfile, doughProfile } from '../src/soft-body/profiles.ts';

test('each soft toy selects its own bank and no material falls back to slime recordings', async t => {
  const profiles = [jellyProfile, cushionProfile, butterProfile, loopProfile, starProfile, dumplingProfile, puttyProfile, doughProfile];
  assert.ok(profiles.every(profile => profile.soundTexture));
  assert.equal(new Set(profiles.map(profile => profile.soundTexture)).size, profiles.length);
  const requests: string[] = [];
  t.mock.method(globalThis, 'fetch', async (url: string) => { requests.push(url); return new Response(new ArrayBuffer(8)); });
  const context = { sampleRate: 31004, decodeAudioData: async () => ({ duration: 1 }) } as unknown as AudioContext;
  const banks = await Promise.all(profiles.map(profile => loadFoley(context, profile.soundTexture!)));
  assert.equal(new Set(banks.map(bank => bank.press[0])).size, profiles.length);
  assert.equal(new Set(banks.map(bank => bank.motion)).size, profiles.length);
  assert.equal(requests.length, profiles.length * 5);
  assert.ok(requests.every(url => /\/v2-/.test(url)));
  const manifest = JSON.parse(await readFile(new URL('../public/audio/asmr/sources.json', import.meta.url), 'utf8'));
  assert.ok(manifest.sources.every((source: { title: string; author: string }) => !/slime/i.test(source.title) && source.author !== 'Archos'));
});

test('shipped recordings match provenance hashes, decode as PCM, and have headroom', async () => {
  const root = new URL('../public/audio/asmr/', import.meta.url);
  const manifest = JSON.parse(await readFile(new URL('sources.json', root), 'utf8'));
  assert.equal(manifest.clips.length, 45);
  for (const clip of manifest.clips) {
    const source = manifest.sources.find((entry: { key: string }) => entry.key === clip.source);
    assert.equal(source?.license, 'CC0-1.0');
    assert.match(source.page, /^https:\/\/(freesound\.org\/people|kenney\.nl\/assets)\//);
    const bytes = await readFile(new URL(clip.file, root));
    assert.equal(createHash('sha256').update(bytes).digest('hex'), clip.sha256, clip.file);
    assert.equal(bytes.toString('ascii', 0, 4), 'RIFF');
    assert.equal(bytes.toString('ascii', 8, 12), 'WAVE');
    assert.equal(bytes.readUInt16LE(20), 1, 'Uncompressed PCM');
    assert.equal(bytes.readUInt16LE(22), 1, 'Mono source');
    assert.equal(bytes.readUInt32LE(24), 32000);
    assert.equal(bytes.readUInt16LE(34), 16);
    assert.equal(bytes.readUInt32LE(40), bytes.length - 44);
    let peak = 0, energy = 0;
    for (let i = 44; i < bytes.length; i += 2) {
      const sample = bytes.readInt16LE(i) / 32768;
      peak = Math.max(peak, Math.abs(sample)); energy += sample * sample;
    }
    assert.ok(peak <= .701 && peak > .03, `${clip.file}: ${peak}`);
    assert.ok(Math.sqrt(energy / ((bytes.length - 44) / 2)) > .005, 'Audible content');
    if (!clip.loop) {
      assert.equal(bytes.readInt16LE(44), 0, 'No onset discontinuity');
      assert.equal(bytes.readInt16LE(bytes.length - 2), 0, 'No tail discontinuity');
    } else {
      const seam = Math.abs(bytes.readInt16LE(44) - bytes.readInt16LE(bytes.length - 2)) / 32768;
      assert.ok(seam < .08, `${clip.file}: loop seam ${seam}`);
    }
  }
});

test('concurrent banks reuse decoding, and all runtime requests stay local', async t => {
  const requests: string[] = []; let decodes = 0;
  t.mock.method(globalThis, 'fetch', async (url: string) => {
    requests.push(url); return new Response(new ArrayBuffer(8));
  });
  const context = { sampleRate: 31001, decodeAudioData: async () => { decodes++; return { duration: 1 }; } } as unknown as AudioContext;
  const [a, b] = await Promise.all([loadFoley(context, 'gel'), loadFoley(context, 'gel')]);
  assert.equal(a.motion, b.motion); assert.equal(a.press[0], b.press[0]);
  assert.equal(requests.length, 5); assert.equal(decodes, 5);
  assert.ok(requests.every(url => url.startsWith('/audio/asmr/') && url.endsWith('.wav')));
  await loadFoley(context, 'gel'); assert.equal(requests.length, 5);
  await loadFoley(context, 'putty'); assert.equal(requests.length, 10, 'Different materials load distinct recordings');
});

test('failed downloads and corrupt audio can be retried without poisoning the cache', async t => {
  for (const failure of ['http', 'decode']) {
    let failing = true;
    const mock = t.mock.method(globalThis, 'fetch', async () => new Response(new ArrayBuffer(8), { status: failing && failure === 'http' ? 404 : 200 }));
    const context = { sampleRate: failure === 'http' ? 31002 : 31003, decodeAudioData: async () => {
      if (failing && failure === 'decode') throw new Error('Invalid audio');
      return { duration: 1 };
    } } as unknown as AudioContext;
    await assert.rejects(loadFoley(context, 'cloth'));
    failing = false;
    assert.ok((await loadFoley(context, 'cloth')).motion);
    mock.mock.restore();
  }
});
