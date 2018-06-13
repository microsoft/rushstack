// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

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

interface IPackageSpecifier {
  name: string;
  version: string | undefined;
}

const RUSH_JSON_FILENAME: string = 'rush.json';
const INSTALLED_FLAG_FILENAME: string = 'installed.flag';
const NODE_MODULES_FOLDER_NAME: string = 'node_modules';
const PACKAGE_JSON_FILENAME: string = 'package.json';

let _npmPath: string | undefined = undefined;
/**
 * Get the absolute path to the npm executable
 */
function getNpmPath(): string {
  if (!_npmPath) {
    try {
      if (os.platform() === 'win32') {
        // We're on Windows
        const whereOutput: string = childProcess.execSync('where npm', { stdio: [] }).toString();
        const lines: string[] = whereOutput.split(os.EOL).filter((line) => !!line);
        _npmPath = lines[lines.length - 1];
      } else {
        // We aren't on Windows - assume we're on *NIX or Darwin
        _npmPath = childProcess.execSync('which npm', { stdio: [] }).toString();
      }
    } catch (e) {
      throw new Error(`Unable to determine the path to the NPM tool: ${e}`);
    }

    _npmPath = _npmPath.trim();
    console.log(`NPM executable is '${_npmPath}'`);

    if (!fs.existsSync(_npmPath)) {
      throw new Error('The NPM executable does not exist');
    }
  }

  return _npmPath;
}

/**
 * Parse a package specifier (in the form of name\@version) into name and version parts.
 */
function parsePackageSpecifier(rawPackageSpecifier: string): IPackageSpecifier {
  rawPackageSpecifier = (rawPackageSpecifier || '').trim();
  const separatorIndex: number = rawPackageSpecifier.lastIndexOf('@');

  let name: string;
  let version: string | undefined = undefined;
  if (separatorIndex === 0) {
    // The specifier starts with a scope and doesn't have a version specified
    name = rawPackageSpecifier;
  } else if (separatorIndex === -1) {
    // The specifier doesn't have a version
    name = rawPackageSpecifier;
  } else {
    name = rawPackageSpecifier.substring(0, separatorIndex);
    version = rawPackageSpecifier.substring(separatorIndex + 1);
  }

  if (!name) {
    throw new Error(`Invalid package specifier: ${rawPackageSpecifier}`);
  }

  return { name, version };
}

/**
 * Resolve a package specifier to a static version
 */
function resolvePackageVersion({ name, version }: IPackageSpecifier): string {
  if (!version) {
    version = '*'; // If no version is specified, use the latest version
  }

  if (version.match(/[\*\^\~]/ig)) {
    // If the version contains the characters "*", "^", or "~", we need to figure out what the
    // version resolves to
    try {
      const npmPath: string = getNpmPath();

      // This returns something that looks like:
      //  @microsoft/rush@3.0.0 '3.0.0'
      //  @microsoft/rush@3.0.1 '3.0.1'
      //  ...
      //  @microsoft/rush@3.0.20 '3.0.20'
      //  <blank line>
      const npmViewVersionOutput: string = childProcess.execSync(
        `${npmPath} view ${name}@${version} version --no-update-notifier`,
        { stdio: [] }
      ).toString();
      const versionLines: string[] = npmViewVersionOutput.split('\n').filter((line) => !!line);
      const latestVersion: string = versionLines[versionLines.length - 1];
      const versionMatches: string[] | null = latestVersion.match(/^.+\s\'(.+)\'$/);
      if (!versionMatches) {
        throw new Error(`Invalid npm output ${latestVersion}`);
      }

      return versionMatches[1];
    } catch (e) {
      throw new Error(`Unable to resolve version ${version} of package ${name}: ${e}`);
    }
  } else {
    return version;
  }
}

let _rushJsonFolder: string | undefined;
/**
 * Find the absolute path to the folder containing rush.json
 */
function findRushJsonFolder(): string {
  if (!_rushJsonFolder) {
    let basePath: string = __dirname;
    let tempPath: string = __dirname;
    do {
      const testRushJsonPath: string = path.join(basePath, RUSH_JSON_FILENAME);
      if (fs.existsSync(testRushJsonPath)) {
        _rushJsonFolder = basePath;
        break;
      } else {
        basePath = tempPath;
      }
    } while (basePath !== (tempPath = path.resolve(basePath, '..'))); // Exit the loop when we hit the disk root

    if (!_rushJsonFolder) {
      throw new Error('Unable to find rush.json.');
    }
  }

  return _rushJsonFolder;
}

/**
 * Create missing directories under the specified base directory, and return the resolved directory.
 *
 * Does not support "." or ".." path segments.
 * Assumes the baseFolder exists.
 */
function ensureAndResolveFolder(baseFolder: string, ...pathSegments: string[]): string {
  let resolvedDirectory: string = baseFolder;
  try {
    for (let pathSegment of pathSegments) {
      pathSegment = pathSegment.replace(/[\\\/]/g, '_');
      resolvedDirectory = path.resolve(resolvedDirectory, pathSegment);
      if (!fs.existsSync(resolvedDirectory)) {
        fs.mkdirSync(resolvedDirectory);
      }
    }
  } catch (e) {
    throw new Error(`Error building local installation directory (${path.resolve(baseFolder, ...pathSegments)}): ${e}`);
  }

  return resolvedDirectory;
}

function copyNpmrcIfItExists(rushJsonFolder: string, packageInstallFolder: string): void {
  const npmrcPath: string = path.join(rushJsonFolder, 'common', 'config', 'rush', '.npmrc');
  const packageInstallNpmrcPath: string = path.join(packageInstallFolder, '.npmrc');
  if (fs.existsSync(npmrcPath)) {
    try {
      let npmrcFileLines: string[] = fs.readFileSync(npmrcPath).toString().split('\n');
      npmrcFileLines = npmrcFileLines.map((line) => (line || '').trim());
      const resultLines: string[] = [];
      // Trim out lines that reference environment variables that aren't defined
      for (const line of npmrcFileLines) {
        const regex: RegExp = /\$\{([^\}]+)\}/g; // This finds environment variable tokens that look like "${VAR_NAME}"
        const environmentVariables: string[] | null = line.match(regex);
        let lineShouldBeTrimmed: boolean = false;
        if (environmentVariables) {
          for (const token of environmentVariables) {
            // Remove the leading "${" and the trailing "}" from the token
            const environmentVariableName: string = token.substring(2, token.length - 1);
            if (!process.env[environmentVariableName]) {
              lineShouldBeTrimmed = true;
              break;
            }
          }
        }

        if (!lineShouldBeTrimmed) {
          resultLines.push(line);
        }
      }

      fs.writeFileSync(packageInstallNpmrcPath, resultLines.join(os.EOL));
    } catch (e) {
      throw new Error(`Error reading or writing .npmrc file: ${e}`);
    }
  }
}

