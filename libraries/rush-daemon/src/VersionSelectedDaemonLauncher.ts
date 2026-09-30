// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { spawn, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import type { BigIntStats } from 'node:fs';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

import { _FlagFile, EnvironmentVariableNames, getWorkspaceHostEnvironment } from '@microsoft/rush-lib';
import { EnvironmentConfiguration } from '@microsoft/rush-lib/lib/api/EnvironmentConfiguration';
import {
  DependencySpecifier,
  DependencySpecifierType
} from '@microsoft/rush-lib/lib/logic/DependencySpecifier';
import { Utilities } from '@microsoft/rush-lib/lib/utilities/Utilities';
import {
  Executable,
  FileSystem,
  JsonFile,
  PackageJsonLookup,
  SubprocessTerminator,
  User,
  type IWaitForExitResult
} from '@rushstack/node-core-library';
import { DAEMON_PROTOCOL_VERSION } from '@rushstack/rush-daemon-protocol';
import type { IDaemonStartCommand } from '@rushstack/rush-client-core';

import {
  readDaemonInstallationMetadata,
  type IDaemonInstallationMetadata,
  type IInstalledDaemonLauncher
} from './DaemonInstallation';

const DAEMON_PACKAGE: string = '@rushstack/rush-daemon';

/** How long a registry answer that leaves no usable launcher for an engine stands before the registry is asked again. */
const UNAVAILABLE_VERDICT_TTL_MS: number = 24 * 60 * 60 * 1000;
/** How long a failed or unfinished registry lookup stands, so an unreachable registry costs one deadline per period. */
const REGISTRY_FAILURE_VERDICT_TTL_MS: number = 60 * 60 * 1000;
/** npm's --fetch-timeout does not cover the TCP connect: against a black-holed registry, `npm view` took 133 s. */
const DEFAULT_REGISTRY_TIMEOUT_MS: number = 30 * 1000;
const VERDICT_SCHEMA_VERSION: number = 1;

export interface IDaemonLauncherContext {
  readonly repoRoot: string;
  readonly rushVersion: string;
  readonly environment: Readonly<NodeJS.ProcessEnv>;
}

export interface IVersionSelectedDaemonLaunch extends IInstalledDaemonLauncher {
  readonly startCommand: IDaemonStartCommand;
}

export interface ISelectDaemonLauncherOptions {
  /** When false, selects only among cached installations and never queries the registry. */
  readonly allowInstall?: boolean;
  /** Stops a registry lookup that has not finished after this many milliseconds. */
  readonly registryTimeoutMs?: number;
}

export class DaemonLauncherUnavailableError extends Error {
  public readonly installation: IInstalledDaemonLauncher | undefined;
  /** Why no launcher is available: the message without its fixed prefix and suffix. */
  public readonly reason: string;

  public constructor(rushVersion: string, reason: string, installation?: IInstalledDaemonLauncher) {
    super(`Cannot launch selected Rush ${rushVersion}: ${reason} Use native Rush instead.`);
    this.name = 'DaemonLauncherUnavailableError';
    this.reason = reason;
    this.installation = installation;
  }
}

/** A registry lookup that failed or did not finish, as opposed to an answer from the registry. */
class RegistryLookupError extends DaemonLauncherUnavailableError {}

interface IIncompatibleInstallationRecord {
  readonly folderName: string;
  /** Changes whenever the installer writes the installation's last-install marker. */
  readonly markerIdentity: string;
  readonly installation: IInstalledDaemonLauncher;
}

/** Why the last selection for an engine found no usable launcher, and what it saw in the cache. */
interface IUnavailableVerdict {
  readonly schemaVersion: number;
  readonly rushVersion: string;
  readonly client: string;
  readonly checkedAt: string;
  readonly expiresAt: string;
  readonly reason: string;
  readonly installation?: IInstalledDaemonLauncher;
  readonly incompatibleInstallations: ReadonlyArray<IIncompatibleInstallationRecord>;
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
    // The daemon outlives the client that starts it, so it keeps none of that client's request-scoped values.
    environment: Object.freeze(getWorkspaceHostEnvironment(context.environment))
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
  const installation: unknown = JSON.parse(stdout);
  if (!isInstalledDaemonLauncher(installation)) {
    throw new Error('Daemon version attestation returned an invalid result.');
  }
  return installation;
}

