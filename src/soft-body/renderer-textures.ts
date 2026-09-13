import type { Material, Texture, WebGPURenderer } from 'three/webgpu';

interface TextureBackend {
  createTexture(texture: Texture, options?: object): void;
  createDefaultTexture(texture: Texture): void;
  destroyTexture(texture: Texture, isDefaultTexture?: boolean): void;
}

/**
 * Three r183's Textures.dispose() clears its cache without removing texture
 * listeners. Its shared DFG_LUT then retains every retired backend. Track live
 * textures on this backend and dispose them before renderer.dispose(), while
 * Three can still remove its own listeners. No global prototypes are changed.
 * Recheck this compatibility helper when upgrading Three.
 */
export function trackRendererTextures(backend: TextureBackend): () => void {
  const textures = new Set<Texture>();
  const { createTexture, createDefaultTexture, destroyTexture } = backend;
  backend.createTexture = function(texture, options) {
    textures.add(texture);
    return createTexture.call(this, texture, options);
  };
  backend.createDefaultTexture = function(texture) {
    textures.add(texture);
    return createDefaultTexture.call(this, texture);
  };
  backend.destroyTexture = function(texture, isDefaultTexture) {
    textures.delete(texture);
    return destroyTexture.call(this, texture, isDefaultTexture);
  };
  let disposed = false;
  return () => {
    if (disposed) return;
    disposed = true;
    try {
      for (const texture of textures) texture.dispose();
    } finally {
      textures.clear();
      backend.createTexture = createTexture;
      backend.createDefaultTexture = createDefaultTexture;
      backend.destroyTexture = destroyTexture;
    }
  };
}

/** r183 also omits its output material, retaining RenderObjects on a shared quad. */
export function disposeRendererOutput(renderer: WebGPURenderer): void {
  // There is no public accessor for the renderer-owned output pass in r183.
  // Keep this version-specific access here and cover it with browser lifecycle QA.
  const output = (renderer as unknown as { _quad: { material: Material } })._quad;
  output.material.dispose();
}
