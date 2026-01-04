// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

jest.mock('../OperationStateFile');
jest.mock('node:fs');

import { MockWritable, StringBufferTerminalProvider, Terminal, TerminalChunkKind } from '@rushstack/terminal';
import type { IPhase } from '../../../api/CommandLineConfiguration';
import type { RushConfigurationProject } from '../../../api/RushConfigurationProject';
import { OperationMetadataManager } from '../OperationMetadataManager';
import { CollatedTerminalProvider } from '../../../utilities/CollatedTerminalProvider';
import { CollatedTerminal } from '@rushstack/stream-collator';
import { FileSystem } from '@rushstack/node-core-library';
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

describe(OperationMetadataManager.name, () => {
  let mockTerminalProvider: StringBufferTerminalProvider;
  beforeEach(() => {
    mockTerminalProvider = new StringBufferTerminalProvider(false);
    jest.spyOn(FileSystem, 'copyFileAsync').mockResolvedValue();
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

    expect(
      mockTerminalProvider.getAllOutputAsChunks({ asFlat: true, severityAsNames: true })
    ).toMatchSnapshot();
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

    expect(
      mockTerminalProvider.getAllOutputAsChunks({ asFlat: true, severityAsNames: true })
    ).toMatchSnapshot();
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
    expect(
      mockTerminalProvider.getAllOutputAsChunks({ asFlat: true, severityAsNames: true })
    ).toMatchSnapshot();
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

    expect(mockTerminalProvider.getAllOutput()).toEqual({});
    expect(mockClose).toHaveBeenCalledTimes(1);
    expect(mockWritable.chunks).toMatchSnapshot();
  });
});
