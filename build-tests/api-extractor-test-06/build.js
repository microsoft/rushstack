const fsx = require('fs-extra');
const child_process = require('child_process');
const path = require('path');
const process = require('process');

const apiExtractorConfigTemplate = require('./api-extractor-template');

const packageJsonTemplate = {
  private: true,
  version: "1.0.0",
  main: 'index.js',
  typings: 'index.d.ts',
};

function executeCommand(command) {
  console.log('---> ' + command);
  child_process.execSync(command, { stdio: 'inherit' });
}

function prepareScenario(scenario) {
  const name = `scenario-${scenario.toLowerCase()}`;

  const outputDir = `dist/${name}`;
  fsx.emptyDirSync(path.join(outputDir));

  fsx.copyFileSync(path.join('lib', `${scenario}.js`), path.join(outputDir, 'index.js'));

  const packageJson = Object.assign({}, packageJsonTemplate);
  packageJson.name = name;
  fsx.writeJSONSync(path.join(outputDir, 'package.json'), packageJson, { spaces: 2 });

  const apiExtractorConfig = Object.assign({}, apiExtractorConfigTemplate);
  apiExtractorConfig.project.entryPointSourceFile = `lib/${scenario}.d.ts`;
  apiExtractorConfig.dtsRollup.mainDtsRollupPath = `${name}/index.d.ts`;
  const configPath = path.join('temp', `api-extractor-${scenario.toLowerCase()}.json`);

  fsx.writeJSONSync(configPath, apiExtractorConfig, { spaces: 2 });
  if (process.argv.indexOf('--production') >= 0) {
    executeCommand(`node node_modules/@microsoft/api-extractor/lib/start run --config ${configPath}`);
  } else {
    executeCommand(`node node_modules/@microsoft/api-extractor/lib/start run --local --config ${configPath}`);
  }
}

// Clean the old build outputs
console.log(`==> Starting build.js for ${path.basename(process.cwd())}`);
fsx.emptyDirSync('dist');
fsx.emptyDirSync('lib');
fsx.emptyDirSync('temp');

// Run the TypeScript compiler
executeCommand('node node_modules/typescript/lib/tsc');

// Run the API Extractor command-line
console.log(`==> Running API Extractor for each scenario of ${path.basename(process.cwd())}`);
const files = fsx.readdirSync('src');
for (const file of files) {
  if (file.endsWith('.ts')) {
    const scenario = file.substring(0, file.length - 3);
    prepareScenario(scenario);
  }
}

console.log(`==> Running test for ${path.basename(process.cwd())}`);
executeCommand('node node_modules/typescript/lib/tsc --project tsconfig-caller.json');
require('./caller.js');

console.log(`==> Finished build.js for ${path.basename(process.cwd())}`);
