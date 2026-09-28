// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import * as fsSync from 'node:fs';
import { createHash } from 'node:crypto';

import { Async, FileSystem, JsonFile, PackageJsonLookup, Path, Sort } from '@rushstack/node-core-library';
import type { ITerminal } from '@rushstack/terminal';

import type { RushConfiguration } from './RushConfiguration';
import type { RushConfigurationProject } from './RushConfigurationProject';
import { RushProjectConfiguration } from './RushProjectConfiguration';
import { getDaemonIpcImplementationIdentityAsync } from '../logic/operations/DaemonIpcConfiguration';
import { AutoinstallerPluginLoader } from '../pluginFramework/PluginLoader/AutoinstallerPluginLoader';
import { getFileStamp, getSettledBeforeNs, isFileStatSettled } from '../utilities/FileContentStamp';

/** Stable inputs which distinguish reusable, reloadable, and process-bound workspace state. @alpha */
export interface IWorkspaceInputFingerprint {
  readonly configurationHash: string;
  readonly environmentHash: string;
  readonly installationHash: string;
  /**
   * The Node.js executable and version, the running Rush package, the host's `runtimePaths`, and the installed
   * package folder of every configured Rush plugin. A change requires a new process.
   */
  readonly runtimeHash: string;
  readonly selectedRushVersion: string;
}

/** Options for capturing workspace definition inputs, not ordinary project source/output files. @alpha */
export interface IWorkspaceInputFingerprintOptions {
  readonly rushConfiguration: RushConfiguration;
  readonly environment: Readonly<Record<string, string | undefined>>;
  /** Additional implementation files/folders owned by the embedding host. */
  readonly runtimePaths?: ReadonlyArray<string>;
  /**
   * Invocation-owner cache for file digests. Workspace definitions are always compared by content: a cached
   * digest is reused only for a file that had stopped changing before it was read (see
   * {@link WorkspaceRuntimeFingerprintCache}).
   */
  readonly runtimeCache?: WorkspaceRuntimeFingerprintCache;
}

