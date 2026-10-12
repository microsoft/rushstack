// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/* eslint-disable no-console */

import * as childProcess from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { StringDecoder } from 'node:string_decoder';

import type { IPackageJson } from '@rushstack/node-core-library';

import { syncNpmrc, type ILogger } from '../utilities/npmrcUtilities';
import { escapeArgumentIfNeeded, IS_WINDOWS } from '../utilities/executionUtilities';
import type { RushConstants } from '../logic/RushConstants';

export const RUSH_JSON_FILENAME: typeof RushConstants.rushJsonFilename = 'rush.json';
const RUSH_TEMP_FOLDER_ENV_VARIABLE_NAME: string = 'RUSH_TEMP_FOLDER';
const INSTALL_RUN_LOCKFILE_PATH_VARIABLE: 'INSTALL_RUN_LOCKFILE_PATH' = 'INSTALL_RUN_LOCKFILE_PATH';
const INSTALLED_FLAG_FILENAME: string = 'installed.flag';
const NODE_MODULES_FOLDER_NAME: string = 'node_modules';
const PACKAGE_JSON_FILENAME: string = 'package.json';
let _externalOutputCaptureId: number = 0;
export const NPM_OUTPUT_CAPTURE_SCRIPT: string = `
const childProcess = require('node:child_process');
const fs = require('node:fs');
const { StringDecoder } = require('node:string_decoder');
const [
  command,
  argsJson,
  capturePath,
  useShell,
  maxBytesText,
  renderStdoutText,
  renderStderrText
] = process.argv.slice(1);
const child = childProcess.spawn(command, JSON.parse(argsJson), {
  cwd: process.cwd(),
  env: process.env,
  shell: useShell === '1',
  windowsVerbatimArguments: false,
  stdio: ['inherit', 'pipe', 'pipe']
});
const decoders = { stdout: new StringDecoder('utf8'), stderr: new StringDecoder('utf8') };
const maxBytes = Number(maxBytesText);
let capturedBytes = 0;
let overflowed = false;
const renderedStreams = { stdout: renderStdoutText === '1', stderr: renderStderrText === '1' };
function capture(stream, text) {
  if (!text || overflowed) {
    return;
  }
  const record = JSON.stringify({ stream, text, wasRendered: renderedStreams[stream] }) + '\\n';
  const recordBytes = Buffer.byteLength(record);
  if (capturedBytes + recordBytes <= maxBytes) {
    fs.appendFileSync(capturePath, record);
    capturedBytes += recordBytes;
  } else {
    overflowed = true;
    fs.appendFileSync(capturePath, JSON.stringify({ overflow: true }) + '\\n');
  }
}
function forwardAndCapture(stream, chunk) {
  if (renderedStreams[stream]) {
    (stream === 'stdout' ? process.stdout : process.stderr).write(chunk);
  }
  capture(stream, decoders[stream].write(chunk));
}
child.stdout.on('data', (chunk) => forwardAndCapture('stdout', chunk));
child.stderr.on('data', (chunk) => forwardAndCapture('stderr', chunk));
child.on('error', (error) => {
  process.stderr.write(String(error) + '\\n');
  process.exitCode = 1;
});
child.on('close', (code, signal) => {
  capture('stdout', decoders.stdout.end());
  capture('stderr', decoders.stderr.end());
  if (signal) {
    process.stderr.write('npm was terminated by signal: ' + signal + '\\n');
    process.exitCode = 1;
  } else {
    process.exitCode = code === null ? 1 : code;
  }
});
`;

export interface IInstallAndRunOptions {
  readonly onExternalOutput?: (stream: 'stdout' | 'stderr', text: string, wasRendered: boolean) => void;
  readonly onExternalOutputOverflow?: () => void;
  readonly externalOutputCaptureMaxBytes?: number;
  readonly externalOutputLiveStreams?: Readonly<{ stdout: boolean; stderr: boolean }>;
  readonly prepareToRun?: () => void;
}

