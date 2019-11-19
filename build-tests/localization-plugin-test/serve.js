const fsx = require('fs-extra');
const child_process = require('child_process');
const path = require('path');
const process = require('process');

const { LocJsonPreprocessor } = require('@rushstack/localization-plugin');

function executeCommand(command) {
  console.log('---> ' + command);
  child_process.execSync(command, { stdio: 'inherit' });
}

// Clean the old build outputs
console.log(`==> Starting build.js for ${path.basename(process.cwd())}`);
fsx.emptyDirSync('dist');
fsx.emptyDirSync('lib');
fsx.emptyDirSync('temp');

LocJsonPreprocessor.preprocessLocJsonFiles({
  srcFolder: path.resolve(__dirname, 'src'),
  generatedTsFolder: path.resolve(__dirname, 'temp', 'loc-json-ts')
});

// Run Webpack
executeCommand('node node_modules/webpack-dev-server/bin/webpack-dev-server');
