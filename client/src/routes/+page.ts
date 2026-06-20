// Disable SSR for this route:
// colyseus.js and @colyseus/schema ship browser/UMD builds that
// reference `exports` – a CJS global that doesn't exist in Vite's
// ESM SSR runtime.  Running the game page client-only avoids the
// "exports is not defined" crash entirely.
export const ssr = false;
