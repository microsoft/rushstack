// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { spawn, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

import { _FlagFile } from '@microsoft/rush-lib';
import { EnvironmentConfiguration } from '@microsoft/rush-lib/lib/api/EnvironmentConfiguration';
import {
  DependencySpecifier,
  DependencySpecifierType
} from '@microsoft/rush-lib/lib/logic/DependencySpecifier';
import { Utilities } from '@microsoft/rush-lib/lib/utilities/Utilities';
import { FileSystem, JsonFile, PackageJsonLookup, User } from '@rushstack/node-core-library';
import { DAEMON_PROTOCOL_VERSION } from '@rushstack/rush-daemon-protocol';
import type { IDaemonStartCommand } from '@rushstack/rush-client-core';

import {
  readDaemonInstallationMetadata,
  type IDaemonInstallationMetadata,
  type IInstalledDaemonLauncher
} from './DaemonInstallation';

const DAEMON_PACKAGE: string = '@rushstack/rush-daemon';

export interface IDaemonLauncherContext {
  readonly repoRoot: string;
  readonly rushVersion: string;
  readonly environment: Readonly<NodeJS.ProcessEnv>;
}

export interface IVersionSelectedDaemonLaunch extends IInstalledDaemonLauncher {
  readonly startCommand: IDaemonStartCommand;
}

export class DaemonLauncherUnavailableError extends Error {
  public readonly installation: IInstalledDaemonLauncher | undefined;

  public constructor(rushVersion: string, reason: string, installation?: IInstalledDaemonLauncher) {
    super(`Cannot launch selected Rush ${rushVersion}: ${reason} Use native Rush instead.`);
    this.name = 'DaemonLauncherUnavailableError';
    this.installation = installation;
  }
}

/** Native-style, node-specific cache, resolved against the captured environment without mutating process.env. */
export function getDaemonVersionCacheFolder(environment: Readonly<NodeJS.ProcessEnv>): string {
  const globalFolder: string =
    EnvironmentConfiguration._getRushGlobalFolderOverride(environment) ??
    path.join(User.getHomeFolder(), '.rush');
  const nodeVersion: string = /^[a-z0-9.-]+$/i.test(process.version) ? process.version : 'unknown-version';
  return path.join(globalFolder, `node-${nodeVersion}`, 'rush-daemon-versions');
}

export function assertExactDaemonVersion(version: string): void {
  if (
    !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(version) ||
    new DependencySpecifier(DAEMON_PACKAGE, version).specifierType !== DependencySpecifierType.Version
  ) {
    throw new Error(`Daemon selection requires an exact version, not "${version}".`);
  }
}

export function getSelectedDaemonStartCommand(
  daemonPackageJsonPath: string,
  context: IDaemonLauncherContext
): IDaemonStartCommand {
  return {
    command: process.execPath,
    args: [
      require.resolve('./SelectedDaemonBootstrap'),
      '--launch',
      daemonPackageJsonPath,
      context.rushVersion,
      context.repoRoot
    ],
    cwd: context.repoRoot,
    environment: Object.freeze(
      Object.fromEntries(
        Object.entries(context.environment).filter(
          (entry): entry is [string, string] => entry[1] !== undefined
        )
      )
    )
  };
}

/** Probes in a fresh process so loading a foreign Rush engine cannot alter the caller's SDK/global state. */
export async function inspectDaemonLauncherAsync(
  daemonPackageJsonPath: string,
  context: IDaemonLauncherContext
): Promise<IInstalledDaemonLauncher> {
  const { stdout, stderr, exitCode, signal } = await Utilities.executeCommandAndCaptureOutputAsync({
    command: process.execPath,
    args: [require.resolve('./SelectedDaemonBootstrap'), '--probe', daemonPackageJsonPath],
    workingDirectory: context.repoRoot,
    environment: { ...context.environment },
    keepEnvironment: false,
    captureExitCodeAndSignal: true
  });
  if (exitCode !== 0 || signal) throw new Error(`Daemon version attestation failed: ${stderr}`);
  const installation: IInstalledDaemonLauncher = JSON.parse(stdout);
  if (
    typeof installation.rushVersion !== 'string' ||
    typeof installation.daemonVersion !== 'string' ||
    typeof installation.launcherPath !== 'string' ||
    typeof installation.rushLibEntryPoint !== 'string' ||
    !installation.protocolVersion ||
    !Number.isSafeInteger(installation.protocolVersion.major) ||
    !Number.isSafeInteger(installation.protocolVersion.minor) ||
    typeof installation.daemonPackageJsonPath !== 'string' ||
    typeof installation.canLaunchRequests !== 'boolean'
  ) {
    throw new Error('Daemon version attestation returned an invalid result.');
  }
  return installation;
}

