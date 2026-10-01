// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

jest.mock('../OperationStateFile');
jest.mock('node:fs');

import { MockWritable, StringBufferTerminalProvider, Terminal, TerminalChunkKind } from '@rushstack/terminal';
import type { IPhase } from '../../../api/CommandLineConfiguration';
import type { RushConfigurationProject } from '../../../api/RushConfigurationProject';
import { type IOperationMetaData, OperationMetadataManager } from '../OperationMetadataManager';
import { CollatedTerminalProvider } from '../../../utilities/CollatedTerminalProvider';
import { CollatedTerminal } from '@rushstack/stream-collator';
import { FileSystem, type IFileSystemCopyFileOptions, NewlineKind, Text } from '@rushstack/node-core-library';
import * as fs from 'node:fs';
import { Readable } from 'node:stream';
import { Operation } from '../Operation';

const mockWritable: MockWritable = new MockWritable();
const mockTerminal: Terminal = new Terminal(new CollatedTerminalProvider(new CollatedTerminal(mockWritable)));

const operation = new Operation({
  logFilenameIdentifier: 'identifier',
  project: {
    projectFolder: '/path/to/project'
  } as unknown as RushConfigurationProject,
  phase: {
    logFilenameIdentifier: 'identifier'
  } as unknown as IPhase
});

const manager: OperationMetadataManager = new OperationMetadataManager({
  operation
});

const cachedErrorLogPath: string = '/path/to/project/.rush/temp/operation/identifier/error.log';

function createNotExistError(): NodeJS.ErrnoException {
  return Object.assign(new Error('ENOENT: no such file or directory'), {
    code: 'ENOENT',
    errno: -2,
    syscall: 'copyfile',
    path: '/path/to/file'
  });
}

