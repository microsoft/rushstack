// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

jest.mock('../typeScript7Loader.cjs', () => ({ importAsync: jest.fn() }));

import * as path from 'node:path';
import * as fs from 'node:fs';

import type { APIOptions, Diagnostic, ParsedCommandLine } from 'typescript-7/dist/api/async/api';

import type { IScopedLogger, IWatchFileSystem } from '@rushstack/heft';
import { FileSystem } from '@rushstack/node-core-library';

import { TypeScript7Builder } from '../TypeScript7Builder';
import { importAsync } from '../typeScript7Loader.cjs';

describe('TypeScript 7 compiler lifecycle', () => {
  const diagnostic: Diagnostic = { code: 2322, category: 1, pos: 0, end: 0, text: 'type error' };
  let controller: AbortController;
  let config: ParsedCommandLine;
  let logger: IScopedLogger;
  let builder: TypeScript7Builder;
  let createApi: jest.Mock;
  const program = {
    getConfigFileParsingDiagnostics: jest.fn(),
    getProgramDiagnostics: jest.fn(),
    getGlobalDiagnostics: jest.fn(),
    getSyntacticDiagnostics: jest.fn(),
    getSemanticDiagnostics: jest.fn(),
    getDeclarationDiagnostics: jest.fn(),
    emit: jest.fn()
  };
  const api = {
    parseConfigFile: jest.fn(),
    createProgram: jest.fn(),
    createSnapshot: jest.fn(),
    close: jest.fn()
  };

  beforeEach(() => {
    jest.resetAllMocks();
    controller = new AbortController();
    config = {
      fileNames: ['/project/src/index.ts' as ParsedCommandLine['fileNames'][number]],
      options: {},
      errors: []
    };
    logger = {
      emitError: jest.fn(),
      emitWarning: jest.fn(),
      terminal: { writeLine: jest.fn() }
    } as unknown as IScopedLogger;
    for (const method of Object.values(program)) {
      method.mockResolvedValue([]);
    }
    program.emit.mockResolvedValue({ diagnostics: [] });
    api.parseConfigFile.mockImplementation(async () => config);
    api.createProgram.mockResolvedValue(program);
    api.close.mockResolvedValue(undefined);
    createApi = jest.fn().mockImplementation(() => api);
    (importAsync as jest.Mock).mockResolvedValue({
      API: createApi,
      formatDiagnostics: (diagnostics: Diagnostic[]) => diagnostics[0].text
    });
    builder = new TypeScript7Builder({
      typescriptPackagePath: path.dirname(require.resolve('typescript-7/package.json')),
      tsconfigPath: '/project/tsconfig.json',
      buildFolderPath: '/project',
      abortSignal: controller.signal,
      logger
    });
  });

  it('forces typechecking and declaration-only output without selecting module kinds', async () => {
    config.options = { noCheck: true, declaration: false, emitDeclarationOnly: false, noEmitOnError: true };
    await builder.invokeAsync();
    const options: object = api.createProgram.mock.calls[0][1];
    expect(options).toEqual({
      configFilePath: '/project/tsconfig.json',
      noCheck: false,
      declaration: true,
      emitDeclarationOnly: true,
      noEmitOnError: true
    });
    expect(api.close).toHaveBeenCalledTimes(1);
  });

  it('reports and deduplicates all diagnostic stages including emit', async () => {
    config.errors.push(diagnostic);
    for (const method of Object.values(program)) {
      method.mockResolvedValue([diagnostic]);
    }
    program.emit.mockResolvedValue({ diagnostics: [diagnostic] });
    await builder.invokeAsync();
    expect(logger.emitError).toHaveBeenCalledTimes(1);
    expect(api.close).toHaveBeenCalledTimes(1);
  });

  it.each(['parseConfigFile', 'createProgram'])('closes after %s fails', async (method) => {
    api[method as 'parseConfigFile' | 'createProgram'].mockRejectedValue(new Error('compiler failure'));
    await expect(builder.invokeAsync()).rejects.toThrow('compiler failure');
    expect(api.close).toHaveBeenCalledTimes(1);
  });

  it('closes after diagnostics or emit fail', async () => {
    program.getSemanticDiagnostics.mockRejectedValueOnce(new Error('check failure'));
    await expect(builder.invokeAsync()).rejects.toThrow('check failure');
    expect(api.close).toHaveBeenCalledTimes(1);
    program.emit.mockRejectedValueOnce(new Error('emit failure'));
    await expect(builder.invokeAsync()).rejects.toThrow('emit failure');
    expect(api.close).toHaveBeenCalledTimes(2);
  });

  it('does not emit after cancellation and still closes the native session', async () => {
    program.getSemanticDiagnostics.mockImplementation(async () => {
      controller.abort();
      return [];
    });
    await builder.invokeAsync();
    expect(program.emit).not.toHaveBeenCalled();
    expect(api.close).toHaveBeenCalledTimes(1);
  });

  it('guards against accidental JavaScript output', async () => {
    await builder.invokeAsync();
    const options: APIOptions = createApi.mock.calls[0][0];
    const writeFile = options.fs!.writeFile;
    if (typeof writeFile !== 'function') {
      throw new Error('Expected a writeFile callback');
    }
    expect(() => writeFile('/project/out/index.js' as never, 'JavaScript')).toThrow(
      'cannot emit JavaScript'
    );
  });

  it('retains the API and snapshot chain, and rearms cached filesystem dependencies', async () => {
    const watchFs = { getStateAndTrack: jest.fn() } as unknown as IWatchFileSystem;
    const snapshots = Array.from({ length: 3 }, () => ({
      operation: { createdPrograms: [{ id: 'synthetic:test' }] },
      getProgram: jest.fn().mockReturnValue(program),
      update: jest.fn(),
      dispose: jest.fn().mockResolvedValue(undefined)
    }));
    api.createSnapshot.mockResolvedValue(snapshots[0]);
    snapshots[0].update.mockResolvedValue(snapshots[1]);
    snapshots[1].update.mockResolvedValue(snapshots[2]);
    await builder.invokeAsync(controller.signal, watchFs);
    const fsOptions: APIOptions = createApi.mock.calls[0][0];
    const readFile = fsOptions.fs!.readFile;
    if (typeof readFile !== 'function') {
      throw new Error('Expected readFile');
    }
    readFile('/project/missing.ts' as never);
    (watchFs.getStateAndTrack as jest.Mock).mockClear();
    await builder.invokeAsync(new AbortController().signal, watchFs);
    await builder.invokeAsync(new AbortController().signal, watchFs);
    expect(createApi).toHaveBeenCalledTimes(1);
    expect(api.createSnapshot).toHaveBeenCalledTimes(1);
    expect(api.createProgram).not.toHaveBeenCalled();
    expect(watchFs.getStateAndTrack).toHaveBeenCalledTimes(2);
    expect(snapshots[0].dispose).toHaveBeenCalledTimes(1);
    expect(snapshots[1].dispose).toHaveBeenCalledTimes(1);
    expect(api.close).not.toHaveBeenCalled();
    await builder.closeAsync();
    await builder.closeAsync();
    expect(api.close).toHaveBeenCalledTimes(1);
  });

  it.each(['abort', 'error'])('recovers watch snapshots after an iteration %s', async (failure) => {
    const watchFs = { getStateAndTrack: jest.fn() } as unknown as IWatchFileSystem;
    const snapshot = {
      operation: { createdPrograms: [{ id: 'synthetic:test' }] },
      getProgram: jest.fn().mockReturnValue(program),
      dispose: jest.fn().mockResolvedValue(undefined)
    };
    api.createSnapshot.mockResolvedValue(snapshot);
    program.getSemanticDiagnostics.mockImplementationOnce(async () => {
      if (failure === 'error') {
        throw new Error('check failure');
      }
      controller.abort();
      return [];
    });
    const invocation: Promise<void> = builder.invokeAsync(controller.signal, watchFs);
    if (failure === 'error') {
      await expect(invocation).rejects.toThrow('check failure');
    } else {
      await invocation;
    }
    expect(snapshot.dispose).toHaveBeenCalledTimes(1);
    expect(api.close).not.toHaveBeenCalled();
    await builder.invokeAsync(new AbortController().signal, watchFs);
    expect(createApi).toHaveBeenCalledTimes(1);
    expect(api.createSnapshot).toHaveBeenCalledTimes(2);
    expect(program.emit).toHaveBeenCalledTimes(1);
    await builder.closeAsync();
    expect(api.close).toHaveBeenCalledTimes(1);
  });

  it('can retry a missing watch config without replacing the API client', async () => {
    const watchFs = { getStateAndTrack: jest.fn() } as unknown as IWatchFileSystem;
    api.parseConfigFile.mockRejectedValueOnce(new Error('missing config'));
    await expect(builder.invokeAsync(controller.signal, watchFs)).rejects.toThrow('missing config');
    expect(api.close).not.toHaveBeenCalled();
    api.createSnapshot.mockResolvedValue({
      operation: { createdPrograms: [{ id: 'synthetic:test' }] },
      getProgram: () => program
    });
    await builder.invokeAsync(new AbortController().signal, watchFs);
    expect(createApi).toHaveBeenCalledTimes(1);
    expect(program.emit).toHaveBeenCalledTimes(1);
    await builder.closeAsync();
  });

  it('does not dispose a snapshot when the native API returns it unchanged', async () => {
    const watchFs = { getStateAndTrack: jest.fn() } as unknown as IWatchFileSystem;
    const snapshot = {
      operation: { createdPrograms: [{ id: 'synthetic:test' }] },
      getProgram: jest.fn().mockReturnValue(program),
      update: jest.fn(),
      dispose: jest.fn().mockResolvedValue(undefined)
    };
    snapshot.update.mockResolvedValue(snapshot);
    api.createSnapshot.mockResolvedValue(snapshot);
    await builder.invokeAsync(controller.signal, watchFs);
    await builder.invokeAsync(new AbortController().signal, watchFs);
    expect(snapshot.dispose).not.toHaveBeenCalled();
    expect(api.close).not.toHaveBeenCalled();
    expect(program.emit).toHaveBeenCalledTimes(2);
    await builder.closeAsync();
  });

  it('notifies actual created and deleted children of an existing enumerated directory', async () => {
    const directory: string = path.resolve(__dirname, '../../temp/watch-dependency-test');
    FileSystem.ensureEmptyFolder(directory);
    const oldFile: string = path.join(directory, 'old.ts');
    const newFile: string = path.join(directory, 'new.ts');
    fs.writeFileSync(oldFile, 'export const value = 1;');
    const watchFs = {
      getStateAndTrack: jest.fn(),
      readdirSync: jest.fn()
    } as unknown as IWatchFileSystem;
    const snapshot = {
      operation: { createdPrograms: [{ id: 'synthetic:test' }] },
      getProgram: jest.fn().mockReturnValue(program),
      update: jest.fn(),
      dispose: jest.fn()
    };
    const nextSnapshot = {
      getProgram: jest.fn().mockReturnValue(program)
    };
    api.createSnapshot.mockResolvedValue(snapshot);
    snapshot.update.mockResolvedValue(nextSnapshot);
    try {
      await builder.invokeAsync(controller.signal, watchFs);
      const options: APIOptions = createApi.mock.calls[0][0];
      const getEntries = options.fs!.getAccessibleEntries;
      if (typeof getEntries !== 'function') {
        throw new Error('Expected getAccessibleEntries');
      }
      getEntries(directory as never);
      fs.unlinkSync(oldFile);
      fs.writeFileSync(newFile, 'export const value = 2;');
      await builder.invokeAsync(new AbortController().signal, watchFs);
      expect(snapshot.update).toHaveBeenCalledWith({
        fileNotifications: { changed: [directory], created: [newFile], deleted: [oldFile] },
        ensurePrograms: true
      });
    } finally {
      await builder.closeAsync();
      FileSystem.deleteFolder(directory);
    }
  });

  it('replays creation notifications when a snapshot update fails before applying them', async () => {
    const directory: string = path.resolve(__dirname, '../../temp/watch-notification-retry');
    FileSystem.ensureEmptyFolder(directory);
    const filePath: string = path.join(directory, 'missing.ts');
    const watchFs = { getStateAndTrack: jest.fn() } as unknown as IWatchFileSystem;
    const snapshot = {
      operation: { createdPrograms: [{ id: 'synthetic:test' }] },
      getProgram: jest.fn().mockReturnValue(program),
      update: jest.fn().mockRejectedValue(new Error('update failure')),
      dispose: jest.fn()
    };
    api.createSnapshot.mockResolvedValue(snapshot);
    try {
      await builder.invokeAsync(controller.signal, watchFs);
      const options: APIOptions = createApi.mock.calls[0][0];
      const readFile = options.fs!.readFile;
      if (typeof readFile !== 'function') {
        throw new Error('Expected readFile');
      }
      readFile(filePath as never);
      fs.writeFileSync(filePath, 'export const value = 1;');
      await expect(builder.invokeAsync(controller.signal, watchFs)).rejects.toThrow('update failure');
      await builder.invokeAsync(new AbortController().signal, watchFs);
      expect(api.createSnapshot.mock.calls[1][0].fileNotifications).toEqual({
        changed: [],
        created: [filePath],
        deleted: []
      });
      expect(createApi).toHaveBeenCalledTimes(1);
    } finally {
      await builder.closeAsync();
      FileSystem.deleteFolder(directory);
    }
  });
});
