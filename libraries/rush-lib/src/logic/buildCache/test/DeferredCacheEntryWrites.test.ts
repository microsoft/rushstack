// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { StringBufferTerminalProvider, Terminal, type ITerminal } from '@rushstack/terminal';

import {
  DEFERRED_CACHE_ENTRY_STAGING_FOLDER_NAME,
  DeferredCacheEntryWrites,
  getSecondsForUtimes,
  type IDeferredCacheEntryWrite,
  type IDeferredCacheEntryWritesOptions,
  type ISealedOutputs
} from '../DeferredCacheEntryWrites';

const PID: number = 4242;
const OUTPUT_PATHS: string[] = ['lib/index.js', 'lib/nested/a.js'];
const MODIFICATION_TIME: Date = new Date('2020-02-03T04:05:06.000Z');
// More output files than are cloned at once
const MANY_OUTPUT_PATHS: string[] = [
  ...OUTPUT_PATHS,
  ...Array.from(new Array(18).keys(), (index: number) => `lib/many/${index}.js`)
];
// How long a test waits for a seal that should end at once
const SEAL_TIMEOUT_MS: number = 2000;
// Longer than a tick of the clocks that coarse timestamps come from
const CLOCK_TICK_MS: number = 50;
const NANOSECONDS_PER_SECOND: bigint = BigInt(1000 * 1000 * 1000);

async function copyFileAsync(sourcePath: string, destinationPath: string): Promise<void> {
  await fs.promises.copyFile(sourcePath, destinationPath);
}

async function delayAsync(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

/** Resolves to what the promise resolves to, or to 'timed out' if that takes longer than SEAL_TIMEOUT_MS. */
async function withTimeoutAsync<T>(promise: Promise<T>): Promise<T | 'timed out'> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<'timed out'>((resolve) => {
        timeout = setTimeout(() => resolve('timed out'), SEAL_TIMEOUT_MS);
      })
    ]);
  } finally {
    clearTimeout(timeout);
  }
}

interface IGatedClones {
  /** Copies the file once its clone is released */
  readonly cloneFileAsync: (sourcePath: string, destinationPath: string) => Promise<void>;
  /** The source paths of the clones that started */
  readonly startedPaths: string[];
  /** Releases the clones of the given files, or of all files if none are given, including clones that start later */
  readonly release: (...sourcePaths: string[]) => void;
  /** Resolves when at least the given number of clones have started */
  readonly whenStartedAsync: (count: number) => Promise<void>;
}

function createGatedClones(): IGatedClones {
  const gates: Map<string, { opened: Promise<void>; open: () => void }> = new Map();
  let isReleased: boolean = false;
  const startListeners: (() => void)[] = [];
  const getGate = (sourcePath: string): { opened: Promise<void>; open: () => void } => {
    let gate: { opened: Promise<void>; open: () => void } | undefined = gates.get(sourcePath);
    if (!gate) {
      let open!: () => void;
      const opened: Promise<void> = new Promise((resolve) => (open = resolve));
      gate = { opened, open };
      gates.set(sourcePath, gate);
    }
    return gate;
  };
  const clones: IGatedClones = {
    startedPaths: [],
    cloneFileAsync: async (sourcePath: string, destinationPath: string) => {
      clones.startedPaths.push(sourcePath);
      for (const listener of startListeners.splice(0)) {
        listener();
      }
      if (!isReleased) {
        await getGate(sourcePath).opened;
      }
      await fs.promises.copyFile(sourcePath, destinationPath);
    },
    release: (...sourcePaths: string[]) => {
      if (sourcePaths.length === 0) {
        isReleased = true;
      }
      for (const sourcePath of sourcePaths.length ? sourcePaths : Array.from(gates.keys())) {
        getGate(sourcePath).open();
      }
    },
    whenStartedAsync: async (count: number) => {
      while (clones.startedPaths.length < count) {
        await new Promise<void>((resolve) => startListeners.push(resolve));
      }
    }
  };
  return clones;
}

function canCloneFilesIn(folderPath: string): boolean {
  const probeFolderPath: string = fs.mkdtempSync(path.join(folderPath, 'deferred-cache-entry-clone-probe-'));
  try {
    fs.writeFileSync(path.join(probeFolderPath, 'source'), 'probe');
    fs.copyFileSync(
      path.join(probeFolderPath, 'source'),
      path.join(probeFolderPath, 'clone'),
      fs.constants.COPYFILE_FICLONE_FORCE
    );
    return true;
  } catch {
    return false;
  } finally {
    fs.rmSync(probeFolderPath, { recursive: true, force: true });
  }
}

