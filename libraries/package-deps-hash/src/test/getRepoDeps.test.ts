// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'path';
import { execSync } from 'child_process';

import { getRepoState, parseGitLsTree, getRepoRoot } from '../getRepoState';

import { FileSystem, FileConstants } from '@rushstack/node-core-library';

const SOURCE_PATH: string = path.join(__dirname).replace(path.join('lib', 'test'), path.join('src', 'test'));

const TEST_PREFIX: string = `libraries/package-deps-hash/src/test/`;
const TEST_PROJECT_PATH: string = path.join(SOURCE_PATH, 'testProject');

const FILTERS: string[] = [`testProject/`, `nestedTestProject/`];

function getRelevantEntries(results: Map<string, string>): Map<string, string> {
  const relevantResults: Map<string, string> = new Map();
  for (const [key, hash] of results) {
    if (key.startsWith(TEST_PREFIX)) {
      const partialKey: string = key.slice(TEST_PREFIX.length);
      for (const filter of FILTERS) {
        if (partialKey.startsWith(filter)) {
          relevantResults.set(partialKey, hash);
        }
      }
    }
  }
  return relevantResults;
}

describe(`getRepoRoot`, () => {
  it(`returns the correct directory`, () => {
    const root: string = getRepoRoot(__dirname);
    const expectedRoot: string = path.resolve(__dirname, '../../../..').replace(/\\/g, '/');
    expect(root).toEqual(expectedRoot);
  });
});

describe('parseGitLsTree', () => {
  it('can handle a blob', () => {
    const filename: string = 'src/typings/tsd.d.ts';
    const hash: string = '3451bccdc831cb43d7a70ed8e628dcf9c7f888c8';

    const output: string = `100644 blob ${hash}\t${filename}\x00`;
    const changes: Map<string, string> = parseGitLsTree(output);

    expect(changes.size).toEqual(1); // Expect there to be exactly 1 change
    expect(changes.get(filename)).toEqual(hash); // Expect the hash to be ${hash}
  });

  it('can handle a submodule', () => {
    const filename: string = 'rushstack';
    const hash: string = 'c5880bf5b0c6c1f2e2c43c95beeb8f0a808e8bac';

    const output: string = `160000 commit ${hash}\t${filename}\x00`;
    const changes: Map<string, string> = parseGitLsTree(output);

    expect(changes.size).toEqual(1); // Expect there to be exactly 1 change
    expect(changes.get(filename)).toEqual(hash); // Expect the hash to be ${hash}
  });

  it('can handle multiple lines', () => {
    const filename1: string = 'src/typings/tsd.d.ts';
    const hash1: string = '3451bccdc831cb43d7a70ed8e628dcf9c7f888c8';

    const filename2: string = 'src/foo bar/tsd.d.ts';
    const hash2: string = '0123456789abcdef1234567890abcdef01234567';

    const output: string = `100644 blob ${hash1}\t${filename1}\x00100666 blob ${hash2}\t${filename2}\0`;
    const changes: Map<string, string> = parseGitLsTree(output);

    expect(changes.size).toEqual(2); // Expect there to be exactly 2 changes
    expect(changes.get(filename1)).toEqual(hash1); // Expect the hash to be ${hash1}
    expect(changes.get(filename2)).toEqual(hash2); // Expect the hash to be ${hash2}
  });
});

