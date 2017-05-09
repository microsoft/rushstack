import { expect } from 'chai';
import * as path from 'path';
import ChangeFiles from '../ChangeFiles';

describe('ChangeFiles.validate', () => {
  it('Throws when there is any missing package.', () => {
    const changeFile: string = path.join(__dirname, 'verifyChanges', 'changes.json');
    const changedPackages: string[] = ['a', 'b', 'c'];
    expect(() => {
      ChangeFiles.validate([changeFile], changedPackages);
    }).to.throw(Error);
  });

  it('Does not throw when there is no missing packages', () => {
    const changeFile: string = path.join(__dirname, 'verifyChanges', 'changes.json');
    const changedPackages: string[] = ['a'];
    expect(() => {
      ChangeFiles.validate([changeFile], changedPackages);
    }).not.to.throw();
  });
});