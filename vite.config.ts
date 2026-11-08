import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

/** Content-Security-Policy shared by the build-time meta tag and public/_headers. */
export const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com", // inline style attributes are used for animation
  "font-src 'self' https://fonts.gstatic.com",
  "img-src 'self' data: blob:",
  "connect-src 'self'", // only our own /api server
  "worker-src 'self'",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ');

/** Adds the CSP meta tag to production builds only (the dev server needs inline scripts for hot reload). */
const cspMeta = (): Plugin => ({
  name: 'csp-meta',
  apply: 'build',
  transformIndexHtml: (html) => html.replace('<head>', `<head>\n    <meta http-equiv="Content-Security-Policy" content="${CSP}" />`),
});

export default defineConfig({
  plugins: [react(), cspMeta()],
  server: { port: 5173 },
  build: {
    sourcemap: false, // never ship source maps
    rollupOptions: {
      output: {
        // Long-lived vendor chunks: cached across app updates, downloaded once per phone.
        manualChunks: (id) => {
          if (!id.includes('node_modules')) return undefined;
          if (/[\/](react|react-dom|scheduler|react-router|react-router-dom)[\/]/.test(id)) return 'react';
          if (id.includes('motion') || id.includes('framer-motion')) return 'motion';
          if (id.includes('@supabase')) return 'supabase';
          if (id.includes('lucide-react')) return 'icons';
          return undefined;
        },
      },
    },
  },
});