/**
 * Parse a package specifier (in the form of name\@version) into name and version parts.
 */
function _parsePackageSpecifier(rawPackageSpecifier: string): IPackageSpecifier {
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

let _npmPath: string | undefined = undefined;

/**
 * Get the absolute path to the npm executable
 */
export function getNpmPath(): string {
  if (!_npmPath) {
    try {
      if (IS_WINDOWS) {
        // We're on Windows
        const whereOutput: string = childProcess.execSync('where npm', { stdio: [] }).toString();
        const lines: string[] = whereOutput.split(os.EOL).filter((line) => !!line);

        // take the last result, we are looking for a .cmd command
        // see https://github.com/microsoft/rushstack/issues/759
        _npmPath = lines[lines.length - 1];
      } else {
        // We aren't on Windows - assume we're on *NIX or Darwin
        _npmPath = childProcess.execSync('command -v npm', { stdio: [] }).toString();
      }
    } catch (e) {
      throw new Error(`Unable to determine the path to the NPM tool: ${e}`);
    }

    _npmPath = _npmPath.trim();
    if (!fs.existsSync(_npmPath)) {
      throw new Error('The NPM executable does not exist');
    }
  }

  return _npmPath;
}

function _ensureFolder(folderPath: string): void {
  if (!fs.existsSync(folderPath)) {
    const parentDir: string = path.dirname(folderPath);
    _ensureFolder(parentDir);
    fs.mkdirSync(folderPath);
  }
}

/**
 * Create missing directories under the specified base directory, and return the resolved directory.
 *
 * Does not support "." or ".." path segments.
 * Assumes the baseFolder exists.
 */
function _ensureAndJoinPath(baseFolder: string, ...pathSegments: string[]): string {
  let joinedPath: string = baseFolder;
  try {
    for (let pathSegment of pathSegments) {
      pathSegment = pathSegment.replace(/[\\\/]/g, '+');
      joinedPath = path.join(joinedPath, pathSegment);
      if (!fs.existsSync(joinedPath)) {
        fs.mkdirSync(joinedPath);
      }
    }
  } catch (e) {
    throw new Error(
      `Error building local installation folder (${path.join(baseFolder, ...pathSegments)}): ${e}`
    );
  }

  return joinedPath;
}

function _getRushTempFolder(rushCommonFolder: string): string {
  const rushTempFolder: string | undefined = process.env[RUSH_TEMP_FOLDER_ENV_VARIABLE_NAME];
  if (rushTempFolder !== undefined) {
    _ensureFolder(rushTempFolder);
    return rushTempFolder;
  } else {
    return _ensureAndJoinPath(rushCommonFolder, 'temp');
  }
}

export interface IPackageSpecifier {
  name: string;
  version: string | undefined;
}

/**
 * Compare version strings according to semantic versioning.
 * Returns a positive integer if "a" is a later version than "b",
 * a negative integer if "b" is later than "a",
 * and 0 otherwise.
 */
function _compareVersionStrings(a: string, b: string): number {
  const aParts: string[] = a.split(/[.-]/);
  const bParts: string[] = b.split(/[.-]/);
  const numberOfParts: number = Math.max(aParts.length, bParts.length);
  for (let i: number = 0; i < numberOfParts; i++) {
    if (aParts[i] !== bParts[i]) {
      return (Number(aParts[i]) || 0) - (Number(bParts[i]) || 0);
    }
  }
  return 0;
}

/**
 * Resolve a package specifier to a static version
 */
function _resolvePackageVersion(
  logger: ILogger,
  rushCommonFolder: string,
  { name, version }: IPackageSpecifier
): string {
  if (!version) {
    version = '*'; // If no version is specified, use the latest version
  }

  if (version.match(/^[a-zA-Z0-9\-\+\.]+$/)) {
    // If the version contains only characters that we recognize to be used in static version specifiers,
    // pass the version through
    return version;
  } else {
    // version resolves to
    try {
      const rushTempFolder: string = _getRushTempFolder(rushCommonFolder);
      const sourceNpmrcFolder: string = path.join(rushCommonFolder, 'config', 'rush');

      syncNpmrc({
        sourceNpmrcFolder,
        targetNpmrcFolder: rushTempFolder,
        logger,
        supportEnvVarFallbackSyntax: false,
        // Always filter npm-incompatible properties in install-run scripts.
        // Any warnings will be shown when running Rush commands directly.
        filterNpmIncompatibleProperties: true
      });

      // This returns something that looks like:
      // ```
      // [
      //   "3.0.0",
      //   "3.0.1",
      //   ...
      //   "3.0.20"
      // ]
      // ```
      //
      // if multiple versions match the selector, or
      //
      // ```
      // "3.0.0"
      // ```
      //
      // if only a single version matches.

      const npmVersionSpawnResult: childProcess.SpawnSyncReturns<Buffer | string> = _runNpmConfirmSuccess(
        ['view', `${name}@${version}`, 'version', '--no-update-notifier', '--json'],
        {
          cwd: rushTempFolder,
          stdio: [],
          env: process.env
        },
        'npm view'
      );

      const npmViewVersionOutput: string = npmVersionSpawnResult.stdout.toString();
      const parsedVersionOutput: string | string[] = JSON.parse(npmViewVersionOutput);
      const versions: string[] = Array.isArray(parsedVersionOutput)
        ? parsedVersionOutput
        : [parsedVersionOutput];
      let latestVersion: string | undefined = versions[0];
      for (let i: number = 1; i < versions.length; i++) {
        const latestVersionCandidate: string = versions[i];
        if (_compareVersionStrings(latestVersionCandidate, latestVersion) > 0) {
          latestVersion = latestVersionCandidate;
        }
      }

      if (!latestVersion) {
        throw new Error('No versions found for the specified version range.');
      }

      return latestVersion;
    } catch (e) {
      throw new Error(`Unable to resolve version ${version} of package ${name}: ${e}`);
    }
  }
}

let _rushJsonFolder: string | undefined;
/**
 * Find the absolute path to the folder containing rush.json
 */
export function findRushJsonFolder(): string {
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
    } while (basePath !== (tempPath = path.dirname(basePath))); // Exit the loop when we hit the disk root

    if (!_rushJsonFolder) {
      throw new Error(`Unable to find ${RUSH_JSON_FILENAME}.`);
    }
  }

  return _rushJsonFolder;
}