/**
 * Reuses a verified available installation or installs a daemon release that pins the exact requested engine.
 * Unlike RushVersionSelector.ensureRushVersionInstalledAsync(), this never executes a Rush command.
 * Registry selection uses the newest release declaring that exact engine dependency, without overrides.
 * Installation runs the native Rush installer in an isolated process and keeps its mutex outside the
 * directory that the installer replaces. Cached-only selection never queries the registry.
 */
export async function selectDaemonLauncherAsync(
  input: IDaemonLauncherContext,
  options: { readonly allowInstall?: boolean } = {}
): Promise<IVersionSelectedDaemonLaunch> {
  const override: string | undefined = EnvironmentConfiguration._getRushGlobalFolderOverride(
    input.environment
  );
  const context: IDaemonLauncherContext = {
    repoRoot: path.resolve(input.repoRoot),
    rushVersion: input.rushVersion,
    environment: Object.freeze({
      ...input.environment,
      ...(override ? { RUSH_GLOBAL_FOLDER: override } : {})
    })
  };
  assertExactDaemonVersion(context.rushVersion);
  const cacheFolder: string = getDaemonVersionCacheFolder(context.environment);
  const configured: { rushVersion?: unknown } = await JsonFile.loadAsync(
    path.join(context.repoRoot, 'rush.json')
  );
  if ((context.environment.RUSH_PREVIEW_VERSION || configured.rushVersion) !== context.rushVersion) {
    throw new DaemonLauncherUnavailableError(
      context.rushVersion,
      'The requested version does not match rush.json or its RUSH_PREVIEW_VERSION override.'
    );
  }
  const bundledPackage: string | undefined =
    PackageJsonLookup.instance.tryGetPackageJsonFilePathFor(__dirname);
  if (!bundledPackage) throw new Error('Cannot locate the bundled daemon package.');
  if (readDaemonInstallationMetadata(bundledPackage).rushVersion === context.rushVersion) {
    return createLaunch(await inspectDaemonLauncherAsync(bundledPackage, context), context);
  }
  let incompatible: IInstalledDaemonLauncher | undefined;
  if (await FileSystem.existsAsync(cacheFolder)) {
    for (const entry of await fs.readdir(cacheFolder, { withFileTypes: true })) {
      if (!entry.isDirectory() || !entry.name.startsWith('daemon-')) continue;
      const version: string = entry.name.slice('daemon-'.length);
      assertExactDaemonVersion(version);
      const folder: string = path.join(cacheFolder, entry.name);
      const marker: _FlagFile = new _FlagFile(folder, 'last-install', {
        node: process.versions.node,
        daemonVersion: version
      });
      if (!(await marker.isValidAsync())) continue;
      const packagePath: string = path.join(
        folder,
        'node_modules',
        '@rushstack',
        'rush-daemon',
        'package.json'
      );
      const metadata: IDaemonInstallationMetadata = readDaemonInstallationMetadata(packagePath);
      if (metadata.daemonVersion !== version)
        throw new Error(`Daemon cache version does not match ${folder}.`);
      if (metadata.rushVersion !== context.rushVersion) continue;
      const installed: IInstalledDaemonLauncher = await inspectDaemonLauncherAsync(packagePath, context);
      if (supportsClient(installed)) return createLaunch(installed, context);
      incompatible = installed;
    }
  }
  if (options.allowInstall === false) {
    if (incompatible) return createLaunch(incompatible, context);
    throw new DaemonLauncherUnavailableError(
      context.rushVersion,
      'No matching installed daemon launcher is available.'
    );
  }
  const versions: unknown = await npmViewAsync(DAEMON_PACKAGE, 'versions', context);
  const candidates: unknown[] = Array.isArray(versions) ? versions : [versions];
  // npm view returns its versions field in semver order; no second version parser is needed here.
  for (const candidate of candidates.reverse()) {
    if (typeof candidate !== 'string') throw new Error('npm returned an invalid daemon version list.');
    assertExactDaemonVersion(candidate);
    const metadata: unknown = await npmViewAsync(`${DAEMON_PACKAGE}@${candidate}`, undefined, context);
    if (!isRecord(metadata) || metadata.name !== DAEMON_PACKAGE || metadata.version !== candidate) {
      throw new Error(`npm returned invalid metadata for ${DAEMON_PACKAGE}@${candidate}.`);
    }
    if (
      !isRecord(metadata.dependencies) ||
      metadata.dependencies['@microsoft/rush-lib'] !== context.rushVersion ||
      !isRecord(metadata.bin) ||
      typeof metadata.bin.rushd !== 'string'
    )
      continue;
    const child: ChildProcess = spawn(
      process.execPath,
      [require.resolve('./SelectedDaemonInstaller'), cacheFolder, candidate, context.repoRoot],
      {
        cwd: context.repoRoot,
        env: { ...context.environment },
        stdio: ['ignore', 2, 2]
      }
    );
    const [exitCode, signal] = await once(child, 'exit');
    if (exitCode !== 0 || signal) {
      throw new Error(`Installing ${DAEMON_PACKAGE}@${candidate} failed (${signal ?? exitCode}).`);
    }
    const packagePath: string = path.join(
      cacheFolder,
      `daemon-${candidate}`,
      'node_modules',
      '@rushstack',
      'rush-daemon',
      'package.json'
    );
    const installed: IInstalledDaemonLauncher = await inspectDaemonLauncherAsync(packagePath, context);
    if (installed.daemonVersion !== candidate)
      throw new Error(`Installed daemon does not match requested ${candidate}.`);
    return createLaunch(installed, context);
  }
  throw new DaemonLauncherUnavailableError(
    context.rushVersion,
    'No published daemon release pins that exact Rush engine.'
  );
}

