'use strict';

const path = require('path');
const webpack = require('webpack');
const { PackageJsonLookup, FileSystem, Path } = require('@rushstack/node-core-library');
const { PreserveDynamicRequireWebpackPlugin } = require('@rushstack/webpack-preserve-dynamic-require-plugin');
const PathConstants = require('./lib-commonjs/utilities/PathConstants');

const SCRIPT_ENTRY_OPTIONS = {
  filename: `${PathConstants.scriptsFolderName}/[name]`,
  library: {
    type: 'commonjs2'
  }
};

const EXPOSED_LIB_PATHS = [];
function collectJsFilePaths(absPath, relPath) {
  const entries = FileSystem.readFolderItems(absPath);
  for (const entry of entries) {
    const name = entry.name;
    // TODO: Use the heuristics from the .npmignore file to decide what to include here
    if (entry.isFile()) {
      if (name.match(/(?!\.test)\.js$/)) {
        EXPOSED_LIB_PATHS.push(`${relPath}/${name.substring(0, name.length - 3)}`);
      }
    } else if (entry.isDirectory() && name !== '__mocks__' && name !== 'test') {
      collectJsFilePaths(`${absPath}/${name}`, `${relPath}/${name}`);
    }
  }
}
collectJsFilePaths(`${__dirname}/lib-esnext`, '.');
EXPOSED_LIB_PATHS.sort();

const INDEX_BUNDLE_PATH = `${__dirname}/lib-esnext/index-bundle.js`;

function generateEntrypoints() {
  FileSystem.writeFile(
    INDEX_BUNDLE_PATH,
    [
      'export function getPath(p) {',
      '  switch(p) {',
      ...EXPOSED_LIB_PATHS.map((path) => `  case '${path}': return require('${path}');`),
      '  }',
      '}',
      ''
    ].join('\n')
  );

  const distFilePath = `${__dirname}/dist/rush-lib`;
  for (const libPath of EXPOSED_LIB_PATHS) {
    const filePath = `${__dirname}/lib/${libPath}.js`;
    const requirePath = Path.convertToSlashes(path.relative(path.dirname(filePath), distFilePath));
    FileSystem.writeFile(
      filePath,
      [`module.exports = require('${requirePath}').getPath('${libPath}');`].join('\n'),
      {
        ensureFolderExists: true
      }
    );
  }
}

module.exports = () => {
  const packageJson = PackageJsonLookup.loadOwnPackageJson(__dirname);

  const externalDependencyNames = new Set([
    ...Object.keys(packageJson.dependencies || {}),
    ...Object.keys(packageJson.peerDependencies || {}),
    ...Object.keys(packageJson.optionalDependencies || {}),
    ...Object.keys(packageJson.devDependencies || {})
  ]);

  generateEntrypoints();

  return {
    mode: 'development', // So the output isn't minified
    devtool: 'source-map',
    entry: {
      ['rush-lib']: {
        import: INDEX_BUNDLE_PATH,
        library: {
          type: 'commonjs'
        }
      },
      [PathConstants.pnpmfileShimFilename]: {
        import: `${__dirname}/lib-esnext/logic/pnpm/PnpmfileShim.js`,
        ...SCRIPT_ENTRY_OPTIONS
      },
      [PathConstants.installRunScriptFilename]: {
        import: `${__dirname}/lib-esnext/scripts/install-run.js`,
        ...SCRIPT_ENTRY_OPTIONS
      },
      [PathConstants.installRunRushScriptFilename]: {
        import: `${__dirname}/lib-esnext/scripts/install-run-rush.js`,
        ...SCRIPT_ENTRY_OPTIONS
      },
      [PathConstants.installRunRushxScriptFilename]: {
        import: `${__dirname}/lib-esnext/scripts/install-run-rushx.js`,
        ...SCRIPT_ENTRY_OPTIONS
      }
    },
    output: {
      path: `${__dirname}/dist`,
      filename: '[name].js',
      chunkFilename: 'chunks/[name].js'
    },
    target: 'node',
    plugins: [
      new PreserveDynamicRequireWebpackPlugin(),
      new webpack.ids.DeterministicModuleIdsPlugin({
        maxLength: 6
      })
    ],
    externals: [
      ({ request }, callback) => {
        let packageName;
        let firstSlashIndex = request.indexOf('/');
        if (firstSlashIndex === -1) {
          packageName = request;
        } else if (request.startsWith('@')) {
          let secondSlash = request.indexOf('/', firstSlashIndex + 1);
          if (secondSlash === -1) {
            packageName = request;
          } else {
            packageName = request.substring(0, secondSlash);
          }
        } else {
          packageName = request.substring(0, firstSlashIndex);
        }

        if (externalDependencyNames.has(packageName)) {
          callback(null, `commonjs ${request}`);
        } else {
          callback();
        }
      }
    ]
  };
};