/**
 * Detects if the package in the specified directory is installed
 */
function isPackageAlreadyInstalled(packageInstallFolder: string): boolean {
  try {
    const flagFilePath: string = path.join(packageInstallFolder, INSTALLED_FLAG_FILENAME);
    if (!fs.existsSync(flagFilePath)) {
      return false;
    }

    const fileContents: string = fs.readFileSync(flagFilePath).toString();
    return fileContents.trim() === process.version;
  } catch (e) {
    return false;
  }
}

/**
 * Removes the installed.flag file and the node_modules folder under the specified folder path.
 */
function cleanInstallFolder(packageInstallFolder: string): void {
  try {
    const flagFile: string = path.resolve(packageInstallFolder, INSTALLED_FLAG_FILENAME);
    if (fs.existsSync(flagFile)) {
      fs.unlinkSync(flagFile);
    }

    // This should probably use the rush-recycler, but these files are intended to be as light as possible
    // for now.
    const nodeModulesFolder: string = path.resolve(packageInstallFolder, NODE_MODULES_FOLDER_NAME);
    if (fs.existsSync(nodeModulesFolder)) {
      fs.unlinkSync(nodeModulesFolder);
    }
  } catch (e) {
  throw new Error(`Error cleaning the package install folder (${packageInstallFolder}): ${e}`);
  }
}

function createPackageJason(packageInstallFolder: string, name: string, version: string): void {
  try {
    const packageJsonContents: IPackageJson = {
      'name': 'ci-rush',
      'version': '0.0.0',
      'dependencies': {
        [name]: version
      },
      'description': 'DON\'T WARN',
      'repository': 'DON\'T WARN',
      'license': 'MIT'
    };

    const packageJsonPath: string = path.join(packageInstallFolder, PACKAGE_JSON_FILENAME);
    fs.writeFileSync(packageJsonPath, JSON.stringify(packageJsonContents, undefined, 2));
  } catch (e) {
    throw new Error(`Unable to create package.json: ${e}`);
  }
}

/**
 * Run "npm install" in the package install folder.
 */
function installPackage(packageInstallFolder: string, name: string, version: string): void {
  try {
    console.log(`Installing ${name}...`);
    const npmPath: string = getNpmPath();
    childProcess.execSync(`"${npmPath}" install`, { cwd: packageInstallFolder });
    console.log(`Successfully installed ${name}@${version}`);
  } catch (e) {
    throw new Error(`Unable to install package: ${e}`);
  }
}

/**
 * Try to resolve the specified binary in an installed package.
 */
