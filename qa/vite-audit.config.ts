import { mergeConfig } from 'vite';
import config from '../vite.config';

// A stable local audit session while other tasks edit the live preview.
export default mergeConfig(config, { server: { port: 5174, hmr: false, strictPort: true } });