/**
 * Environment variable names that are excluded from {@link IWorkspaceInputFingerprint.environmentHash}.
 *
 * @remarks
 * These variables are maintained per shell, terminal, remote session, service unit, agent session or client
 * invocation. Rush never reads them to configure the engine, construct the operation graph or compute operation
 * hashes, so a difference must not discard a warm workspace:
 *
 * - shell bookkeeping: `_`, `PWD`, `OLDPWD`, `SHLVL`, `PS1`, `HISTFILE`, `HISTSIZE`
 *   (a child shell recomputes `PWD`/`SHLVL`/`_` for its own working directory)
 * - terminal presentation: `TERM`, `TERM_PROGRAM`, `TERM_PROGRAM_VERSION`, `TERM_SESSION_ID`, `COLORTERM`,
 *   `COLUMNS`, `LINES`, `LS_COLORS`, `WINDOWID`, and the per-window handles of terminal emulators:
 *   `WT_SESSION`, `WT_PROFILE_ID`, `ITERM_SESSION_ID`
 * - session and multiplexer handles: `WSL_INTEROP`, `WSLENV`, `SSH_CLIENT`, `SSH_CONNECTION`, `SSH_TTY`,
 *   `SSH_AUTH_SOCK`, `TMUX`, `TMUX_PANE`, `STY`, `XDG_SESSION_ID`, `XDG_SESSION_TYPE`, `DBUS_SESSION_BUS_ADDRESS`
 * - service manager metadata that systemd assigns to every unit and scope: `INVOCATION_ID`, `JOURNAL_STREAM`,
 *   `MANAGERPID`, `SYSTEMD_EXEC_PID`, `MEMORY_PRESSURE_WATCH`, `MEMORY_PRESSURE_WRITE`
 * - editor and credential-prompt handles of an integrated terminal: `VSCODE_IPC_HOOK_CLI`,
 *   `VSCODE_GIT_IPC_HANDLE`, `VSCODE_GIT_ASKPASS_MAIN`, `VSCODE_GIT_ASKPASS_NODE`,
 *   `VSCODE_GIT_ASKPASS_EXTRA_ARGS`, `VSCODE_INJECTION`, `VSCODE_NONCE`, `GIT_ASKPASS`, `SSH_ASKPASS`
 * - coding agent session markers: `COPILOT_CLI`, `COPILOT_AGENT_SESSION_ID`, `COPILOT_LOADER_PID`,
 *   `COPILOT_CLI_BINARY_VERSION`, `COPILOT_CLI_RESOLVED_DIST_DIR`, `CLAUDECODE`, `CLAUDE_CODE_ENTRYPOINT`
 * - `INIT_CWD`, which Rush removes from every lifecycle script environment and sets explicitly where needed,
 *   and `RUSH_INVOKED_FOLDER`, which Rush assigns for each invocation
 * - client routing and presentation: `RUSH_DAEMON` and `RUSH_DAEMON_AUTO_START` only select and start a daemon,
 *   `RUSH_DAEMON_QUEUE_TIMEOUT_SECONDS` is sent as each request's admission deadline, `RUSHD_OUTPUT` selects
 *   the client's output mode, and `RUSH_DAEMON_EXPERIMENTAL` is read from each request rather than from the process
 * - `RUSH_PARALLELISM`, which a long-lived host applies to each request as its `--parallelism` default
 * - temporary and runtime folders, which are often set per session, job or sandbox: `TMPDIR`, `TMP`, `TEMP` and
 *   `XDG_RUNTIME_DIR`, and `RUSHD_RUNTIME_DIR`, which only selects the folder where a client meets its daemon
 *
 * Every other variable remains a process-bound input, including the remaining `RUSH_*` settings (such as
 * `RUSH_BUILD_CACHE_*` and the daemon's own `RUSH_DAEMON_*` resource settings), `NODE_*`, npm/pnpm
 * configuration, credentials, `PATH` and `HOME`. On Windows, names are matched case-insensitively.
 * `PATH` is compared without repeated entries, because a later duplicate can never change which executable
 * a lookup finds.
 *
 * A long-lived host that ignores these variables must not give the processes it launches the values of the
 * client that started it. Each operation instead takes every one of these variables from the request that it
 * serves ({@link getWorkspaceRequestOperationEnvironment}), and does not receive the variable when that
 * request does not define it. The host's own process also drops {@link workspaceRequestScopedEnvironmentVariables},
 * because code running inside it reads them from `process.env`.
 *
 * @alpha
 */
export const workspaceFingerprintIgnoredEnvironmentVariables: ReadonlySet<string> = new Set([
  '_',
  'PWD',
  'OLDPWD',
  'SHLVL',
  'PS1',
  'HISTFILE',
  'HISTSIZE',
  'TERM',
  'TERM_PROGRAM',
  'TERM_PROGRAM_VERSION',
  'TERM_SESSION_ID',
  'COLORTERM',
  'COLUMNS',
  'LINES',
  'LS_COLORS',
  'WINDOWID',
  'WT_SESSION',
  'WT_PROFILE_ID',
  'ITERM_SESSION_ID',
  'WSL_INTEROP',
  'WSLENV',
  'SSH_CLIENT',
  'SSH_CONNECTION',
  'SSH_TTY',
  'SSH_AUTH_SOCK',
  'TMUX',
  'TMUX_PANE',
  'STY',
  'XDG_SESSION_ID',
  'XDG_SESSION_TYPE',
  'DBUS_SESSION_BUS_ADDRESS',
  'INVOCATION_ID',
  'JOURNAL_STREAM',
  'MANAGERPID',
  'SYSTEMD_EXEC_PID',
  'MEMORY_PRESSURE_WATCH',
  'MEMORY_PRESSURE_WRITE',
  'VSCODE_IPC_HOOK_CLI',
  'VSCODE_GIT_IPC_HANDLE',
  'VSCODE_GIT_ASKPASS_MAIN',
  'VSCODE_GIT_ASKPASS_NODE',
  'VSCODE_GIT_ASKPASS_EXTRA_ARGS',
  'VSCODE_INJECTION',
  'VSCODE_NONCE',
  'GIT_ASKPASS',
  'SSH_ASKPASS',
  'COPILOT_CLI',
  'COPILOT_AGENT_SESSION_ID',
  'COPILOT_LOADER_PID',
  'COPILOT_CLI_BINARY_VERSION',
  'COPILOT_CLI_RESOLVED_DIST_DIR',
  'CLAUDECODE',
  'CLAUDE_CODE_ENTRYPOINT',
  'INIT_CWD',
  'RUSH_INVOKED_FOLDER',
  'RUSH_DAEMON',
  'RUSH_DAEMON_AUTO_START',
  'RUSH_DAEMON_QUEUE_TIMEOUT_SECONDS',
  'RUSHD_OUTPUT',
  'RUSH_DAEMON_EXPERIMENTAL',
  'RUSH_PARALLELISM',
  'TMPDIR',
  'TMP',
  'TEMP',
  'XDG_RUNTIME_DIR',
  'RUSHD_RUNTIME_DIR'
]);