function isInstalledDaemonLauncher(installation: unknown): installation is IInstalledDaemonLauncher {
  return (
    isRecord(installation) &&
    typeof installation.rushVersion === 'string' &&
    typeof installation.daemonVersion === 'string' &&
    typeof installation.launcherPath === 'string' &&
    typeof installation.rushLibEntryPoint === 'string' &&
    isRecord(installation.protocolVersion) &&
    Number.isSafeInteger(installation.protocolVersion.major) &&
    Number.isSafeInteger(installation.protocolVersion.minor) &&
    typeof installation.daemonPackageJsonPath === 'string' &&
    typeof installation.canLaunchRequests === 'boolean'
  );
}

/**
 * Reuses a verified available installation or installs a daemon release that pins the exact requested engine.
 * Unlike RushVersionSelector.ensureRushVersionInstalledAsync(), this never executes a Rush command.
 * Registry selection uses the newest release declaring that exact engine dependency, without overrides.
 * Installation runs the native Rush installer in an isolated process and keeps its mutex outside the
 * directory that the installer replaces. Cached-only selection never queries the registry.
 *
 * When the registry path finds no usable launcher, the cache folder keeps that verdict: for a day after an answer
 * from the registry, and for an hour after a lookup that failed or did not finish. While the verdict stands and the
 * engine's cached installations are the ones it saw, selection fails at once with the same error, without
 * attesting those installations again or asking the registry. Cached-only selection neither reads nor writes it.
 */
export async function selectDaemonLauncherAsync(
  input: IDaemonLauncherContext,
  options: ISelectDaemonLauncherOptions = {}
): Promise<IVersionSelectedDaemonLaunch> {
  const override: string | undefined = EnvironmentConfiguration._getRushGlobalFolderOverride(
    input.environment
  );
  const context: IDaemonLauncherContext = {
    repoRoot: await fs.realpath(input.repoRoot),
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
  const bundled: IDaemonInstallationMetadata = readDaemonInstallationMetadata(bundledPackage);
  if (bundled.rushVersion === context.rushVersion) {
    return createLaunch(await inspectDaemonLauncherAsync(bundledPackage, context), context);
  }
  // A verdict holds only for the client that reached it; another client may accept other launchers.
  const client: string = `${bundled.daemonVersion} protocol ${DAEMON_PROTOCOL_VERSION.major}.${DAEMON_PROTOCOL_VERSION.minor}`;
  const verdictPath: string = path.join(cacheFolder, `unavailable-${context.rushVersion}.json`);
  const verdict: IUnavailableVerdict | undefined =
    options.allowInstall === false
      ? undefined
      : await tryReadLiveVerdictAsync(verdictPath, context.rushVersion, client);
  const incompatible: IIncompatibleInstallationRecord[] = [];
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
      const markerIdentity: string = await getMarkerIdentityAsync(marker.path);
      const installed: IInstalledDaemonLauncher =
        verdict?.incompatibleInstallations.find(
          (record) => record.folderName === entry.name && record.markerIdentity === markerIdentity
        )?.installation ?? (await inspectDaemonLauncherAsync(packagePath, context));
      if (supportsClient(installed)) return createLaunch(installed, context);
      incompatible.push({ folderName: entry.name, markerIdentity, installation: installed });
    }
  }
  if (options.allowInstall === false) {
    if (incompatible.length) return createLaunch(incompatible[incompatible.length - 1].installation, context);
    throw new DaemonLauncherUnavailableError(
      context.rushVersion,
      'No matching installed daemon launcher is available.'
    );
  }
  if (verdict && isSameInstallationSet(verdict.incompatibleInstallations, incompatible)) {
    throw new DaemonLauncherUnavailableError(context.rushVersion, verdict.reason, verdict.installation);
  }
  try {
    return await installFromRegistryAsync(
      context,
      cacheFolder,
      options.registryTimeoutMs ?? DEFAULT_REGISTRY_TIMEOUT_MS
    );
  } catch (error) {
    if (error instanceof DaemonLauncherUnavailableError) {
      await tryWriteVerdictAsync(verdictPath, {
        schemaVersion: VERDICT_SCHEMA_VERSION,
        rushVersion: context.rushVersion,
        client,
        ttlMs:
          error instanceof RegistryLookupError ? REGISTRY_FAILURE_VERDICT_TTL_MS : UNAVAILABLE_VERDICT_TTL_MS,
        reason: error.reason,
        installation: error.installation,
        incompatibleInstallations: await addInstalledRecordAsync(
          incompatible,
          error.installation,
          cacheFolder
        )
      });
    }
    throw error;
  }
}