describe('getPackageDeps', () => {
  it('can parse committed files', () => {
    const results: Map<string, string> = getRepoState(__dirname);
    const filteredResults: Map<string, string> = getRelevantEntries(results);
    const expectedFiles: Map<string, string> = new Map(
      Object.entries({
        'nestedTestProject/src/file 1.txt': 'c7b2f707ac99ca522f965210a7b6b0b109863f34',
        [`nestedTestProject/${FileConstants.PackageJson}`]: '18a1e415e56220fa5122428a4ef8eb8874756576',
        'testProject/file1.txt': 'c7b2f707ac99ca522f965210a7b6b0b109863f34',
        'testProject/file  2.txt': 'a385f754ec4fede884a4864d090064d9aeef8ccb',
        'testProject/file蝴蝶.txt': 'ae814af81e16cb2ae8c57503c77e2cab6b5462ba',
        [`testProject/${FileConstants.PackageJson}`]: '18a1e415e56220fa5122428a4ef8eb8874756576'
      })
    );

    for (const [filePath, hash] of expectedFiles) {
      expect(filteredResults.get(filePath)).toEqual(hash);
    }
    expect(filteredResults.size).toEqual(expectedFiles.size);
  });

  it('can handle adding one file', () => {
    const tempFilePath: string = path.join(TEST_PROJECT_PATH, 'a.txt');

    FileSystem.writeFile(tempFilePath, 'a');

    const results: Map<string, string> = getRepoState(__dirname);
    const filteredResults: Map<string, string> = getRelevantEntries(results);

    try {
      const expectedFiles: Map<string, string> = new Map(
        Object.entries({
          'nestedTestProject/src/file 1.txt': 'c7b2f707ac99ca522f965210a7b6b0b109863f34',
          [`nestedTestProject/${FileConstants.PackageJson}`]: '18a1e415e56220fa5122428a4ef8eb8874756576',
          'testProject/a.txt': '2e65efe2a145dda7ee51d1741299f848e5bf752e',
          'testProject/file1.txt': 'c7b2f707ac99ca522f965210a7b6b0b109863f34',
          'testProject/file  2.txt': 'a385f754ec4fede884a4864d090064d9aeef8ccb',
          'testProject/file蝴蝶.txt': 'ae814af81e16cb2ae8c57503c77e2cab6b5462ba',
          [`testProject/${FileConstants.PackageJson}`]: '18a1e415e56220fa5122428a4ef8eb8874756576'
        })
      );

      for (const [filePath, hash] of expectedFiles) {
        expect(filteredResults.get(filePath)).toEqual(hash);
      }
      expect(filteredResults.size).toEqual(expectedFiles.size);
    } finally {
      FileSystem.deleteFile(tempFilePath);
    }
  });

  it('can handle adding two files', () => {
    const tempFilePath1: string = path.join(TEST_PROJECT_PATH, 'a.txt');
    const tempFilePath2: string = path.join(TEST_PROJECT_PATH, 'b.txt');

    FileSystem.writeFile(tempFilePath1, 'a');
    FileSystem.writeFile(tempFilePath2, 'a');

    const results: Map<string, string> = getRepoState(__dirname);
    const filteredResults: Map<string, string> = getRelevantEntries(results);

    try {
      const expectedFiles: Map<string, string> = new Map(
        Object.entries({
          'nestedTestProject/src/file 1.txt': 'c7b2f707ac99ca522f965210a7b6b0b109863f34',
          [`nestedTestProject/${FileConstants.PackageJson}`]: '18a1e415e56220fa5122428a4ef8eb8874756576',
          'testProject/a.txt': '2e65efe2a145dda7ee51d1741299f848e5bf752e',
          'testProject/b.txt': '2e65efe2a145dda7ee51d1741299f848e5bf752e',
          'testProject/file1.txt': 'c7b2f707ac99ca522f965210a7b6b0b109863f34',
          'testProject/file  2.txt': 'a385f754ec4fede884a4864d090064d9aeef8ccb',
          'testProject/file蝴蝶.txt': 'ae814af81e16cb2ae8c57503c77e2cab6b5462ba',
          [`testProject/${FileConstants.PackageJson}`]: '18a1e415e56220fa5122428a4ef8eb8874756576'
        })
      );

      for (const [filePath, hash] of expectedFiles) {
        expect(filteredResults.get(filePath)).toEqual(hash);
      }
      expect(filteredResults.size).toEqual(expectedFiles.size);
    } finally {
      FileSystem.deleteFile(tempFilePath1);
      FileSystem.deleteFile(tempFilePath2);
    }
  });

  it('can handle removing one file', () => {
    const testFilePath: string = path.join(TEST_PROJECT_PATH, 'file1.txt');

    FileSystem.deleteFile(testFilePath);

    const results: Map<string, string> = getRepoState(__dirname);
    const filteredResults: Map<string, string> = getRelevantEntries(results);

    try {
      const expectedFiles: Map<string, string> = new Map(
        Object.entries({
          'nestedTestProject/src/file 1.txt': 'c7b2f707ac99ca522f965210a7b6b0b109863f34',
          [`nestedTestProject/${FileConstants.PackageJson}`]: '18a1e415e56220fa5122428a4ef8eb8874756576',
          'testProject/file  2.txt': 'a385f754ec4fede884a4864d090064d9aeef8ccb',
          'testProject/file蝴蝶.txt': 'ae814af81e16cb2ae8c57503c77e2cab6b5462ba',
          [`testProject/${FileConstants.PackageJson}`]: '18a1e415e56220fa5122428a4ef8eb8874756576'
        })
      );

      for (const [filePath, hash] of expectedFiles) {
        expect(filteredResults.get(filePath)).toEqual(hash);
      }
      expect(filteredResults.size).toEqual(expectedFiles.size);
    } finally {
      execSync(`git checkout --force HEAD -- ${TEST_PREFIX}testProject/file1.txt`, {
        stdio: 'ignore',
        cwd: getRepoRoot(__dirname)
      });
    }
  });

  it('can handle changing one file', () => {
    const testFilePath: string = path.join(TEST_PROJECT_PATH, 'file1.txt');

    FileSystem.writeFile(testFilePath, 'abc');

    const results: Map<string, string> = getRepoState(__dirname);
    const filteredResults: Map<string, string> = getRelevantEntries(results);

    try {
      const expectedFiles: Map<string, string> = new Map(
        Object.entries({
          'nestedTestProject/src/file 1.txt': 'c7b2f707ac99ca522f965210a7b6b0b109863f34',
          [`nestedTestProject/${FileConstants.PackageJson}`]: '18a1e415e56220fa5122428a4ef8eb8874756576',
          'testProject/file1.txt': 'f2ba8f84ab5c1bce84a7b441cb1959cfc7093b7f',
          'testProject/file  2.txt': 'a385f754ec4fede884a4864d090064d9aeef8ccb',
          'testProject/file蝴蝶.txt': 'ae814af81e16cb2ae8c57503c77e2cab6b5462ba',
          [`testProject/${FileConstants.PackageJson}`]: '18a1e415e56220fa5122428a4ef8eb8874756576'
        })
      );

      for (const [filePath, hash] of expectedFiles) {
        expect(filteredResults.get(filePath)).toEqual(hash);
      }
      expect(filteredResults.size).toEqual(expectedFiles.size);
    } finally {
      execSync(`git checkout --force HEAD -- ${TEST_PREFIX}testProject/file1.txt`, {
        stdio: 'ignore',
        cwd: getRepoRoot(__dirname)
      });
    }
  });

  it('can handle uncommitted filenames with spaces and non-ASCII characters', () => {
    const tempFilePath1: string = path.join(TEST_PROJECT_PATH, 'a file.txt');
    const tempFilePath2: string = path.join(TEST_PROJECT_PATH, 'a  file name.txt');
    const tempFilePath3: string = path.join(TEST_PROJECT_PATH, 'newFile批把.txt');

    FileSystem.writeFile(tempFilePath1, 'a');
    FileSystem.writeFile(tempFilePath2, 'a');
    FileSystem.writeFile(tempFilePath3, 'a');

    const results: Map<string, string> = getRepoState(__dirname);
    const filteredResults: Map<string, string> = getRelevantEntries(results);

    try {
      const expectedFiles: Map<string, string> = new Map(
        Object.entries({
          'nestedTestProject/src/file 1.txt': 'c7b2f707ac99ca522f965210a7b6b0b109863f34',
          [`nestedTestProject/${FileConstants.PackageJson}`]: '18a1e415e56220fa5122428a4ef8eb8874756576',
          'testProject/a file.txt': '2e65efe2a145dda7ee51d1741299f848e5bf752e',
          'testProject/a  file name.txt': '2e65efe2a145dda7ee51d1741299f848e5bf752e',
          'testProject/file1.txt': 'c7b2f707ac99ca522f965210a7b6b0b109863f34',
          'testProject/file  2.txt': 'a385f754ec4fede884a4864d090064d9aeef8ccb',
          'testProject/file蝴蝶.txt': 'ae814af81e16cb2ae8c57503c77e2cab6b5462ba',
          'testProject/newFile批把.txt': '2e65efe2a145dda7ee51d1741299f848e5bf752e',
          [`testProject/${FileConstants.PackageJson}`]: '18a1e415e56220fa5122428a4ef8eb8874756576'
        })
      );

      for (const [filePath, hash] of expectedFiles) {
        expect(filteredResults.get(filePath)).toEqual(hash);
      }
      expect(filteredResults.size).toEqual(expectedFiles.size);
    } finally {
      FileSystem.deleteFile(tempFilePath1);
      FileSystem.deleteFile(tempFilePath2);
      FileSystem.deleteFile(tempFilePath3);
    }
  });
});
