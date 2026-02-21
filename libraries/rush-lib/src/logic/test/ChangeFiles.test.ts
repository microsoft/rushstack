// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { Path } from '@rushstack/node-core-library';

import type { IChangelog } from '../../api/Changelog.ts';
import { ChangeFiles } from '../ChangeFiles.ts';
import type { RushConfiguration } from '../../api/RushConfiguration.ts';

describe(ChangeFiles.name, () => {
  let rushConfiguration: RushConfiguration;

  beforeEach(() => {
    rushConfiguration = {} as RushConfiguration;
  });

  describe(ChangeFiles.prototype.getFilesAsync.name, () => {
    it('returns correctly when there is one change file', async () => {
      const changesPath: string = `${__dirname}/leafChange`;
      const changeFiles: ChangeFiles = new ChangeFiles(changesPath);
      const expectedPath: string = Path.convertToSlashes(`${changesPath}/change1.json`);
      expect(await changeFiles.getFilesAsync()).toEqual([expectedPath]);
    });

    it('returns empty array when no change files', async () => {
      const changesPath: string = `${__dirname}/noChange`;
      const changeFiles: ChangeFiles = new ChangeFiles(changesPath);
      expect(await changeFiles.getFilesAsync()).toHaveLength(0);
    });

    it('returns correctly when change files are categorized', async () => {
      const changesPath: string = `${__dirname}/categorizedChanges`;
      const changeFiles: ChangeFiles = new ChangeFiles(changesPath);
      const files: string[] = await changeFiles.getFilesAsync();
      expect(files).toHaveLength(3);

      const expectedPathA: string = Path.convertToSlashes(`${changesPath}/@ms/a/changeA.json`);
      const expectedPathB: string = Path.convertToSlashes(`${changesPath}/@ms/b/changeB.json`);
      const expectedPathC: string = Path.convertToSlashes(`${changesPath}/changeC.json`);
      expect(files).toContain(expectedPathA);
      expect(files).toContain(expectedPathB);
      expect(files).toContain(expectedPathC);
    });
  });

  describe(ChangeFiles.validate.name, () => {
    it('throws when there is a patch in a hotfix branch.', () => {
      const changeFile: string = `${__dirname}/leafChange/change1.json`;
      const changedPackages: string[] = ['d'];
      expect(() => {
        ChangeFiles.validate([changeFile], changedPackages, {
          hotfixChangeEnabled: true
        } as RushConfiguration);
      }).toThrow(Error);
    });

    it('allows a hotfix in a hotfix branch.', () => {
      const changeFile: string = `${__dirname}/multipleHotfixChanges/change1.json`;
      const changedPackages: string[] = ['a'];
      ChangeFiles.validate([changeFile], changedPackages, { hotfixChangeEnabled: true } as RushConfiguration);
    });

    it('throws when there is any missing package.', () => {
      const changeFile: string = `${__dirname}/verifyChanges/changes.json`;
      const changedPackages: string[] = ['a', 'b', 'c'];
      expect(() => {
        ChangeFiles.validate([changeFile], changedPackages, rushConfiguration);
      }).toThrow(Error);
    });

    it('does not throw when there is no missing packages', () => {
      const changeFile: string = `${__dirname}/verifyChanges/changes.json`;
      const changedPackages: string[] = ['a'];
      expect(() => {
        ChangeFiles.validate([changeFile], changedPackages, rushConfiguration);
      }).not.toThrow();
    });

    it('throws when missing packages from categorized changes', () => {
      const changeFileA: string = `${__dirname}/categorizedChanges/@ms/a/changeA.json`;
      const changeFileB: string = `${__dirname}/categorizedChanges/@ms/b/changeB.json`;
      const changedPackages: string[] = ['@ms/a', '@ms/b', 'c'];
      expect(() => {
        ChangeFiles.validate([changeFileA, changeFileB], changedPackages, rushConfiguration);
      }).toThrow(Error);
    });

    it('does not throw when no missing packages from categorized changes', () => {
      const changeFileA: string = `${__dirname}/categorizedChanges/@ms/a/changeA.json`;
      const changeFileB: string = `${__dirname}/categorizedChanges/@ms/b/changeB.json`;
      const changeFileC: string = `${__dirname}/categorizedChanges/changeC.json`;
      const changedPackages: string[] = ['@ms/a', '@ms/b', 'c'];
      expect(() => {
        ChangeFiles.validate([changeFileA, changeFileB, changeFileC], changedPackages, rushConfiguration);
      }).not.toThrow(Error);
    });
  });

  describe(ChangeFiles.prototype.deleteAllAsync.name, () => {
    it('delete all files when there are no prerelease packages', async () => {
      const changesPath: string = `${__dirname}/multipleChangeFiles`;
      const changeFiles: ChangeFiles = new ChangeFiles(changesPath);
      expect(await changeFiles.deleteAllAsync(false)).toEqual(3);
    });

    it('does not delete change files for package whose change logs do not get updated. ', async () => {
      const changesPath: string = `${__dirname}/multipleChangeFiles`;
      const changeFiles: ChangeFiles = new ChangeFiles(changesPath);
      const updatedChangelogs: IChangelog[] = [
        {
          name: 'a',
          entries: []
        },
        {
          name: 'b',
          entries: []
        }
      ];
      expect(await changeFiles.deleteAllAsync(false, updatedChangelogs)).toEqual(2);
    });

    it('delete all files when there are hotfixes', async () => {
      const changesPath: string = `${__dirname}/multipleHotfixChanges`;
      const changeFiles: ChangeFiles = new ChangeFiles(changesPath);
      expect(await changeFiles.deleteAllAsync(false)).toEqual(3);
    });
  });
});
