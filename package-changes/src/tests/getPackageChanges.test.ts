import { getPackageChanges } from '../getPackageChanges';
import { expect } from 'chai';
import * as path from 'path';
import * as fs from 'fs';
import { execSync } from 'child_process';

const SOURCE_PATH: string = path.join(__dirname).replace(
  path.join('lib', 'tests'),
  path.join('src', 'tests'));

describe('getPackageChanges', () => {

  it('can parse one file', function (done) {
    this.timeout(1000000);

    getPackageChanges(path.join(SOURCE_PATH, 'oneFile')).then((results) => {
      try {
        let expectedFiles = {
          'file1.txt': 'c7b2f707ac99ca522f965210a7b6b0b109863f34',
          'package.json': '33703d582243a41bdebff8ee7dd046a01fc054b9'
        };
        let filePaths = Object.keys(results.files).sort();

        filePaths.forEach(filePath => expect(results.files[filePath]).equals(expectedFiles[filePath], `path: ${filePath}`));
      } catch (e) { return done(e); }

      done();
    });
  });

  it('can can handle adding one file', function (done) {
    this.timeout(1000000);

    const tempFilePath = path.join(SOURCE_PATH, 'oneFile', 'a.txt');

    fs.writeFileSync(tempFilePath, 'a');

    function _done(e?: Error) {
      fs.unlinkSync(tempFilePath);
      done(e);
    }

    getPackageChanges(path.join(SOURCE_PATH, 'oneFile')).then((results) => {
      try {
        let expectedFiles = {
          'a.txt': '2e65efe2a145dda7ee51d1741299f848e5bf752e',
          'file1.txt': 'c7b2f707ac99ca522f965210a7b6b0b109863f34',
          'package.json': '33703d582243a41bdebff8ee7dd046a01fc054b9'
        };
        let filePaths = Object.keys(results.files).sort();

        filePaths.forEach(filePath => expect(results.files[filePath]).equals(expectedFiles[filePath], `path: ${filePath}`));
      } catch (e) {
        return _done(e);
      }

      _done();
    });

  });

  it('can can handle removing one file', function (done) {
    this.timeout(1000000);

    const filePath = path.join(SOURCE_PATH, 'oneFile', 'file1.txt');

    fs.unlinkSync(filePath);

    function _done(e?: Error) {
      execSync(`git checkout ${filePath}`);
      done(e);
    }

    getPackageChanges(path.join(SOURCE_PATH, 'oneFile')).then((results) => {
      try {
        let expectedFiles = {
          'package.json': '33703d582243a41bdebff8ee7dd046a01fc054b9'
        };
        let filePaths = Object.keys(results.files).sort();

        filePaths.forEach(filePath => expect(results.files[filePath]).equals(expectedFiles[filePath], `path: ${filePath}`));
      } catch (e) {
        return _done(e);
      }

      _done();
    });

  });

});
