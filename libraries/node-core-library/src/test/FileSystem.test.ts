// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import fs from 'node:fs';

import { FileSystem } from '../FileSystem';
import { PosixModeBits } from '../PosixModeBits';

// Use a deterministic path inside the project's output folder for temp files
const testTempFolder: string = `${__dirname}/temp`;

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
    const tempDir: string = `${testTempFolder}/createReadStream`;

    beforeEach(async () => {
      await FileSystem.ensureFolderAsync(tempDir);
    });

    afterEach(async () => {
      await FileSystem.deleteFolderAsync(tempDir);
    });

    test('returns a readable stream for an existing file', async () => {
      const filePath: string = `${tempDir}/test.txt`;
      await FileSystem.writeFileAsync(filePath, 'hello world');

      const stream: fs.ReadStream = FileSystem.createReadStream(filePath);
      const chunks: Buffer[] = [];

      for await (const chunk of stream) {
        chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
      }

      const result: string = Buffer.concat(chunks).toString();
      expect(result).toBe('hello world');
    });

    test('stream emits an error for a nonexistent file', async () => {
      const filePath: string = `${tempDir}/nonexistent.txt`;
      const stream: fs.ReadStream = FileSystem.createReadStream(filePath);

      await expect(async () => {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        for await (const _chunk of stream) {
          fail();
        }
      }).rejects.toThrow(/ENOENT/);
    });
  });

  describe(FileSystem.createWriteStream.name, () => {
    const tempDir: string = `${testTempFolder}/createWriteStream`;

    beforeEach(async () => {
      await FileSystem.ensureFolderAsync(tempDir);
    });

    afterEach(async () => {
      await FileSystem.deleteFolderAsync(tempDir);
    });

    test('creates a writable stream that writes data to a file', async () => {
      const filePath: string = `${tempDir}/output.txt`;
      const stream: fs.WriteStream = FileSystem.createWriteStream(filePath);

      await new Promise<void>((resolve, reject) => {
        stream.on('error', reject);
        stream.write('hello ');
        stream.write('world');
        stream.end(() => resolve());
      });

      const result: string = await FileSystem.readFileAsync(filePath);
      expect(result).toBe('hello world');
    });

    test('emits an error when the parent folder does not exist and ensureFolderExists is not set', async () => {
      const filePath: string = `${tempDir}/nonexistent-folder/output.txt`;
      const stream: fs.WriteStream = FileSystem.createWriteStream(filePath);

      await expect(
        new Promise<void>((resolve, reject) => {
          stream.on('error', reject);
          stream.on('open', () => resolve());
        })
      ).rejects.toThrow(/ENOENT/);
    });

    test('creates the parent folder when ensureFolderExists is true', async () => {
      const filePath: string = `${tempDir}/new-folder/output.txt`;
      const stream: fs.WriteStream = FileSystem.createWriteStream(filePath, {
        ensureFolderExists: true
      });

      await new Promise<void>((resolve, reject) => {
        stream.on('error', reject);
        stream.write('test data');
        stream.end(() => resolve());
      });

      const result: string = await FileSystem.readFileAsync(filePath);
      expect(result).toBe('test data');
    });
  });

  describe(FileSystem.createWriteStreamAsync.name, () => {
    const tempDir: string = `${testTempFolder}/createWriteStreamAsync`;

    beforeEach(async () => {
      await FileSystem.ensureFolderAsync(tempDir);
    });

    afterEach(async () => {
      await FileSystem.deleteFolderAsync(tempDir);
    });

    test('creates a writable stream that writes data to a file', async () => {
      const filePath: string = `${tempDir}/output.txt`;
      const stream: fs.WriteStream = await FileSystem.createWriteStreamAsync(filePath);

      await new Promise<void>((resolve, reject) => {
        stream.on('error', reject);
        stream.write('async hello');
        stream.end(() => resolve());
      });

      const result: string = await FileSystem.readFileAsync(filePath);
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

      const result: string = await FileSystem.readFileAsync(filePath);
      expect(result).toBe('async test data');
    });
  });
});
