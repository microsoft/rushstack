// The webpack-dev-middleware@5.3.1 project has a phantom dependency on @types/node
// and so "npm install" chooses the "*" latest version.  As a result, their index.d.ts
// has a reference to fs.StatSyncFn which is new in @types/node@16.  As of this writing
// Node 12 is still LTS so we need to support it.
// Upstream issue: https://github.com/webpack/webpack-dev-middleware/issues/1194
declare module 'fs' {
  export type StatSyncFn = typeof statSync;
}
