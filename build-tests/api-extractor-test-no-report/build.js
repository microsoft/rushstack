const fsx = require('../api-extractor-test-04/node_modules/fs-extra/lib');
const child_process = require('child_process');
const path = require('path');
const process = require('process');

console.log(`==> Invoking tsc in the "beta-consumer" folder`);

function executeCommand(command, cwd) {
  console.log('---> ' + command);
  child_process.execSync(command, { stdio: 'inherit', cwd: cwd });
}

// Clean the old build outputs
console.log(`==> Starting build.js for ${path.basename(process.cwd())}`);
fsx.emptyDirSync('dist');
fsx.emptyDirSync('lib');
fsx.emptyDirSync('temp');

// Run the TypeScript compiler
executeCommand('node node_modules/typescript/lib/tsc');

// Run the API Extractor command-line
if (process.argv.indexOf('--production') >= 0) {
  executeCommand('node node_modules/@microsoft/api-extractor/lib/start run');
} else {
  executeCommand('node node_modules/@microsoft/api-extractor/lib/start run --local');
}

// Run the TypeScript compiler in the beta-consumer folder
console.log(`==> Invoking tsc in the "beta-consumer" folder`);

fsx.emptyDirSync('beta-consumer/lib');
const tscPath = path.resolve('node_modules/typescript/lib/tsc');
executeCommand(`node ${tscPath}`, 'beta-consumer');

console.log(`==> Finished build.js for ${path.basename(process.cwd())}`);
