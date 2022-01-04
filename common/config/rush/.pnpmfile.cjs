'use strict';

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
  // schema-utils (dependency of webpack-dev-server) has an unfulfilled peer dependency
  if (packageJson.name === 'schema-utils') {
    if (!packageJson.dependencies) {
      packageJson.dependencies = {};
    }

    packageJson.dependencies['ajv'] = '~6.12.5';
  } else if (packageJson.name === '@types/webpack-dev-server') {
    delete packageJson.dependencies['@types/webpack'];

    if (!packageJson.peerDependencies) {
      packageJson.peerDependencies = {};
    }

    switch (packageJson.version) {
      case '3.11.3': {
        // This is for heft-webpack4-plugin and the other projects that use Webpack 4
        packageJson.peerDependencies['@types/webpack'] = '^4.0.0';
        break;
      }

      case '4.0.0': {
        // This is for heft-webpack5-plugin and the other projects that use Webpack 5.
        // Webpack 5 brings its own typings
        packageJson.peerDependencies['webpack'] = '^5.0.0';
        break;
      }

      default: {
        throw new Error(
          `Unexpected version of @types/webpack-dev-server: "${packageJson.version}". ` +
            'Update pnpmfile.js to add support for this version.'
        );
      }
    }
  } else if (
    packageJson.name === '@typescript-eslint/types' ||
    packageJson.name === 'tslint-microsoft-contrib'
  ) {
    // The `@typescript-eslint/types` check is a workaround for https://github.com/typescript-eslint/typescript-eslint/issues/3622.
    // The `tslint-microsoft-contrib` repo is archived so it can't be updated to TS 4.4+.
    if (!packageJson.peerDependencies) {
      packageJson.peerDependencies = {};
    }
    packageJson.peerDependencies['typescript'] = '*';
  }

  return packageJson;
}
