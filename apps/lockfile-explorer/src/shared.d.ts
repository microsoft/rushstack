/**
 * This file is a typing stub for the shared code between the lockfile-explorer-web and lockfile-explorer.
 * We want the lflint CLI tool (contained in the lockfile-explorer package) and the lockfile-explorer-web app.js
 * bundle to share some code that has been bundled into shared.js. This bundling happens in the lockfile-explorer-web project,
 * which is not published to NPM, so we copy lockfile-explorer-web/dist/shared.js into lockfile-explorer/dist.
 *
 * The shared.js/shared.d.ts stubs provide a way for TypeScript code to import these copied files with typings.
 *
 * The shared.d.ts file reexports typings from lockfile-explorer-web.
 * The corresponding shared.js file reexports the real bundle from the "dist" folder.
 */

export * from '@rushstack/lockfile-explorer-web/lib/shared';
