"use strict";

/**
 * When using the PNPM package manager, you can use pnpmfile.js to workaround
 * dependencies that have mistakes in their package.json file.  (This feature is
 * functionally similar to Yarn's "resolutions".)
 *
 * For details, see the PNPM documentation:
 * https://pnpm.js.org/docs/en/hooks.html
 *
 * IMPORTANT: SINCE THIS FILE CONTAINS EXECUTABLE CODE, MODIFYING IT IS LIKELY
 * TO INVALIDATE ANY CACHED DEPENDENCY ANALYSIS.  We recommend to run "rush update --full"
 * after any modification to pnpmfile.js.
 *
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
  // these packages have peerDependencies on typescript, but now we have multiple copies
  // in the repo so it doesn't know which one to pick
  // See this issue: https://github.com/pnpm/pnpm/issues/1187
  if (packageJson.name === 'tslint-microsoft-contrib' || packageJson.name === 'tslint' || packageJson.name === 'ts-jest' || packageJson.name === 'ts-loader') {
    packageJson.dependencies['typescript'] = '~3.0.0';
    delete packageJson.peerDependencies['typescript'];
  }

  return packageJson;
}
