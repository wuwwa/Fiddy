import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { productionSecurity } from './config/security';

export default defineConfig({
  plugins: [react(), productionSecurity()],
  server: { port: 5173, strictPort: true },
  build: {
    manifest: true,
    rollupOptions: {
      output: {
        onlyExplicitManualChunks: true,
        manualChunks(id) {
          const path = id.replaceAll('\\', '/');
          if (path.endsWith('/three/build/three.core.js')) return 'three-core';
          if (path.endsWith('/three/build/three.module.js')) return 'three-webgl';
          if (path.endsWith('/three/build/three.webgpu.js')) return 'three-webgpu';
        },
      },
    },
    chunkSizeWarningLimit: 700,
  },
});
