// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as nodeJsOs from 'node:os';
import fs from 'node:fs';

import { FileSystem } from '../FileSystem';
import { PosixModeBits } from '../PosixModeBits';

describe(FileSystem.name, () => {
  test(FileSystem.formatPosixModeBits.name, () => {
    // The PosixModeBits are intended to be used with bitwise operations.
    /* eslint-disable no-bitwise */
    let modeBits: number = PosixModeBits.AllRead | PosixModeBits.AllWrite;

    expect(FileSystem.formatPosixModeBits(modeBits)).toEqual('-rw-rw-rw-');

    modeBits |= PosixModeBits.GroupExecute;
    expect(FileSystem.formatPosixModeBits(modeBits)).toEqual('-rw-rwxrw-');

    // Add the group execute bit
    modeBits |= PosixModeBits.OthersExecute;
    expect(FileSystem.formatPosixModeBits(modeBits)).toEqual('-rw-rwxrwx');

    // Add the group execute bit
    modeBits &= ~PosixModeBits.AllWrite;
    expect(FileSystem.formatPosixModeBits(modeBits)).toEqual('-r--r-xr-x');
    /* eslint-enable no-bitwise */
  });

  describe(FileSystem.isErrnoException.name, () => {
    test('Should return false for a non-ErrnoException', () => {
      const error: Error = new Error('Test error');
      expect(FileSystem.isErrnoException(error)).toBe(false);
    });

    test('Should return true for an error on a path call', () => {
      expect.assertions(1);
      try {
        fs.openSync(`${__dirname}/nonexistent.txt`, 'r');
      } catch (error) {
        expect(FileSystem.isErrnoException(error)).toBe(true);
      }
    });

    test('Should return true for an error on a file descriptor call', () => {
      expect.assertions(1);
      try {
        fs.readFileSync(`${__dirname}/nonexistent.txt`);
      } catch (error) {
        expect(FileSystem.isErrnoException(error)).toBe(true);
      }
    });
  });

  describe(FileSystem.createReadStream.name, () => {
    let tempDir: string;

    beforeEach(() => {
      tempDir = fs.mkdtempSync(`${nodeJsOs.tmpdir()}/filesystem-test-`);
    });

    afterEach(() => {
      fs.rmSync(tempDir, { recursive: true, force: true });
    });

    test('returns a readable stream for an existing file', (done) => {
      const filePath: string = `${tempDir}/test.txt`;
      fs.writeFileSync(filePath, 'hello world');

      const stream: fs.ReadStream = FileSystem.createReadStream(filePath);
      const chunks: Buffer[] = [];

      stream.on('data', (chunk: string | Buffer) => {
        chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
      });

      stream.on('end', () => {
        const result: string = Buffer.concat(chunks).toString();
        expect(result).toBe('hello world');
        done();
      });

      stream.on('error', done);
    });

    test('stream emits an error for a nonexistent file', (done) => {
      const filePath: string = `${tempDir}/nonexistent.txt`;
      const stream: fs.ReadStream = FileSystem.createReadStream(filePath);

      stream.on('error', (error: NodeJS.ErrnoException) => {
        expect(error.code).toBe('ENOENT');
        done();
      });
    });
  });

  describe(FileSystem.createWriteStream.name, () => {
    let tempDir: string;

    beforeEach(() => {
      tempDir = fs.mkdtempSync(`${nodeJsOs.tmpdir()}/filesystem-test-`);
    });

    afterEach(() => {
      fs.rmSync(tempDir, { recursive: true, force: true });
    });

    test('creates a writable stream that writes data to a file', (done) => {
      const filePath: string = `${tempDir}/output.txt`;
      const stream: fs.WriteStream = FileSystem.createWriteStream(filePath);

      stream.write('hello ');
      stream.write('world');
      stream.end(() => {
        const result: string = fs.readFileSync(filePath, 'utf-8');
        expect(result).toBe('hello world');
        done();
      });

      stream.on('error', done);
    });

    test('emits an error when the parent folder does not exist and ensureFolderExists is not set', (done) => {
      const filePath: string = `${tempDir}/nonexistent-folder/output.txt`;
      const stream: fs.WriteStream = FileSystem.createWriteStream(filePath);

      stream.on('error', (error: NodeJS.ErrnoException) => {
        expect(error.code).toBe('ENOENT');
        done();
      });
    });

    test('creates the parent folder when ensureFolderExists is true', (done) => {
      const filePath: string = `${tempDir}/new-folder/output.txt`;
      const stream: fs.WriteStream = FileSystem.createWriteStream(filePath, {
        ensureFolderExists: true
      });

      stream.write('test data');
      stream.end(() => {
        const result: string = fs.readFileSync(filePath, 'utf-8');
        expect(result).toBe('test data');
        done();
      });

      stream.on('error', done);
    });
  });

  describe('createWriteStreamAsync', () => {
    let tempDir: string;

    beforeEach(() => {
      tempDir = fs.mkdtempSync(`${nodeJsOs.tmpdir()}/filesystem-test-`);
    });

    afterEach(() => {
      fs.rmSync(tempDir, { recursive: true, force: true });
    });

    test('creates a writable stream that writes data to a file', async () => {
      const filePath: string = `${tempDir}/output.txt`;
      const stream: fs.WriteStream = await FileSystem.createWriteStreamAsync(filePath);

      await new Promise<void>((resolve, reject) => {
        stream.on('error', reject);
        stream.write('async hello');
        stream.end(() => resolve());
      });

      const result: string = fs.readFileSync(filePath, 'utf-8');
      expect(result).toBe('async hello');
    });

    test('creates the parent folder when ensureFolderExists is true', async () => {
      const filePath: string = `${tempDir}/new-folder/output.txt`;
      const stream: fs.WriteStream = await FileSystem.createWriteStreamAsync(filePath, {
        ensureFolderExists: true
      });

      await new Promise<void>((resolve, reject) => {
        stream.on('error', reject);
        stream.write('async test data');
        stream.end(() => resolve());
      });

      const result: string = fs.readFileSync(filePath, 'utf-8');
      expect(result).toBe('async test data');
    });
  });
});
