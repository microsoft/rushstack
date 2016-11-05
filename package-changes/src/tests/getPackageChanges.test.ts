import { getPackageChanges } from '../getPackageChanges';
import { expect } from 'chai';
import * as path from 'path';

const SOURCE_PATH: string = path.join(__dirname).replace(
  path.join('lib', 'tests'),
  path.join('src', 'tests'));

describe('getPackageChanges', () => {

  it('can parse one file', function(done) {
    this.timeout(1000000);


    getPackageChanges(path.join(SOURCE_PATH, 'oneFile')).then((changes) => {
      debugger;
      expect(changes).eql({
        files: {
          'file1.txt': 'abc'
        },
        dependencies: {}
      });
      done();
    });
  });


});
