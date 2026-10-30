import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// The API runs inside the dev server so `npm run dev` has the same /api routes as production.
// Secrets come from .env.local (never prefixed VITE_, so they never reach the browser bundle).
const apiPlugin = (env) => ({
  name: 'mock-exam-api',
  async configureServer(server) {
    const { createApi } = await import('./server/api.mjs');
    server.middlewares.use(await createApi({ ...process.env, ...env }));
  },
});

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
    plugins: [react(), apiPlugin(env)],
    server: { port: 5180, strictPort: true },
    test: { environment: 'node' },
  };
});