async function installFromRegistryAsync(
  context: IDaemonLauncherContext,
  cacheFolder: string,
  registryTimeoutMs: number
): Promise<IVersionSelectedDaemonLaunch> {
  const versions: unknown = await npmViewAsync(DAEMON_PACKAGE, 'versions', context, registryTimeoutMs);
  const candidates: unknown[] = Array.isArray(versions) ? versions : [versions];
  // npm view returns its versions field in semver order; no second version parser is needed here.
  for (const candidate of candidates.reverse()) {
    if (typeof candidate !== 'string') throw new Error('npm returned an invalid daemon version list.');
    assertExactDaemonVersion(candidate);
    const metadata: unknown = await npmViewAsync(
      `${DAEMON_PACKAGE}@${candidate}`,
      undefined,
      context,
      registryTimeoutMs
    );
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
        stdio: ['ignore', 'ignore', 'ignore']
      }
    );
    const [exitCode, signal] = await once(child, 'close');
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

async function getMarkerIdentityAsync(markerPath: string): Promise<string> {
  const stats: BigIntStats = await fs.stat(markerPath, { bigint: true });
  return `${stats.size}:${stats.mtimeNs}:${stats.ino}`;
}

function isSameInstallationSet(
  recorded: ReadonlyArray<IIncompatibleInstallationRecord>,
  current: ReadonlyArray<IIncompatibleInstallationRecord>
): boolean {
  return (
    recorded.length === current.length &&
    current.every((installation) =>
      recorded.some(
        (record) =>
          record.folderName === installation.folderName &&
          record.markerIdentity === installation.markerIdentity
      )
    )
  );
}

/** Adds the installation that the registry path installed and attested, so the next selection accepts the verdict. */
async function addInstalledRecordAsync(
  incompatible: ReadonlyArray<IIncompatibleInstallationRecord>,
  installation: IInstalledDaemonLauncher | undefined,
  cacheFolder: string
): Promise<IIncompatibleInstallationRecord[]> {
  const records: IIncompatibleInstallationRecord[] = [...incompatible];
  if (!installation || supportsClient(installation)) return records;
  const folderName: string = `daemon-${installation.daemonVersion}`;
  if (records.some((record) => record.folderName === folderName)) return records;
  const marker: _FlagFile = new _FlagFile(path.join(cacheFolder, folderName), 'last-install', {
    node: process.versions.node,
    daemonVersion: installation.daemonVersion
  });
  if (await marker.isValidAsync()) {
    records.push({ folderName, markerIdentity: await getMarkerIdentityAsync(marker.path), installation });
  }
  return records;
}

async function tryReadLiveVerdictAsync(
  verdictPath: string,
  rushVersion: string,
  client: string
): Promise<IUnavailableVerdict | undefined> {
  let verdict: unknown;
  try {
    verdict = JSON.parse(await fs.readFile(verdictPath, 'utf8'));
  } catch {
    return undefined;
  }
  if (!isRecord(verdict)) return undefined;
  const now: number = Date.now();
  const checkedAt: number = typeof verdict.checkedAt === 'string' ? Date.parse(verdict.checkedAt) : NaN;
  const expiresAt: number = typeof verdict.expiresAt === 'string' ? Date.parse(verdict.expiresAt) : NaN;
  if (
    verdict.schemaVersion !== VERDICT_SCHEMA_VERSION ||
    verdict.rushVersion !== rushVersion ||
    verdict.client !== client ||
    // A clock that moved back since the check cannot say how old the verdict is.
    !(checkedAt <= now && now < expiresAt) ||
    typeof verdict.reason !== 'string' ||
    (verdict.installation !== undefined && !isInstalledDaemonLauncher(verdict.installation)) ||
    !Array.isArray(verdict.incompatibleInstallations) ||
    !verdict.incompatibleInstallations.every(
      (record: unknown) =>
        isRecord(record) &&
        typeof record.folderName === 'string' &&
        typeof record.markerIdentity === 'string' &&
        isInstalledDaemonLauncher(record.installation) &&
        // A recorded attestation only ever stands in for a refusal, never for a launch.
        !supportsClient(record.installation)
    )
  ) {
    return undefined;
  }
  return verdict as unknown as IUnavailableVerdict;
}

