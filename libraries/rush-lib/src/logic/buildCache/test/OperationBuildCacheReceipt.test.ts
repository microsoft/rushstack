// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { StringBufferTerminalProvider, Terminal, type ITerminal } from '@rushstack/terminal';

import type { BuildCacheConfiguration } from '../../../api/BuildCacheConfiguration';
import type { RushConfigurationProject } from '../../../api/RushConfigurationProject';
import type { ICreateArchiveOptions, IUntarOptions, TarExecutable } from '../../../utilities/TarExecutable';
import type { IBaseOperationExecutionResult } from '../../operations/IOperationExecutionResult';
import type { IGenerateCacheEntryIdOptions } from '../CacheEntryId';
import { DeferredCacheEntryWrites } from '../DeferredCacheEntryWrites';
import { OperationBuildCache, _setTarUtilityPromiseForTesting } from '../OperationBuildCache';

const HIT_LINE: string = 'Build cache hit.';
const SKIP_LINE: string = 'The output folders already match this cache entry; nothing to restore.';
const METADATA_FOLDER: string = '.rush/temp/operation/_phase_build';
const RECEIPT: string = '.rush/temp/build-cache-receipt__phase_build.json';
const CACHE_ID: string = 'acme-hash1';

// A fake cache entry: the project-relative path and content of each file.
type FakeArchive = Record<string, string>;

const ENTRY: FakeArchive = {
  'lib/out.txt': 'out',
  'lib/nested/deep/data.json': '{"a":1}',
  [`${METADATA_FOLDER}/state.json`]: '{}'
};

interface ISubjectOptions {
  stateHash?: string;
  outputFolderNames?: string[];
  excludeAppleDoubleFiles?: boolean;
}

interface IRestoreResult {
  result: boolean;
  output: string;
}