/**
 * The subset of {@link workspaceFingerprintIgnoredEnvironmentVariables} whose value belongs to one request.
 *
 * @remarks
 * A long-lived host must not inherit these variables from the client that started it: it applies
 * `RUSH_PARALLELISM` from each request's own environment, and code running inside the host that reads a session
 * identifier such as `COPILOT_AGENT_SESSION_ID` from `process.env` would otherwise attribute every later session's
 * work to the first one. Likewise, the first client's `TMPDIR` or `XDG_RUNTIME_DIR` may be removed when that
 * client's session or job ends, while the host lives on. (`TMP` and `TEMP` stay, because Windows has no usable
 * default for them.)
 * On Windows, names are matched case-insensitively.
 *
 * @alpha
 */
export const workspaceRequestScopedEnvironmentVariables: ReadonlySet<string> = new Set([
  'RUSH_PARALLELISM',
  'COPILOT_AGENT_SESSION_ID',
  'TMPDIR',
  'XDG_RUNTIME_DIR'
]);

/**
 * Returns the defined environment entries that participate in workspace fingerprints, sorted by name.
 *
 * @remarks
 * Omits undefined values and {@link workspaceFingerprintIgnoredEnvironmentVariables}, and removes repeated
 * `PATH` entries. Hosts that compare environments outside {@link captureWorkspaceInputFingerprintAsync} must use
 * this function so that every comparison applies the same normalization.
 *
 * @alpha
 */
export function getWorkspaceFingerprintEnvironmentEntries(
  environment: Readonly<Record<string, string | undefined>>
): [string, string][] {
  const isWindows: boolean = process.platform === 'win32';
  const entries: [string, string][] = [];
  for (const [name, value] of Object.entries(environment)) {
    if (value === undefined) continue;
    const normalizedName: string = isWindows ? name.toUpperCase() : name;
    if (workspaceFingerprintIgnoredEnvironmentVariables.has(normalizedName)) continue;
    entries.push([name, normalizedName === 'PATH' ? removeRepeatedPathEntries(value) : value]);
  }
  return entries.sort(([left], [right]) => Sort.compareByValue(left, right));
}

/**
 * Returns a copy of a host startup environment without {@link workspaceRequestScopedEnvironmentVariables}.
 *
 * @alpha
 */
export function getWorkspaceHostEnvironment(
  environment: Readonly<Record<string, string | undefined>>
): Record<string, string> {
  const isWindows: boolean = process.platform === 'win32';
  const hostEnvironment: Record<string, string> = {};
  for (const [name, value] of Object.entries(environment)) {
    if (
      value !== undefined &&
      !workspaceRequestScopedEnvironmentVariables.has(isWindows ? name.toUpperCase() : name)
    ) {
      hostEnvironment[name] = value;
    }
  }
  return hostEnvironment;
}

/**
 * Returns the environment that an operation starts from when a long-lived host runs it for a request.
 *
 * @remarks
 * Every variable in {@link workspaceFingerprintIgnoredEnvironmentVariables} takes the request's value, and is
 * omitted when the request does not define it, so that the operation sees its own requester's session, terminal
 * and credential-helper variables. Every other variable comes from the host, whose environment matches the
 * request's for identity. A host returns the result from `IOperationGraphIterationOptions.getOperationEnvironment`.
 * On Windows, names are matched case-insensitively.
 *
 * @alpha
 */
