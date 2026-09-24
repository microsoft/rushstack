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

/** Stable inputs which distinguish reusable, reloadable, and process-bound workspace state. @alpha */
export interface IWorkspaceInputFingerprint {
  readonly configurationHash: string;
  readonly environmentHash: string;
  readonly installationHash: string;
  readonly runtimeHash: string;
  readonly selectedRushVersion: string;
}

/** Options for capturing workspace definition inputs, not ordinary project source/output files. @alpha */
export interface IWorkspaceInputFingerprintOptions {
  readonly rushConfiguration: RushConfiguration;
  readonly environment: Readonly<Record<string, string | undefined>>;
  /** Additional implementation files/folders owned by the embedding host. */
  readonly runtimePaths?: ReadonlyArray<string>;
  /** Invocation-owner cache for implementation files; workspace definitions are always read by content. */
  readonly runtimeCache?: WorkspaceRuntimeFingerprintCache;
}

/**
 * Environment variable names that are excluded from {@link IWorkspaceInputFingerprint.environmentHash}.
 *
 * @remarks
 * These variables are maintained per shell, terminal, remote session or client invocation. Rush never reads them
 * to configure the engine, construct the operation graph or compute operation hashes, so a difference must not
 * discard a warm workspace:
 *
 * - shell bookkeeping: `_`, `PWD`, `OLDPWD`, `SHLVL`, `PS1`, `HISTFILE`, `HISTSIZE`
 *   (a child shell recomputes `PWD`/`SHLVL`/`_` for its own working directory)
 * - terminal presentation: `TERM`, `TERM_PROGRAM`, `TERM_PROGRAM_VERSION`, `TERM_SESSION_ID`, `COLORTERM`,
 *   `COLUMNS`, `LINES`, `LS_COLORS`, `WINDOWID`
 * - session and multiplexer handles: `WSL_INTEROP`, `WSLENV`, `SSH_CLIENT`, `SSH_CONNECTION`, `SSH_TTY`,
 *   `SSH_AUTH_SOCK`, `TMUX`, `TMUX_PANE`, `STY`, `XDG_SESSION_ID`, `XDG_SESSION_TYPE`, `DBUS_SESSION_BUS_ADDRESS`
 * - `INIT_CWD`, which Rush removes from every lifecycle script environment and sets explicitly where needed
 * - client routing: `RUSH_DAEMON` and `RUSH_DAEMON_AUTO_START` only select and start a daemon, and
 *   `RUSH_DAEMON_EXPERIMENTAL` is read from each request rather than from the process
 *
 * Every other variable remains a process-bound input, including the remaining `RUSH_*` settings (such as
 * `RUSH_BUILD_CACHE_*` and the daemon's own `RUSH_DAEMON_*` resource settings), `NODE_*`, npm/pnpm
 * configuration, `PATH` and `HOME`. On Windows, names are matched case-insensitively.
 *
 * A long-lived host that ignores these variables keeps the values from its own startup environment for the
 * processes it launches. Projects that need one of these values as an operation input should not rely on it
 * being request-specific in such a host.
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
  'INIT_CWD',
  'RUSH_DAEMON',
  'RUSH_DAEMON_AUTO_START',
  'RUSH_DAEMON_EXPERIMENTAL'
]);

/**
 * Returns the defined environment entries that participate in workspace fingerprints, sorted by name.
 *
 * @remarks
 * Omits undefined values and {@link workspaceFingerprintIgnoredEnvironmentVariables}. Hosts that compare
 * environments outside {@link captureWorkspaceInputFingerprintAsync} must use this function so that every
 * comparison applies the same normalization.
 *
 * @alpha
 */
