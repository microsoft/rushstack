import { expect } from 'chai';
import * as path from 'path';
import ChangeFiles from '../ChangeFiles';

describe('ChangeFiles', () => {
  describe('getFiles', () => {
    it('returns correctly when there is one change file', () => {
      const changesPath: string = path.join(__dirname, 'leafChange');
      const changeFiles: ChangeFiles = new ChangeFiles(changesPath);
      expect(changeFiles.getFiles()).to.eql([path.join(changesPath, 'change1.json')]);
    });

    it('returns empty array when no change files', () => {
      const changesPath: string = path.join(__dirname, 'noChange');
      const changeFiles: ChangeFiles = new ChangeFiles(changesPath);
      expect(changeFiles.getFiles().length).to.equal(0);
    });

    it('returns correctly when change files are categorized', () => {
      const changesPath: string = path.join(__dirname, 'categorizedChanges');
      const changeFiles: ChangeFiles = new ChangeFiles(changesPath);
      const files: string[] = changeFiles.getFiles();
      expect(files.length).to.equal(3);
      expect(files).to.contains(path.join(changesPath, '@ms', 'a', 'changeA.json'),
        'changeA is missing');
      expect(files).to.contains(path.join(changesPath, '@ms', 'b', 'changeB.json'),
        'changeB is missing');
      expect(files).to.contains(path.join(changesPath, 'changeC.json'),
        'changeC is missing');
    });
  });

  describe('validate', () => {
    it('throws when there is any missing package.', () => {
      const changeFile: string = path.join(__dirname, 'verifyChanges', 'changes.json');
      const changedPackages: string[] = ['a', 'b', 'c'];
      expect(() => {
        ChangeFiles.validate([changeFile], changedPackages);
      }).to.throw(Error);
    });

    it('does not throw when there is no missing packages', () => {
      const changeFile: string = path.join(__dirname, 'verifyChanges', 'changes.json');
      const changedPackages: string[] = ['a'];
      expect(() => {
        ChangeFiles.validate([changeFile], changedPackages);
      }).not.to.throw();
    });
  });
});
