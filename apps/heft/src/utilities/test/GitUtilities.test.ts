// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'node:path';
import { GitUtilities, type GitignoreFilterFn } from '../GitUtilities.ts';
import { PackageJsonLookup } from '@rushstack/node-core-library';

describe('GitUtilities', () => {
  describe('checkIgnoreAsync', () => {
    const projectRoot: string = PackageJsonLookup.instance.tryGetPackageFolderFor(__dirname)!;

    const testFoldersBasePath: string = `${projectRoot}/src/utilities/test/checkIgnoreTests`;

    it('returns all files are ignored', async () => {
      const testFolderPath: string = path.join(testFoldersBasePath, 'allIgnored');
      const git = new GitUtilities(testFolderPath);
      const isUnignoredAsync: GitignoreFilterFn = (await git.tryCreateGitignoreFilterAsync())!;
      expect(await isUnignoredAsync(path.join(testFolderPath, 'a.txt'))).toEqual(false);
      expect(await isUnignoredAsync(path.join(testFolderPath, 'b.txt'))).toEqual(false);
      expect(await isUnignoredAsync(path.join(testFolderPath, 'c.txt'))).toEqual(false);
    });

    it('returns some files are ignored', async () => {
      const testFolderPath: string = path.join(testFoldersBasePath, 'someIgnored');
      const git = new GitUtilities(testFolderPath);
      const isUnignoredAsync: GitignoreFilterFn = (await git.tryCreateGitignoreFilterAsync())!;
      expect(await isUnignoredAsync(path.join(testFolderPath, 'a.txt'))).toEqual(false);
      expect(await isUnignoredAsync(path.join(testFolderPath, 'b', 'c.txt'))).toEqual(false);
      expect(await isUnignoredAsync(path.join(testFolderPath, 'b', 'd.txt'))).toEqual(true);
      expect(await isUnignoredAsync(path.join(testFolderPath, 'e.txt'))).toEqual(true);
      expect(await isUnignoredAsync(path.join(testFolderPath, 'f', 'g.txt'))).toEqual(true);
    });

    it('returns non-negated files are ignored', async () => {
      const testFolderPath: string = path.join(testFoldersBasePath, 'negateIgnore');
      const git = new GitUtilities(testFolderPath);
      const isUnignoredAsync: GitignoreFilterFn = (await git.tryCreateGitignoreFilterAsync())!;
      expect(await isUnignoredAsync(path.join(testFolderPath, 'a.txt'))).toEqual(false);
      expect(await isUnignoredAsync(path.join(testFolderPath, 'a', 'c.txt'))).toEqual(false);
      expect(await isUnignoredAsync(path.join(testFolderPath, 'b', 'c.txt'))).toEqual(false);
      expect(await isUnignoredAsync(path.join(testFolderPath, 'a', 'b.txt'))).toEqual(true);
    });

    it('returns ignored files specified in the repo gitignore', async () => {
      // <repoRoot>/apps/heft
      const git = new GitUtilities(projectRoot);
      const isUnignoredAsync: GitignoreFilterFn = (await git.tryCreateGitignoreFilterAsync())!;
      expect(await isUnignoredAsync(path.join(projectRoot, 'lib', 'a.txt'))).toEqual(false);
      expect(await isUnignoredAsync(path.join(projectRoot, 'temp', 'a.txt'))).toEqual(false);
      expect(await isUnignoredAsync(path.join(projectRoot, 'dist', 'a.txt'))).toEqual(false);
      expect(await isUnignoredAsync(path.join(projectRoot, 'src', 'a.txt'))).toEqual(true);

      const ignoredFolderPath: string = path.join(testFoldersBasePath, 'allIgnored');
      expect(await isUnignoredAsync(path.join(ignoredFolderPath, 'a.txt'))).toEqual(false);
      expect(await isUnignoredAsync(path.join(ignoredFolderPath, 'b.txt'))).toEqual(false);
      expect(await isUnignoredAsync(path.join(ignoredFolderPath, 'c.txt'))).toEqual(false);

      const someIgnoredFolderPath: string = path.join(testFoldersBasePath, 'someIgnored');
      expect(await isUnignoredAsync(path.join(someIgnoredFolderPath, 'a.txt'))).toEqual(false);
      expect(await isUnignoredAsync(path.join(someIgnoredFolderPath, 'b', 'c.txt'))).toEqual(false);
      expect(await isUnignoredAsync(path.join(someIgnoredFolderPath, 'b', 'd.txt'))).toEqual(true);
      expect(await isUnignoredAsync(path.join(someIgnoredFolderPath, 'e.txt'))).toEqual(true);
      expect(await isUnignoredAsync(path.join(someIgnoredFolderPath, 'f', 'g.txt'))).toEqual(true);

      const negateIgnoreFolderPath: string = path.join(testFoldersBasePath, 'negateIgnore');
      expect(await isUnignoredAsync(path.join(negateIgnoreFolderPath, 'a.txt'))).toEqual(false);
      expect(await isUnignoredAsync(path.join(negateIgnoreFolderPath, 'a', 'c.txt'))).toEqual(false);
      expect(await isUnignoredAsync(path.join(negateIgnoreFolderPath, 'b', 'c.txt'))).toEqual(false);
      expect(await isUnignoredAsync(path.join(negateIgnoreFolderPath, 'a', 'b.txt'))).toEqual(true);
    });
  });
});
