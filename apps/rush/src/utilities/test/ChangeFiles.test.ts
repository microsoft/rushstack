import { expect } from 'chai';
import * as path from 'path';
import ChangeFiles from '../ChangeFiles';

describe('ChangeFiles', () => {
  describe('getFiles', () => {
    it('returns correctly when there is one change file', () => {
      const changesPath: string = path.join(__dirname, 'leafChange');
      const changeFiles: ChangeFiles = new ChangeFiles(changesPath);
      expect(changeFiles.getFiles()).to.be.eql(['change1.json']);
    });

    it('returns empty array when no change files', () => {
      const changesPath: string = path.join(__dirname, 'noChange');
      const changeFiles: ChangeFiles = new ChangeFiles(changesPath);
      expect(changeFiles.getFiles().length).to.be.equal(0);
    });

    it('returns correctly when change files are categorized', () => {
      const changesPath: string = path.join(__dirname, 'categorizedChanges');
      const changeFiles: ChangeFiles = new ChangeFiles(changesPath);
      expect(changeFiles.getFiles()).to.contains(path.join('@ms', 'a', 'changeA.json'));
      expect(changeFiles.getFiles()).to.contains(path.join('@ms', 'b', 'changeB.json'));
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
