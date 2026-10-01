// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as ts from 'typescript';

import { Async, FileSystem, PackageJsonLookup } from '@rushstack/node-core-library';

import {
  createExistenceAwareWatchFile,
  createSystemWithExistenceAwareWatchFile,
  type WatchFileFunction
} from '../existenceAwareWatchFile';

const { Created, Changed, Deleted } = ts.FileWatcherEventKind;
const { PriorityPollingInterval, UseFsEventsOnParentDirectory } = ts.WatchFileKind;

// TypeScript 3.7 and older have no `WatchFileKind`.
const TYPESCRIPT_WITHOUT_WATCH_FILE_KIND: Pick<typeof ts, 'FileWatcherEventKind'> = {
  FileWatcherEventKind: ts.FileWatcherEventKind
};

const WATCHED_FILE_PATH: string = '/project/src/b.ts';
const POLLING_INTERVAL: number = 250;
const WATCH_OPTIONS: ts.WatchOptions = {
  watchFile: UseFsEventsOnParentDirectory,
  fallbackPolling: ts.PollingWatchKind.DynamicPriority
};

interface IBaseWatcher {
  callback: ts.FileWatcherCallback;
  pollingInterval: number | undefined;
  options: ts.WatchOptions | undefined;
  closed: boolean;
}

interface IFakeSystem {
  files: Set<string>;
  watchers: IBaseWatcher[];
  system: Pick<ts.System, 'fileExists' | 'watchFile'>;
}

function createFakeSystem(existingFilePaths: string[]): IFakeSystem {
  const files: Set<string> = new Set(existingFilePaths);
  const watchers: IBaseWatcher[] = [];
  const system: Pick<ts.System, 'fileExists' | 'watchFile'> = {
    fileExists: (filePath: string) => files.has(filePath),
    watchFile: (
      filePath: string,
      callback: ts.FileWatcherCallback,
      pollingInterval?: number,
      options?: ts.WatchOptions
    ): ts.FileWatcher => {
      const watcher: IBaseWatcher = { callback, pollingInterval, options, closed: false };
      watchers.push(watcher);
      return {
        close: () => {
          watcher.closed = true;
        }
      };
    }
  };
  return { files, watchers, system };
}

function watchAndRecordKinds(
  fakeSystem: IFakeSystem
): [baseWatcher: IBaseWatcher, reportedKinds: ts.FileWatcherEventKind[], watcher: ts.FileWatcher] {
  const watchFile: WatchFileFunction = createExistenceAwareWatchFile(ts, fakeSystem.system)!;
  const reportedKinds: ts.FileWatcherEventKind[] = [];
  const watcher: ts.FileWatcher = watchFile(
    WATCHED_FILE_PATH,
    (fileName: string, eventKind: ts.FileWatcherEventKind) => {
      reportedKinds.push(eventKind);
    },
    POLLING_INTERVAL,
    WATCH_OPTIONS
  );
  const [baseWatcher] = fakeSystem.watchers;
  expect(baseWatcher.options).toBe(WATCH_OPTIONS);
  return [baseWatcher, reportedKinds, watcher];
}

function getOpenPollingWatchers(fakeSystem: IFakeSystem): IBaseWatcher[] {
  return fakeSystem.watchers.filter(
    (watcher: IBaseWatcher) => !watcher.closed && watcher.options?.watchFile === PriorityPollingInterval
  );
}