async function tryWriteVerdictAsync(
  verdictPath: string,
  input: Omit<IUnavailableVerdict, 'checkedAt' | 'expiresAt'> & { readonly ttlMs: number }
): Promise<void> {
  const { ttlMs, ...fields } = input;
  const now: number = Date.now();
  const verdict: IUnavailableVerdict = {
    ...fields,
    checkedAt: new Date(now).toISOString(),
    expiresAt: new Date(now + ttlMs).toISOString()
  };
  // Readers never see a partial file: each writer renames its own complete copy into place.
  const temporaryPath: string = `${verdictPath}.${process.pid}-${now}.tmp`;
  try {
    await fs.mkdir(path.dirname(verdictPath), { recursive: true });
    await fs.writeFile(temporaryPath, JSON.stringify(verdict, undefined, 2));
    await fs.rename(temporaryPath, verdictPath);
  } catch {
    // The verdict only saves time; without it, the next selection checks again.
    await fs.rm(temporaryPath, { force: true }).catch(() => undefined);
  }
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
  context: IDaemonLauncherContext,
  timeoutMs: number
): Promise<unknown> {
  const configFolder: string = path.join(context.repoRoot, 'common', 'config', 'rush');
  const currentWorkingDirectory: string = (await FileSystem.existsAsync(configFolder))
    ? configFolder
    : context.repoRoot;
  const environment: NodeJS.ProcessEnv = getRushCommandEnvironment(context.environment);
  const args: string[] = [
    'view',
    specifier,
    ...(field ? [field] : []),
    '--json',
    '--fetch-retries=0',
    '--fetch-timeout=30000',
    '--no-update-notifier'
  ];
  let timedOut: boolean = false;
  let result: IWaitForExitResult<string>;
  try {
    // No shell: a POSIX shell need not exec its command, and stopping only the shell would leave npm running
    // with the output pipes open, so the wait would last as long as npm's own connect timeout.
    const child: ChildProcess = spawnRegistryLookup(args, currentWorkingDirectory, environment);
    const timer: NodeJS.Timeout = setTimeout(() => {
      if (child.exitCode !== null || child.signalCode !== null) return;
      timedOut = true;
      stopRegistryLookup(child);
    }, timeoutMs);
    try {
      result = await Executable.waitForExitAsync(child, { encoding: 'utf8' });
    } finally {
      clearTimeout(timer);
    }
  } catch (error) {
    throw new RegistryLookupError(
      context.rushVersion,
      `Registry lookup for ${specifier} failed: ${(error as Error).message}`
    );
  }
  if (timedOut) {
    throw new RegistryLookupError(
      context.rushVersion,
      `Registry lookup for ${specifier} did not finish within ${timeoutMs / 1000} s.`
    );
  }
  const { stdout, stderr, exitCode, signal } = result;
  if (exitCode !== 0 || signal) {
    throw new RegistryLookupError(context.rushVersion, `Registry lookup for ${specifier} failed: ${stderr}`);
  }
  return JSON.parse(stdout);
}

function spawnRegistryLookup(
  args: string[],
  currentWorkingDirectory: string,
  environment: NodeJS.ProcessEnv
): ChildProcess {
  if (process.platform === 'win32') {
    return Executable.spawn('npm', args, {
      currentWorkingDirectory,
      environment,
      stdio: ['ignore', 'pipe', 'pipe']
    });
  }
  const npmPath: string | undefined = Executable.tryResolve('npm', {
    currentWorkingDirectory,
    environment
  });
  if (!npmPath) {
    throw new Error('The executable file was not found: "npm"');
  }
  return spawn(npmPath, args, {
    cwd: currentWorkingDirectory,
    detached: true,
    env: environment,
    stdio: ['ignore', 'pipe', 'pipe']
  });
}

function stopRegistryLookup(child: ChildProcess): void {
  child.stdout?.destroy();
  child.stderr?.destroy();
  if (process.platform === 'win32') {
    // There npm is a batch file, so the child is cmd.exe; end npm with it.
    try {
      SubprocessTerminator.killProcessTree(child, { detached: false });
      return;
    } catch {
      // Fall back to ending the child alone.
    }
  } else {
    try {
      SubprocessTerminator.killProcessTree(child, { detached: true });
      return;
    } catch {
      // Fall back to ending the child alone.
    }
  }
  child.kill('SIGKILL');
}

/** The environment that Utilities gives a Rush command, which is what npm view ran with before it had a deadline. */
function getRushCommandEnvironment(environment: Readonly<NodeJS.ProcessEnv>): NodeJS.ProcessEnv {
  const result: NodeJS.ProcessEnv = {};
  for (const key of Object.getOwnPropertyNames(environment)) {
    const value: string | undefined = environment[key];
    if (value === undefined) continue;
    const normalizedKey: string =
      process.platform === 'win32' && !/^pnpm_config_\/\//i.test(key) ? key.toUpperCase() : key;
    if (
      normalizedKey === 'INIT_CWD' ||
      /^NPM_CONFIG_/.test(normalizedKey) ||
      normalizedKey.startsWith('RUSH_DAEMON')
    ) {
      continue;
    }
    result[normalizedKey] = value;
  }
  result[EnvironmentVariableNames._RUSH_RECURSIVE_RUSHX_CALL] = '1';
  return result;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
