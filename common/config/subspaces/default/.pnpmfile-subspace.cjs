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
  if (packageJson.name.startsWith('@radix-ui/')) {
    if (packageJson.peerDependencies && packageJson.peerDependencies['react']) {
      packageJson.peerDependencies['@types/react'] = '*';
      packageJson.peerDependencies['@types/react-dom'] = '*';
    }
  }

  switch (packageJson.name) {
    case '@jest/test-result': {
      // The `@jest/test-result` package takes undeclared dependencies on `jest-haste-map`
      // and `jest-resolve`
      packageJson.dependencies['jest-haste-map'] = packageJson.version;
      packageJson.dependencies['jest-resolve'] = packageJson.version;
    }

    case '@serverless-stack/core': {
      delete packageJson.dependencies['@typescript-eslint/eslint-plugin'];
      delete packageJson.dependencies['eslint-config-serverless-stack'];
      delete packageJson.dependencies['lerna'];
      break;
    }

    case 'tslint-microsoft-contrib': {
      // The `tslint-microsoft-contrib` repo is archived so it can't be updated to TS 4.4+.
      // unmet peer typescript@"^2.1.0 || ^3.0.0": found 4.5.5
      packageJson.peerDependencies['typescript'] = '*';
      break;
    }
  }

  return packageJson;
}
