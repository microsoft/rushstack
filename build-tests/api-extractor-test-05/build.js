const fsx = require('../api-extractor-test-05/node_modules/fs-extra');
const child_process = require('child_process');
const path = require('path');
const process = require('process');

function executeCommand(command) {
  console.log('---> ' + command);
  child_process.execSync(command, { stdio: 'inherit' });
}

// Clean the old build outputs
console.log(`==> Starting build.js for ${path.basename(process.cwd())}`);
fsx.emptyDirSync('dist');
fsx.emptyDirSync('etc');
fsx.emptyDirSync('temp');

// We do not run TSC in this test as to show the issue with additional spaces inside of a d.ts,
// which is still a valid format for a typescript file.

// Run the API Extractor command-line
if (process.argv.indexOf('--production') >= 0) {
  executeCommand('node node_modules/@microsoft/api-extractor/lib/start run');
} else {
  executeCommand('node node_modules/@microsoft/api-extractor/lib/start run --local');
}

console.log(`==> Finished build.js for ${path.basename(process.cwd())}`);
