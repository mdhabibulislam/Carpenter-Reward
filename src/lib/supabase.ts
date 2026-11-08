/**
 * Where the app keeps its data.
 * - Deployed (Vercel): the server in /api stores everything in a private GitHub repo. REMOTE = true.
 * - `npm run dev` or a build with VITE_DEMO_MODE=true: data stays in this browser only (IndexedDB). For local testing.
 */
const local = import.meta.env.DEV || import.meta.env.VITE_DEMO_MODE === 'true';
export const IS_DEMO = local;
export const REMOTE = !local;
export const CONFIG_ERROR: string | null = null;
