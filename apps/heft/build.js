'use strict';

const path = require('path');
const glob = require('glob');
const { FileSystem } = require('@rushstack/node-core-library');
const { ToolPaths } = require('@microsoft/rush-stack-compiler-3.7');
const { callNodeScript } = require('./callNodeScript');
const child_process = require('child_process');

const isProductionBuild = process.argv.indexOf('--production') !== -1;

process.exitCode = 1;
try {
  FileSystem.ensureEmptyFolder(path.resolve(__dirname, 'lib'));
  FileSystem.ensureEmptyFolder(path.resolve(__dirname, 'dist'));
  FileSystem.ensureEmptyFolder(path.resolve(__dirname, 'temp'));

  console.log(`-- TYPESCRIPT (${ToolPaths.typescriptPackageJson.version}) --\n`);
  callNodeScript(path.resolve(ToolPaths.typescriptPackagePath, 'bin', 'tsc'));

  console.log('-- COPY JSON FILES --\n');
  const jsonFiles = glob.sync(`${__dirname}/src/**/*.json`);
  for (const jsonFile of jsonFiles) {
    FileSystem.copyFile({
      sourcePath: jsonFile,
      destinationPath: path.resolve(__dirname, 'lib', path.relative(path.join(__dirname, 'src'), jsonFile))
    });
  }

  console.log(`-- API EXTRACTOR (${ToolPaths.apiExtractorPackageJson.version}) --\n`);
  const apiExtractorPath = path.join(__dirname, 'node_modules', '.bin', 'rush-api-extractor');
  child_process.execSync(`${apiExtractorPath} run ${isProductionBuild ? '' : '--local'}`, {
    stdio: 'inherit',
    cwd: __dirname
  });

  console.log(`-- ESLINT (${ToolPaths.eslintPackageJson.version}) --\n`);
  callNodeScript(path.join(ToolPaths.eslintPackagePath, 'bin', 'eslint'), [
    '-f',
    'unix',
    'src/**/*.{ts,tsx}'
  ]);

  process.exitCode = 0;
} catch (e) {
  console.log('ERROR: ' + e.message);
}
