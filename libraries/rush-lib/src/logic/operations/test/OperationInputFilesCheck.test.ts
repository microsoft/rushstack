// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

const mockCalls: string[] = [];

jest.mock('../InputFilesStatSignature', () => ({
  haveInputFilesChanged: jest.fn(() => {
    mockCalls.push('stat');
    return false;
  }),
  haveSnapshotHashesChangedAsync: jest.fn(async () => {
    mockCalls.push('hash');
    return false;
  })
}));

import {
  haveInputFilesChanged,
  haveSnapshotHashesChangedAsync,
  type IInputFilesState
} from '../InputFilesStatSignature';
import { getInputFilesChangeKindSinceSnapshotAsync } from '../OperationInputFilesCheck';

describe(getInputFilesChangeKindSinceSnapshotAsync.name, () => {
  const inputFilesState: IInputFilesState = {
    rootDirectory: 'repo',
    filePaths: [],
    statSignature: '',
    folderEntries: new Map(),
    filesChangedDuringSnapshot: ['src/index.ts'],
    filesDeletedDuringSnapshot: []
  };

  beforeEach(() => {
    mockCalls.length = 0;
    jest.mocked(haveInputFilesChanged).mockClear();
    jest.mocked(haveSnapshotHashesChangedAsync).mockClear();
  });

  it('re-hashes snapshot-window files before comparing stats', async () => {
    await expect(
      getInputFilesChangeKindSinceSnapshotAsync({
        inputFilesState,
        snapshotHashes: new Map([['src/index.ts', 'hash']]),
        getGitPath: () => 'git',
        isNewInput: () => false
      })
    ).resolves.toBe('none');

    expect(mockCalls).toEqual(['hash', 'stat']);
  });

  it('does not compare stats after a snapshot-window hash changes', async () => {
    jest.mocked(haveSnapshotHashesChangedAsync).mockImplementationOnce(async () => {
      mockCalls.push('hash');
      return true;
    });

    await expect(
      getInputFilesChangeKindSinceSnapshotAsync({
        inputFilesState,
        snapshotHashes: new Map([['src/index.ts', 'hash']]),
        getGitPath: () => 'git',
        isNewInput: () => false
      })
    ).resolves.toBe('snapshot-hashes');

    expect(mockCalls).toEqual(['hash']);
  });
});
