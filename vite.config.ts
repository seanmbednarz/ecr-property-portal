import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// Vars the app cannot function without. A missing one is normally invisible:
// `import.meta.env.X` inlines to undefined, the guard that reads it folds to a
// constant, and the minifier deletes the whole branch behind it. That is not
// theoretical — a production build made without VITE_MAPBOX_TOKEN shipped with
// every Mapbox request compiled out of the bundle, so the address autocomplete
// silently returned nothing on the live site while the code looked correct.
// Fail the build instead.
const REQUIRED = ['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY', 'VITE_MAPBOX_TOKEN'];

// https://vitejs.dev/config/
export default defineConfig(({ command, mode }) => {
  if (command === 'build') {
    // loadEnv reads .env files the same way the build does, and process.env
    // covers CI, where the values arrive as real environment variables.
    const env = { ...loadEnv(mode, process.cwd(), ''), ...process.env };
    const missing = REQUIRED.filter(k => !env[k]);
    if (missing.length) {
      throw new Error(
        `Missing required build-time env var(s): ${missing.join(', ')}.\n` +
        `Add them to .env (see .env.example) or export them before building.\n` +
        `Building without them produces a bundle with those features silently removed.`
      );
    }
  }
  return {
    plugins: [react()],
    optimizeDeps: {
      exclude: ['lucide-react'],
    },
  };
});
