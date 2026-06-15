// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'node:path';
import { execSync, type SpawnSyncReturns } from 'node:child_process';

import {
  getDetailedRepoStateAsync,
  type IDetailedRepoState,
  parseGitLsTree,
  getRepoRoot,
  parseGitHashObject
} from '../getRepoState';

import { Executable, FileSystem } from '@rushstack/node-core-library';

const SOURCE_PATH: string = path
  .join(__dirname)
  .replace(path.join('lib-commonjs', 'test'), path.join('src', 'test'));

const TEST_PREFIX: string = `libraries/package-deps-hash/src/test/`;
const TEST_PROJECT_PATH: string = path.join(SOURCE_PATH, 'testProject');

const FILTERS: string[] = [`testProject/`, `nestedTestProject/`];

function checkSnapshot(results: IDetailedRepoState): void {
  const relevantResults: Record<string, string> = {};
  for (const [key, hash] of results.files) {
    if (key.startsWith(TEST_PREFIX)) {
      const partialKey: string = key.slice(TEST_PREFIX.length);
      relevantResults[partialKey] = hash;
    }
  }

  expect({
    hasSubmodules: results.hasSubmodules,
    hasUncommittedChanges: results.hasUncommittedChanges,
    files: relevantResults
  }).toMatchSnapshot();
}

describe(getRepoRoot.name, () => {
  it(`returns the correct directory`, () => {
    const root: string = getRepoRoot(__dirname);
    const expectedRoot: string = path.resolve(__dirname, '../../../..').replace(/\\/g, '/');
    expect(root).toEqual(expectedRoot);
  });

  it(`strips GIT_DIR and GIT_WORK_TREE before invoking git`, () => {
    // Regression test for the linked-worktree bug. When git runs a hook it injects GIT_DIR (and
    // sometimes GIT_WORK_TREE) into the environment; in a linked worktree GIT_DIR points at the
    // per-worktree metadata directory, which makes `git rev-parse --show-toplevel` resolve against
    // the current directory instead of the true repository root. getRepoRoot must therefore invoke
    // git with those variables removed, so the root is derived solely from currentWorkingDirectory.
    //
    // This is asserted at the spawn boundary rather than by mutating process.env and shelling out for
    // real: the Jest environment does not propagate in-process process.env writes to child processes,
    // so an end-to-end variant would pass whether or not the stripping actually happens.
    const fakeRoot: string = '/fake/repo/root';
    const mockResult: SpawnSyncReturns<string> = {
      pid: 0,
      output: [],
      stdout: fakeRoot,
      stderr: '',
      status: 0,
      signal: null
    };
    const spawnSyncSpy: jest.SpyInstance = jest.spyOn(Executable, 'spawnSync').mockReturnValue(mockResult);

    const originalGitDir: string | undefined = process.env.GIT_DIR;
    const originalGitWorkTree: string | undefined = process.env.GIT_WORK_TREE;
    try {
      process.env.GIT_DIR = '/repo/.git/worktrees/feature';
      process.env.GIT_WORK_TREE = '/repo/work/tree';

      // A unique cwd that no other test resolves, so getRepoRoot's module-level cache can't satisfy
      // this from a previous call and skip the spawn.
      getRepoRoot('/nonexistent/getRepoRoot-strips-git-env');

      expect(spawnSyncSpy).toHaveBeenCalledTimes(1);
      const passedEnvironment: NodeJS.ProcessEnv | undefined = spawnSyncSpy.mock.calls[0][2]?.environment;
      // The fix passes an explicit environment (pre-fix code passed none) that omits both variables,
      // while leaving the rest of process.env intact.
      expect(passedEnvironment).toBeDefined();
      expect(passedEnvironment).not.toHaveProperty('GIT_DIR');
      expect(passedEnvironment).not.toHaveProperty('GIT_WORK_TREE');
    } finally {
      spawnSyncSpy.mockRestore();
      if (originalGitDir === undefined) {
        delete process.env.GIT_DIR;
      } else {
        process.env.GIT_DIR = originalGitDir;
      }
      if (originalGitWorkTree === undefined) {
        delete process.env.GIT_WORK_TREE;
      } else {
        process.env.GIT_WORK_TREE = originalGitWorkTree;
      }
    }
  });
});

