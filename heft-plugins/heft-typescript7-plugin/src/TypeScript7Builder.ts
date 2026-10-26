// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as fs from 'node:fs';
import * as path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

import * as semver from 'semver';
// These are compile-time-only imports: Node10 resolution cannot resolve the beta's package exports.
import type {
  API,
  Diagnostic,
  ParsedCommandLine,
  Program,
  Snapshot,
  SyntheticProjectId,
  FileNotifications,
  CreateSnapshotProgramParams
} from 'typescript-7/dist/api/async/api';
import type { FileSystemCallbacks, FileSystemEntries } from 'typescript-7/dist/api/fs';

import { FileSystem, JsonFile } from '@rushstack/node-core-library';
import type { IScopedLogger, IWatchFileSystem } from '@rushstack/heft';

import { importAsync } from './typeScript7Loader.cjs';

type TypeScript7API = typeof import('typescript-7/dist/api/async/api');

interface ITypeScript7BuilderOptions {
  typescriptPackagePath: string;
  buildFolderPath: string;
  tsconfigPath: string;
  logger: IScopedLogger;
  watchFs?: IWatchFileSystem;
  requestRun?: () => void;
  abortSignal: AbortSignal;
}

interface IWatchSubscription {
  watcher: fs.FSWatcher;
  names: Set<string>;
  all: boolean;
  identity: string;
}

interface IFileSystemDependency {
  directory: boolean;
  state: string;
  entries?: readonly string[];
}

export class TypeScript7Builder {
  private readonly _options: ITypeScript7BuilderOptions;
  private _api: API | undefined;
  private _typescript: TypeScript7API | undefined;
  private _snapshot: Snapshot | undefined;
  private _projectId: SyntheticProjectId | undefined;
  private readonly _obsoleteProjectIds: Set<SyntheticProjectId> = new Set();
  private _programConfiguration: string | undefined;
  private _abortSignal: AbortSignal;
  private _watchFs: IWatchFileSystem | undefined;
  private readonly _dependencies: Map<string, IFileSystemDependency> = new Map();
  private readonly _watchers: Map<string, IWatchSubscription> = new Map();
  private readonly _outputs: Set<string> = new Set();

  public constructor(options: ITypeScript7BuilderOptions) {
    this._options = options;
    this._abortSignal = options.abortSignal;
    this._watchFs = options.watchFs;
  }