export function getWorkspaceFingerprintEnvironmentEntries(
  environment: Readonly<Record<string, string | undefined>>
): [string, string][] {
  const isWindows: boolean = process.platform === 'win32';
  return Object.entries(environment)
    .filter(
      (entry): entry is [string, string] =>
        entry[1] !== undefined &&
        !workspaceFingerprintIgnoredEnvironmentVariables.has(isWindows ? entry[0].toUpperCase() : entry[0])
    )
    .sort(([left], [right]) => Sort.compareByValue(left, right));
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
 * @alpha
 */
export class WorkspaceRuntimeFingerprintCache {
  private readonly _files: Map<string, { stamp: string; entry: ReadonlyArray<string> }> = new Map();
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
    for (const filename of paths) {
      for (const file of listRuntimeFilesSync(filename)) filenames.add(file);
    }
    const entries: ReadonlyArray<string>[] = [];
    for (const filename of Array.from(filenames).sort()) {
      try {
        const stat: fsSync.BigIntStats = fsSync.statSync(filename, { bigint: true });
        const realPath: string = fsSync.realpathSync(filename);
        const stamp: string = `${realPath}:${stat.dev}:${stat.ino}:${stat.size}:${stat.mtimeNs}:${stat.ctimeNs}`;
        let cached: { stamp: string; entry: ReadonlyArray<string> } | undefined = this._files.get(filename);
        if (cached?.stamp !== stamp) {
          cached = {
            stamp,
            entry: [
              filename,
              realPath,
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
  const configurationFiles: string[] = await listFilesAsync(path.join(root, 'common', 'config'), false);
  for (const filename of configurationFiles) {
    (isProcessBoundConfiguration(filename) ? installation : definitions).add(filename);
  }
  for (const project of rushJson.projects) {
    const projectFolder: string = path.resolve(root, project.projectFolder);
    if (!Path.isUnderOrEqual(projectFolder, root)) {
      throw new Error('A fingerprint project folder must be inside the workspace.');
    }
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
    ...(options.runtimePaths ?? [])
  ];
  const runtimeHash: string = (options.runtimeCache ?? new WorkspaceRuntimeFingerprintCache())._hashPaths(
    runtimePaths
  );
  return {
    configurationHash: await hashFilesAsync(definitions),
    environmentHash: hashText(JSON.stringify(getWorkspaceFingerprintEnvironmentEntries(environment))),
    installationHash: await hashFilesAsync(installation),
    runtimeHash: hashText(JSON.stringify([process.execPath, process.version, runtimeHash])),
    selectedRushVersion: environment.RUSH_PREVIEW_VERSION ?? rushJson.rushVersion
  };
}

/** Fingerprints native merged project/rig/inherited configuration using invocation-owned loader caches. @alpha */
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

async function hashFilesAsync(filenames: Iterable<string>): Promise<string> {
  const entries: string[][] = await Async.mapAsync(
    Array.from(filenames).sort(),
    async (filename) => {
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
    },
    { concurrency: 3 }
  );
  return hashText(JSON.stringify(entries));
}

async function listFilesAsync(folderOrFile: string, runtime: boolean): Promise<string[]> {
  try {
    const stat: Awaited<ReturnType<typeof fs.stat>> = await fs.stat(folderOrFile);
    if (!stat.isDirectory()) return [folderOrFile];
    const files: string[] = [];
    for (const entry of await fs.readdir(folderOrFile, { withFileTypes: true })) {
      if (entry.name === 'node_modules' || (runtime && entry.name === 'test')) continue;
      const filename: string = path.join(folderOrFile, entry.name);
      if (entry.isDirectory()) files.push(...(await listFilesAsync(filename, runtime)));
      else if (!runtime || (/\.(?:js|cjs|mjs|json)$/.test(entry.name) && !entry.name.endsWith('.test.js'))) {
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

function listRuntimeFilesSync(folderOrFile: string): string[] {
  try {
    if (!fsSync.statSync(folderOrFile).isDirectory()) return [folderOrFile];
    const files: string[] = [];
    for (const entry of fsSync.readdirSync(folderOrFile, { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name === 'test') continue;
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
