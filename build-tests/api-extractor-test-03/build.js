const fsx = require('fs-extra');
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
fsx.emptyDirSync('lib');
fsx.emptyDirSync('temp');

// Run the TypeScript compiler
executeCommand('node node_modules/typescript/lib/tsc');

// (NO API EXTRACTOR FOR THIS PROJECT)

console.log(`==> Finished build.js for ${path.basename(process.cwd())}`);
