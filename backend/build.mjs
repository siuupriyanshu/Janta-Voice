// Bundle the whole backend (our code + all node_modules) into one self-contained
// ESM function for Vercel. Bundling everything (rather than leaving packages
// external) avoids the web3.js/rpc-websockets `require()`-of-ESM-uuid crash you
// get on a Node ESM serverless runtime. esbuild (platform:node, format:esm)
// injects its own require/__dirname/__filename shims — do not add a banner.
import { build } from "esbuild";

await build({
  entryPoints: ["src/entry.ts"],
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node20",
  outfile: "api/index.js",
  // Provide a real `require` so esbuild's __require shim resolves dynamic
  // require() of node builtins (express/body-parser/depd) instead of throwing.
  // Only `require` — esbuild injects its own __dirname/__filename.
  banner: {
    js: "import { createRequire as __createRequire } from 'module'; const require = __createRequire(import.meta.url);",
  },
  logLevel: "info",
});
