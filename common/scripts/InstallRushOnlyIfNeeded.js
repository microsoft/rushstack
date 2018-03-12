"use strict"

// This script is invoked by the CI build, via a build definition step.
//
// "npm install @microsoft/rush -g" will always delete and recreate the rush
// global folder, even if it is already up to date. This causes a race condition
// when multiple builds are running simultaneously on the same build machine.
//
// As a workaround, this script checks whether Rush is up to date before
// running the command.

const child_process = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const packageName = "@microsoft/rush";

const rushJsonPath = path.join(__dirname, '..', '..', 'rush.json');
let expectedVersion;
try {
  const rushJsonContents = fs.readFileSync(rushJsonPath, 'UTF-8');
  // Use a regular expression to parse out the rushVersion value because rush.json supports comments,
  //  but JSON.parse does not and we don't want to pull in more dependencies than we need to in this script.
  const rushJsonMatches = rushJsonContents.match(/\"rushVersion\"\s*\:\s*\"([0-9\.]+)\"/);
  expectedVersion = rushJsonMatches[1];
} catch (e) {
  console.error(`Unable to determine the required version of Rush from rush.json (${rushJsonPath}). ` +
                'The "rushVersion" field is either not assigned in rush.json or was specified ' +
                'using an unexpected syntax.');
  return;
}

let npmPath;
try {
  if (process.env.NODIST_PREFIX) {
    // Nodist is installed
    npmPath = path.join(process.env.NODIST_PREFIX, 'bin', 'npm.exe');
  } else if (os.platform() === 'win32') {
    // We're on Windows
    const whereOutput = child_process.execSync('where npm', { stdio: [] }).toString();
    const lines = whereOutput.split(os.EOL).filter((line) => !!line);
    npmPath = lines[lines.length - 1];
  } else {
    // We aren't on Windows - assume we're on 'NIX or Darwin
    npmPath = child_process.execSync('which npm', { stdio: [] }).toString();
  }
} catch (e) {
  console.error(`Unable to determine the path to the NPM tool: ${e}`);
  return;
}

npmPath = npmPath.trim();

console.log(os.EOL + `NPM executable is "${npmPath}"`);

if (!fs.existsSync(npmPath)) {
  console.error('The NPM executable does not exist');
  process.exit(1);
}

const buildDirectory = path.join(__dirname, '..', '..');
const rushPath = path.join(buildDirectory, 'common', 'local-rush');
const rushPackagePath = path.join(rushPath, 'package.json');

if (!fs.existsSync(rushPath)) {
  fs.mkdirSync(rushPath);
}

if (!fs.existsSync(rushPackagePath)) {
  const packageContents = {
    "dependencies": {
      [packageName]: expectedVersion
    }
  };

  fs.writeFileSync(rushPackagePath, JSON.stringify(packageContents, undefined, 2));
}

// Check for the Rush version
let installedVersion = undefined;
console.log(os.EOL + `Expected Rush version is ${expectedVersion}`);

try {
  const output = child_process.execSync(`"${npmPath}" list ${packageName} version`,
    { cwd: rushPath, stdio: ['pipe', 'pipe', 'pipe'] });
  const matches = /@microsoft\/rush\@([0-9.]+)/.exec(output);
  if (matches && matches.length === 2) {
    installedVersion = matches[1];
  }
}
catch (error) {
  // (this happens if we didn't find the installed package)
}

if (installedVersion) {
  console.log(os.EOL + `Installed version is ${installedVersion}`);
} else {
  console.log(os.EOL + 'Rush does not appear to be installed');
}

if (installedVersion !== expectedVersion) {
  console.log(os.EOL + 'Installing Rush...');
  child_process.execSync(`"${npmPath}" install ${packageName}@${expectedVersion}`, { cwd: rushPath });
  console.log(os.EOL + `Successfully installed Rush ${expectedVersion}`);
}
