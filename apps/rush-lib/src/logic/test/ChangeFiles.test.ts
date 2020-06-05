// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'path';

import { IChangelog } from '../../api/Changelog';
import { ChangeFiles } from '../ChangeFiles';
import { RushConfiguration } from '../../api/RushConfiguration';

describe('ChangeFiles', () => {
  let rushConfiguration: RushConfiguration;

  beforeEach(() => {
    rushConfiguration = {} as RushConfiguration;
  });

  describe('getFiles', () => {
    it('returns correctly when there is one change file', () => {
      const changesPath: string = path.join(__dirname, 'leafChange');
      const changeFiles: ChangeFiles = new ChangeFiles(changesPath);
      const expectedPath: string = path.join(changesPath, 'change1.json').replace(/\\/g, '/');
      expect(changeFiles.getFiles()).toEqual([expectedPath]);
    });

    it('returns empty array when no change files', () => {
      const changesPath: string = path.join(__dirname, 'noChange');
      const changeFiles: ChangeFiles = new ChangeFiles(changesPath);
      expect(changeFiles.getFiles()).toHaveLength(0);
    });

    it('returns correctly when change files are categorized', () => {
      const changesPath: string = path.join(__dirname, 'categorizedChanges');
      const changeFiles: ChangeFiles = new ChangeFiles(changesPath);
      const files: string[] = changeFiles.getFiles();
      expect(files).toHaveLength(3);

      const expectedPathA: string = path.join(changesPath, '@ms', 'a', 'changeA.json').replace(/\\/g, '/');
      const expectedPathB: string = path.join(changesPath, '@ms', 'b', 'changeB.json').replace(/\\/g, '/');
      const expectedPathC: string = path.join(changesPath, 'changeC.json').replace(/\\/g, '/');
      expect(files).toContain(expectedPathA);
      expect(files).toContain(expectedPathB);
      expect(files).toContain(expectedPathC);
    });
  });

  describe('validate', () => {
    it('throws when there is a patch in a hotfix branch.', () => {
      const changeFile: string = path.join(__dirname, 'leafChange', 'change1.json');
      const changedPackages: string[] = ['d'];
      expect(() => {
        ChangeFiles.validate([changeFile], changedPackages, { hotfixChangeEnabled: true } as RushConfiguration);
      }).toThrow(Error);
    });

    it('allows a hotfix in a hotfix branch.', () => {
      const changeFile: string = path.join(__dirname, 'multipleHotfixChanges', 'change1.json');
      const changedPackages: string[] = ['a'];
      ChangeFiles.validate([changeFile], changedPackages, { hotfixChangeEnabled: true } as RushConfiguration);
    });

    it('throws when there is any missing package.', () => {
      const changeFile: string = path.join(__dirname, 'verifyChanges', 'changes.json');
      const changedPackages: string[] = ['a', 'b', 'c'];
      expect(() => {
        ChangeFiles.validate([changeFile], changedPackages, rushConfiguration);
      }).toThrow(Error);
    });

    it('does not throw when there is no missing packages', () => {
      const changeFile: string = path.join(__dirname, 'verifyChanges', 'changes.json');
      const changedPackages: string[] = ['a'];
      expect(() => {
        ChangeFiles.validate([changeFile], changedPackages, rushConfiguration);
      }).not.toThrow();
    });

    it('throws when missing packages from categorized changes', () => {
      const changeFileA: string = path.join(__dirname, 'categorizedChanges', '@ms', 'a', 'changeA.json');
      const changeFileB: string = path.join(__dirname, 'categorizedChanges', '@ms', 'b', 'changeB.json');
      const changedPackages: string[] = ['@ms/a', '@ms/b', 'c'];
      expect(() => {
        ChangeFiles.validate([changeFileA, changeFileB], changedPackages, rushConfiguration);
      }).toThrow(Error);
    });

    it('does not throw when no missing packages from categorized changes', () => {
      const changeFileA: string = path.join(__dirname, 'categorizedChanges', '@ms', 'a', 'changeA.json');
      const changeFileB: string = path.join(__dirname, 'categorizedChanges', '@ms', 'b', 'changeB.json');
      const changeFileC: string = path.join(__dirname, 'categorizedChanges', 'changeC.json');
      const changedPackages: string[] = ['@ms/a', '@ms/b', 'c'];
      expect(() => {
        ChangeFiles.validate([changeFileA, changeFileB, changeFileC], changedPackages, rushConfiguration);
      }).not.toThrow(Error);
    });
  });

  describe('deleteAll', () => {
    it('delete all files when there are no prerelease packages', () => {
      const changesPath: string = path.join(__dirname, 'multipleChangeFiles');
      const changeFiles: ChangeFiles = new ChangeFiles(changesPath);
      expect(changeFiles.deleteAll(false)).toEqual(3);
    });

    it('does not delete change files for package whose change logs do not get updated. ', () => {
      const changesPath: string = path.join(__dirname, 'multipleChangeFiles');
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
      expect(changeFiles.deleteAll(false, updatedChangelogs)).toEqual(2);
    });

    it('delete all files when there are hotfixes', () => {
      const changesPath: string = path.join(__dirname, 'multipleHotfixChanges');
      const changeFiles: ChangeFiles = new ChangeFiles(changesPath);
      expect(changeFiles.deleteAll(false)).toEqual(3);
    });
  });
});
