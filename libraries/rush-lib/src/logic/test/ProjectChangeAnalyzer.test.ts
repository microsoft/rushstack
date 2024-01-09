// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

const mockHashes: Map<string, string> = new Map([
  ['a/package.json', 'hash1'],
  ['b/package.json', 'hash2'],
  ['c/package.json', 'hash3'],
  ['changes/a.json', 'hash4'],
  ['changes/b.json', 'hash5'],
  ['changes/c.json', 'hash6'],
  ['changes/d.json', 'hash7'],
  ['changes/h.json', 'hash8'],
  ['common/config/rush/version-policies.json', 'hash9'],
  ['common/config/rush/npm-shrinkwrap.json', 'hash10'],
  ['d/package.json', 'hash11'],
  ['e/package.json', 'hash12'],
  ['f/package.json', 'hash13'],
  ['g/package.json', 'hash14'],
  ['h/package.json', 'hash15'],
  ['i/package.json', 'hash16'],
  ['j/package.json', 'hash17']
]);
jest.mock(`@rushstack/package-deps-hash`, () => {
  return {
    getRepoRoot(dir: string): string {
      return dir;
    },
    getRepoStateAsync(): ReadonlyMap<string, string> {
      return mockHashes;
    },
    getRepoChangesAsync(): ReadonlyMap<string, string> {
      return new Map();
    },
    getGitHashForFiles(filePaths: Iterable<string>): ReadonlyMap<string, string> {
      return new Map(Array.from(filePaths, (filePath: string) => [filePath, filePath]));
    }
  };
});

const mockSnapshot: jest.Mock = jest.fn();

jest.mock('../snapshots/InputSnapshot', () => {
  return {
    InputSnapshot: mockSnapshot
  };
});

import { resolve } from 'node:path';

import { ProjectChangeAnalyzer } from '../ProjectChangeAnalyzer';
import { RushConfiguration } from '../../api/RushConfiguration';
import { StringBufferTerminalProvider, Terminal } from '@rushstack/node-core-library';
import type { IInputSnapshot, IRushSnapshotParameters } from '../snapshots/InputSnapshot';

describe(ProjectChangeAnalyzer.name, () => {
  beforeEach(() => {
    mockSnapshot.mockClear();
  });

  describe(ProjectChangeAnalyzer.prototype._tryGetSnapshotAsync.name, () => {
    it('returns a snapshot', async () => {
      const rootDir: string = resolve(__dirname, 'repo');
      const rushConfiguration: RushConfiguration = RushConfiguration.loadFromConfigurationFile(
        resolve(rootDir, 'rush.json')
      );
      const projectChangeAnalyzer: ProjectChangeAnalyzer = new ProjectChangeAnalyzer(rushConfiguration);
      const terminalProvider: StringBufferTerminalProvider = new StringBufferTerminalProvider(true);
      const terminal: Terminal = new Terminal(terminalProvider);
      const mockSnapshotValue: {} = {};
      mockSnapshot.mockImplementation(() => mockSnapshotValue);
      const snapshot: IInputSnapshot | undefined = await projectChangeAnalyzer._tryGetSnapshotAsync(terminal);

      expect(snapshot).toBe(mockSnapshotValue);
      expect(terminalProvider.getErrorOutput()).toEqual('');
      expect(terminalProvider.getWarningOutput()).toEqual('');

      expect(mockSnapshot).toHaveBeenCalledTimes(1);

      const mockInput: IRushSnapshotParameters = mockSnapshot.mock.calls[0][0];
      expect(mockInput.globalAdditionalFiles).toBeDefined();
      expect(mockInput.globalAdditionalFiles).toMatchObject(['common/config/rush/npm-shrinkwrap.json']);

      expect(mockInput.hashes).toEqual(mockHashes);
      expect(mockInput.rootDir).toEqual(rootDir);
      expect(mockInput.additionalHashes).toEqual(new Map());
    });
  });
});