describe(createExistenceAwareWatchFile.name, () => {
  it('returns undefined if the system cannot watch files', () => {
    expect(createExistenceAwareWatchFile(ts, { fileExists: () => true })).toBeUndefined();
    expect(
      createExistenceAwareWatchFile(TYPESCRIPT_WITHOUT_WATCH_FILE_KIND, { fileExists: () => true })
    ).toBeUndefined();
  });

  it("returns the system's own watchFile if TypeScript has no WatchFileKind", () => {
    const fakeSystem: IFakeSystem = createFakeSystem([]);
    expect(createExistenceAwareWatchFile(TYPESCRIPT_WITHOUT_WATCH_FILE_KIND, fakeSystem.system)).toBe(
      fakeSystem.system.watchFile
    );
  });

  it('reports "Changed" as "Created" or "Deleted" when the file appeared or disappeared since the last event', () => {
    const fakeSystem: IFakeSystem = createFakeSystem([]);
    const [baseWatcher, reportedKinds] = watchAndRecordKinds(fakeSystem);

    fakeSystem.files.add(WATCHED_FILE_PATH);
    baseWatcher.callback(WATCHED_FILE_PATH, Changed);
    baseWatcher.callback(WATCHED_FILE_PATH, Changed);
    fakeSystem.files.delete(WATCHED_FILE_PATH);
    baseWatcher.callback(WATCHED_FILE_PATH, Changed);
    baseWatcher.callback(WATCHED_FILE_PATH, Changed);
    fakeSystem.files.add(WATCHED_FILE_PATH);
    baseWatcher.callback(WATCHED_FILE_PATH, Changed);

    expect(reportedKinds).toEqual([Created, Changed, Deleted, Changed, Created]);
  });

  it('passes "Created" and "Deleted" through, and counts them as the latest state', () => {
    const fakeSystem: IFakeSystem = createFakeSystem([WATCHED_FILE_PATH]);
    const [baseWatcher, reportedKinds] = watchAndRecordKinds(fakeSystem);

    fakeSystem.files.delete(WATCHED_FILE_PATH);
    baseWatcher.callback(WATCHED_FILE_PATH, Deleted);
    baseWatcher.callback(WATCHED_FILE_PATH, Changed);
    fakeSystem.files.add(WATCHED_FILE_PATH);
    baseWatcher.callback(WATCHED_FILE_PATH, Created);
    baseWatcher.callback(WATCHED_FILE_PATH, Changed);

    expect(reportedKinds).toEqual([Deleted, Changed, Created, Changed]);
  });

  it('passes the arguments through and returns a watcher that closes the base watcher', () => {
    const fakeSystem: IFakeSystem = createFakeSystem([WATCHED_FILE_PATH]);
    const watchFile: WatchFileFunction = createExistenceAwareWatchFile(ts, fakeSystem.system)!;
    const events: [string, ts.FileWatcherEventKind, Date | undefined][] = [];
    const watcher: ts.FileWatcher = watchFile(
      WATCHED_FILE_PATH,
      (fileName: string, eventKind: ts.FileWatcherEventKind, modifiedTime?: Date) => {
        events.push([fileName, eventKind, modifiedTime]);
      },
      250,
      WATCH_OPTIONS
    );

    // The file exists, so nothing polls for it.
    expect(fakeSystem.watchers).toHaveLength(1);
    const [baseWatcher] = fakeSystem.watchers;
    expect(baseWatcher.pollingInterval).toBe(250);
    expect(baseWatcher.options).toBe(WATCH_OPTIONS);

    const modifiedTime: Date = new Date(1000);
    baseWatcher.callback('/project/src/sub/../b.ts', Changed, modifiedTime);
    expect(events).toEqual([['/project/src/sub/../b.ts', Changed, modifiedTime]]);

    expect(baseWatcher.closed).toBe(false);
    watcher.close();
    expect(baseWatcher.closed).toBe(true);
  });

  it('polls for a missing file with the same polling interval, and reports "Created" once when the poll finds it', () => {
    const fakeSystem: IFakeSystem = createFakeSystem([]);
    const watchFile: WatchFileFunction = createExistenceAwareWatchFile(ts, fakeSystem.system)!;
    const events: [string, ts.FileWatcherEventKind, Date | undefined][] = [];
    watchFile(
      WATCHED_FILE_PATH,
      (fileName: string, eventKind: ts.FileWatcherEventKind, modifiedTime?: Date) => {
        events.push([fileName, eventKind, modifiedTime]);
      },
      POLLING_INTERVAL,
      WATCH_OPTIONS
    );

    expect(fakeSystem.watchers).toHaveLength(2);
    const [baseWatcher, pollingWatcher] = fakeSystem.watchers;
    expect(baseWatcher.options).toBe(WATCH_OPTIONS);
    expect(pollingWatcher.pollingInterval).toBe(POLLING_INTERVAL);
    expect(pollingWatcher.options).toEqual({ ...WATCH_OPTIONS, watchFile: PriorityPollingInterval });

    pollingWatcher.callback(WATCHED_FILE_PATH, Changed);
    expect(events).toEqual([]);

    fakeSystem.files.add(WATCHED_FILE_PATH);
    const modifiedTime: Date = new Date(2000);
    pollingWatcher.callback(WATCHED_FILE_PATH, Changed, modifiedTime);
    expect(events).toEqual([[WATCHED_FILE_PATH, Created, modifiedTime]]);
    expect(pollingWatcher.closed).toBe(true);

    // The base watcher sees the same file, which it now reports as changed.
    baseWatcher.callback(WATCHED_FILE_PATH, Changed);
    expect(events.map(([, eventKind]) => eventKind)).toEqual([Created, Changed]);
    expect(getOpenPollingWatchers(fakeSystem)).toEqual([]);

    // A late event from the closed polling watcher doesn't report the file again.
    pollingWatcher.callback(WATCHED_FILE_PATH, Created);
    expect(events).toHaveLength(2);

    // A caller that passes no polling interval or options gets TypeScript's interval for missing files.
    watchFile('/project/src/c.ts', () => {
      // Not called
    });
    expect(fakeSystem.watchers).toHaveLength(4);
    expect(fakeSystem.watchers[2].pollingInterval).toBeUndefined();
    expect(fakeSystem.watchers[3].pollingInterval).toBe(500);
    expect(fakeSystem.watchers[3].options).toEqual({ watchFile: PriorityPollingInterval });
  });

  it('polls again whenever the file goes missing, and stops polling when the watcher is closed', () => {
    const fakeSystem: IFakeSystem = createFakeSystem([WATCHED_FILE_PATH]);
    const [baseWatcher, reportedKinds, watcher] = watchAndRecordKinds(fakeSystem);
    expect(getOpenPollingWatchers(fakeSystem)).toEqual([]);

    fakeSystem.files.delete(WATCHED_FILE_PATH);
    baseWatcher.callback(WATCHED_FILE_PATH, Changed);
    baseWatcher.callback(WATCHED_FILE_PATH, Changed);
    expect(reportedKinds).toEqual([Deleted, Changed]);
    expect(getOpenPollingWatchers(fakeSystem)).toEqual([fakeSystem.watchers[1]]);

    fakeSystem.files.add(WATCHED_FILE_PATH);
    baseWatcher.callback(WATCHED_FILE_PATH, Changed);
    expect(reportedKinds).toEqual([Deleted, Changed, Created]);
    expect(getOpenPollingWatchers(fakeSystem)).toEqual([]);

    fakeSystem.files.delete(WATCHED_FILE_PATH);
    baseWatcher.callback(WATCHED_FILE_PATH, Deleted);
    expect(reportedKinds).toEqual([Deleted, Changed, Created, Deleted]);
    const pollingWatcher: IBaseWatcher = fakeSystem.watchers[2];
    expect(getOpenPollingWatchers(fakeSystem)).toEqual([pollingWatcher]);

    watcher.close();
    expect(baseWatcher.closed).toBe(true);
    expect(pollingWatcher.closed).toBe(true);

    // Events that arrive after the watcher was closed don't report the file or poll for it again.
    baseWatcher.callback(WATCHED_FILE_PATH, Changed);
    fakeSystem.files.add(WATCHED_FILE_PATH);
    pollingWatcher.callback(WATCHED_FILE_PATH, Created);
    expect(reportedKinds).toEqual([Deleted, Changed, Created, Deleted, Changed]);
    expect(fakeSystem.watchers).toHaveLength(3);
  });
});

