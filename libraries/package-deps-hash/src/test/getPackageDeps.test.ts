// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'node:path';
import { execSync } from 'node:child_process';

import { getPackageDeps, parseGitLsTree, parseGitFilename } from '../getPackageDeps';

import { FileSystem, FileConstants } from '@rushstack/node-core-library';

const SOURCE_PATH: string = path
  .join(__dirname)
  .replace(path.join('lib-commonjs', 'test'), path.join('src', 'test'));

const TEST_PROJECT_PATH: string = path.join(SOURCE_PATH, 'testProject');
const NESTED_TEST_PROJECT_PATH: string = path.join(SOURCE_PATH, 'nestedTestProject');

describe(parseGitFilename.name, () => {
  it('can parse backslash-escaped filenames', () => {
    expect(parseGitFilename('some/path/to/a/file name')).toEqual('some/path/to/a/file name');
    expect(parseGitFilename('"some/path/to/a/file?name"')).toEqual('some/path/to/a/file?name');
    expect(parseGitFilename('"some/path/to/a/file\\\\name"')).toEqual('some/path/to/a/file\\name');
    expect(parseGitFilename('"some/path/to/a/file\\"name"')).toEqual('some/path/to/a/file"name');
    expect(parseGitFilename('"some/path/to/a/file\\"name"')).toEqual('some/path/to/a/file"name');
    expect(parseGitFilename('"some/path/to/a/file\\347\\275\\221\\347\\275\\221name"')).toEqual(
      'some/path/to/a/file网网name'
    );
    expect(parseGitFilename('"some/path/to/a/file\\\\347\\\\\\347\\275\\221name"')).toEqual(
      'some/path/to/a/file\\347\\网name'
    );
    expect(parseGitFilename('"some/path/to/a/file\\\\\\347\\275\\221\\347\\275\\221name"')).toEqual(
      'some/path/to/a/file\\网网name'
    );
  });
});

describe(parseGitLsTree.name, () => {
  it('can handle a blob', () => {
    const filename: string = 'src/typings/tsd.d.ts';
    const hash: string = '3451bccdc831cb43d7a70ed8e628dcf9c7f888c8';

    const output: string = `100644 blob ${hash}\t${filename}`;
    const changes: Map<string, string> = parseGitLsTree(output);

    expect(changes.size).toEqual(1); // Expect there to be exactly 1 change
    expect(changes.get(filename)).toEqual(hash); // Expect the hash to be ${hash}
  });

  it('can handle a submodule', () => {
    const filename: string = 'rushstack';
    const hash: string = 'c5880bf5b0c6c1f2e2c43c95beeb8f0a808e8bac';

    const output: string = `160000 commit ${hash}\t${filename}`;
    const changes: Map<string, string> = parseGitLsTree(output);

    expect(changes.size).toEqual(1); // Expect there to be exactly 1 change
    expect(changes.get(filename)).toEqual(hash); // Expect the hash to be ${hash}
  });

  it('can handle multiple lines', () => {
    const filename1: string = 'src/typings/tsd.d.ts';
    const hash1: string = '3451bccdc831cb43d7a70ed8e628dcf9c7f888c8';

    const filename2: string = 'src/foo bar/tsd.d.ts';
    const hash2: string = '0123456789abcdef1234567890abcdef01234567';

    const output: string = `100644 blob ${hash1}\t${filename1}\n100666 blob ${hash2}\t${filename2}`;
    const changes: Map<string, string> = parseGitLsTree(output);

    expect(changes.size).toEqual(2); // Expect there to be exactly 2 changes
    expect(changes.get(filename1)).toEqual(hash1); // Expect the hash to be ${hash1}
    expect(changes.get(filename2)).toEqual(hash2); // Expect the hash to be ${hash2}
  });

  it('throws with malformed input', () => {
    expect(parseGitLsTree.bind(undefined, 'some super malformed input')).toThrow();
  });
});