export function getWorkspaceRequestOperationEnvironment(
  hostEnvironment: Readonly<Record<string, string | undefined>>,
  requestEnvironment: Readonly<Record<string, string | undefined>>
): Record<string, string> {
  const isWindows: boolean = process.platform === 'win32';
  const isRequestValue = (name: string): boolean =>
    workspaceFingerprintIgnoredEnvironmentVariables.has(isWindows ? name.toUpperCase() : name);
  const environment: Record<string, string> = {};
  for (const [name, value] of Object.entries(hostEnvironment)) {
    if (value !== undefined && !isRequestValue(name)) environment[name] = value;
  }
  for (const [name, value] of Object.entries(requestEnvironment)) {
    if (value !== undefined && isRequestValue(name)) environment[name] = value;
  }
  return environment;
}

function removeRepeatedPathEntries(value: string): string {
  return Array.from(new Set(value.split(path.delimiter))).join(path.delimiter);
}

interface IFileDigest {
  readonly stamp: string;
  readonly entry: ReadonlyArray<string>;
}

/**
 * Memoizes runtime content digests behind file identity, size, nanosecond mtime and ctime checks.
 * Changes to metadata alone still produce the same content fingerprint.
 *
 * @remarks
 * Embedding hosts create one cache per workspace lifetime and pass it to
 * {@link captureWorkspaceInputFingerprintAsync} through `runtimeCache`. The capture function
 * updates the cache; hosts can inspect {@link WorkspaceRuntimeFingerprintCache.changedPaths}
 * when reporting why a process restart is required.
 *
 * The cache also memoizes the digests of workspace definition and installation files, which users edit while
 * a host is running. Such a digest is recorded only if the file's ctime and mtime were at least 3 seconds old
 * when the file was examined, and it is reused only while the file's identity, size, mtime and ctime are
 * unchanged. A file that changed more recently is read again by every capture. Every write updates a file's
 * ctime, which userspace can't set, so a later write can't keep the recorded stamp even on a filesystem whose
 * timestamps are coarse, provided that the filesystem's clock agrees with the host's to within that margin.
 *
 * Like the runtime digests, a memoized entry keeps the file's resolved path while the identity of the file it
 * reaches is unchanged. A symbolic link that is retargeted to another hard link of the same file, or a parent
 * folder that is moved without changing the file, keeps the previous resolved path.
 *
 * @alpha
 */
export class WorkspaceRuntimeFingerprintCache {
  private readonly _files: Map<string, IFileDigest> = new Map();
  private readonly _inputFiles: Map<string, IFileDigest> = new Map();
  private _baseline: ReadonlyMap<string, string> | undefined;
  private _changedPaths: ReadonlyArray<string> = [];

  /**
   * Implementation paths whose content or existence differs from the first capture using this cache.
   * Updated by each capture; metadata-only changes do not appear in this list.
   */
  public get changedPaths(): ReadonlyArray<string> {
    return this._changedPaths;
  }

  /** @internal */
  public _hashPaths(paths: ReadonlyArray<string>): string {
    const filenames: Set<string> = new Set();
    // Several configured plugins often come from one package, whose folder is walked only once.
    for (const filename of new Set(paths)) {
      for (const file of listRuntimeFilesSync(filename)) filenames.add(file);
    }
    const entries: ReadonlyArray<string>[] = [];
    for (const filename of Array.from(filenames).sort()) {
      try {
        // statSync follows links, so dev and ino identify the file that is loaded. Its resolved path is
        // recomputed whenever that identity changes, which avoids a costly realpath for every unchanged file.
        const stat: fsSync.BigIntStats = fsSync.statSync(filename, { bigint: true });
        const stamp: string = getFileStamp(stat);
        let cached: IFileDigest | undefined = this._files.get(filename);
        if (cached?.stamp !== stamp) {
          cached = {
            stamp,
            entry: [
              filename,
              fsSync.realpathSync(filename),
              createHash('sha256').update(fsSync.readFileSync(filename)).digest('hex')
            ]
          };
          this._files.set(filename, cached);
        }
        entries.push(cached.entry);
      } catch (error) {
        if (!FileSystem.isNotExistError(error as Error)) throw error;
        this._files.delete(filename);
        entries.push([filename, 'missing']);
      }
    }
    const current: ReadonlyMap<string, string> = new Map(
      entries.map((entry) => [entry[0], JSON.stringify(entry)])
    );
    this._baseline ??= current;
    this._changedPaths = Array.from(new Set([...this._baseline.keys(), ...current.keys()])).filter(
      (filename) => this._baseline!.get(filename) !== current.get(filename)
    );
    return hashText(JSON.stringify(entries));
  }