describe('OperationBuildCache receipts', () => {
  let rootFolder: string;
  let projectFolder: string;
  let cacheFolder: string;
  let untarHook: ((outputFolderPath: string) => void) | undefined;
  let tarHook: ((projectFolderPath: string) => void) | undefined;
  // If defined, the fake tar waits for it, or for its abort signal, before it reads the files.
  let tarGate: Promise<void> | undefined;
  let untarMock: jest.Mock<Promise<number>, [IUntarOptions]>;
  let createArchiveMock: jest.Mock<Promise<number>, [ICreateArchiveOptions]>;

  beforeEach(() => {
    rootFolder = fs.mkdtempSync(path.join(os.tmpdir(), 'rush-build-cache-receipt-'));
    projectFolder = path.join(rootFolder, 'project');
    cacheFolder = path.join(rootFolder, 'cache');
    fs.mkdirSync(projectFolder);
    fs.mkdirSync(cacheFolder);
    untarHook = undefined;
    tarHook = undefined;
    tarGate = undefined;

    untarMock = jest.fn(async ({ archivePath, outputFolderPath }: IUntarOptions) => {
      const archive: FakeArchive = JSON.parse(fs.readFileSync(archivePath, 'utf8'));
      writeFiles(outputFolderPath, archive);
      untarHook?.(outputFolderPath);
      return 0;
    });
    createArchiveMock = jest.fn(
      async ({ archivePath, paths, project, baseFolderPath, abortSignal }: ICreateArchiveOptions) => {
        await waitForGateAsync(abortSignal);
        if (abortSignal?.aborted) {
          // As a killed tar would
          return 1;
        }
        const archive: FakeArchive = {};
        for (const relativePath of paths) {
          archive[relativePath] = fs.readFileSync(
            path.join(baseFolderPath ?? project.projectFolder, relativePath),
            'utf8'
          );
        }
        tarHook?.(project.projectFolder);
        fs.writeFileSync(archivePath, JSON.stringify(archive));
        return 0;
      }
    );
    _setTarUtilityPromiseForTesting(
      Promise.resolve({
        tryUntarAsync: untarMock,
        tryCreateArchiveFromProjectPathsAsync: createArchiveMock
      } as unknown as TarExecutable)
    );
  });

  afterEach(() => {
    _setTarUtilityPromiseForTesting(undefined);
    fs.rmSync(rootFolder, { recursive: true, force: true });
  });

  function writeFiles(folderPath: string, files: FakeArchive): void {
    for (const [relativePath, content] of Object.entries(files)) {
      const filePath: string = path.join(folderPath, relativePath);
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(filePath, content);
    }
  }

  async function waitForGateAsync(abortSignal: AbortSignal | undefined): Promise<void> {
    const gate: Promise<void> | undefined = tarGate;
    if (gate) {
      await new Promise<void>((resolve) => {
        void gate.then(resolve);
        abortSignal?.addEventListener('abort', () => resolve(), { once: true });
      });
    }
  }

  function getProject(): RushConfigurationProject {
    return {
      packageName: 'acme',
      projectFolder,
      projectRushTempFolder: path.join(projectFolder, '.rush', 'temp'),
      rushConfiguration: { commonTempFolder: path.join(rootFolder, 'common-temp') }
    } as unknown as RushConfigurationProject;
  }

  function getBuildCacheConfiguration(): BuildCacheConfiguration {
    return {
      buildCacheEnabled: true,
      cacheWriteEnabled: true,
      getCacheEntryId: ({ projectName, projectStateHash }: IGenerateCacheEntryIdOptions) =>
        `${projectName}-${projectStateHash}`,
      localCacheProvider: {
        getCacheEntryPath: (cacheId: string) => path.join(cacheFolder, cacheId),
        tryGetCacheEntryPathByIdAsync: async (terminal: ITerminal, cacheId: string) => {
          const cacheEntryPath: string = path.join(cacheFolder, cacheId);
          return fs.existsSync(cacheEntryPath) ? cacheEntryPath : undefined;
        }
      },
      cloudCacheProvider: undefined
    } as unknown as BuildCacheConfiguration;
  }

  function createSubject(options: ISubjectOptions = {}): OperationBuildCache {
    const { stateHash = 'hash1', outputFolderNames = ['lib'], excludeAppleDoubleFiles = false } = options;
    const project: RushConfigurationProject = getProject();
    const executionResult: IBaseOperationExecutionResult = {
      operation: {
        settings: { outputFolderNames },
        associatedProject: project,
        associatedPhase: { name: '_phase:build' },
        logFilenameIdentifier: '_phase_build'
      },
      metadataFolderPath: METADATA_FOLDER,
      getStateHash: () => stateHash
    } as unknown as IBaseOperationExecutionResult;
    return OperationBuildCache.forOperation(executionResult, {
      buildCacheConfiguration: getBuildCacheConfiguration(),
      terminal: new Terminal(new StringBufferTerminalProvider()),
      excludeAppleDoubleFiles,
      useDirectFileTransfersForBuildCache: false
    });
  }

  function seedEntry(cacheId: string = CACHE_ID, archive: FakeArchive = ENTRY): void {
    fs.writeFileSync(path.join(cacheFolder, cacheId), JSON.stringify(archive));
  }

  async function restoreAsync(
    subject: OperationBuildCache,
    specifiedCacheId?: string
  ): Promise<IRestoreResult> {
    const terminalProvider: StringBufferTerminalProvider = new StringBufferTerminalProvider();
    const result: boolean = await subject.tryRestoreFromCacheAsync(
      new Terminal(terminalProvider),
      specifiedCacheId
    );
    return { result, output: terminalProvider.getOutput() };
  }

  async function setCacheEntryAsync(
    subject: OperationBuildCache,
    deferredCacheEntryWrites?: DeferredCacheEntryWrites
  ): Promise<boolean> {
    return await subject.trySetCacheEntryAsync(
      new Terminal(new StringBufferTerminalProvider()),
      undefined,
      deferredCacheEntryWrites
    );
  }

  // Copies the files instead of cloning them, which works on any file system.
  function createWrites(
    cloneFileAsync: (sourcePath: string, destinationPath: string) => Promise<void> = fs.promises.copyFile
  ): DeferredCacheEntryWrites {
    // The files are cloned before the seal resolves, however slow the machine is.
    return new DeferredCacheEntryWrites({ cloneFileAsync, sealWaitMs: 60 * 1000 });
  }

  function hasEntry(): boolean {
    return fs.existsSync(path.join(cacheFolder, CACHE_ID));
  }

  // The identity, modification time and status change time of every file in the entry.
  function statOutputs(): Record<string, bigint[]> {
    const result: Record<string, bigint[]> = {};
    for (const relativePath of Object.keys(ENTRY)) {
      const { ino, mtimeNs, ctimeNs } = fs.statSync(path.join(projectFolder, relativePath), { bigint: true });
      result[relativePath] = [ino, mtimeNs, ctimeNs];
    }
    return result;
  }

  function hasReceipt(): boolean {
    return fs.existsSync(path.join(projectFolder, RECEIPT));
  }

  function getReceiptTempFiles(): string[] {
    const rushTempFolder: string = path.join(projectFolder, '.rush', 'temp');
    return fs.existsSync(rushTempFolder)
      ? fs.readdirSync(rushTempFolder).filter((name: string) => name.endsWith('.tmp'))
      : [];
  }

  function readEntry(): FakeArchive {
    return JSON.parse(fs.readFileSync(path.join(cacheFolder, CACHE_ID), 'utf8'));
  }

  // Waits for the writes in the background to make the condition true.
  async function waitForAsync(condition: () => boolean): Promise<void> {
    while (!condition()) {
      await new Promise<void>((resolve) => setTimeout(resolve, 1));
    }
  }

  /**
   * Writes the entry of the outputs in the background, with a write that waits at the tar gate. Then rebuilds the
   * outputs with other content and writes the entry again, while that write is pending.
   */
  async function rebuildWhileWritePendingAsync(
    writes: DeferredCacheEntryWrites
  ): Promise<{ subject: OperationBuildCache; openGate: () => void }> {
    let openGate: () => void = () => undefined;
    tarGate = new Promise<void>((resolve: () => void) => {
      openGate = resolve;
    });
    writeFiles(projectFolder, ENTRY);
    const subject: OperationBuildCache = createSubject();

    expect(await setCacheEntryAsync(subject, writes)).toBe(true);
    expect(hasReceipt()).toBe(true);
    const receipt: string = fs.readFileSync(path.join(projectFolder, RECEIPT), 'utf8');
    await waitForAsync(() => createArchiveMock.mock.calls.length === 1);
    // Only the first write waits at the gate.
    tarGate = undefined;
    writeFiles(projectFolder, { 'lib/out.txt': 'rebuilt' });
    expect(await setCacheEntryAsync(subject, writes)).toBe(true);

    // The receipt of the first write is left, and it doesn't match the rebuilt outputs.
    expect(fs.readFileSync(path.join(projectFolder, RECEIPT), 'utf8')).toBe(receipt);
    expect(getReceiptTempFiles()).toEqual([]);
    return { subject, openGate };
  }

  // Restores the entry, so that the project has a receipt for it.
  async function restoreWithReceiptAsync(subject: OperationBuildCache): Promise<void> {
    expect((await restoreAsync(subject)).result).toBe(true);
    expect(hasReceipt()).toBe(true);
  }

  it('T1: skips a second restore of the same entry, and leaves every output as it was', async () => {
    seedEntry();
    const subject: OperationBuildCache = createSubject();
    await restoreWithReceiptAsync(subject);
    expect(untarMock).toHaveBeenCalledTimes(1);
    const before: Record<string, bigint[]> = statOutputs();

    const { result, output } = await restoreAsync(subject);

    expect(result).toBe(true);
    expect(untarMock).toHaveBeenCalledTimes(1);
    expect(output).toContain(HIT_LINE);
    expect(output).toContain(SKIP_LINE);
    expect(statOutputs()).toEqual(before);
    expect(getReceiptTempFiles()).toEqual([]);
  });

  it('T2: restores again if an output was rewritten with the same content', async () => {
    seedEntry();
    const subject: OperationBuildCache = createSubject();
    await restoreWithReceiptAsync(subject);

    fs.writeFileSync(path.join(projectFolder, 'lib/out.txt'), ENTRY['lib/out.txt']);
    const { result, output } = await restoreAsync(subject);

    expect(result).toBe(true);
    expect(untarMock).toHaveBeenCalledTimes(2);
    expect(output).not.toContain(SKIP_LINE);
  });

  it.each([
    ['a file was added', () => fs.writeFileSync(path.join(projectFolder, 'lib/added.txt'), 'added')],
    ['a file was deleted', () => fs.unlinkSync(path.join(projectFolder, 'lib/nested/deep/data.json'))],
    ['an empty folder was added', () => fs.mkdirSync(path.join(projectFolder, 'lib/empty'))]
  ])('T3: restores again if %s', async (description: string, change: () => void) => {
    seedEntry();
    const subject: OperationBuildCache = createSubject();
    await restoreWithReceiptAsync(subject);

    change();
    const { result, output } = await restoreAsync(subject);

    expect(result).toBe(true);
    expect(untarMock).toHaveBeenCalledTimes(2);
    expect(output).not.toContain(SKIP_LINE);
  });

  it('T4: restores another entry for another state hash', async () => {
    seedEntry();
    seedEntry('acme-hash2');
    await restoreWithReceiptAsync(createSubject());

    const { result, output } = await restoreAsync(createSubject({ stateHash: 'hash2' }));

    expect(result).toBe(true);
    expect(untarMock).toHaveBeenCalledTimes(2);
    expect(output).not.toContain(SKIP_LINE);
  });

  it('T4: restores another entry for a specified cache id', async () => {
    seedEntry();
    seedEntry('acme-other');
    const subject: OperationBuildCache = createSubject();
    await restoreWithReceiptAsync(subject);

    const { result, output } = await restoreAsync(subject, 'acme-other');

    expect(result).toBe(true);
    expect(untarMock).toHaveBeenCalledTimes(2);
    expect(output).not.toContain(SKIP_LINE);
    expect(JSON.parse(fs.readFileSync(path.join(projectFolder, RECEIPT), 'utf8')).cacheId).toBe('acme-other');
  });

  it('T5: does not skip if the entry is gone from the local cache', async () => {
    seedEntry();
    const subject: OperationBuildCache = createSubject();
    await restoreWithReceiptAsync(subject);

    fs.unlinkSync(path.join(cacheFolder, CACHE_ID));
    const { result, output } = await restoreAsync(subject);

    expect(result).toBe(false);
    expect(output).not.toContain(SKIP_LINE);
    expect(untarMock).toHaveBeenCalledTimes(1);
  });

  it('T6: restores again after a same-size rewrite whose modification time was put back', async () => {
    const mtime: Date = new Date('2020-01-01T00:00:00Z');
    untarHook = (outputFolderPath: string) =>
      fs.utimesSync(path.join(outputFolderPath, 'lib/out.txt'), mtime, mtime);
    seedEntry();
    const subject: OperationBuildCache = createSubject();
    await restoreWithReceiptAsync(subject);
    const filePath: string = path.join(projectFolder, 'lib/out.txt');
    const before: fs.BigIntStats = fs.statSync(filePath, { bigint: true });

    fs.writeFileSync(filePath, ENTRY['lib/out.txt'].toUpperCase());
    fs.utimesSync(filePath, mtime, mtime);
    const after: fs.BigIntStats = fs.statSync(filePath, { bigint: true });
    expect([after.ino, after.size, after.mode, after.mtimeNs]).toEqual([
      before.ino,
      before.size,
      before.mode,
      before.mtimeNs
    ]);
    const { result, output } = await restoreAsync(subject);

    expect(result).toBe(true);
    expect(untarMock).toHaveBeenCalledTimes(2);
    expect(output).not.toContain(SKIP_LINE);
    expect(fs.readFileSync(filePath, 'utf8')).toBe(ENTRY['lib/out.txt']);
  });

  it('T7: writes no receipt if an output has a time after the stamp', async () => {
    const future: Date = new Date(Date.now() + 60 * 60 * 1000);
    untarHook = (outputFolderPath: string) =>
      fs.utimesSync(path.join(outputFolderPath, 'lib/out.txt'), future, future);
    seedEntry();
    const subject: OperationBuildCache = createSubject();

    expect((await restoreAsync(subject)).result).toBe(true);
    expect(hasReceipt()).toBe(false);
    expect(getReceiptTempFiles()).toEqual([]);
    const { result, output } = await restoreAsync(subject);

    expect(result).toBe(true);
    expect(untarMock).toHaveBeenCalledTimes(2);
    expect(output).not.toContain(SKIP_LINE);
  });

  it('T8: writes a receipt when it writes an entry, and then skips its restore', async () => {
    writeFiles(projectFolder, ENTRY);
    const subject: OperationBuildCache = createSubject();

    expect(await setCacheEntryAsync(subject)).toBe(true);
    expect(JSON.parse(fs.readFileSync(path.join(projectFolder, RECEIPT), 'utf8'))).toEqual({
      version: 1,
      cacheId: CACHE_ID,
      outputFolderNames: ['lib', METADATA_FOLDER],
      listingDigest: expect.stringMatching(/^[0-9a-f]{40}$/)
    });
    expect(getReceiptTempFiles()).toEqual([]);
    const before: Record<string, bigint[]> = statOutputs();
    const { result, output } = await restoreAsync(subject);

    expect(result).toBe(true);
    expect(untarMock).not.toHaveBeenCalled();
    expect(output).toContain(SKIP_LINE);
    expect(statOutputs()).toEqual(before);
  });

  it('T9: writes no receipt if an output changes while the entry is written', async () => {
    tarHook = (projectFolderPath: string) =>
      fs.appendFileSync(path.join(projectFolderPath, 'lib/out.txt'), '!');
    writeFiles(projectFolder, ENTRY);
    const subject: OperationBuildCache = createSubject();

    expect(await setCacheEntryAsync(subject)).toBe(true);
    expect(hasReceipt()).toBe(false);
    expect(getReceiptTempFiles()).toEqual([]);
    const { result, output } = await restoreAsync(subject);

    expect(result).toBe(true);
    expect(untarMock).toHaveBeenCalledTimes(1);
    expect(output).not.toContain(SKIP_LINE);
    expect(fs.readFileSync(path.join(projectFolder, 'lib/out.txt'), 'utf8')).toBe(ENTRY['lib/out.txt']);
  });

  it('T10: deletes the receipt before a restore that fails', async () => {
    seedEntry();
    const subject: OperationBuildCache = createSubject();
    await restoreWithReceiptAsync(subject);

    fs.appendFileSync(path.join(projectFolder, 'lib/out.txt'), '!');
    untarMock.mockResolvedValueOnce(1);
    const { result } = await restoreAsync(subject);

    expect(result).toBe(false);
    expect(untarMock).toHaveBeenCalledTimes(2);
    expect(hasReceipt()).toBe(false);
  });

  it('T11: restores again for the same cache id with other output folders', async () => {
    seedEntry();
    await restoreWithReceiptAsync(createSubject());

    const { result, output } = await restoreAsync(createSubject({ outputFolderNames: ['lib', 'dist'] }));

    expect(result).toBe(true);
    expect(untarMock).toHaveBeenCalledTimes(2);
    expect(output).not.toContain(SKIP_LINE);
  });

  it('T12: restores again, without throwing, if the receipt is not valid JSON', async () => {
    seedEntry();
    const subject: OperationBuildCache = createSubject();
    await restoreWithReceiptAsync(subject);

    fs.writeFileSync(path.join(projectFolder, RECEIPT), '{ not JSON');
    const { result, output } = await restoreAsync(subject);

    expect(result).toBe(true);
    expect(untarMock).toHaveBeenCalledTimes(2);
    expect(output).not.toContain(SKIP_LINE);
  });

  it("T28: restores and writes entries, without throwing, if the receipt can't be read, written or deleted", async () => {
    seedEntry();
    fs.mkdirSync(path.join(projectFolder, RECEIPT), { recursive: true });
    const subject: OperationBuildCache = createSubject();
    const terminalProvider: StringBufferTerminalProvider = new StringBufferTerminalProvider();

    expect(await subject.tryRestoreFromCacheAsync(new Terminal(terminalProvider))).toBe(true);
    expect(terminalProvider.getVerboseOutput()).toContain('Unable to read the build cache receipt');
    expect((await restoreAsync(subject)).result).toBe(true);
    expect(untarMock).toHaveBeenCalledTimes(2);
    expect(await setCacheEntryAsync(subject)).toBe(true);
    expect(fs.statSync(path.join(projectFolder, RECEIPT)).isDirectory()).toBe(true);
    expect(getReceiptTempFiles()).toEqual([]);
  });

  it('T13: writes no receipt if an output folder contains the receipt folder', async () => {
    seedEntry();
    const subject: OperationBuildCache = createSubject({ outputFolderNames: ['lib', '.rush'] });

    expect((await restoreAsync(subject)).result).toBe(true);
    expect(hasReceipt()).toBe(false);
    expect(await setCacheEntryAsync(subject)).toBe(true);
    expect(hasReceipt()).toBe(false);
    expect(getReceiptTempFiles()).toEqual([]);
  });

  it('T14: restores again after the operation writes an output', async () => {
    seedEntry();
    const subject: OperationBuildCache = createSubject();
    await restoreWithReceiptAsync(subject);
    expect((await restoreAsync(subject)).output).toContain(SKIP_LINE);

    fs.writeFileSync(path.join(projectFolder, 'lib/out.txt'), 'rebuilt');
    const { result, output } = await restoreAsync(subject);

    expect(result).toBe(true);
    expect(untarMock).toHaveBeenCalledTimes(2);
    expect(output).not.toContain(SKIP_LINE);
    expect(fs.readFileSync(path.join(projectFolder, 'lib/out.txt'), 'utf8')).toBe(ENTRY['lib/out.txt']);
  });

  it('T16: writes no receipt for an entry written while an output folder has an empty folder', async () => {
    writeFiles(projectFolder, ENTRY);
    fs.mkdirSync(path.join(projectFolder, 'lib/empty'));
    const subject: OperationBuildCache = createSubject();

    expect(await setCacheEntryAsync(subject)).toBe(true);
    expect(hasReceipt()).toBe(false);
    const { result, output } = await restoreAsync(subject);

    expect(result).toBe(true);
    expect(untarMock).toHaveBeenCalledTimes(1);
    expect(output).not.toContain(SKIP_LINE);
  });

  it('T17: writes no receipt if an output folder has a symbolic link', async () => {
    untarHook = (outputFolderPath: string) =>
      fs.symlinkSync(
        path.join(outputFolderPath, 'lib/nested'),
        path.join(outputFolderPath, 'lib/link'),
        'junction'
      );
    seedEntry();
    const subject: OperationBuildCache = createSubject();

    expect((await restoreAsync(subject)).result).toBe(true);
    expect(fs.lstatSync(path.join(projectFolder, 'lib/link')).isSymbolicLink()).toBe(true);
    expect(hasReceipt()).toBe(false);
    expect(getReceiptTempFiles()).toEqual([]);
  });

  it('T18: writes no receipt for a build cache that is not for an operation', async () => {
    seedEntry();
    const subject: OperationBuildCache = OperationBuildCache.getOperationBuildCache({
      buildCacheConfiguration: getBuildCacheConfiguration(),
      terminal: new Terminal(new StringBufferTerminalProvider()),
      project: getProject(),
      phaseName: '_phase:build',
      projectOutputFolderNames: ['lib', METADATA_FOLDER],
      operationStateHash: 'hash1',
      excludeAppleDoubleFiles: false,
      useDirectFileTransfersForBuildCache: false
    });

    expect((await restoreAsync(subject)).result).toBe(true);
    expect(await setCacheEntryAsync(subject)).toBe(true);
    const { result, output } = await restoreAsync(subject);

    expect(result).toBe(true);
    expect(output).not.toContain(SKIP_LINE);
    expect(untarMock).toHaveBeenCalledTimes(2);
    expect(hasReceipt()).toBe(false);
    expect(getReceiptTempFiles()).toEqual([]);
  });

  it('T19: writes a receipt when it seals the outputs for a deferred write, and then skips its restore', async () => {
    let openGate: () => void = () => undefined;
    tarGate = new Promise<void>((resolve: () => void) => {
      openGate = resolve;
    });
    writeFiles(projectFolder, ENTRY);
    const subject: OperationBuildCache = createSubject();
    const writes: DeferredCacheEntryWrites = createWrites();

    expect(await setCacheEntryAsync(subject, writes)).toBe(true);
    expect(hasReceipt()).toBe(true);
    expect(hasEntry()).toBe(false);
    expect(getReceiptTempFiles()).toEqual([]);
    openGate();
    await writes.waitForIdleAsync();
    expect(writes.takeReport()).toMatchObject({ writtenCount: 1, failedCount: 0 });
    const before: Record<string, bigint[]> = statOutputs();
    const { result, output } = await restoreAsync(subject);

    expect(result).toBe(true);
    expect(untarMock).not.toHaveBeenCalled();
    expect(output).toContain(SKIP_LINE);
    expect(statOutputs()).toEqual(before);
  });

  it('T20: does not skip a restore if a deferred write is dropped', async () => {
    tarGate = new Promise<void>(() => undefined);
    writeFiles(projectFolder, ENTRY);
    const subject: OperationBuildCache = createSubject();
    const writes: DeferredCacheEntryWrites = createWrites();

    expect(await setCacheEntryAsync(subject, writes)).toBe(true);
    expect(hasReceipt()).toBe(true);
    await writes.abortAsync();
    expect(fs.readdirSync(cacheFolder)).toEqual([]);
    const { result, output } = await restoreAsync(subject);

    expect(result).toBe(false);
    expect(untarMock).not.toHaveBeenCalled();
    expect(output).not.toContain(SKIP_LINE);
  });

  it('T21: writes the entry at once, and no receipt, if an output changes while it is sealed for a deferred write', async () => {
    const changedFilePath: string = path.join(projectFolder, 'lib/out.txt');
    const changedContent: string = `${ENTRY['lib/out.txt']}!`;
    writeFiles(projectFolder, ENTRY);
    const subject: OperationBuildCache = createSubject();
    const writes: DeferredCacheEntryWrites = createWrites(
      async (sourcePath: string, destinationPath: string) => {
        await fs.promises.copyFile(sourcePath, destinationPath);
        if (sourcePath === changedFilePath) {
          await fs.promises.appendFile(sourcePath, '!');
        }
      }
    );

    // The file changed before its clone was checked, so the seal fails, and the entry is written from the files.
    expect(await setCacheEntryAsync(subject, writes)).toBe(true);
    expect(hasReceipt()).toBe(false);
    expect(getReceiptTempFiles()).toEqual([]);
    const entry: FakeArchive = JSON.parse(fs.readFileSync(path.join(cacheFolder, CACHE_ID), 'utf8'));
    expect(entry['lib/out.txt']).toBe(changedContent);
    await writes.waitForIdleAsync();
    expect(writes.takeReport()).toMatchObject({ queuedCount: 0, droppedCount: 0, failedCount: 0 });
    const { result, output } = await restoreAsync(subject);

    expect(result).toBe(true);
    expect(untarMock).toHaveBeenCalledTimes(1);
    expect(output).not.toContain(SKIP_LINE);
    expect(fs.readFileSync(changedFilePath, 'utf8')).toBe(changedContent);
  });

  it('T22: writes no receipt for a deferred write if the entry leaves out a file of an output folder', async () => {
    // On macOS, the entry leaves out an AppleDouble file that has a companion file.
    const originalPlatform: NodeJS.Platform = process.platform;
    Object.defineProperty(process, 'platform', { value: 'darwin' });
    let subject: OperationBuildCache;
    try {
      subject = createSubject({ excludeAppleDoubleFiles: true });
    } finally {
      Object.defineProperty(process, 'platform', { value: originalPlatform });
    }
    writeFiles(projectFolder, { ...ENTRY, 'lib/._out.txt': 'attributes' });
    const writes: DeferredCacheEntryWrites = createWrites();

    expect(await setCacheEntryAsync(subject, writes)).toBe(true);
    expect(hasReceipt()).toBe(false);
    await writes.waitForIdleAsync();
    const entry: FakeArchive = JSON.parse(fs.readFileSync(path.join(cacheFolder, CACHE_ID), 'utf8'));
    expect(Object.keys(entry).sort()).toEqual(Object.keys(ENTRY).sort());
    const { result, output } = await restoreAsync(subject);

    expect(result).toBe(true);
    expect(untarMock).toHaveBeenCalledTimes(1);
    expect(output).not.toContain(SKIP_LINE);
  });

  it('T23: writes no receipt for a deferred write if the local cache already has an entry', async () => {
    tarGate = new Promise<void>(() => undefined);
    seedEntry();
    writeFiles(projectFolder, ENTRY);
    const subject: OperationBuildCache = createSubject();
    const writes: DeferredCacheEntryWrites = createWrites();

    expect(await setCacheEntryAsync(subject, writes)).toBe(true);
    expect(hasReceipt()).toBe(false);
    expect(getReceiptTempFiles()).toEqual([]);
    await writes.abortAsync();
    const { result, output } = await restoreAsync(subject);

    expect(result).toBe(true);
    expect(untarMock).toHaveBeenCalledTimes(1);
    expect(output).not.toContain(SKIP_LINE);
    expect(hasReceipt()).toBe(true);
  });

  it('T24: writes no receipt while an older write of the entry is pending', async () => {
    const writes: DeferredCacheEntryWrites = createWrites();
    const { subject, openGate } = await rebuildWhileWritePendingAsync(writes);

    // The entry of the rebuilt outputs is written first, and the older write replaces it.
    await waitForAsync(() => fs.existsSync(path.join(cacheFolder, CACHE_ID)));
    expect(readEntry()['lib/out.txt']).toBe('rebuilt');
    openGate();
    await writes.waitForIdleAsync();
    expect(writes.takeReport()).toMatchObject({ queuedCount: 2, writtenCount: 2, failedCount: 0 });
    expect(readEntry()).toEqual(ENTRY);
    const { result, output } = await restoreAsync(subject);

    expect(result).toBe(true);
    expect(untarMock).toHaveBeenCalledTimes(1);
    expect(output).not.toContain(SKIP_LINE);
    expect(fs.readFileSync(path.join(projectFolder, 'lib/out.txt'), 'utf8')).toBe(ENTRY['lib/out.txt']);
  });

  it('T25: writes no receipt while an older write of the entry is pending, if the entry is written at once', async () => {
    const writes: DeferredCacheEntryWrites = createWrites(
      async (sourcePath: string, destinationPath: string) => {
        // The seal of the rebuilt outputs fails, so their entry is written at once.
        if (fs.readFileSync(sourcePath, 'utf8') === 'rebuilt') {
          throw Object.assign(new Error('The clone failed.'), { code: 'EIO' });
        }
        await fs.promises.copyFile(sourcePath, destinationPath);
      }
    );
    const { subject, openGate } = await rebuildWhileWritePendingAsync(writes);

    expect(readEntry()['lib/out.txt']).toBe('rebuilt');
    openGate();
    await writes.waitForIdleAsync();
    expect(writes.takeReport()).toMatchObject({ queuedCount: 1, writtenCount: 1, failedCount: 0 });
    expect(readEntry()).toEqual(ENTRY);
    const { result, output } = await restoreAsync(subject);

    expect(result).toBe(true);
    expect(untarMock).toHaveBeenCalledTimes(1);
    expect(output).not.toContain(SKIP_LINE);
    expect(fs.readFileSync(path.join(projectFolder, 'lib/out.txt'), 'utf8')).toBe(ENTRY['lib/out.txt']);
  });
});