describe(getPackageDeps.name, () => {
  it('can parse committed file', () => {
    const results: Map<string, string> = getPackageDeps(TEST_PROJECT_PATH);
    const expectedFiles: { [key: string]: string } = {
      'file1.txt': 'c7b2f707ac99ca522f965210a7b6b0b109863f34',
      'file  2.txt': 'a385f754ec4fede884a4864d090064d9aeef8ccb',
      'file蝴蝶.txt': 'ae814af81e16cb2ae8c57503c77e2cab6b5462ba',
      [FileConstants.PackageJson]: '18a1e415e56220fa5122428a4ef8eb8874756576'
    };
    const filePaths: string[] = Array.from(results.keys()).sort();

    filePaths.forEach((filePath) => expect(results.get(filePath)).toEqual(expectedFiles[filePath]));
  });

  it('can handle files in subfolders', () => {
    const results: Map<string, string> = getPackageDeps(NESTED_TEST_PROJECT_PATH);
    const expectedFiles: { [key: string]: string } = {
      'src/file 1.txt': 'c7b2f707ac99ca522f965210a7b6b0b109863f34',
      [FileConstants.PackageJson]: '18a1e415e56220fa5122428a4ef8eb8874756576'
    };
    const filePaths: string[] = Array.from(results.keys()).sort();

    filePaths.forEach((filePath) => expect(results.get(filePath)).toEqual(expectedFiles[filePath]));
  });

  it('can handle adding one file', () => {
    const tempFilePath: string = path.join(TEST_PROJECT_PATH, 'a.txt');

    FileSystem.writeFile(tempFilePath, 'a');

    const results: Map<string, string> = getPackageDeps(TEST_PROJECT_PATH);
    try {
      const expectedFiles: { [key: string]: string } = {
        'a.txt': '2e65efe2a145dda7ee51d1741299f848e5bf752e',
        'file1.txt': 'c7b2f707ac99ca522f965210a7b6b0b109863f34',
        'file  2.txt': 'a385f754ec4fede884a4864d090064d9aeef8ccb',
        'file蝴蝶.txt': 'ae814af81e16cb2ae8c57503c77e2cab6b5462ba',
        [FileConstants.PackageJson]: '18a1e415e56220fa5122428a4ef8eb8874756576'
      };
      const filePaths: string[] = Array.from(results.keys()).sort();

      filePaths.forEach((filePath) => expect(results.get(filePath)).toEqual(expectedFiles[filePath]));
    } finally {
      FileSystem.deleteFile(tempFilePath);
    }
  });

  it('can handle adding two files', () => {
    const tempFilePath1: string = path.join(TEST_PROJECT_PATH, 'a.txt');
    const tempFilePath2: string = path.join(TEST_PROJECT_PATH, 'b.txt');

    FileSystem.writeFile(tempFilePath1, 'a');
    FileSystem.writeFile(tempFilePath2, 'a');

    const results: Map<string, string> = getPackageDeps(TEST_PROJECT_PATH);
    try {
      const expectedFiles: { [key: string]: string } = {
        'a.txt': '2e65efe2a145dda7ee51d1741299f848e5bf752e',
        'b.txt': '2e65efe2a145dda7ee51d1741299f848e5bf752e',
        'file1.txt': 'c7b2f707ac99ca522f965210a7b6b0b109863f34',
        'file  2.txt': 'a385f754ec4fede884a4864d090064d9aeef8ccb',
        'file蝴蝶.txt': 'ae814af81e16cb2ae8c57503c77e2cab6b5462ba',
        [FileConstants.PackageJson]: '18a1e415e56220fa5122428a4ef8eb8874756576'
      };
      const filePaths: string[] = Array.from(results.keys()).sort();

      filePaths.forEach((filePath) => expect(results.get(filePath)).toEqual(expectedFiles[filePath]));
    } finally {
      FileSystem.deleteFile(tempFilePath1);
      FileSystem.deleteFile(tempFilePath2);
    }
  });

  it('can handle removing one file', () => {
    const testFilePath: string = path.join(TEST_PROJECT_PATH, 'file1.txt');

    FileSystem.deleteFile(testFilePath);

    const results: Map<string, string> = getPackageDeps(TEST_PROJECT_PATH);
    try {
      const expectedFiles: { [key: string]: string } = {
        'file  2.txt': 'a385f754ec4fede884a4864d090064d9aeef8ccb',
        'file蝴蝶.txt': 'ae814af81e16cb2ae8c57503c77e2cab6b5462ba',
        [FileConstants.PackageJson]: '18a1e415e56220fa5122428a4ef8eb8874756576'
      };
      const filePaths: string[] = Array.from(results.keys()).sort();

      filePaths.forEach((filePath) => expect(results.get(filePath)).toEqual(expectedFiles[filePath]));
    } finally {
      execSync(`git checkout ${testFilePath}`, { stdio: 'ignore' });
    }
  });

  it('can handle changing one file', () => {
    const testFilePath: string = path.join(TEST_PROJECT_PATH, 'file1.txt');

    FileSystem.writeFile(testFilePath, 'abc');

    const results: Map<string, string> = getPackageDeps(TEST_PROJECT_PATH);
    try {
      const expectedFiles: { [key: string]: string } = {
        'file1.txt': 'f2ba8f84ab5c1bce84a7b441cb1959cfc7093b7f',
        'file  2.txt': 'a385f754ec4fede884a4864d090064d9aeef8ccb',
        'file蝴蝶.txt': 'ae814af81e16cb2ae8c57503c77e2cab6b5462ba',
        [FileConstants.PackageJson]: '18a1e415e56220fa5122428a4ef8eb8874756576'
      };
      const filePaths: string[] = Array.from(results.keys()).sort();

      filePaths.forEach((filePath) => expect(results.get(filePath)).toEqual(expectedFiles[filePath]));
    } finally {
      execSync(`git checkout ${testFilePath}`, { stdio: 'ignore' });
    }
  });

  it('can exclude a committed file', () => {
    const results: Map<string, string> = getPackageDeps(TEST_PROJECT_PATH, [
      'file1.txt',
      'file  2.txt',
      'file蝴蝶.txt'
    ]);

    const expectedFiles: { [key: string]: string } = {
      [FileConstants.PackageJson]: '18a1e415e56220fa5122428a4ef8eb8874756576'
    };
    const filePaths: string[] = Array.from(results.keys()).sort();

    filePaths.forEach((filePath) => expect(results.get(filePath)).toEqual(expectedFiles[filePath]));
  });

  it('can exclude an added file', () => {
    const tempFilePath: string = path.join(TEST_PROJECT_PATH, 'a.txt');

    FileSystem.writeFile(tempFilePath, 'a');

    const results: Map<string, string> = getPackageDeps(TEST_PROJECT_PATH, ['a.txt']);
    try {
      const expectedFiles: { [key: string]: string } = {
        'file1.txt': 'c7b2f707ac99ca522f965210a7b6b0b109863f34',
        'file  2.txt': 'a385f754ec4fede884a4864d090064d9aeef8ccb',
        'file蝴蝶.txt': 'ae814af81e16cb2ae8c57503c77e2cab6b5462ba',
        [FileConstants.PackageJson]: '18a1e415e56220fa5122428a4ef8eb8874756576'
      };
      const filePaths: string[] = Array.from(results.keys()).sort();

      expect(filePaths).toHaveLength(Object.keys(expectedFiles).length);

      filePaths.forEach((filePath) => expect(results.get(filePath)).toEqual(expectedFiles[filePath]));
    } finally {
      FileSystem.deleteFile(tempFilePath);
    }
  });

  it('can handle a filename with spaces', () => {
    const tempFilePath: string = path.join(TEST_PROJECT_PATH, 'a file.txt');

    FileSystem.writeFile(tempFilePath, 'a');

    const results: Map<string, string> = getPackageDeps(TEST_PROJECT_PATH);
    try {
      const expectedFiles: { [key: string]: string } = {
        'file1.txt': 'c7b2f707ac99ca522f965210a7b6b0b109863f34',
        'file  2.txt': 'a385f754ec4fede884a4864d090064d9aeef8ccb',
        'file蝴蝶.txt': 'ae814af81e16cb2ae8c57503c77e2cab6b5462ba',
        'a file.txt': '2e65efe2a145dda7ee51d1741299f848e5bf752e',
        [FileConstants.PackageJson]: '18a1e415e56220fa5122428a4ef8eb8874756576'
      };
      const filePaths: string[] = Array.from(results.keys()).sort();

      expect(filePaths).toHaveLength(Object.keys(expectedFiles).length);

      filePaths.forEach((filePath) => expect(results.get(filePath)).toEqual(expectedFiles[filePath]));
    } finally {
      FileSystem.deleteFile(tempFilePath);
    }
  });

  it('can handle a filename with multiple spaces', () => {
    const tempFilePath: string = path.join(TEST_PROJECT_PATH, 'a  file name.txt');

    FileSystem.writeFile(tempFilePath, 'a');

    const results: Map<string, string> = getPackageDeps(TEST_PROJECT_PATH);
    try {
      const expectedFiles: { [key: string]: string } = {
        'file1.txt': 'c7b2f707ac99ca522f965210a7b6b0b109863f34',
        'file  2.txt': 'a385f754ec4fede884a4864d090064d9aeef8ccb',
        'file蝴蝶.txt': 'ae814af81e16cb2ae8c57503c77e2cab6b5462ba',
        'a  file name.txt': '2e65efe2a145dda7ee51d1741299f848e5bf752e',
        [FileConstants.PackageJson]: '18a1e415e56220fa5122428a4ef8eb8874756576'
      };
      const filePaths: string[] = Array.from(results.keys()).sort();

      expect(filePaths).toHaveLength(Object.keys(expectedFiles).length);

      filePaths.forEach((filePath) => expect(results.get(filePath)).toEqual(expectedFiles[filePath]));
    } finally {
      FileSystem.deleteFile(tempFilePath);
    }
  });

  it('can handle a filename with non-standard characters', () => {
    const tempFilePath: string = path.join(TEST_PROJECT_PATH, 'newFile批把.txt');

    FileSystem.writeFile(tempFilePath, 'a');

    const results: Map<string, string> = getPackageDeps(TEST_PROJECT_PATH);
    try {
      const expectedFiles: { [key: string]: string } = {
        'file1.txt': 'c7b2f707ac99ca522f965210a7b6b0b109863f34',
        'file  2.txt': 'a385f754ec4fede884a4864d090064d9aeef8ccb',
        'file蝴蝶.txt': 'ae814af81e16cb2ae8c57503c77e2cab6b5462ba',
        'newFile批把.txt': '2e65efe2a145dda7ee51d1741299f848e5bf752e',
        [FileConstants.PackageJson]: '18a1e415e56220fa5122428a4ef8eb8874756576'
      };
      const filePaths: string[] = Array.from(results.keys()).sort();

      expect(filePaths).toHaveLength(Object.keys(expectedFiles).length);

      filePaths.forEach((filePath) => expect(results.get(filePath)).toEqual(expectedFiles[filePath]));
    } finally {
      FileSystem.deleteFile(tempFilePath);
    }
  });

  it('can handle a filename with non-standard characters', () => {
    const tempFilePath: string = path.join(TEST_PROJECT_PATH, 'newFile批把.txt');

    FileSystem.writeFile(tempFilePath, 'a');

    const results: Map<string, string> = getPackageDeps(TEST_PROJECT_PATH);
    try {
      const expectedFiles: { [key: string]: string } = {
        'file1.txt': 'c7b2f707ac99ca522f965210a7b6b0b109863f34',
        'file  2.txt': 'a385f754ec4fede884a4864d090064d9aeef8ccb',
        'file蝴蝶.txt': 'ae814af81e16cb2ae8c57503c77e2cab6b5462ba',
        'newFile批把.txt': '2e65efe2a145dda7ee51d1741299f848e5bf752e',
        [FileConstants.PackageJson]: '18a1e415e56220fa5122428a4ef8eb8874756576'
      };
      const filePaths: string[] = Array.from(results.keys()).sort();

      expect(filePaths).toHaveLength(Object.keys(expectedFiles).length);

      filePaths.forEach((filePath) => expect(results.get(filePath)).toEqual(expectedFiles[filePath]));
    } finally {
      FileSystem.deleteFile(tempFilePath);
    }
  });
});
