import test from 'node:test';
import assert from 'node:assert/strict';
import { Texture } from 'three/webgpu';
import { trackRendererTextures } from '../src/soft-body/renderer-textures';

function fixture() {
  const released: Texture[] = [];
  const backend = {
    createTexture(texture: Texture) {
      const release = () => {
        texture.removeEventListener('dispose', release);
        this.destroyTexture(texture);
      };
      texture.addEventListener('dispose', release);
    },
    createDefaultTexture(texture: Texture) { this.createTexture(texture); },
    destroyTexture(texture: Texture) { released.push(texture); },
  };
  return { backend, released };
}

test('renderer cleanup releases internal textures as well as scene-owned textures', () => {
  const { backend, released } = fixture();
  const original = { ...backend };
  const dispose = trackRendererTextures(backend);
  const lookup = new Texture(), fallback = new Texture();
  backend.createTexture(lookup);
  backend.createDefaultTexture(fallback);
  dispose();
  dispose();
  assert.deepEqual(released, [lookup, fallback]);
  assert.equal(backend.createTexture, original.createTexture);
  assert.equal(backend.createDefaultTexture, original.createDefaultTexture);
  assert.equal(backend.destroyTexture, original.destroyTexture);
});

test('texture tracking retires disposed textures and handles later recreation', () => {
  const { backend, released } = fixture();
  const dispose = trackRendererTextures(backend);
  const texture = new Texture();
  backend.createTexture(texture);
  texture.dispose();
  backend.createTexture(texture);
  dispose();
  assert.deepEqual(released, [texture, texture]);
});

test('retiring one backend does not change the hooks on another backend', () => {
  const first = fixture(), second = fixture();
  const disposeFirst = trackRendererTextures(first.backend);
  const disposeSecond = trackRendererTextures(second.backend);
  const texture = new Texture();
  second.backend.createTexture(texture);
  disposeFirst();
  assert.equal(second.released.length, 0);
  disposeSecond();
  assert.deepEqual(second.released, [texture]);
});
