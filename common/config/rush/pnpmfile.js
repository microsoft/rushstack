"use strict";

/**
 * When using the PNPM package manager, you can use pnpmfile.js to workaround
 * dependencies that have mistakes in their package.json file.  (This feature is
 * functionally similar to Yarn's "resolutions".)
 *
 * For details, see the PNPM documentation:
 * https://pnpm.js.org/docs/en/hooks.html
 *
 * IMPORTANT: SINCE THIS FILE CONTAINS EXECUTABLE CODE, MODIFYING IT IS LIKELY TO INVALIDATE
 * ANY CACHED DEPENDENCY ANALYSIS.  After any modification to pnpmfile.js, it's recommended to run
 * "rush update --full" so that PNPM will recalculate all version selections.
 */
module.exports = {
  hooks: {
    readPackage
  }
};

/**
 * This hook is invoked during installation before a package's dependencies
 * are selected.
 * The `packageJson` parameter is the deserialized package.json
 * contents for the package that is about to be installed.
 * The `context` parameter provides a log() function.
 * The return value is the updated object.
 */
function readPackage(packageJson, context) {
  // tslint-microsoft-contrib, tslint, and ts-jest have peerDependencies on typescript, but now we have two copies
  // in the repo so it doesn't know which one to pick
  // See this issue: https://github.com/pnpm/pnpm/issues/1187
  if (packageJson.name === 'tslint-microsoft-contrib' || packageJson.name === 'tslint' || packageJson.name === 'ts-jest') {
    packageJson.dependencies['typescript'] = '~3.0.0';
    delete packageJson.peerDependencies['typescript'];
  }

  return packageJson;
}