describe(parseGitLsTree.name, () => {
  it('can handle a blob', () => {
    const filename: string = 'src/typings/tsd.d.ts';
    const hash: string = '3451bccdc831cb43d7a70ed8e628dcf9c7f888c8';

    const output: string = `100644 blob ${hash}\t${filename}\x00`;
    const { files, symlinks, submodules } = parseGitLsTree(output);

    expect(symlinks.size).toEqual(0); // Expect there to be exactly 0 symlinks
    expect(submodules.size).toEqual(0); // Expect there to be exactly 0 submodules

    expect(files.size).toEqual(1); // Expect there to be exactly 1 change
    expect(files.get(filename)).toEqual(hash); // Expect the hash to be ${hash}
  });

  it('can handle a symlink', () => {
    const filename: string = 'src/symlink';
    const hash: string = '3451bccdc831cb43d7a70ed8e628dcf9c7f888c8';

    const output: string = `120000 link ${hash}\t${filename}\x00`;
    const { files, symlinks, submodules } = parseGitLsTree(output);

    expect(files.size).toEqual(0); // Expect there to be exactly 0 files
    expect(submodules.size).toEqual(0); // Expect there to be exactly 0 submodules

    expect(symlinks.size).toEqual(1); // Expect there to be exactly 1 symlink
    expect(symlinks.get(filename)).toEqual(hash); // Expect the hash to be ${hash}
  });

  it('can handle a submodule', () => {
    const filename: string = 'rushstack';
    const hash: string = 'c5880bf5b0c6c1f2e2c43c95beeb8f0a808e8bac';

    const output: string = `160000 commit ${hash}\t${filename}\x00`;
    const { submodules } = parseGitLsTree(output);

    expect(submodules.size).toEqual(1); // Expect there to be exactly 1 submodule change
    expect(submodules.get(filename)).toEqual(hash); // Expect the hash to be ${hash}
  });

  it('can handle multiple lines', () => {
    const filename1: string = 'src/typings/tsd.d.ts';
    const hash1: string = '3451bccdc831cb43d7a70ed8e628dcf9c7f888c8';

    const filename2: string = 'src/foo bar/tsd.d.ts';
    const hash2: string = '0123456789abcdef1234567890abcdef01234567';

    const filename3: string = 'submodule/src/index.ts';
    const hash3: string = 'fedcba9876543210fedcba9876543210fedcba98';

    const output: string = `100644 blob ${hash1}\t${filename1}\x00100666 blob ${hash2}\t${filename2}\x00160000 commit ${hash3}\t${filename3}\0`;
    const { files, symlinks, submodules } = parseGitLsTree(output);

    expect(files.size).toEqual(2); // Expect there to be exactly 2 files
    expect(files.get(filename1)).toEqual(hash1); // Expect the hash to be ${hash1}
    expect(files.get(filename2)).toEqual(hash2); // Expect the hash to be ${hash2}

    expect(symlinks.size).toEqual(0); // Expect there to be exactly 0 symlink changes

    expect(submodules.size).toEqual(1); // Expect there to be exactly 1 submodule
    expect(submodules.get(filename3)).toEqual(hash3); // Expect the hash to be ${hash3}
  });
});

describe(parseGitHashObject.name, () => {
  it('can handle requesting zero entries', () => {
    const results: Map<string, string> = new Map(parseGitHashObject('', []));
    expect(results.size).toEqual(0);
  });

  it('can parse multiple entries', () => {
    const results: Map<string, string> = new Map(parseGitHashObject('11\n22\n33', ['a', 'b', 'c']));
    expect(results).toMatchSnapshot();
  });

  it('can parse multiple entries with trailing whitespace', () => {
    const results: Map<string, string> = new Map(parseGitHashObject('11\n22\n33\n\n', ['a', 'b', 'c']));
    expect(results).toMatchSnapshot();
  });

  it('throws if too few hashes are provided', () => {
    expect(() => {
      new Map(parseGitHashObject('11\n22', ['a', 'b', 'c']));
    }).toThrowErrorMatchingSnapshot();
  });

  it('throws if too many hashes are provided', () => {
    expect(() => {
      new Map(parseGitHashObject('11\n22\n33', ['a', 'b']));
    }).toThrowErrorMatchingSnapshot();
  });
});

