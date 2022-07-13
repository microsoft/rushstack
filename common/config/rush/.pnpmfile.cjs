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
  switch (packageJson.name) {
    case '@emotion/core':
    case '@emotion/styled':
    case '@emotion/styled-base':
    case '@emotion/theming':
    case '@storybook/addons':
    case '@storybook/api':
    case '@storybook/router':
    case 'emotion-theming':
    case 'react-router-dom':
    case 'react-router': {
      // This package reexports types from `react`
      packageJson.peerDependencies['@types/react'] = '>=16';
      break;
    }

    case '@jest/reporters': {
      // The `@jest/reporters` package reexports types from `istanbul-lib-coverage`
      packageJson.dependencies['@types/istanbul-lib-coverage'] = '2.0.4';
      break;
    }

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

    case '@serverless-stack/resources': {
      packageJson.dependencies.esbuild = '*';
      break;
    }

    case '@storybook/react': {
      // This package reexports types from `react`
      packageJson.peerDependencies['@types/node'] = '>=12';
      packageJson.peerDependencies['@types/react'] = '>=16';
      break;
    }

    case '@storybook/theming': {
      packageJson.dependencies['@emotion/serialize'] = '*';
      packageJson.dependencies['@emotion/utils'] = '*';
      break;
    }

    case '@types/webpack': {
      packageJson.dependencies.anymatch = '^3';
      break;
    }

    case '@typescript-eslint/types': {
      // `@typescript-eslint/types` reexports types from `typescript`
      packageJson.peerDependencies = { typescript: '*' };
      break;
    }

    case 'collect-v8-coverage': {
      // The `collect-v8-coverage` package references `node` in its typings
      packageJson.peerDependencies = {
        '@types/node': '>=12'
      };
      break;
    }

    case 'http-proxy-middleware': {
      packageJson.dependencies['@types/express'] = '*';
      break;
    }

    case 'tslint-microsoft-contrib': {
      // The `tslint-microsoft-contrib` repo is archived so it can't be updated to TS 4.4+.
      // unmet peer typescript@"^2.1.0 || ^3.0.0": found 4.5.5
      packageJson.peerDependencies['typescript'] = '*';
      break;
    }

    case 'webpack-dev-server': {
      packageJson.dependencies.anymatch = '^3';
      packageJson.dependencies['@types/express-serve-static-core'] = '*';
      packageJson.dependencies['@types/serve-static'] = '*';
      // If using webpack 4, need peer dependency on the typings
      packageJson.peerDependencies['@types/webpack'] = '^4';
      (packageJson.peerDependenciesMeta || (packageJson.peerDependenciesMeta = {}))['@types/webpack'] = {
        optional: true
      };
      break;
    }

    case 'webpack-dev-middleware': {
      // If using webpack 4, need peer dependency on the typings
      packageJson.peerDependencies['@types/webpack'] = '^4';
      (packageJson.peerDependenciesMeta || (packageJson.peerDependenciesMeta = {}))['@types/webpack'] = {
        optional: true
      };
      break;
    }
  }

  return packageJson;
}