  public async invokeAsync(
    abortSignal: AbortSignal = this._options.abortSignal,
    watchFs: IWatchFileSystem | undefined = this._options.watchFs
  ): Promise<void> {
    const { typescriptPackagePath, buildFolderPath, tsconfigPath, logger } = this._options;
    if (abortSignal.aborted) {
      return;
    }
    this._abortSignal = abortSignal;
    this._watchFs = watchFs;
    const previousDependencies: Map<string, IFileSystemDependency> = new Map(this._dependencies);
    let api: API | undefined = this._api;
    let succeeded: boolean = false;
    try {
      const notifications: FileNotifications = { changed: [], created: [], deleted: [] };
      // Native snapshots can reuse inputs without calling the host again. Retain and rearm
      // those dependencies, and explicitly invalidate changed inputs in the next snapshot.
      for (const [filePath, dependency] of this._dependencies) {
        const state: string = this._getState(filePath, dependency.directory);
        if (state !== dependency.state) {
          const changes: NonNullable<FileNotifications['changed']> = !state
            ? notifications.deleted!
            : !dependency.state
              ? notifications.created!
              : notifications.changed!;
          changes.push(filePath);
          if (dependency.directory && dependency.entries) {
            // A changed directory alone does not invalidate cached child module lookups in the beta.
            const entries: readonly string[] | undefined = this._getDirectoryEntries(filePath);
            if (entries) {
              const previousEntries: Set<string> = new Set(dependency.entries);
              const currentEntries: Set<string> = new Set(entries);
              for (const entry of currentEntries) {
                if (!previousEntries.has(entry)) {
                  notifications.created!.push(path.join(filePath, entry));
                }
              }
              for (const entry of previousEntries) {
                if (!currentEntries.has(entry)) {
                  notifications.deleted!.push(path.join(filePath, entry));
                }
              }
            }
          }
        }
        this._track(filePath, dependency.directory);
      }
      if (!api) {
        const { version } = JsonFile.load(path.join(typescriptPackagePath, 'package.json')) as {
          version: string;
        };
        if (!semver.valid(version) || semver.major(version) !== 7) {
          throw new Error(`The typescript7-plugin requires TypeScript 7; resolved TypeScript ${version}.`);
        }
        const resolveFromTypeScript: NodeJS.Require = createRequire(
          path.join(typescriptPackagePath, 'package.json')
        );
        this._typescript = (await importAsync(
          pathToFileURL(resolveFromTypeScript.resolve('typescript/async')).href
        )) as TypeScript7API;

        api = this._api = new this._typescript.API({
          cwd: buildFolderPath,
          fs: this._createFileSystem()
        });
      }
      const typescript: TypeScript7API = this._typescript!;
      if (watchFs && this._snapshot) {
        const previous: Snapshot = this._snapshot;
        this._snapshot = await previous.update({
          fileNotifications: notifications,
          ensurePrograms: true,
          ...(this._obsoleteProjectIds.size ? { removePrograms: [...this._obsoleteProjectIds] } : {})
        });
        this._obsoleteProjectIds.clear();
        if (this._snapshot !== previous) {
          await previous.dispose();
        }
      }
      const config: ParsedCommandLine = await api.parseConfigFile(tsconfigPath);
      if (abortSignal.aborted) {
        return;
      }
      if (config.projectReferences?.length) {
        throw new Error(
          'The typescript7-plugin does not build project references. Build referenced projects separately.'
        );
      }
      const programOptions: CreateSnapshotProgramParams = {
        rootFiles: config.fileNames,
        compilerOptions: {
          ...config.options,
          configFilePath: tsconfigPath,
          noCheck: false,
          declaration: true,
          emitDeclarationOnly: true
        },
        options: { configFileParsingDiagnostics: config.errors }
      };
      let program: Program;
      if (watchFs) {
        const previous: Snapshot | undefined = this._snapshot;
        const configuration: string = JSON.stringify(programOptions);
        const refreshAutomaticTypes: boolean =
          !!config.options.types?.includes('*') &&
          !!(notifications.created!.length || notifications.deleted!.length);
        let snapshot: Snapshot;
        if (previous) {
          if (refreshAutomaticTypes) {
            // The beta does not rediscover wildcard @types packages when reconfiguring
            // a synthetic program with unchanged options. Retain the session/snapshot
            // caches, but replace that synthetic project after structural changes.
            snapshot = await previous.update({
              createPrograms: [programOptions]
            });
          } else if (configuration !== this._programConfiguration) {
            snapshot = await previous.update({
              reconfigurePrograms: [{ id: this._projectId!, ...programOptions }]
            });
          } else {
            snapshot = previous;
          }
        } else {
          snapshot = await api.createSnapshot({
            // Explicit paths also recover inputs consumed by an aborted snapshot.
            // invalidateAll alone does not reliably reload inherited configs in the beta.
            fileNotifications: {
              ...notifications,
              changed: [...this._dependencies.keys()].filter(
                (filePath) =>
                  !notifications.created!.includes(filePath) && !notifications.deleted!.includes(filePath)
              )
            },
            createPrograms: [programOptions]
          });
        }
        this._snapshot = snapshot;
        if (!previous || refreshAutomaticTypes) {
          if (previous) {
            // Retire it on the next update, after the replacement has been created.
            this._obsoleteProjectIds.add(this._projectId!);
          }
          this._projectId = snapshot.operation.createdPrograms![0].id as SyntheticProjectId;
        }
        this._programConfiguration = configuration;
        program = snapshot.getProgram(this._projectId!)!;
        if (previous !== snapshot) {
          await previous?.dispose();
        }
      } else {
        program = await api.createProgram(
          config.fileNames,
          programOptions.compilerOptions,
          programOptions.options
        );
      }
      const diagnostics: Diagnostic[] = [...config.errors];
      for (const getDiagnosticsAsync of [
        () => program.getConfigFileParsingDiagnostics(),
        () => program.getProgramDiagnostics(),
        () => program.getGlobalDiagnostics(),
        () => program.getSyntacticDiagnostics(),
        () => program.getSemanticDiagnostics(),
        () => program.getDeclarationDiagnostics()
      ]) {
        if (abortSignal.aborted) {
          return;
        }
        diagnostics.push(...(await getDiagnosticsAsync()));
      }
      if (!abortSignal.aborted && !config.options.noEmit) {
        diagnostics.push(...(await program.emit()).diagnostics);
      }
      if (abortSignal.aborted) {
        return;
      }
      const reportedDiagnostics: Set<string> = new Set();
      for (const diagnostic of diagnostics) {
        const text: string = typescript.formatDiagnostics([diagnostic], api).trimEnd();
        if (!reportedDiagnostics.has(text)) {
          reportedDiagnostics.add(text);
          if (diagnostic.category === 1) {
            logger.emitError(new Error(text));
          } else if (diagnostic.category === 0) {
            logger.emitWarning(new Error(text));
          } else {
            logger.terminal.writeLine(text);
          }
        }
      }
      succeeded = true;
    } finally {
      if (!watchFs || !succeeded) {
        // Keep the API process, but discard partially updated snapshots after failures or aborts.
        // The next scheduled run starts from filesystem state rather than a poisoned program.
        if (watchFs) {
          // A rejected update may not have consumed any of the staged notifications.
          for (const [filePath, dependency] of previousDependencies) {
            this._dependencies.set(filePath, dependency);
          }
          const snapshot: Snapshot | undefined = this._snapshot;
          this._snapshot = undefined;
          this._projectId = undefined;
          this._obsoleteProjectIds.clear();
          this._programConfiguration = undefined;
          await snapshot?.dispose();
          this._programConfiguration = undefined;
        } else {
          await this.closeAsync();
        }
      }
    }
  }