  /**
   * Hashes workspace definition or installation files by content, as `[filename, realpath, sha256]` entries or
   * `[filename, 'missing']`. See the remarks of {@link WorkspaceRuntimeFingerprintCache} for when a digest is reused.
   * @internal
   */
  public async _hashInputFilesAsync(filenames: Iterable<string>): Promise<string> {
    const settledBeforeNs: bigint = getSettledBeforeNs();
    const sortedFilenames: string[] = Array.from(filenames).sort();
    const entries: ReadonlyArray<string>[] = new Array(sortedFilenames.length);
    const misses: { index: number; stat: fsSync.BigIntStats | undefined }[] = [];
    for (let index: number = 0; index < sortedFilenames.length; index++) {
      const filename: string = sortedFilenames[index];
      let stat: fsSync.BigIntStats | undefined;
      try {
        // statSync follows links, so dev and ino identify the file whose content is hashed.
        stat = fsSync.statSync(filename, { bigint: true, throwIfNoEntry: false });
      } catch {
        // Hashing the file reports the error, or its absence, as an uncached capture does.
        misses.push({ index, stat: undefined });
        continue;
      }
      if (!stat) {
        this._inputFiles.delete(filename);
        entries[index] = [filename, 'missing'];
      } else if (!stat.isFile()) {
        misses.push({ index, stat: undefined });
      } else {
        const cached: IFileDigest | undefined = this._inputFiles.get(filename);
        if (cached?.stamp === getFileStamp(stat)) {
          entries[index] = cached.entry;
        } else {
          misses.push({ index, stat });
        }
      }
    }
    await Async.forEachAsync(
      misses,
      async ({ index, stat }) => {
        const filename: string = sortedFilenames[index];
        const entry: ReadonlyArray<string> = await hashFileAsync(filename);
        entries[index] = entry;
        if (stat && entry.length === 3 && isFileStatSettled(stat, settledBeforeNs)) {
          this._inputFiles.set(filename, { stamp: getFileStamp(stat), entry });
        } else {
          this._inputFiles.delete(filename);
        }
      },
      { concurrency: 3 }
    );
    return hashText(JSON.stringify(entries));
  }
}

/** The strongest action required by a workspace input change. @alpha */
export enum WorkspaceInputChangeTier {
  Reuse = 0,
  Reload = 1,
  Restart = 2
}

/** Compares stable content identities; timestamps alone never cause reloads. @alpha */
export function classifyWorkspaceInputChange(
  current: IWorkspaceInputFingerprint,
  next: IWorkspaceInputFingerprint
): WorkspaceInputChangeTier {
  if (
    current.runtimeHash !== next.runtimeHash ||
    current.environmentHash !== next.environmentHash ||
    current.installationHash !== next.installationHash ||
    current.selectedRushVersion !== next.selectedRushVersion
  ) {
    return WorkspaceInputChangeTier.Restart;
  }
  return current.configurationHash === next.configurationHash
    ? WorkspaceInputChangeTier.Reuse
    : WorkspaceInputChangeTier.Reload;
}