describe(createSystemWithExistenceAwareWatchFile.name, () => {
  it("keeps the system's members and the overrides, and wraps the system's watchFile", () => {
    const fakeSystem: IFakeSystem = createFakeSystem([]);
    const readFile: (filePath: string) => string | undefined = () => undefined;
    const baseGetCurrentDirectory: () => string = () => '/';
    const getCurrentDirectory: () => string = () => '/project';
    const baseSystem: Pick<ts.System, 'fileExists' | 'watchFile' | 'readFile' | 'getCurrentDirectory'> = {
      ...fakeSystem.system,
      readFile,
      getCurrentDirectory: baseGetCurrentDirectory
    };

    const system: Pick<ts.System, 'fileExists' | 'watchFile' | 'readFile' | 'getCurrentDirectory'> =
      createSystemWithExistenceAwareWatchFile(ts, baseSystem, { getCurrentDirectory });
    expect(system).not.toBe(baseSystem);
    expect(system.fileExists).toBe(baseSystem.fileExists);
    expect(system.readFile).toBe(readFile);
    expect(system.getCurrentDirectory).toBe(getCurrentDirectory);
    expect(baseSystem.getCurrentDirectory).toBe(baseGetCurrentDirectory);
    expect(system.watchFile).not.toBe(baseSystem.watchFile);

    const reportedKinds: ts.FileWatcherEventKind[] = [];
    system.watchFile!(
      WATCHED_FILE_PATH,
      (fileName: string, eventKind: ts.FileWatcherEventKind) => {
        reportedKinds.push(eventKind);
      },
      POLLING_INTERVAL,
      WATCH_OPTIONS
    );
    // The file is missing, so the system's watchFile was called for the watcher and for a poll.
    expect(fakeSystem.watchers).toHaveLength(2);
    expect(getOpenPollingWatchers(fakeSystem)).toHaveLength(1);

    const [baseWatcher] = fakeSystem.watchers;
    fakeSystem.files.add(WATCHED_FILE_PATH);
    baseWatcher.callback(WATCHED_FILE_PATH, Changed);
    expect(reportedKinds).toEqual([Created]);
    expect(getOpenPollingWatchers(fakeSystem)).toHaveLength(0);
  });

  it("keeps the system's own watchFile if TypeScript has no WatchFileKind", () => {
    const fakeSystem: IFakeSystem = createFakeSystem([]);
    const getCurrentDirectory: () => string = () => '/project';
    const system: Pick<ts.System, 'fileExists' | 'watchFile' | 'getCurrentDirectory'> =
      createSystemWithExistenceAwareWatchFile(
        TYPESCRIPT_WITHOUT_WATCH_FILE_KIND,
        { ...fakeSystem.system, getCurrentDirectory: () => '/' },
        { getCurrentDirectory }
      );
    expect(system.watchFile).toBe(fakeSystem.system.watchFile);
    expect(system.getCurrentDirectory).toBe(getCurrentDirectory);
  });

  it('has no watchFile if the system cannot watch files', () => {
    const system: Pick<ts.System, 'fileExists' | 'watchFile'> = createSystemWithExistenceAwareWatchFile(
      ts,
      { fileExists: () => true },
      {}
    );
    expect(system.watchFile).toBeUndefined();
  });
});