  public async closeAsync(): Promise<void> {
    const api: API | undefined = this._api;
    this._api = undefined;
    this._snapshot = undefined;
    this._projectId = undefined;
    this._obsoleteProjectIds.clear();
    this._dependencies.clear();
    for (const { watcher } of this._watchers.values()) {
      watcher.close();
    }
    this._watchers.clear();
    this._outputs.clear();
    await api?.close();
  }

  private _getState(filePath: string, directory: boolean): string {
    try {
      const stats: fs.Stats = fs.statSync(filePath);
      return directory && stats.isDirectory()
        ? `directory:${stats.dev}:${stats.ino}:${fs.readdirSync(filePath).sort().join('\0')}`
        : `${stats.dev}:${stats.ino}:${stats.mode}:${stats.size}:${stats.mtimeMs}:${stats.ctimeMs}`;
    } catch (error) {
      if (!FileSystem.isNotExistError(error as Error)) {
        throw error;
      }
      return '';
    }
  }

  private _getDirectoryEntries(filePath: string): readonly string[] | undefined {
    try {
      return fs.readdirSync(filePath);
    } catch (error) {
      if (!FileSystem.isNotExistError(error as Error)) {
        throw error;
      }
      return undefined;
    }
  }

  private _track(filePath: string, directory: boolean = false): void {
    if (!this._watchFs) {
      return;
    }
    filePath = path.normalize(filePath);
    directory ||= this._dependencies.get(filePath)?.directory || false;
    this._dependencies.set(filePath, {
      directory,
      state: this._getState(filePath, directory),
      entries: directory ? this._getDirectoryEntries(filePath) : undefined
    });
    const requestRun: (() => void) | undefined = this._options.requestRun;
    if (requestRun) {
      // The beta snapshot API exposes host reads, not native watch registrations.
      // Watch only those directories, nonrecursively; file probes watch one entry in
      // the nearest existing parent so missing imports and directories can appear.
      let watchedPath: string = directory ? filePath : path.dirname(filePath);
      let name: string | undefined = directory ? undefined : path.basename(filePath);
      while (!fs.existsSync(watchedPath)) {
        name = path.basename(watchedPath);
        const parent: string = path.dirname(watchedPath);
        if (parent === watchedPath) {
          return;
        }
        watchedPath = parent;
      }
      const stats: fs.Stats = fs.statSync(watchedPath);
      const identity: string = `${stats.dev}:${stats.ino}`;
      let subscription: IWatchSubscription | undefined = this._watchers.get(watchedPath);
      if (subscription && subscription.identity !== identity) {
        subscription.watcher.close();
        subscription = undefined;
      }
      if (!subscription) {
        const names: Set<string> = new Set();
        const watcher: fs.FSWatcher = fs.watch(watchedPath, { recursive: false }, (event, fileName) => {
          const current: IWatchSubscription | undefined = this._watchers.get(watchedPath);
          const changedPath: string | undefined = fileName ? path.join(watchedPath, fileName) : undefined;
          if (changedPath && this._outputs.has(changedPath)) {
            return;
          }
          if (!fileName || current?.all || current?.names.has(fileName)) {
            requestRun();
          }
        });
        watcher.on('error', () => {
          watcher.close();
          if (this._watchers.get(watchedPath)?.watcher === watcher) {
            this._watchers.delete(watchedPath);
          }
          requestRun();
        });
        subscription = { watcher, names, all: false, identity };
        this._watchers.set(watchedPath, subscription);
      }
      if (name) {
        subscription.names.add(name);
      } else {
        subscription.all = true;
      }
      return;
    }
    if (directory) {
      try {
        this._watchFs.readdirSync(filePath);
      } catch (error) {
        if (!FileSystem.isNotExistError(error as Error)) {
          throw error;
        }
      }
    } else {
      this._watchFs.getStateAndTrack(filePath);
    }
  }