/**
 * Detects if the package in the specified directory is installed
 */
function _isPackageAlreadyInstalled(packageInstallFolder: string): boolean {
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
 * Delete a file. Fail silently if it does not exist.
 */
function _deleteFile(file: string): void {
  try {
    fs.unlinkSync(file);
  } catch (err) {
    if (err.code !== 'ENOENT' && err.code !== 'ENOTDIR') {
      throw err;
    }
  }
}

/**
 * Removes the following files and directories under the specified folder path:
 *  - installed.flag
 *  -
 *  - node_modules
 */
function _cleanInstallFolder(
  rushTempFolder: string,
  packageInstallFolder: string,
  lockFilePath: string | undefined
): void {
  try {
    const flagFile: string = path.resolve(packageInstallFolder, INSTALLED_FLAG_FILENAME);
    _deleteFile(flagFile);

    const packageLockFile: string = path.resolve(packageInstallFolder, 'package-lock.json');
    if (lockFilePath) {
      fs.copyFileSync(lockFilePath, packageLockFile);
    } else {
      // Not running `npm ci`, so need to cleanup
      _deleteFile(packageLockFile);

      const nodeModulesFolder: string = path.resolve(packageInstallFolder, NODE_MODULES_FOLDER_NAME);
      if (fs.existsSync(nodeModulesFolder)) {
        const rushRecyclerFolder: string = _ensureAndJoinPath(rushTempFolder, 'rush-recycler');

        fs.renameSync(
          nodeModulesFolder,
          path.join(rushRecyclerFolder, `install-run-${Date.now().toString()}`)
        );
      }
    }
  } catch (e) {
    throw new Error(`Error cleaning the package install folder (${packageInstallFolder}): ${e}`);
  }
}

function _createPackageJson(packageInstallFolder: string, name: string, version: string): void {
  try {
    const packageJsonContents: IPackageJson = {
      name: 'ci-rush',
      version: '0.0.0',
      dependencies: {
        [name]: version
      },
      description: "DON'T WARN",
      repository: "DON'T WARN",
      license: 'MIT'
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
function _installPackage(
  logger: ILogger,
  packageInstallFolder: string,
  name: string,
  version: string,
  npmCommand: 'install' | 'ci',
  onExternalOutput: ((stream: 'stdout' | 'stderr', text: string, wasRendered: boolean) => void) | undefined,
  onExternalOutputOverflow: (() => void) | undefined,
  externalOutputCaptureMaxBytes: number | undefined,
  externalOutputLiveStreams: Readonly<{ stdout: boolean; stderr: boolean }> | undefined
): void {
  let capturePath: string | undefined;
  try {
    logger.info(`Installing ${name}...`);
    if (onExternalOutput) {
      capturePath = path.join(
        packageInstallFolder,
        `.install-run-output-${process.pid}-${_externalOutputCaptureId++}.log`
      );
      fs.closeSync(fs.openSync(capturePath, 'wx', 0o600));
    }
    if (capturePath) {
      _runNpmWithCaptureConfirmSuccess(
        [npmCommand],
        {
          stdio: 'inherit',
          cwd: packageInstallFolder,
          env: process.env
        },
        capturePath,
        externalOutputCaptureMaxBytes ?? 1024 * 1024,
        externalOutputLiveStreams ?? { stdout: true, stderr: true },
        `npm ${npmCommand}`
      );
    } else {
      _runNpmConfirmSuccess(
        [npmCommand],
        {
          stdio: 'inherit',
          cwd: packageInstallFolder,
          env: process.env
        },
        `npm ${npmCommand}`
      );
    }
  } catch (e) {
    throw new Error(`Unable to install package: ${e}`);
  } finally {
    if (capturePath !== undefined) {
      finalizeCapturedNpmOutput(capturePath, logger, onExternalOutput!, onExternalOutputOverflow);
    }
  }
  logger.info(`Successfully installed ${name}@${version}`);
}

function _reportCaptureDamage(logger: ILogger, capturePath: string, detail: string): void {
  const message: string = `Warning: npm output capture ${JSON.stringify(capturePath)} ${detail}`;
  try {
    if (logger.warning) {
      logger.warning(message, 'local-sensitive');
    } else {
      logger.error(message, 'local-sensitive');
    }
  } catch {
    try {
      process.stderr.write(`${message}\n`);
    } catch {
      // Capture diagnostics are best-effort and must not change the install result.
    }
  }
}

export function finalizeCapturedNpmOutput(
  capturePath: string,
  logger: ILogger,
  onExternalOutput: (stream: 'stdout' | 'stderr', text: string, wasRendered: boolean) => void,
  onExternalOutputOverflow: (() => void) | undefined
): void {
  let firstDamageDetail: string | undefined;
  let damageCount: number = 0;
  try {
    _readCapturedNpmOutput(capturePath, onExternalOutput, onExternalOutputOverflow, (detail: string) => {
      firstDamageDetail ??= detail;
      damageCount++;
    });
  } catch (error) {
    firstDamageDetail ??= `could not be read: ${String(error)}.`;
    damageCount++;
  }
  if (firstDamageDetail) {
    const additionalDamage: string =
      damageCount > 1 ? ` ${damageCount - 1} additional capture issue(s) were discarded.` : '';
    _reportCaptureDamage(logger, capturePath, `${firstDamageDetail}${additionalDamage}`);
  }

  try {
    _deleteFile(capturePath);
  } catch (error) {
    _reportCaptureDamage(logger, capturePath, `could not be deleted: ${String(error)}.`);
  }
}

function _readCapturedNpmOutput(
  capturePath: string,
  onExternalOutput: (stream: 'stdout' | 'stderr', text: string, wasRendered: boolean) => void,
  onExternalOutputOverflow: (() => void) | undefined,
  onCaptureDamage: (detail: string) => void
): void {
  const fileDescriptor: number = fs.openSync(capturePath, 'r');
  const buffer: Buffer = Buffer.allocUnsafe(64 * 1024);
  const decoder: StringDecoder = new StringDecoder('utf8');
  let pending: string = '';
  try {
    for (;;) {
      const bytesRead: number = fs.readSync(fileDescriptor, buffer, 0, buffer.length, null);
      if (bytesRead === 0) {
        break;
      }
      pending += decoder.write(buffer.subarray(0, bytesRead));
      let newlineIndex: number;
      while ((newlineIndex = pending.indexOf('\n')) >= 0) {
        const line: string = pending.slice(0, newlineIndex);
        pending = pending.slice(newlineIndex + 1);
        if (line) {
          let record: {
            stream?: unknown;
            text?: unknown;
            wasRendered?: unknown;
            overflow?: unknown;
          };
          try {
            record = JSON.parse(line);
          } catch (error) {
            onCaptureDamage(`contains a corrupt record that was discarded: ${String(error)}.`);
            continue;
          }
          if (record.overflow === true) {
            onExternalOutputOverflow?.();
          } else if (
            (record.stream === 'stdout' || record.stream === 'stderr') &&
            typeof record.text === 'string'
          ) {
            onExternalOutput(record.stream, record.text, record.wasRendered === true);
          } else {
            onCaptureDamage('contains an invalid record that was discarded.');
          }
        }
      }
    }
    pending += decoder.end();
    if (pending.trim()) {
      onCaptureDamage('ended with a partial record that was discarded.');
    }
  } finally {
    fs.closeSync(fileDescriptor);
  }
}

/**
 * Get the ".bin" path for the package.
 */
function _getBinPath(packageInstallFolder: string, binName: string): string {
  const binFolderPath: string = path.resolve(packageInstallFolder, NODE_MODULES_FOLDER_NAME, '.bin');
  const resolvedBinName: string = IS_WINDOWS ? `${binName}.cmd` : binName;
  return path.resolve(binFolderPath, resolvedBinName);
}

function _buildShellCommand(command: string, args: string[]): string {
  const escapedCommand: string = escapeArgumentIfNeeded(command);
  const escapedArgs: string[] = args.map((arg) => escapeArgumentIfNeeded(arg));
  return [escapedCommand, ...escapedArgs].join(' ');
}

/**
 * Write a flag file to the package's install directory, signifying that the install was successful.
 */
function _writeFlagFile(packageInstallFolder: string): void {
  try {
    const flagFilePath: string = path.join(packageInstallFolder, INSTALLED_FLAG_FILENAME);
    fs.writeFileSync(flagFilePath, process.version);
  } catch (e) {
    throw new Error(`Unable to create installed.flag file in ${packageInstallFolder}`);
  }
}

/**
 * Run npm under the platform's shell and throw if it didn't succeed.
 */
function _runNpmConfirmSuccess(
  args: string[],
  options: childProcess.SpawnSyncOptions,
  commandNameForLogging: string
): childProcess.SpawnSyncReturns<string | Buffer> {
  const command: string = getNpmPath();
  let result: childProcess.SpawnSyncReturns<string | Buffer>;
  if (IS_WINDOWS) {
    result = childProcess.spawnSync(_buildShellCommand(command, args), {
      ...options,
      shell: true,
      windowsVerbatimArguments: false
    });
  } else {
    result = childProcess.spawnSync(command, args, options);
  }
  _throwIfSpawnFailed(result, commandNameForLogging);
  return result;
}

function _runNpmWithCaptureConfirmSuccess(
  args: string[],
  options: childProcess.SpawnSyncOptions,
  capturePath: string,
  captureMaxBytes: number,
  liveStreams: Readonly<{ stdout: boolean; stderr: boolean }>,
  commandNameForLogging: string
): childProcess.SpawnSyncReturns<string | Buffer> {
  const npmPath: string = getNpmPath();
  const command: string = IS_WINDOWS ? _buildShellCommand(npmPath, args) : npmPath;
  const commandArgs: string[] = IS_WINDOWS ? [] : args;
  const result: childProcess.SpawnSyncReturns<string | Buffer> = childProcess.spawnSync(
    process.execPath,
    [
      '-e',
      NPM_OUTPUT_CAPTURE_SCRIPT,
      command,
      JSON.stringify(commandArgs),
      capturePath,
      IS_WINDOWS ? '1' : '0',
      String(captureMaxBytes),
      liveStreams.stdout ? '1' : '0',
      liveStreams.stderr ? '1' : '0'
    ],
    options
  );
  _throwIfSpawnFailed(result, commandNameForLogging);
  return result;
}

function _throwIfSpawnFailed(
  result: childProcess.SpawnSyncReturns<string | Buffer>,
  commandNameForLogging: string
): void {
  if (result.status !== 0) {
    if (!result.status) {
      // Is status null or undefined?
      if (result.error) {
        throw new Error(`"${commandNameForLogging}" failed: ${result.error.message.toString()}`);
      } else if (result.signal) {
        throw new Error(`"${commandNameForLogging}" was terminated by signal: ${result.signal}`);
      } else {
        throw new Error(`"${commandNameForLogging}" failed for an unknown reason`);
      }
    } else {
      throw new Error(`"${commandNameForLogging}" returned error code ${result.status}`);
    }
  }
}

export function installAndRun(
  logger: ILogger,
  packageName: string,
  packageVersion: string,
  packageBinName: string,
  packageBinArgs: string[],
  lockFilePath: string | undefined = process.env[INSTALL_RUN_LOCKFILE_PATH_VARIABLE],
  options: IInstallAndRunOptions = {}
): number {
  const rushJsonFolder: string = findRushJsonFolder();
  const rushCommonFolder: string = path.join(rushJsonFolder, 'common');
  const rushTempFolder: string = _getRushTempFolder(rushCommonFolder);
  const packageInstallFolder: string = _ensureAndJoinPath(
    rushTempFolder,
    'install-run',
    `${packageName}@${packageVersion}`
  );

  if (!_isPackageAlreadyInstalled(packageInstallFolder)) {
    // The package isn't already installed
    _cleanInstallFolder(rushTempFolder, packageInstallFolder, lockFilePath);

    const sourceNpmrcFolder: string = path.join(rushCommonFolder, 'config', 'rush');
    syncNpmrc({
      sourceNpmrcFolder,
      targetNpmrcFolder: packageInstallFolder,
      logger,
      supportEnvVarFallbackSyntax: false,
      // Always filter npm-incompatible properties in install-run scripts.
      // Any warnings will be shown when running Rush commands directly.
      filterNpmIncompatibleProperties: true
    });

    _createPackageJson(packageInstallFolder, packageName, packageVersion);
    const installCommand: 'install' | 'ci' = lockFilePath ? 'ci' : 'install';
    _installPackage(
      logger,
      packageInstallFolder,
      packageName,
      packageVersion,
      installCommand,
      options.onExternalOutput,
      options.onExternalOutputOverflow,
      options.externalOutputCaptureMaxBytes,
      options.externalOutputLiveStreams
    );
    _writeFlagFile(packageInstallFolder);
  }

  const invocation: string = options.onExternalOutput
    ? packageBinName
    : `${packageBinName} ${packageBinArgs.join(' ')}`;
  const statusMessage: string = `Invoking "${invocation}"`;
  const statusMessageLine: string = new Array(statusMessage.length + 1).join('-');
  logger.info('\n' + statusMessage + '\n' + statusMessageLine + '\n');
  options.prepareToRun?.();

  const binPath: string = _getBinPath(packageInstallFolder, packageBinName);
  const binFolderPath: string = path.resolve(packageInstallFolder, NODE_MODULES_FOLDER_NAME, '.bin');

  // Windows environment variables are case-insensitive.  Instead of using SpawnSyncOptions.env, we need to
  // assign via the process.env proxy to ensure that we append to the right PATH key.
  const originalEnvPath: string = process.env.PATH || '';
  let result: childProcess.SpawnSyncReturns<string | Buffer>;
  try {
    process.env.PATH = [binFolderPath, originalEnvPath].join(path.delimiter);

    const spawnOptions: childProcess.SpawnSyncOptions = {
      stdio: 'inherit',
      cwd: process.cwd(),
      env: process.env
    };
    if (IS_WINDOWS) {
      result = childProcess.spawnSync(_buildShellCommand(binPath, packageBinArgs), {
        ...spawnOptions,
        windowsVerbatimArguments: false,
        // `npm` bin stubs on Windows are `.cmd` files
        // Node.js will not directly invoke a `.cmd` file unless `shell` is set to `true`
        shell: true
      });
    } else {
      result = childProcess.spawnSync(binPath, packageBinArgs, spawnOptions);
    }
  } finally {
    process.env.PATH = originalEnvPath;
  }

  if (result.status !== null) {
    return result.status;
  } else {
    throw result.error || new Error('An unknown error occurred.');
  }
}

export function runWithErrorAndStatusCode(logger: ILogger, fn: () => number): void {
  process.exitCode = 1;

  try {
    const exitCode: number = fn();
    process.exitCode = exitCode;
  } catch (e) {
    logger.error('\n\n' + (e as Error).toString() + '\n\n');
  }
}

function _run(): void {
  const [
    nodePath /* Ex: /bin/node */,
    scriptPath /* /repo/common/scripts/install-run-rush.js */,
    rawPackageSpecifier /* qrcode@^1.2.0 */,
    packageBinName /* qrcode */,
    ...packageBinArgs /* [-f, myproject/lib] */
  ]: string[] = process.argv;

  if (!nodePath) {
    throw new Error('Could not detect node path');
  }

  const scriptFileName: string = path.basename(scriptPath).toLowerCase();
  if (scriptFileName !== 'install-run.js' && scriptFileName !== 'install-run') {
    // If install-run.js wasn't directly invoked, don't execute the rest of this function. Return control
    // to the script that (presumably) imported this file

    return;
  }

  if (process.argv.length < 4) {
    console.log('Usage: install-run.js <package>@<version> <command> [args...]');
    console.log('Example: install-run.js qrcode@1.2.2 qrcode https://rushjs.io');
    process.exit(1);
  }

  const logger: ILogger = {
    info: (text: string) => console.log(text),
    error: (text: string) => console.error(text)
  };

  runWithErrorAndStatusCode(logger, () => {
    const rushJsonFolder: string = findRushJsonFolder();
    const rushCommonFolder: string = _ensureAndJoinPath(rushJsonFolder, 'common');

    const packageSpecifier: IPackageSpecifier = _parsePackageSpecifier(rawPackageSpecifier);
    const name: string = packageSpecifier.name;
    const version: string = _resolvePackageVersion(logger, rushCommonFolder, packageSpecifier);

    if (packageSpecifier.version !== version) {
      console.log(`Resolved to ${name}@${version}`);
    }

    return installAndRun(logger, name, version, packageBinName, packageBinArgs);
  });
}

_run();
