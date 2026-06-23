'use strict';

/**
 * When using the PNPM package manager, you can use pnpmfile.js to workaround
 * dependencies that have mistakes in their package.json file.  (This feature is
 * functionally similar to Yarn's "resolutions".)
 *
 * For details, see the PNPM documentation:
 * https://pnpm.io/pnpmfile#hooks
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

function fixUndeclaredDependency(packageJson, dependencyName) {
  packageJson.dependencies[dependencyName] =
    packageJson.dependencies[dependencyName] ||
    packageJson.devDependencies?.[dependencyName] ||
    packageJson.version;
}

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
    // CVE-2024-29180 (GHSA-wr3j-pwj9-hqq6): webpack-dev-middleware@3.7.3 is vulnerable to path
    // traversal. These storybook v6 packages require ^3.7.3, but 5.3.4 is the lowest patched
    // version and remains compatible with webpack 4 (supports webpack@^4.0.0 || ^5.0.0).
    case '@storybook/builder-webpack4':
    case '@storybook/manager-webpack4': {
      if (packageJson.dependencies && packageJson.dependencies['webpack-dev-middleware']) {
        packageJson.dependencies['webpack-dev-middleware'] = '^5.3.4';
      }
      break;
    }

    case '@jest/test-result': {
      // The `@jest/test-result` package takes undeclared dependencies on `jest-haste-map`
      // and `jest-resolve`
      fixUndeclaredDependency(packageJson, 'jest-haste-map');
      fixUndeclaredDependency(packageJson, 'jest-resolve');
    }

    case '@serverless-stack/core': {
      delete packageJson.dependencies['@typescript-eslint/eslint-plugin'];
      delete packageJson.dependencies['eslint-config-serverless-stack'];
      delete packageJson.dependencies['lerna'];
      break;
    }

    case '@typescript-eslint/rule-tester': {
      // The `@typescript-eslint/rule-tester` package takes an undeclared dependency
      // on `@typescript-eslint/parser`
      fixUndeclaredDependency(packageJson, '@typescript-eslint/parser');
      break;
    }
  }

  return packageJson;
}
