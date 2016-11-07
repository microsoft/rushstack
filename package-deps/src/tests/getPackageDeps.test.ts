import { getPackageDeps } from '../getPackageDeps';
import { expect } from 'chai';
import * as path from 'path';
import * as fs from 'fs';
import { execSync } from 'child_process';

const SOURCE_PATH: string = path.join(__dirname).replace(
  path.join('lib', 'tests'),
  path.join('src', 'tests'));

describe('getPackageDeps', () => {

  it('can parse one file', (done) => {
    getPackageDeps(path.join(SOURCE_PATH, 'oneFile')).then((results) => {
      try {
        let expectedFiles: { [key: string]: string } = {
          'file1.txt': 'c7b2f707ac99ca522f965210a7b6b0b109863f34',
          'package.json': '33703d582243a41bdebff8ee7dd046a01fc054b9'
        };
        let filePaths: string[] = Object.keys(results.files).sort();

        filePaths.forEach(filePath => (
          expect(results.files[filePath])
            .equals(expectedFiles[filePath], `path: ${filePath}`)));

      } catch (e) { return done(e); }

      done();
    });
  });

  it('can can handle adding one file', (done) => { // tslint:disable-line
    const tempFilePath: string = path.join(SOURCE_PATH, 'oneFile', 'a.txt');

    fs.writeFileSync(tempFilePath, 'a');

    function _done(e?: Error): void {
      fs.unlinkSync(tempFilePath);
      done(e);
    }

    getPackageDeps(path.join(SOURCE_PATH, 'oneFile')).then((results) => {
      try {
        let expectedFiles: { [key: string]: string } = {
          'a.txt': '2e65efe2a145dda7ee51d1741299f848e5bf752e',
          'file1.txt': 'c7b2f707ac99ca522f965210a7b6b0b109863f34',
          'package.json': '33703d582243a41bdebff8ee7dd046a01fc054b9'
        };
        let filePaths: string[] = Object.keys(results.files).sort();

        filePaths.forEach(filePath => (
          expect(
            results.files[filePath])
              .equals(expectedFiles[filePath], `path: ${filePath}`)));

      } catch (e) {
        return _done(e);
      }

      _done();
    });

  });

  it('can can handle removing one file', (done) => {
    const testFilePath: string = path.join(SOURCE_PATH, 'oneFile', 'file1.txt');

    fs.unlinkSync(testFilePath);

    function _done(e?: Error): void {
      execSync(`git checkout ${ testFilePath }`);
      done(e);
    }

    getPackageDeps(path.join(SOURCE_PATH, 'oneFile')).then((results) => {
      try {
        let expectedFiles: { [key: string]: string } = {
          'package.json': '33703d582243a41bdebff8ee7dd046a01fc054b9'
        };
        let filePaths: string[] = Object.keys(results.files).sort();

        filePaths.forEach(filePath => (
          expect(results.files[filePath])
            .equals(expectedFiles[filePath], `path: ${filePath}`)));

      } catch (e) {
        return _done(e);
      }

      _done();
    });
  });

  it('can can handle changing one file', (done) => {
    const testFilePath: string = path.join(SOURCE_PATH, 'oneFile', 'file1.txt');

    fs.writeFileSync(testFilePath, 'abc');

    function _done(e?: Error): void {
      execSync(`git checkout ${testFilePath}`);
      done(e);
    }

    getPackageDeps(path.join(SOURCE_PATH, 'oneFile')).then((results) => {
      try {
        let expectedFiles: { [key: string]: string } = {
          'file1.txt': 'f2ba8f84ab5c1bce84a7b441cb1959cfc7093b7f',
          'package.json': '33703d582243a41bdebff8ee7dd046a01fc054b9'
        };
        let filePaths: string[] = Object.keys(results.files).sort();

        filePaths.forEach(filePath => (
          expect(results.files[filePath])
            .equals(expectedFiles[filePath], `path: ${filePath}`)));

      } catch (e) {
        return _done(e);
      }

      _done();
    });
  });

});
