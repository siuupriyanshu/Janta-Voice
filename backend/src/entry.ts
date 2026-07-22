// Bundle entry for the Vercel serverless function.
// esbuild inlines our source + JSON (idl, seed) into a single api/index.js;
// node_modules stay external. server.ts skips app.listen() when VERCEL is set.
import app from "./server";

export default app;