/** Captures graph definitions and process-bound inputs without constructing a graph or executing commands. @alpha */
export async function captureWorkspaceInputFingerprintAsync(
  options: IWorkspaceInputFingerprintOptions
): Promise<IWorkspaceInputFingerprint> {
  const { rushConfiguration, environment } = options;
  const root: string = rushConfiguration.rushJsonFolder;
  const rushJson: { rushVersion: string; projects: Array<{ projectFolder: string }> } =
    await JsonFile.loadAsync(rushConfiguration.rushJsonFile);
  if (typeof rushJson.rushVersion !== 'string' || !Array.isArray(rushJson.projects)) {
    throw new Error('Workspace fingerprints require a valid Rush version and project list.');
  }
  const definitions: Set<string> = new Set([
    rushConfiguration.rushJsonFile,
    path.join(root, '.gitignore'),
    path.join(root, 'package.json'),
    path.join(root, '.npmrc'),
    path.join(root, '.env')
  ]);
  const installation: Set<string> = new Set();
  for (const subspace of rushConfiguration.subspaces) {
    installation.add(path.join(subspace.getSubspaceTempFolderPath(), 'last-install.flag'));
  }
  installation.add(path.join(rushConfiguration.commonTempFolder, 'current-variants.json'));
  const projectFolders: string[] = [];
  for (const project of rushJson.projects) {
    const projectFolder: string = path.resolve(root, project.projectFolder);
    if (!Path.isUnderOrEqual(projectFolder, root)) {
      throw new Error('A fingerprint project folder must be inside the workspace.');
    }
    projectFolders.push(projectFolder);
  }
  const commonConfigFolder: string = path.join(root, 'common', 'config');
  const configurationFiles: string[] = await listFilesAsync(
    commonConfigFolder,
    false,
    getNestedProjectFolders(commonConfigFolder, projectFolders, rushConfiguration)
  );
  for (const filename of configurationFiles) {
    (isProcessBoundConfiguration(filename) ? installation : definitions).add(filename);
  }
  // Configured plugins shape the command-line parser even when they are never loaded for a command.
  for (const pluginConfiguration of rushConfiguration._rushPluginsConfiguration.configuration.plugins) {
    for (const filename of AutoinstallerPluginLoader.getPluginShapeFilePaths(
      rushConfiguration,
      pluginConfiguration
    )) {
      definitions.add(filename);
    }
  }
  for (const projectFolder of projectFolders) {
    for (const relativePath of [
      'package.json',
      '.gitignore',
      'config/rush-project.json',
      'config/rig.json'
    ]) {
      definitions.add(path.join(projectFolder, relativePath));
    }
  }
  // __dirname is the bundle folder in published Rush, not necessarily the source module's api folder.
  const packageFolder: string | undefined = PackageJsonLookup.instance.tryGetPackageFolderFor(__dirname);
  if (!packageFolder)
    throw new Error('Cannot locate the running Rush package for its implementation fingerprint.');
  const runtimePaths: string[] = [
    path.join(packageFolder, 'package.json'),
    path.join(packageFolder, 'lib-commonjs'),
    // In a bundled Rush, lib-commonjs only forwards to the bundle chunks, which contain the implementation.
    path.join(packageFolder, 'dist'),
    ...(options.runtimePaths ?? [])
  ];
  // A host loads plugins with require(), and Node.js never reloads a module, so a plugin's implementation is
  // bound to the process that loaded it: an engine recreated in the same process would reuse the old code.
  for (const pluginConfiguration of rushConfiguration._rushPluginsConfiguration.configuration.plugins) {
    runtimePaths.push(AutoinstallerPluginLoader.getPluginPackageFolder(rushConfiguration, pluginConfiguration));
  }
  const cache: WorkspaceRuntimeFingerprintCache = options.runtimeCache ?? new WorkspaceRuntimeFingerprintCache();
  const runtimeHash: string = cache._hashPaths(runtimePaths);
  return {
    configurationHash: await cache._hashInputFilesAsync(definitions),
    environmentHash: hashText(JSON.stringify(getWorkspaceFingerprintEnvironmentEntries(environment))),
    installationHash: await cache._hashInputFilesAsync(installation),
    runtimeHash: hashText(JSON.stringify([process.execPath, process.version, runtimeHash])),
    selectedRushVersion: environment.RUSH_PREVIEW_VERSION ?? rushJson.rushVersion
  };
}

/**
 * Fingerprints native merged project/rig/inherited configuration using invocation-owned loader caches.
 * Throws a {@link PhasedCommandEngineProjectConfigurationError} if a project's configuration cannot be loaded.
 * @alpha
 */
export async function captureProjectConfigurationFingerprintAsync(
  rushConfiguration: RushConfiguration,
  terminal: ITerminal
): Promise<string> {
  const configurations: ReadonlyMap<RushConfigurationProject, RushProjectConfiguration> =
    await RushProjectConfiguration._tryLoadForProjectsUncachedAsync(rushConfiguration.projects, terminal);
  return hashText(
    JSON.stringify([
      await getDaemonIpcImplementationIdentityAsync(
        configurations,
        rushConfiguration.daemon.usePersistentIpcRunners
      ),
      Array.from(configurations, ([project, configuration]) => [
        project.packageName,
        configuration._getJsonForFingerprint()
      ]).sort(([left], [right]) => Sort.compareByValue(left, right))
    ])
  );
}