describe(getDetailedRepoStateAsync.name, () => {
  it('can parse committed files', async () => {
    const results: IDetailedRepoState = await getDetailedRepoStateAsync(
      SOURCE_PATH,
      undefined,
      undefined,
      FILTERS
    );
    checkSnapshot(results);
  });

  it('can handle adding one file', async () => {
    const tempFilePath: string = path.join(TEST_PROJECT_PATH, 'a.txt');

    FileSystem.writeFile(tempFilePath, 'a');

    try {
      const results: IDetailedRepoState = await getDetailedRepoStateAsync(
        SOURCE_PATH,
        undefined,
        undefined,
        FILTERS
      );
      checkSnapshot(results);
    } finally {
      FileSystem.deleteFile(tempFilePath);
    }
  });

  it('can handle adding two files', async () => {
    const tempFilePath1: string = path.join(TEST_PROJECT_PATH, 'a.txt');
    const tempFilePath2: string = path.join(TEST_PROJECT_PATH, 'b.txt');

    FileSystem.writeFile(tempFilePath1, 'a');
    FileSystem.writeFile(tempFilePath2, 'a');

    try {
      const results: IDetailedRepoState = await getDetailedRepoStateAsync(
        SOURCE_PATH,
        undefined,
        undefined,
        FILTERS
      );
      checkSnapshot(results);
    } finally {
      FileSystem.deleteFile(tempFilePath1);
      FileSystem.deleteFile(tempFilePath2);
    }
  });

  it('can handle removing one file', async () => {
    const testFilePath: string = path.join(TEST_PROJECT_PATH, 'file1.txt');

    FileSystem.deleteFile(testFilePath);

    try {
      const results: IDetailedRepoState = await getDetailedRepoStateAsync(
        SOURCE_PATH,
        undefined,
        undefined,
        FILTERS
      );
      checkSnapshot(results);
    } finally {
      execSync(`git checkout --force HEAD -- ${TEST_PREFIX}testProject/file1.txt`, {
        stdio: 'ignore',
        cwd: getRepoRoot(SOURCE_PATH)
      });
    }
  });

  it('can handle changing one file', async () => {
    const testFilePath: string = path.join(TEST_PROJECT_PATH, 'file1.txt');

    FileSystem.writeFile(testFilePath, 'abc');

    try {
      const results: IDetailedRepoState = await getDetailedRepoStateAsync(
        SOURCE_PATH,
        undefined,
        undefined,
        FILTERS
      );
      checkSnapshot(results);
    } finally {
      execSync(`git checkout --force HEAD -- ${TEST_PREFIX}testProject/file1.txt`, {
        stdio: 'ignore',
        cwd: getRepoRoot(SOURCE_PATH)
      });
    }
  });

  it('can handle uncommitted filenames with spaces and non-ASCII characters', async () => {
    const tempFilePath1: string = path.join(TEST_PROJECT_PATH, 'a file.txt');
    const tempFilePath2: string = path.join(TEST_PROJECT_PATH, 'a  file name.txt');
    const tempFilePath3: string = path.join(TEST_PROJECT_PATH, 'newFile批把.txt');

    FileSystem.writeFile(tempFilePath1, 'a');
    FileSystem.writeFile(tempFilePath2, 'a');
    FileSystem.writeFile(tempFilePath3, 'a');

    try {
      const results: IDetailedRepoState = await getDetailedRepoStateAsync(
        SOURCE_PATH,
        undefined,
        undefined,
        FILTERS
      );
      checkSnapshot(results);
    } finally {
      FileSystem.deleteFile(tempFilePath1);
      FileSystem.deleteFile(tempFilePath2);
      FileSystem.deleteFile(tempFilePath3);
    }
  });

  it('handles requests for additional files', async () => {
    const tempFilePath1: string = path.join(TEST_PROJECT_PATH, 'log.log');

    FileSystem.writeFile(tempFilePath1, 'a');

    try {
      const results: IDetailedRepoState = await getDetailedRepoStateAsync(
        SOURCE_PATH,
        [`${TEST_PREFIX}testProject/log.log`],
        undefined,
        FILTERS
      );
      checkSnapshot(results);
    } finally {
      FileSystem.deleteFile(tempFilePath1);
    }
  });
});