function findBinPath(packageInstallFolder: string, name: string, binName: string): string {
  try {
    const packagePath: string = path.resolve(packageInstallFolder, NODE_MODULES_FOLDER_NAME, name);
    const packageJsonPath: string = path.resolve(packagePath, PACKAGE_JSON_FILENAME);
    const packageJson: IPackageJson = require(packageJsonPath);
    if (!packageJson.bin) {
      throw new Error('No binaries are specified for package.');
    } else {
      const binValue: string = packageJson.bin[binName];
      if (!binValue) {
        throw new Error(`Binary ${binName} is not specified in the package's package.json`);
      } else {
        const resolvedBinPath: string = path.resolve(packagePath, binValue);
        if (!fs.existsSync(resolvedBinPath)) {
          throw new Error('The specified binary points to a path that does not exist');
        } else {
          return resolvedBinPath;
        }
      }
    }
  } catch (e) {
    throw new Error(`Unable to find specified binary "${binName}": ${e}`);
  }
}

/**
 * Write a flag file to the package's install directory, signifying that the install was successful.
 */
function writeFlagFile(packageInstallFolder: string): void {
  try {
    const flagFilePath: string = path.join(packageInstallFolder, INSTALLED_FLAG_FILENAME);
    fs.writeFileSync(flagFilePath, process.version);
  } catch (e) {
    // Ignore
  }
}

function run(): void {
  const [ nodePath, scriptPath, rawPackageSpecifier, packageBinName, ...packageBinArgs ]: string[] = process.argv;

  const packageSpecifier: IPackageSpecifier = parsePackageSpecifier(rawPackageSpecifier);
  const name: string = packageSpecifier.name;
  const version: string = resolvePackageVersion(packageSpecifier);

  if (packageSpecifier.version !== version) {
    console.log(`Resolved to ${name}@${version}`);
  }

  const rushJsonFolder: string = findRushJsonFolder();
  const packageInstallFolder: string = ensureAndResolveFolder(
    rushJsonFolder,
    'common',
    'temp',
    'install-run',
    `${name}@${version}`
  );

  if (!isPackageAlreadyInstalled(packageInstallFolder)) {
    // The package isn't already installed
    cleanInstallFolder(packageInstallFolder);
    copyNpmrcIfItExists(rushJsonFolder, packageInstallFolder);
    createPackageJason(packageInstallFolder, name, version);
    installPackage(packageInstallFolder, name, version);
    writeFlagFile(packageInstallFolder);
  }

  const binPath: string = findBinPath(packageInstallFolder, name, packageBinName);
  const result = childProcess.spawnSync(
    nodePath,
    [binPath, ...packageBinArgs],
    {
      stdio: 'inherit',
      cwd: process.cwd(),
      env: process.env
    }
  );

  debugger;
}

run();

// const PACKAGE_NAME: string = '@microsoft/rush';

// let expectedVersion: string = undefined!;
// const rushJsonPath: string = path.join(rushJsonDirectory, RUSH_JSON_FILENAME);
// try {
//   const rushJsonContents: string = fs.readFileSync(rushJsonPath, 'UTF-8');
//   // Use a regular expression to parse out the rushVersion value because rush.json supports comments,
//   // but JSON.parse does not and we don't want to pull in more dependencies than we need to in this script.
//   const rushJsonMatches: string[] = rushJsonContents.match(/\"rushVersion\"\s*\:\s*\"([0-9a-zA-Z.+\-]+)\"/)!;
//   expectedVersion = rushJsonMatches[1];
// } catch (e) {
//   console.error(
//     `Unable to determine the required version of Rush from rush.json (${rushJsonDirectory}). ` +
//     'The \'rushVersion\' field is either not assigned in rush.json or was specified ' +
//     'using an unexpected syntax.'
//   );
//   process.exit(1);
// }

// console.log(os.EOL + `Expected Rush version is ${expectedVersion}`);

// // Check for the Rush version
// let installedVersion: string = undefined!;
// let installedVersionValid: boolean = false;
// try {
//   const spawnResult: childProcess.SpawnSyncReturns<Buffer> = childProcess.spawnSync(
//     _npmPath, ['list', PACKAGE_NAME, 'version'],
//     { cwd: rushPath, stdio: ['pipe', 'pipe', 'pipe'] }
//   );
//   const output: string = spawnResult.output.toString();
//   const matches: string[] | null = /@microsoft\/rush\@([0-9a-zA-Z.+\-]+)/.exec(output);
//   // If NPM finds the wrong version in node_modules, that version will be in matches[1].
//   // But if it's not installed at all, then NPM instead uselessly tells us all about
//   // the version that we DON'T have ('missing:')
//   if (matches && matches.length === 2 && !output.match(/missing\:/g)) {
//     installedVersion = matches[1]!;

//     if (spawnResult.status === 0) {
//       installedVersionValid = true;
//     }
//   }
// } catch (error) {
//   // (this happens if we didn't find the installed package)
// }

// if (installedVersion) {
//   console.log(os.EOL + `Installed version is ${installedVersion}`);
// } else {
//   console.log(os.EOL + 'Rush does not appear to be installed');
// }

// if (!installedVersionValid || installedVersion !== expectedVersion) {

//   }

// }