interface IControlledWrite {
  readonly write: IDeferredCacheEntryWrite;
  readonly finish: (byteCount: number | undefined) => void;
  /** Resolves when the write starts */
  readonly whenStarted: Promise<void>;
  started: boolean;
  signal: AbortSignal | undefined;
}

/** A write that runs until `finish` is called, or until it is aborted, as tar is. */
function createControlledWrite(cacheId: string, sealedOutputs: ISealedOutputs): IControlledWrite {
  let finish!: (byteCount: number | undefined) => void;
  const finished: Promise<number | undefined> = new Promise((resolve) => (finish = resolve));
  let start!: () => void;
  const controlled: IControlledWrite = {
    finish,
    whenStarted: new Promise((resolve) => (start = resolve)),
    started: false,
    signal: undefined,
    write: {
      cacheId,
      operationName: `${cacheId} (build)`,
      sealedOutputs,
      writeAsync: async (terminal: ITerminal, abortSignal: AbortSignal) => {
        controlled.started = true;
        controlled.signal = abortSignal;
        start();
        abortSignal.addEventListener('abort', () => finish(undefined), { once: true });
        return await finished;
      }
    }
  };
  return controlled;
}

describe(DeferredCacheEntryWrites.name, () => {
  let folderPath: string;
  let commonTempFolder: string;
  let projectFolder: string;
  let terminalProvider: StringBufferTerminalProvider;
  let terminal: Terminal;
  let logLines: string[];

  function writeOutputFile(relativePath: string, contents: string): void {
    const filePath: string = path.join(projectFolder, relativePath);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, contents);
    fs.utimesSync(filePath, MODIFICATION_TIME, MODIFICATION_TIME);
  }

  function getOutputPath(relativePath: string): string {
    return path.join(projectFolder, relativePath);
  }

  function getProcessFolderPath(pid: number = PID): string {
    return path.join(commonTempFolder, DEFERRED_CACHE_ENTRY_STAGING_FOLDER_NAME, `${pid}`);
  }

  function createSubject(options: IDeferredCacheEntryWritesOptions = {}): DeferredCacheEntryWrites {
    const subject: DeferredCacheEntryWrites = new DeferredCacheEntryWrites({
      cloneFileAsync: copyFileAsync,
      isProcessRunning: () => false,
      pid: PID,
      // Unless a test says otherwise, the files are cloned before the seal resolves, however slow the machine is.
      sealWaitMs: 60 * 1000,
      ...options
    });
    subject.setLog((line: string) => logLines.push(line));
    return subject;
  }

  async function sealAsync(
    subject: DeferredCacheEntryWrites,
    relativePaths: string[] = OUTPUT_PATHS
  ): Promise<ISealedOutputs | undefined> {
    return await subject.trySealAsync({
      commonTempFolder,
      sourceFolderPath: projectFolder,
      relativePaths,
      terminal
    });
  }

  beforeEach(() => {
    folderPath = fs.mkdtempSync(path.join(os.tmpdir(), 'deferred-cache-entry-writes-'));
    commonTempFolder = path.join(folderPath, 'common', 'temp');
    projectFolder = path.join(folderPath, 'project');
    fs.mkdirSync(commonTempFolder, { recursive: true });
    writeOutputFile('lib/index.js', 'index contents');
    writeOutputFile('lib/nested/a.js', 'a');
    fs.chmodSync(path.join(projectFolder, 'lib/index.js'), 0o755);
    terminalProvider = new StringBufferTerminalProvider();
    terminal = new Terminal(terminalProvider);
    logLines = [];
  });

  afterEach(() => {
    fs.rmSync(folderPath, { recursive: true, force: true });
  });

  describe('trySealAsync', () => {
    it('copies the output files with their contents, modes and modification times', async () => {
      const sealedOutputs: ISealedOutputs | undefined = await sealAsync(createSubject());

      expect(sealedOutputs).toEqual({
        folderPath: path.join(getProcessFolderPath(), '0'),
        fileCount: 2,
        byteCount: 'index contents'.length + 'a'.length
      });
      for (const relativePath of OUTPUT_PATHS) {
        const source: fs.Stats = fs.statSync(path.join(projectFolder, relativePath));
        const sealedPath: string = path.join(sealedOutputs!.folderPath, relativePath);
        const sealed: fs.Stats = fs.statSync(sealedPath);
        expect(fs.readFileSync(sealedPath, 'utf8')).toBe(
          fs.readFileSync(path.join(projectFolder, relativePath), 'utf8')
        );
        expect(sealed.mode).toBe(source.mode);
        expect(sealed.mtimeMs).toBe(MODIFICATION_TIME.getTime());
      }
      expect(terminalProvider.getAllOutput(true)).toEqual({});
    });

    it('keeps the whole second of a modification time in the last half millisecond of a second', async () => {
      const fractions: [string, number][] = [
        ['lib/index.js', 0.9996],
        ['lib/nested/a.js', 0.999999]
      ];
      for (const [relativePath, fraction] of fractions) {
        const seconds: number = MODIFICATION_TIME.getTime() / 1000 + fraction;
        fs.utimesSync(getOutputPath(relativePath), seconds, seconds);
        // fs.Stats rounds this time to the next second.
        expect(fs.statSync(getOutputPath(relativePath)).mtime.getTime()).toBe(
          MODIFICATION_TIME.getTime() + 1000
        );
      }

      const sealedOutputs: ISealedOutputs | undefined = await sealAsync(createSubject());

      for (const [relativePath] of fractions) {
        const sourceTimeNs: bigint = fs.statSync(getOutputPath(relativePath), { bigint: true }).mtimeNs;
        const sealedTimeNs: bigint = fs.statSync(path.join(sealedOutputs!.folderPath, relativePath), {
          bigint: true
        }).mtimeNs;
        expect(sealedTimeNs / NANOSECONDS_PER_SECOND).toBe(sourceTimeNs / NANOSECONDS_PER_SECOND);
        expect(Math.abs(Number(sourceTimeNs - sealedTimeNs))).toBeLessThan(1000 * 1000);
      }
    });

    it('keeps the sealed files when the output files change afterward', async () => {
      const sealedOutputs: ISealedOutputs | undefined = await sealAsync(createSubject());

      fs.writeFileSync(path.join(projectFolder, 'lib/index.js'), 'changed contents');
      fs.rmSync(path.join(projectFolder, 'lib/nested'), { recursive: true });

      expect(fs.readFileSync(path.join(sealedOutputs!.folderPath, 'lib/index.js'), 'utf8')).toBe(
        'index contents'
      );
      expect(fs.readFileSync(path.join(sealedOutputs!.folderPath, 'lib/nested/a.js'), 'utf8')).toBe('a');
    });

    it('seals each operation into a folder of its own', async () => {
      const subject: DeferredCacheEntryWrites = createSubject();
      const first: ISealedOutputs | undefined = await sealAsync(subject);
      const second: ISealedOutputs | undefined = await sealAsync(subject, ['lib/nested/a.js']);

      expect(second!.folderPath).toBe(path.join(getProcessFolderPath(), '1'));
      expect(fs.readdirSync(getProcessFolderPath()).sort()).toEqual(['0', '1']);
      expect(fs.existsSync(path.join(first!.folderPath, 'lib/index.js'))).toBe(true);
      expect(fs.existsSync(path.join(second!.folderPath, 'lib/index.js'))).toBe(false);
    });

    (canCloneFilesIn(os.tmpdir()) ? it : it.skip)(
      'clones the output files where the file system can clone files',
      async () => {
        const subject: DeferredCacheEntryWrites = new DeferredCacheEntryWrites({ pid: PID });
        const sealedOutputs: ISealedOutputs | undefined = await sealAsync(subject);

        expect(sealedOutputs?.fileCount).toBe(2);
        expect(fs.readFileSync(path.join(sealedOutputs!.folderPath, 'lib/index.js'), 'utf8')).toBe(
          'index contents'
        );
        expect(fs.statSync(path.join(sealedOutputs!.folderPath, 'lib/index.js')).mode).toBe(
          fs.statSync(path.join(projectFolder, 'lib/index.js')).mode
        );
      }
    );

    it('stops sealing once the file system refuses to clone files', async () => {
      const cloneFileAsync: jest.Mock = jest
        .fn()
        .mockRejectedValue(Object.assign(new Error('operation not supported'), { code: 'EOPNOTSUPP' }));
      const subject: DeferredCacheEntryWrites = createSubject({ cloneFileAsync });

      expect(await sealAsync(subject)).toBeUndefined();
      expect(fs.readdirSync(getProcessFolderPath())).toEqual([]);
      expect(terminalProvider.getOutput()).toContain(
        'Unable to clone the output files (EOPNOTSUPP), so the build cache entry is written now.'
      );
      const cloneCount: number = cloneFileAsync.mock.calls.length;
      expect(cloneCount).toBeGreaterThan(0);

      expect(await sealAsync(subject)).toBeUndefined();
      expect(cloneFileAsync).toHaveBeenCalledTimes(cloneCount);
      expect(terminalProvider.getVerboseOutput()).toContain(
        "The output files can't be cloned (EOPNOTSUPP), so the build cache entry is written now."
      );
    });

    it('seals again after an error that does not mean that files cannot be cloned', async () => {
      const subject: DeferredCacheEntryWrites = createSubject();

      expect(await sealAsync(subject, [...OUTPUT_PATHS, 'lib/missing.js'])).toBeUndefined();
      expect(fs.readdirSync(getProcessFolderPath())).toEqual([]);
      expect(terminalProvider.getOutput()).toContain('Unable to clone the output files (ENOENT)');

      expect(await sealAsync(subject)).toMatchObject({ fileCount: 2 });
    });

    it('does not seal a path that is not a file', async () => {
      const subject: DeferredCacheEntryWrites = createSubject();

      expect(await sealAsync(subject, ['lib/nested'])).toBeUndefined();
      expect(fs.readdirSync(getProcessFolderPath())).toEqual([]);
      expect(terminalProvider.getOutput()).toContain(
        'Unable to clone the output files ("lib/nested" is not a file)'
      );
    });

    it('does not seal a symbolic link', async () => {
      // A clone would copy the target of the link, not the link.
      fs.symlinkSync('index.js', getOutputPath('lib/link.js'));
      const subject: DeferredCacheEntryWrites = createSubject();

      expect(await sealAsync(subject, [...OUTPUT_PATHS, 'lib/link.js'])).toBeUndefined();
      expect(fs.readdirSync(getProcessFolderPath())).toEqual([]);
      expect(terminalProvider.getOutput()).toContain(
        'Unable to clone the output files ("lib/link.js" is not a file)'
      );
    });

    it('deletes the staging folders of processes that are not running', async () => {
      const stagingFolderPath: string = path.join(commonTempFolder, DEFERRED_CACHE_ENTRY_STAGING_FOLDER_NAME);
      for (const name of [`${PID}`, '1111', '2222', 'other']) {
        fs.mkdirSync(path.join(stagingFolderPath, name, '0'), { recursive: true });
        fs.writeFileSync(path.join(stagingFolderPath, name, '0', 'left-behind.js'), '');
      }
      const isProcessRunning: jest.Mock = jest.fn((pid: number) => pid === 2222);

      const sealedOutputs: ISealedOutputs | undefined = await sealAsync(createSubject({ isProcessRunning }));

      expect(fs.readdirSync(stagingFolderPath).sort()).toEqual(['2222', `${PID}`, 'other'].sort());
      expect(fs.readdirSync(path.join(sealedOutputs!.folderPath))).toEqual(['lib']);
      expect(fs.readdirSync(getProcessFolderPath())).toEqual(['0']);
      expect(isProcessRunning.mock.calls.map(([pid]) => pid).sort()).toEqual([1111, 2222]);
    });
  });

  describe('with clones that take longer than the wait', () => {
    function writeManyOutputFiles(): void {
      for (const relativePath of MANY_OUTPUT_PATHS.slice(OUTPUT_PATHS.length)) {
        writeOutputFile(relativePath, 'many');
      }
    }

    /** Seals the files in the background, and queues the write of their entry. */
    async function sealInBackgroundAsync(
      subject: DeferredCacheEntryWrites,
      relativePaths: string[] = OUTPUT_PATHS
    ): Promise<IControlledWrite> {
      const sealedOutputs: ISealedOutputs | undefined | 'timed out' = await withTimeoutAsync(
        sealAsync(subject, relativePaths)
      );
      expect(sealedOutputs).toEqual({
        folderPath: path.join(getProcessFolderPath(), '0'),
        fileCount: relativePaths.length,
        byteCount: expect.any(Number),
        isSealing: true
      });
      const write: IControlledWrite = createControlledWrite('a', sealedOutputs as ISealedOutputs);
      subject.enqueue(write.write);
      return write;
    }

    it('waits for clones that finish within the wait, as without it', async () => {
      const clones: IGatedClones = createGatedClones();
      const subject: DeferredCacheEntryWrites = createSubject({ cloneFileAsync: clones.cloneFileAsync });

      const sealing: Promise<ISealedOutputs | undefined> = sealAsync(subject);
      await clones.whenStartedAsync(OUTPUT_PATHS.length);
      clones.release();
      const sealedOutputs: ISealedOutputs | undefined = await sealing;

      expect(sealedOutputs).toEqual({
        folderPath: path.join(getProcessFolderPath(), '0'),
        fileCount: 2,
        byteCount: 'index contents'.length + 'a'.length
      });
      const write: IControlledWrite = createControlledWrite('a', sealedOutputs!);
      subject.enqueue(write.write);
      expect(write.started).toBe(true);
      write.finish(1);
      await subject.waitForIdleAsync();
      expect(logLines).toEqual([expect.stringMatching(/^Wrote the build cache entry a /)]);
    });

    it('resolves first, and writes the entry once the files are cloned', async () => {
      const clones: IGatedClones = createGatedClones();
      const subject: DeferredCacheEntryWrites = createSubject({
        cloneFileAsync: clones.cloneFileAsync,
        sealWaitMs: 0
      });

      const write: IControlledWrite = await sealInBackgroundAsync(subject);

      expect(write.write.sealedOutputs.byteCount).toBe('index contents'.length + 'a'.length);
      expect(write.started).toBe(false);
      expect(subject.takeReport()).toMatchObject({ queuedCount: 1, pendingCount: 1 });
      expect(subject.hasPendingWrite('a')).toBe(true);
      clones.release();
      await write.whenStarted;
      expect(fs.readFileSync(path.join(getProcessFolderPath(), '0', 'lib/index.js'), 'utf8')).toBe(
        'index contents'
      );
      write.finish(1);
      await subject.waitForIdleAsync();

      expect(subject.takeReport()).toMatchObject({ writtenCount: 1, failedCount: 0, pendingCount: 0 });
      expect(subject.hasPendingWrite('a')).toBe(false);
      expect(logLines.map((line: string) => line.replace(/ in \d+ ms\.$/, ' in N ms.'))).toEqual([
        'Sealed the output files of a (build) in the background in N ms.',
        'Wrote the build cache entry a (0.0 MB) for a (build) in N ms.'
      ]);
      expect(fs.readdirSync(getProcessFolderPath())).toEqual([]);
    });

    it('drops the entry if an output file changes before it is cloned, even if only its change time does', async () => {
      writeManyOutputFiles();
      const clones: IGatedClones = createGatedClones();
      const subject: DeferredCacheEntryWrites = createSubject({
        cloneFileAsync: clones.cloneFileAsync,
        sealWaitMs: 0
      });
      const write: IControlledWrite = await sealInBackgroundAsync(subject, MANY_OUTPUT_PATHS);

      // The last file is cloned once the first clones are released. It keeps its size and modification time.
      await delayAsync(CLOCK_TICK_MS);
      writeOutputFile('lib/many/17.js', 'MANY');
      clones.release();
      await withTimeoutAsync(subject.waitForIdleAsync());

      expect(write.started).toBe(false);
      expect(logLines).toEqual([
        'Dropped the build cache entry a for a (build), because lib/many/17.js changed before it was sealed.'
      ]);
      expect(subject.takeReport()).toEqual({
        queuedCount: 1,
        writtenCount: 0,
        writtenByteCount: 0,
        failedCount: 0,
        droppedCount: 1,
        pendingCount: 0
      });
      expect(subject.hasPendingWrite('a')).toBe(false);
      expect(fs.readdirSync(getProcessFolderPath())).toEqual([]);
    });

    it('drops the entry if an output file is deleted before it is cloned', async () => {
      writeManyOutputFiles();
      const clones: IGatedClones = createGatedClones();
      const subject: DeferredCacheEntryWrites = createSubject({
        cloneFileAsync: clones.cloneFileAsync,
        sealWaitMs: 0
      });
      const write: IControlledWrite = await sealInBackgroundAsync(subject, MANY_OUTPUT_PATHS);

      fs.rmSync(getOutputPath('lib/many/17.js'));
      clones.release();
      await withTimeoutAsync(subject.waitForIdleAsync());

      expect(write.started).toBe(false);
      expect(logLines).toEqual([
        'Dropped the build cache entry a for a (build), because lib/many/17.js changed before it was sealed.'
      ]);
      expect(subject.takeReport()).toMatchObject({ failedCount: 0, droppedCount: 1, pendingCount: 0 });
      expect(fs.readdirSync(getProcessFolderPath())).toEqual([]);
    });

    it('writes the entry if an output file changes after it is cloned', async () => {
      const clones: IGatedClones = createGatedClones();
      const subject: DeferredCacheEntryWrites = createSubject({
        cloneFileAsync: clones.cloneFileAsync,
        sealWaitMs: 0
      });
      const write: IControlledWrite = await sealInBackgroundAsync(subject);

      clones.release(getOutputPath('lib/index.js'));
      // The modification time of a clone is set after the clone is checked.
      const sealedPath: string = path.join(getProcessFolderPath(), '0', 'lib/index.js');
      while (!fs.existsSync(sealedPath) || fs.statSync(sealedPath).mtimeMs !== MODIFICATION_TIME.getTime()) {
        await delayAsync(1);
      }
      await delayAsync(CLOCK_TICK_MS);
      writeOutputFile('lib/index.js', 'INDEX CONTENTS');
      clones.release();
      await write.whenStarted;

      expect(fs.readFileSync(sealedPath, 'utf8')).toBe('index contents');
      write.finish(1);
      await subject.waitForIdleAsync();
      expect(subject.takeReport()).toMatchObject({ writtenCount: 1, droppedCount: 0, pendingCount: 0 });
    });

    /** Seals the files in the background with a first clone that fails with the given code. */
    async function failCloneAsync(code: string): Promise<[DeferredCacheEntryWrites, IGatedClones]> {
      const clones: IGatedClones = createGatedClones();
      let hasFailed: boolean = false;
      const cloneFileAsync = async (sourcePath: string, destinationPath: string): Promise<void> => {
        await clones.cloneFileAsync(sourcePath, destinationPath);
        if (!hasFailed && sourcePath === getOutputPath('lib/index.js')) {
          hasFailed = true;
          throw Object.assign(new Error('The clone failed.'), { code });
        }
      };
      const subject: DeferredCacheEntryWrites = createSubject({ cloneFileAsync, sealWaitMs: 0 });
      const write: IControlledWrite = await sealInBackgroundAsync(subject);

      clones.release();
      await withTimeoutAsync(subject.waitForIdleAsync());

      expect(write.started).toBe(false);
      expect(logLines).toEqual([
        `Failed to write the build cache entry a for a (build): Unable to clone the output files (${code}).`
      ]);
      expect(subject.takeReport()).toMatchObject({ failedCount: 1, droppedCount: 0, pendingCount: 0 });
      expect(fs.readdirSync(getProcessFolderPath())).toEqual([]);
      return [subject, clones];
    }

    it('reports a clone that fails as a failed write, and seals the next outputs', async () => {
      const [subject]: [DeferredCacheEntryWrites, IGatedClones] = await failCloneAsync('EIO');

      expect(await withTimeoutAsync(sealAsync(subject))).toMatchObject({ fileCount: 2 });
      await subject.abortAsync();
    });

    it('stops sealing once a clone in the background is refused', async () => {
      const [subject, clones]: [DeferredCacheEntryWrites, IGatedClones] = await failCloneAsync('EOPNOTSUPP');

      expect(await sealAsync(subject)).toBeUndefined();
      expect(clones.startedPaths).toHaveLength(2);
      expect(terminalProvider.getVerboseOutput()).toContain(
        "The output files can't be cloned (EOPNOTSUPP), so the build cache entry is written now."
      );
    });

    it('is stopped by abortAsync, which waits for the clones that are running', async () => {
      writeManyOutputFiles();
      const clones: IGatedClones = createGatedClones();
      const subject: DeferredCacheEntryWrites = createSubject({
        cloneFileAsync: clones.cloneFileAsync,
        sealWaitMs: 0
      });
      const write: IControlledWrite = await sealInBackgroundAsync(subject, MANY_OUTPUT_PATHS);
      await clones.whenStartedAsync(16);

      let isAborted: boolean = false;
      const aborting: Promise<void> = subject.abortAsync().then(() => {
        isAborted = true;
      });
      await delayAsync(CLOCK_TICK_MS);
      expect(isAborted).toBe(false);
      clones.release();
      await aborting;

      // No more files are cloned once the seal is stopped.
      expect(clones.startedPaths).toHaveLength(16);
      expect(write.started).toBe(false);
      expect(logLines).toEqual(['Dropped the build cache entry a for a (build), which was not written yet.']);
      expect(subject.takeReport()).toMatchObject({ failedCount: 0, droppedCount: 1, pendingCount: 0 });
      expect(subject.hasPendingWrite('a')).toBe(false);
      expect(fs.existsSync(getProcessFolderPath())).toBe(false);
    });
  });

  describe('enqueue', () => {
    it('writes two entries at a time, deletes their sealed files and reports them', async () => {
      const subject: DeferredCacheEntryWrites = createSubject();
      const writes: IControlledWrite[] = [];
      for (const cacheId of ['a', 'b', 'c']) {
        writes.push(createControlledWrite(cacheId, (await sealAsync(subject))!));
      }

      for (const { write } of writes) {
        subject.enqueue(write);
      }
      expect(writes.map(({ started }) => started)).toEqual([true, true, false]);
      expect(subject.takeReport()).toEqual({
        queuedCount: 3,
        writtenCount: 0,
        writtenByteCount: 0,
        failedCount: 0,
        droppedCount: 0,
        pendingCount: 3
      });

      writes[0].finish(1024 * 1024);
      await writes[2].whenStarted;
      expect(logLines).toHaveLength(1);
      writes[1].finish(512 * 1024);
      writes[2].finish(0);
      await subject.waitForIdleAsync();

      expect(subject.takeReport()).toEqual({
        queuedCount: 0,
        writtenCount: 3,
        writtenByteCount: 1.5 * 1024 * 1024,
        failedCount: 0,
        droppedCount: 0,
        pendingCount: 0
      });
      expect(subject.takeReport()).toEqual({
        queuedCount: 0,
        writtenCount: 0,
        writtenByteCount: 0,
        failedCount: 0,
        droppedCount: 0,
        pendingCount: 0
      });
      expect(fs.readdirSync(getProcessFolderPath())).toEqual([]);
      // b and c finish together, in either order.
      expect(logLines.map((line) => line.replace(/ in \d+ ms\.$/, ' in N ms.')).sort()).toEqual([
        'Wrote the build cache entry a (1.0 MB) for a (build) in N ms.',
        'Wrote the build cache entry b (0.5 MB) for b (build) in N ms.',
        'Wrote the build cache entry c (0.0 MB) for c (build) in N ms.'
      ]);
    });

    it('reports a write that fails, with its warnings and errors', async () => {
      const subject: DeferredCacheEntryWrites = createSubject();
      const sealedOutputs: ISealedOutputs[] = [(await sealAsync(subject))!, (await sealAsync(subject))!];

      subject.enqueue({
        cacheId: 'a',
        operationName: 'a (build)',
        sealedOutputs: sealedOutputs[0],
        writeAsync: async (writeTerminal: ITerminal) => {
          writeTerminal.writeLine('Not a problem.');
          writeTerminal.writeWarningLine('"tar" exited with code 2.');
          return undefined;
        }
      });
      subject.enqueue({
        cacheId: 'b',
        operationName: 'b (build)',
        sealedOutputs: sealedOutputs[1],
        writeAsync: async () => {
          throw new Error('The disk is full.');
        }
      });
      await subject.waitForIdleAsync();

      expect(subject.takeReport()).toMatchObject({ writtenCount: 0, failedCount: 2, pendingCount: 0 });
      // They fail together, in either order.
      expect(logLines.sort()).toEqual([
        'Failed to write the build cache entry a for a (build): "tar" exited with code 2.',
        'Failed to write the build cache entry b for b (build): The disk is full.'
      ]);
      expect(fs.readdirSync(getProcessFolderPath())).toEqual([]);
    });

    it('has a pending write for a cache ID until each write of it is written or fails', async () => {
      const subject: DeferredCacheEntryWrites = createSubject();
      const writes: IControlledWrite[] = [];
      for (const cacheId of ['a', 'b', 'c', 'a']) {
        writes.push(createControlledWrite(cacheId, (await sealAsync(subject))!));
      }
      const getPendingCacheIds = (): string[] =>
        ['a', 'b', 'c', 'd'].filter((cacheId: string) => subject.hasPendingWrite(cacheId));

      expect(getPendingCacheIds()).toEqual([]);
      for (const { write } of writes) {
        subject.enqueue(write);
      }
      // The first write of a and the write of b are running. The others are queued.
      expect(writes.map(({ started }) => started)).toEqual([true, true, false, false]);
      expect(getPendingCacheIds()).toEqual(['a', 'b', 'c']);
      writes[0].finish(1);
      await writes[2].whenStarted;
      expect(getPendingCacheIds()).toEqual(['a', 'b', 'c']);
      writes[1].finish(undefined);
      await writes[3].whenStarted;
      expect(getPendingCacheIds()).toEqual(['a', 'c']);
      writes[2].finish(1);
      writes[3].finish(1);
      await subject.waitForIdleAsync();

      expect(subject.takeReport()).toMatchObject({ writtenCount: 3, failedCount: 1, pendingCount: 0 });
      expect(getPendingCacheIds()).toEqual([]);
    });

    it('keeps writing when its log throws', async () => {
      const subject: DeferredCacheEntryWrites = createSubject();
      subject.setLog(() => {
        throw new Error('The log is closed.');
      });
      const write: IControlledWrite = createControlledWrite('a', (await sealAsync(subject))!);

      subject.enqueue(write.write);
      write.finish(1);
      await subject.waitForIdleAsync();

      expect(subject.takeReport()).toMatchObject({ writtenCount: 1, failedCount: 0 });
    });
  });

  describe('abortAsync', () => {
    it('drops the writes that are not finished and deletes the staging folder of the process', async () => {
      const subject: DeferredCacheEntryWrites = createSubject();
      const writes: IControlledWrite[] = [];
      for (const cacheId of ['a', 'b', 'c']) {
        writes.push(createControlledWrite(cacheId, (await sealAsync(subject))!));
      }
      for (const { write } of writes) {
        subject.enqueue(write);
      }

      await subject.abortAsync();

      expect(writes.map(({ started }) => started)).toEqual([true, true, false]);
      expect(writes.map(({ signal }) => signal?.aborted)).toEqual([true, true, undefined]);
      expect(subject.takeReport()).toEqual({
        queuedCount: 3,
        writtenCount: 0,
        writtenByteCount: 0,
        failedCount: 0,
        droppedCount: 3,
        pendingCount: 0
      });
      expect(['a', 'b', 'c'].filter((cacheId: string) => subject.hasPendingWrite(cacheId))).toEqual([]);
      expect(fs.existsSync(getProcessFolderPath())).toBe(false);
      expect(logLines.sort()).toEqual([
        'Dropped the build cache entry a for a (build), which was being written.',
        'Dropped the build cache entry b for b (build), which was being written.',
        'Dropped the build cache entry c for c (build), which was not written yet.'
      ]);
    });

    it('writes entries that are queued afterward', async () => {
      const subject: DeferredCacheEntryWrites = createSubject();
      subject.enqueue(createControlledWrite('a', (await sealAsync(subject))!).write);
      await subject.abortAsync();
      logLines.length = 0;

      const write: IControlledWrite = createControlledWrite('b', (await sealAsync(subject))!);
      subject.enqueue(write.write);
      expect(write.signal?.aborted).toBe(false);
      write.finish(1);
      await subject.waitForIdleAsync();

      expect(subject.takeReport()).toMatchObject({ writtenCount: 1, failedCount: 0, pendingCount: 0 });
      expect(fs.readdirSync(getProcessFolderPath())).toEqual([]);
    });

    it('does nothing if nothing was sealed', async () => {
      const subject: DeferredCacheEntryWrites = createSubject();

      await subject.abortAsync();

      expect(fs.existsSync(path.join(commonTempFolder, DEFERRED_CACHE_ENTRY_STAGING_FOLDER_NAME))).toBe(
        false
      );
      expect(logLines).toEqual([]);
    });
  });
});

describe('getSecondsForUtimes', () => {
  it('keeps the whole second of a time in nanoseconds', () => {
    const seconds: number = 1790713413;
    for (const nanoseconds of [0, 1000, 499999999, 999499999, 999500000, 999999000, 999999900, 999999999]) {
      const timeNs: bigint = BigInt(seconds) * NANOSECONDS_PER_SECOND + BigInt(nanoseconds);
      const result: number = getSecondsForUtimes(timeNs);
      expect(Math.floor(result)).toBe(seconds);
      // Microseconds are kept.
      expect(Math.abs(result - seconds - Math.floor(nanoseconds / 1000) / 1e6)).toBeLessThan(1e-6);
    }
  });
});
