// This script is invoked by the CI build, via a build definition step.
//
// 'npm install @microsoft/rush -g' will always delete and recreate the rush
// global folder, even if it is already up to date. This causes a race condition
// when multiple builds are running simultaneously on the same build machine.
//
// As a workaround, this script checks whether Rush is up to date before
// running the command.

import * as childProcess from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { IPackageJson } from '@microsoft/node-core-library';

const PACKAGE_NAME: string = '@microsoft/rush';
const RUSH_JSON_FILENAME: string = 'rush.json';

let rushJsonDirectory: string = undefined!;
let basePath: string = __dirname;
let tempPath: string = __dirname;
do {
  const testRushJsonPath: string = path.join(basePath, RUSH_JSON_FILENAME);
  if (fs.existsSync(testRushJsonPath)) {
    rushJsonDirectory = basePath;
    break;
  } else {
    basePath = tempPath;
  }
} while (basePath !== (tempPath = path.resolve(basePath, '..'))); // Exit the loop when we hit the disk root

if (!rushJsonDirectory) {
  console.error('Unable to find rush.json.');
  process.exit(1);
}

let expectedVersion: string = undefined!;
const rushJsonPath: string = path.join(rushJsonDirectory, RUSH_JSON_FILENAME);
try {
  const rushJsonContents: string = fs.readFileSync(rushJsonPath, 'UTF-8');
  // Use a regular expression to parse out the rushVersion value because rush.json supports comments,
  // but JSON.parse does not and we don't want to pull in more dependencies than we need to in this script.
  const rushJsonMatches: string[] = rushJsonContents.match(/\"rushVersion\"\s*\:\s*\"([0-9a-zA-Z.+\-]+)\"/)!;
  expectedVersion = rushJsonMatches[1];
} catch (e) {
  console.error(
    `Unable to determine the required version of Rush from rush.json (${rushJsonDirectory}). ` +
    'The \'rushVersion\' field is either not assigned in rush.json or was specified ' +
    'using an unexpected syntax.'
  );
  process.exit(1);
}

let npmPath: string = undefined!;
try {
  if (os.platform() === 'win32') {
    // We're on Windows
    const whereOutput: string = childProcess.execSync('where npm', { stdio: [] }).toString();
    const lines: string[] = whereOutput.split(os.EOL).filter((line) => !!line);
    npmPath = lines[lines.length - 1];
  } else {
    // We aren't on Windows - assume we're on *NIX or Darwin
    npmPath = childProcess.execSync('which npm', { stdio: [] }).toString();
  }
} catch (e) {
  console.error(`Unable to determine the path to the NPM tool: ${e}`);
  process.exit(1);
}

npmPath = npmPath.trim();
console.log(os.EOL + `NPM executable is '${npmPath}'`);

if (!fs.existsSync(npmPath)) {
  console.error('The NPM executable does not exist');
  process.exit(1);
}

const rushPathParts: string[] = ['common', 'temp', 'local-rush'];
let rushPath: string = rushJsonDirectory;
for (const rushPathPart of rushPathParts) {
  rushPath = path.join(rushPath, rushPathPart);
  try {
    if (!fs.existsSync(rushPath)) {
      fs.mkdirSync(rushPath);
    }
  } catch (e) {
    console.error(`Error building local rush installation directory: ${e}`);
    process.exit(1);
  }
}

console.log(os.EOL + `Expected Rush version is ${expectedVersion}`);

// Check for the Rush version
let installedVersion: string = undefined!;
let installedVersionValid: boolean = false;
try {
  const spawnResult: childProcess.SpawnSyncReturns<Buffer> = childProcess.spawnSync(
    npmPath, ['list', PACKAGE_NAME, 'version'],
    { cwd: rushPath, stdio: ['pipe', 'pipe', 'pipe'] }
  );
  const output: string = spawnResult.output.toString();
  const matches: string[] | null = /@microsoft\/rush\@([0-9a-zA-Z.+\-]+)/.exec(output);
  // If NPM finds the wrong version in node_modules, that version will be in matches[1].
  // But if it's not installed at all, then NPM instead uselessly tells us all about
  // the version that we DON'T have ('missing:')
  if (matches && matches.length === 2 && !output.match(/missing\:/g)) {
    installedVersion = matches[1]!;

    if (spawnResult.status === 0) {
      installedVersionValid = true;
    }
  }
} catch (error) {
  // (this happens if we didn't find the installed package)
}

if (installedVersion) {
  console.log(os.EOL + `Installed version is ${installedVersion}`);
} else {
  console.log(os.EOL + 'Rush does not appear to be installed');
}

if (!installedVersionValid || installedVersion !== expectedVersion) {
  const npmrcPath: string = path.join(rushJsonDirectory, 'common', 'config', 'rush', '.npmrc');
  const rushNpmrcPath: string = path.join(rushPath, '.npmrc');
  if (fs.existsSync(npmrcPath)) {
    try {
      const npmrcFileLines: string[] = fs.readFileSync(npmrcPath).toString().split('\n').map((line) => line.trim());
      const resultLines: string[] = [];
      // Trim out lines that reference environment variables that aren't defined
      for (const line of npmrcFileLines) {
        const environmentVariables: string[] | null = line.match(/\$\{([^\}]+)\}/g);
        let lineShouldBeTrimmed: boolean = false;
        if (environmentVariables) {
          for (const environmentVariable of environmentVariables) {
            if (!process.env[environmentVariable]) {
              lineShouldBeTrimmed = true;
              break;
            }
          }
        }

        if (!lineShouldBeTrimmed) {
          resultLines.push(line);
        }
      }

      fs.writeFileSync(rushNpmrcPath, resultLines.join(os.EOL));
    } catch (e) {
      console.error(`Error reading or writing .npmrc file: ${e}`);
      process.exit(1);
    }
  }

  const packageContents: IPackageJson = {
    'name': 'local-rush',
    'version': '0.0.0',
    'dependencies': {
      [PACKAGE_NAME]: expectedVersion
    },
    'description': 'DON\'T WARN',
    'repository': 'DON\'T WARN',
    'license': 'MIT'
  };

  const rushPackagePath: string = path.join(rushPath, 'package.json');
  fs.writeFileSync(rushPackagePath, JSON.stringify(packageContents, undefined, 2));

  console.log(os.EOL + 'Installing Rush...');
  childProcess.execSync(`"${npmPath}" install ${PACKAGE_NAME}@${expectedVersion}`, { cwd: rushPath });
  console.log(os.EOL + `Successfully installed Rush ${expectedVersion}`);
}
