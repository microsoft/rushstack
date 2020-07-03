const { FileSystem } = require('@rushstack/node-core-library');
const child_process = require('child_process');
const path = require('path');
const process = require('process');

function executeCommand(command) {
  console.log('---> ' + command);
  child_process.execSync(command, { stdio: 'inherit' });
}

// Clean the old build outputs
console.log(`==> Starting build.js for ${path.basename(process.cwd())}`);
FileSystem.ensureEmptyFolder('dist');
FileSystem.ensureEmptyFolder('lib');
FileSystem.ensureEmptyFolder('temp');

// Run Webpack
executeCommand('node node_modules/webpack-dev-server/bin/webpack-dev-server');