describe('A TypeScript watch program that uses useFsEventsOnParentDirectory', () => {
  const projectFolderPath: string = PackageJsonLookup.instance.tryGetPackageFolderFor(__dirname)!;

  async function expectRecompiledAfterMissingAsync(
    caseName: string,
    deleteAsync: (bFilePath: string, bFolderPath: string) => Promise<void>
  ): Promise<void> {
    const testFolderPath: string = `${projectFolderPath}/temp/test/existenceAwareWatchFile/${caseName}`;
    const aFilePath: string = `${testFolderPath}/src/a.ts`;
    const bFolderPath: string = `${testFolderPath}/src/sub`;
    const bFilePath: string = `${bFolderPath}/b.ts`;
    const bDeclarationFilePath: string = `${testFolderPath}/lib/sub/b.d.ts`;

    await FileSystem.ensureEmptyFolderAsync(testFolderPath);
    await FileSystem.writeFileAsync(aFilePath, 'export const a: number = 1;\n', { ensureFolderExists: true });
    await FileSystem.writeFileAsync(bFilePath, 'export const b: number = 1;\n', { ensureFolderExists: true });

    // Like heft, run the program updates that TypeScript schedules only when asked to.
    const pendingWork: Set<() => void> = new Set();
    const system: ts.System = createSystemWithExistenceAwareWatchFile(ts, ts.sys, {
      setTimeout: (callback: (...args: unknown[]) => void, ms: number, ...args: unknown[]): (() => void) => {
        const work: () => void = () => callback(...args);
        pendingWork.add(work);
        return work;
      },
      clearTimeout: (work: () => void): void => {
        pendingWork.delete(work);
      }
    });

    const diagnosticCodes: number[] = [];
    const host: ts.WatchCompilerHostOfFilesAndCompilerOptions<ts.EmitAndSemanticDiagnosticsBuilderProgram> =
      ts.createWatchCompilerHost(
        [aFilePath, bFilePath],
        {
          declaration: true,
          lib: ['lib.es2019.d.ts'],
          module: ts.ModuleKind.CommonJS,
          outDir: `${testFolderPath}/lib`,
          rootDir: `${testFolderPath}/src`,
          skipLibCheck: true,
          target: ts.ScriptTarget.ES2019,
          types: []
        },
        system,
        ts.createEmitAndSemanticDiagnosticsBuilderProgram,
        (diagnostic: ts.Diagnostic) => {
          diagnosticCodes.push(diagnostic.code);
        },
        () => {
          // Ignore the watch status messages
        },
        undefined,
        { watchFile: ts.WatchFileKind.UseFsEventsOnParentDirectory }
      );

    async function runNextProgramUpdateAsync(): Promise<void> {
      const deadline: number = Date.now() + 10000;
      while (pendingWork.size === 0) {
        if (Date.now() > deadline) {
          throw new Error('TypeScript did not schedule a program update.');
        }

        await Async.sleepAsync(20);
      }

      diagnosticCodes.length = 0;
      for (const work of pendingWork) {
        pendingWork.delete(work);
        work();
      }
    }

    const watchProgram: ts.WatchOfFilesAndCompilerOptions<ts.EmitAndSemanticDiagnosticsBuilderProgram> =
      ts.createWatchProgram(host);
    try {
      expect(diagnosticCodes).toEqual([]);

      await deleteAsync(bFilePath, bFolderPath);
      await runNextProgramUpdateAsync();
      // error TS6053: File '.../b.ts' not found.
      expect(diagnosticCodes).toEqual([6053]);

      await FileSystem.writeFileAsync(
        bFilePath,
        'export const b: number = 2;\nexport const b2: number = 3;\n',
        { ensureFolderExists: true }
      );
      await runNextProgramUpdateAsync();
      expect(diagnosticCodes).toEqual([]);
      expect(await FileSystem.readFileAsync(bDeclarationFilePath)).toContain('b2');
    } finally {
      watchProgram.close();
    }
  }

  it('compiles a root file again after it was missing during a program update', async () => {
    await expectRecompiledAfterMissingAsync('file', async (bFilePath: string) => {
      await FileSystem.deleteFileAsync(bFilePath);
    });
  }, 30000);

  it('compiles a root file again after its folder was missing during a program update', async () => {
    await expectRecompiledAfterMissingAsync('folder', async (bFilePath: string, bFolderPath: string) => {
      await FileSystem.deleteFolderAsync(bFolderPath);
    });
  }, 30000);
});