describe(OperationMetadataManager.name, () => {
  let mockTerminalProvider: StringBufferTerminalProvider;
  beforeEach(() => {
    mockTerminalProvider = new StringBufferTerminalProvider(false);
    jest.spyOn(FileSystem, 'copyFileAsync').mockResolvedValue();
    jest.spyOn(FileSystem, 'deleteFileAsync').mockResolvedValue();
    jest.spyOn(FileSystem, 'writeFileAsync').mockResolvedValue();
  });

  function toJsonLines(data: object[]): string {
    return data.map((item) => JSON.stringify(item)).join('\n');
  }

  it('should restore chunked stdout', async () => {
    const data = [
      {
        text: 'chunk1\n',
        kind: TerminalChunkKind.Stdout
      },
      {
        text: 'chunk2\n',
        kind: TerminalChunkKind.Stdout
      }
    ];

    jest.spyOn(FileSystem, 'readFileAsync').mockResolvedValue(toJsonLines(data));

    await manager.tryRestoreAsync({
      terminal: mockTerminal,
      terminalProvider: mockTerminalProvider,
      errorLogPath: '/path/to/errorLog'
    });

    expect(mockTerminalProvider.getAllOutputAsChunks({ asLines: true })).toMatchSnapshot();
    expect(mockTerminalProvider.getWarningOutput()).toBeFalsy();
  });

  it('should restore chunked stderr', async () => {
    const data = [
      {
        text: 'chunk1\n',
        kind: TerminalChunkKind.Stderr
      },
      {
        text: 'chunk2\n',
        kind: TerminalChunkKind.Stderr
      }
    ];

    jest.spyOn(FileSystem, 'readFileAsync').mockResolvedValue(toJsonLines(data));

    await manager.tryRestoreAsync({
      terminal: mockTerminal,
      terminalProvider: mockTerminalProvider,
      errorLogPath: '/path/to/errorLog'
    });

    expect(mockTerminalProvider.getAllOutputAsChunks({ asLines: true })).toMatchSnapshot();
  });

  it('should restore mixed chunked output', async () => {
    const data = [
      {
        text: 'logged to stdout\n',
        kind: TerminalChunkKind.Stdout
      },
      {
        text: 'logged to stderr\n',
        kind: TerminalChunkKind.Stderr
      }
    ];

    jest.spyOn(FileSystem, 'readFileAsync').mockResolvedValue(toJsonLines(data));

    await manager.tryRestoreAsync({
      terminal: mockTerminal,
      terminalProvider: mockTerminalProvider,
      errorLogPath: '/path/to/errorLog'
    });
    expect(mockTerminalProvider.getAllOutputAsChunks({ asLines: true })).toMatchSnapshot();
  });

  it("should fallback to the log file when chunked output isn't available", async () => {
    // Normalize newlines to make the error message consistent across platforms
    const normalizedRawLogFile: string = `stdout log file`;
    jest
      .spyOn(FileSystem, 'readFileAsync')
      .mockRejectedValue({ code: 'ENOENT', syscall: 'open', path: '/path/to/file', errno: 1 });

    const mockClose = jest.fn();
    const mockReadStream: fs.ReadStream = Readable.from([normalizedRawLogFile]) as fs.ReadStream;
    mockReadStream.close = mockClose;
    jest.spyOn(fs, 'createReadStream').mockReturnValue(mockReadStream);

    await manager.tryRestoreAsync({
      terminal: mockTerminal,
      terminalProvider: mockTerminalProvider,
      errorLogPath: '/path/to/errorLog'
    });

    expect(mockTerminalProvider.getAllOutput(true)).toEqual({});
    expect(mockClose).toHaveBeenCalledTimes(1);
    expect(mockWritable.chunks).toMatchSnapshot();
  });

  it('should write the error log from the stderr chunks instead of copying the cached error log', async () => {
    const data = [
      {
        text: 'logged to stdout\n',
        kind: TerminalChunkKind.Stdout
      },
      {
        text: '\u001b[31merror TS2345: first\u001b[39m\r\n',
        kind: TerminalChunkKind.Stderr
      },
      {
        text: 'more stdout\n',
        kind: TerminalChunkKind.Stdout
      },
      {
        text: 'error TS2304: second\n',
        kind: TerminalChunkKind.Stderr
      }
    ];

    jest.spyOn(FileSystem, 'readFileAsync').mockResolvedValue(toJsonLines(data));

    await manager.tryRestoreAsync({
      terminal: mockTerminal,
      terminalProvider: mockTerminalProvider,
      errorLogPath: '/path/to/errorLog'
    });

    expect(FileSystem.writeFileAsync).toHaveBeenCalledTimes(1);
    expect(FileSystem.writeFileAsync).toHaveBeenCalledWith(
      '/path/to/errorLog',
      Text.convertTo('error TS2345: first\nerror TS2304: second\n', NewlineKind.OsDefault),
      { ensureFolderExists: true }
    );
    expect(FileSystem.copyFileAsync).not.toHaveBeenCalled();
    expect(FileSystem.deleteFileAsync).not.toHaveBeenCalled();
  });

  it('should delete the error log when the chunks have no stderr, even if the cache entry has an error log', async () => {
    // An entry saved after a failed run could hold that run's error log, even though its own run wrote no stderr
    const data = [
      {
        text: 'built without errors\n',
        kind: TerminalChunkKind.Stdout
      }
    ];

    jest.spyOn(FileSystem, 'readFileAsync').mockResolvedValue(toJsonLines(data));

    await manager.tryRestoreAsync({
      terminal: mockTerminal,
      terminalProvider: mockTerminalProvider,
      errorLogPath: '/path/to/errorLog'
    });

    expect(FileSystem.deleteFileAsync).toHaveBeenCalledTimes(1);
    expect(FileSystem.deleteFileAsync).toHaveBeenCalledWith('/path/to/errorLog');
    expect(FileSystem.copyFileAsync).not.toHaveBeenCalled();
    expect(FileSystem.writeFileAsync).not.toHaveBeenCalled();
  });

  describe('without log chunks', () => {
    beforeEach(() => {
      jest.spyOn(FileSystem, 'readFileAsync').mockRejectedValue(createNotExistError());
      const mockReadStream: fs.ReadStream = Readable.from([]) as fs.ReadStream;
      mockReadStream.close = jest.fn();
      jest.spyOn(fs, 'createReadStream').mockReturnValue(mockReadStream);
    });

    it('should copy the cached error log', async () => {
      await manager.tryRestoreAsync({
        terminal: mockTerminal,
        terminalProvider: mockTerminalProvider,
        errorLogPath: '/path/to/errorLog'
      });

      expect(FileSystem.copyFileAsync).toHaveBeenCalledTimes(1);
      expect(FileSystem.copyFileAsync).toHaveBeenCalledWith({
        sourcePath: cachedErrorLogPath,
        destinationPath: '/path/to/errorLog'
      });
      expect(FileSystem.deleteFileAsync).not.toHaveBeenCalled();
      expect(FileSystem.writeFileAsync).not.toHaveBeenCalled();
    });

    it('should delete the error log when the cache entry has none', async () => {
      jest.spyOn(FileSystem, 'copyFileAsync').mockRejectedValue(createNotExistError());

      await manager.tryRestoreAsync({
        terminal: mockTerminal,
        terminalProvider: mockTerminalProvider,
        errorLogPath: '/path/to/errorLog'
      });

      expect(FileSystem.deleteFileAsync).toHaveBeenCalledTimes(1);
      expect(FileSystem.deleteFileAsync).toHaveBeenCalledWith('/path/to/errorLog');
    });
  });

  describe('saveAsync', () => {
    const metadata: IOperationMetaData = {
      durationInSeconds: 1,
      cobuildContextId: undefined,
      cobuildRunnerId: undefined,
      logPath: '/path/to/rush-logs/project.identifier.log',
      errorLogPath: '/path/to/rush-logs/project.identifier.error.log',
      logChunksPath: '/path/to/project/.rush/temp/chunked-rush-logs/project.identifier.chunks.jsonl'
    };

    it('should copy the log files of the run', async () => {
      await manager.saveAsync(metadata);

      expect(FileSystem.copyFileAsync).toHaveBeenCalledTimes(3);
      expect(FileSystem.copyFileAsync).toHaveBeenCalledWith({
        sourcePath: metadata.errorLogPath,
        destinationPath: cachedErrorLogPath
      });
      expect(FileSystem.deleteFileAsync).not.toHaveBeenCalled();
    });

    it('should delete the copy an earlier run left when the run did not write an error log', async () => {
      jest
        .spyOn(FileSystem, 'copyFileAsync')
        .mockImplementation(async ({ sourcePath }: IFileSystemCopyFileOptions) => {
          if (sourcePath === metadata.errorLogPath) {
            throw createNotExistError();
          }
        });

      await manager.saveAsync(metadata);

      expect(FileSystem.copyFileAsync).toHaveBeenCalledTimes(3);
      expect(FileSystem.deleteFileAsync).toHaveBeenCalledTimes(1);
      expect(FileSystem.deleteFileAsync).toHaveBeenCalledWith(cachedErrorLogPath);
    });

    it('should rethrow other errors', async () => {
      const error: Error = new Error('EACCES: permission denied');
      jest.spyOn(FileSystem, 'copyFileAsync').mockRejectedValue(error);

      await expect(manager.saveAsync(metadata)).rejects.toThrow(error);
      expect(FileSystem.deleteFileAsync).not.toHaveBeenCalled();
    });
  });
});