function supportsClient(installation: IInstalledDaemonLauncher): boolean {
  return (
    installation.protocolVersion.major === DAEMON_PROTOCOL_VERSION.major &&
    installation.protocolVersion.minor >= DAEMON_PROTOCOL_VERSION.minor &&
    installation.canLaunchRequests
  );
}

function createLaunch(
  installation: IInstalledDaemonLauncher,
  context: IDaemonLauncherContext
): IVersionSelectedDaemonLaunch {
  if (installation.rushVersion !== context.rushVersion) {
    throw new Error(
      `Daemon installation resolved Rush ${installation.rushVersion}, not requested ${context.rushVersion}.`
    );
  }
  if (!supportsClient(installation)) {
    throw new DaemonLauncherUnavailableError(
      context.rushVersion,
      `Daemon ${installation.daemonVersion} attests protocol ${installation.protocolVersion.major}.${installation.protocolVersion.minor}; this client requires ${DAEMON_PROTOCOL_VERSION.major}.${DAEMON_PROTOCOL_VERSION.minor} and default request-launch APIs.`,
      installation
    );
  }
  return {
    ...installation,
    startCommand: getSelectedDaemonStartCommand(installation.daemonPackageJsonPath, context)
  };
}

async function npmViewAsync(
  specifier: string,
  field: string | undefined,
  context: IDaemonLauncherContext
): Promise<unknown> {
  const configFolder: string = path.join(context.repoRoot, 'common', 'config', 'rush');
  const { stdout, stderr, exitCode, signal } = await Utilities.executeCommandAndCaptureOutputAsync({
    command: 'npm',
    args: [
      'view',
      specifier,
      ...(field ? [field] : []),
      '--json',
      '--fetch-retries=0',
      '--fetch-timeout=30000',
      '--no-update-notifier'
    ],
    workingDirectory: (await FileSystem.existsAsync(configFolder)) ? configFolder : context.repoRoot,
    environment: { ...context.environment },
    keepEnvironment: false,
    captureExitCodeAndSignal: true
  });
  if (exitCode !== 0 || signal) {
    throw new DaemonLauncherUnavailableError(
      context.rushVersion,
      `Registry lookup for ${specifier} failed: ${stderr}`
    );
  }
  return JSON.parse(stdout);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