function hashText(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

async function hashFileAsync(filename: string): Promise<ReadonlyArray<string>> {
  try {
    return [
      filename,
      await fs.realpath(filename),
      createHash('sha256')
        .update(await fs.readFile(filename))
        .digest('hex')
    ];
  } catch (error) {
    if (!FileSystem.isNotExistError(error as Error)) throw error;
    return [filename, 'missing'];
  }
}

/**
 * Returns the Rush project folders nested inside `common/config`. Rush reads such a project only through the
 * project definition files fingerprinted for every project, and running its operations rewrites logs, build
 * outputs and `.rush/temp` state inside it, which must not look like a configuration change. A project folder
 * that is inside or contains a Rush configuration folder is never excluded.
 */
function getNestedProjectFolders(
  commonConfigFolder: string,
  projectFolders: ReadonlyArray<string>,
  rushConfiguration: RushConfiguration
): ReadonlySet<string> {
  const rushConfigurationFolders: string[] = [
    rushConfiguration.commonRushConfigFolder,
    path.join(commonConfigFolder, 'subspaces'),
    ...rushConfiguration.subspaces.map((subspace) => subspace.getSubspaceConfigFolderPath())
  ];
  return new Set(
    projectFolders.filter(
      (projectFolder) =>
        Path.isUnder(projectFolder, commonConfigFolder) &&
        !rushConfigurationFolders.some(
          (folder) => Path.isUnderOrEqual(folder, projectFolder) || Path.isUnderOrEqual(projectFolder, folder)
        )
    )
  );
}

async function listFilesAsync(
  folderOrFile: string,
  runtime: boolean,
  excludedFolders: ReadonlySet<string> = new Set()
): Promise<string[]> {
  try {
    const stat: Awaited<ReturnType<typeof fs.stat>> = await fs.stat(folderOrFile);
    if (!stat.isDirectory()) return [folderOrFile];
    const files: string[] = [];
    for (const entry of await fs.readdir(folderOrFile, { withFileTypes: true })) {
      if (entry.name === 'node_modules' || (runtime && entry.name === 'test')) continue;
      const filename: string = path.join(folderOrFile, entry.name);
      if (entry.isDirectory()) {
        if (!excludedFolders.has(filename)) {
          files.push(...(await listFilesAsync(filename, runtime, excludedFolders)));
        }
      } else if (
        !runtime ||
        (/\.(?:js|cjs|mjs|json)$/.test(entry.name) && !entry.name.endsWith('.test.js'))
      ) {
        files.push(filename);
      }
    }
    return files.sort();
  } catch (error) {
    if (!FileSystem.isNotExistError(error as Error)) throw error;
    return [folderOrFile];
  }
}

function isProcessBoundConfiguration(filename: string): boolean {
  return ['pnpm-lock.yaml', 'npm-shrinkwrap.json', 'yarn.lock', 'rush-plugins.json'].includes(
    path.basename(filename)
  );
}

// Declaration and ES module output, which a plugin's CommonJS entry point doesn't load. Listing them would only
// slow down the synchronous walk that every request runs.
const NON_RUNTIME_FOLDER_NAMES: ReadonlySet<string> = new Set(['node_modules', 'test', 'lib-dts', 'lib-esm']);

function listRuntimeFilesSync(folderOrFile: string): string[] {
  try {
    if (!fsSync.statSync(folderOrFile).isDirectory()) return [folderOrFile];
    const files: string[] = [];
    for (const entry of fsSync.readdirSync(folderOrFile, { withFileTypes: true })) {
      if (NON_RUNTIME_FOLDER_NAMES.has(entry.name)) continue;
      const filename: string = path.join(folderOrFile, entry.name);
      if (entry.isDirectory()) files.push(...listRuntimeFilesSync(filename));
      else if (/\.(?:js|cjs|mjs|json)$/.test(entry.name) && !entry.name.endsWith('.test.js'))
        files.push(filename);
    }
    return files;
  } catch (error) {
    if (!FileSystem.isNotExistError(error as Error)) throw error;
    return [folderOrFile];
  }
}