  private _createFileSystem(): FileSystemCallbacks {
    const stat = (filePath: string): fs.Stats | undefined => {
      this._track(filePath);
      try {
        return fs.statSync(filePath);
      } catch (error) {
        if (!FileSystem.isNotExistError(error as Error)) {
          throw error;
        }
        return undefined;
      }
    };
    return {
      fileExists: (filePath) => !!stat(filePath)?.isFile(),
      directoryExists: (filePath) => !!stat(filePath)?.isDirectory(),
      stat,
      readFile: (filePath) => {
        // IWatchFileSystem has no readFile: track the read, including a missing file, before opening it.
        this._track(filePath);
        try {
          return fs.readFileSync(filePath, 'utf8');
        } catch (error) {
          if (!FileSystem.isNotExistError(error as Error)) {
            throw error;
          }
          return undefined;
        }
      },
      getAccessibleEntries: (directoryPath) => {
        const result: FileSystemEntries = { files: [], directories: [], symlinks: [] };
        let entries: fs.Dirent[];
        try {
          this._track(directoryPath, true);
          entries = fs.readdirSync(directoryPath, { withFileTypes: true });
        } catch (error) {
          if (!FileSystem.isNotExistError(error as Error)) {
            throw error;
          }
          return result;
        }
        for (const entry of entries) {
          if (entry.isSymbolicLink()) {
            result.symlinks!.push(entry.name);
          }
          const entryStat: fs.Dirent | fs.Stats | undefined = entry.isSymbolicLink()
            ? stat(path.join(directoryPath, entry.name))
            : entry;
          if (entryStat?.isFile()) {
            result.files.push(entry.name);
          } else if (entryStat?.isDirectory()) {
            result.directories.push(entry.name);
          }
        }
        return result;
      },
      realpath: (filePath) => {
        this._track(filePath);
        const realPath: string = fs.realpathSync(filePath);
        this._track(realPath);
        return realPath;
      },
      writeFile: (filePath, contents) => {
        if (this._abortSignal.aborted) {
          return;
        }
        if (!/(\.d\.[cm]?ts(\.map)?|\.tsbuildinfo)$/.test(filePath)) {
          throw new Error(
            `The typescript7-plugin cannot emit JavaScript or other non-declaration output: ${filePath}`
          );
        }
        this._outputs.add(path.normalize(filePath));
        for (let folder: string = path.dirname(filePath); !fs.existsSync(folder); folder = path.dirname(folder)) {
          this._outputs.add(folder);
        }
        FileSystem.writeFile(filePath, contents, { ensureFolderExists: true });
      },
      removeFile: (filePath) => {
        throw new Error(`Unexpected TypeScript compiler file removal: ${filePath}`);
      }
    };
  }
}
