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

  describe(FileSystem.ensureEmptyFolder.name, () => {
    const tempDir: string = `${testTempFolder}/ensureEmptyFolder`;

    afterEach(() => {
      FileSystem.deleteFolder(tempDir);
    });

    test('empties an existing folder but keeps the folder itself', () => {
      FileSystem.ensureFolder(`${tempDir}/sub`);
      FileSystem.writeFile(`${tempDir}/a.txt`, 'a');
      FileSystem.writeFile(`${tempDir}/sub/b.txt`, 'b');

      FileSystem.ensureEmptyFolder(tempDir);

      expect(fs.existsSync(tempDir)).toBe(true);
      expect(fs.readdirSync(tempDir)).toEqual([]);
    });

    test('creates the folder when it does not exist', () => {
      expect(fs.existsSync(tempDir)).toBe(false);

      FileSystem.ensureEmptyFolder(tempDir);

      expect(fs.existsSync(tempDir)).toBe(true);
      expect(fs.readdirSync(tempDir)).toEqual([]);
    });

    test('re-throws errors from readFolderItems that are not not-exist errors', () => {
      const permError: NodeJS.ErrnoException = Object.assign(new Error('EACCES: permission denied'), {
        code: 'EACCES'
      });
      const spy: jest.SpyInstance = jest.spyOn(FileSystem, 'readFolderItems').mockImplementationOnce(() => {
        throw permError;
      });

      try {
        expect(() => FileSystem.ensureEmptyFolder(tempDir)).toThrow(/EACCES/);
      } finally {
        spy.mockRestore();
      }
    });
  });

  describe(FileSystem.ensureEmptyFolderAsync.name, () => {
    const tempDir: string = `${testTempFolder}/ensureEmptyFolderAsync`;

    afterEach(async () => {
      await FileSystem.deleteFolderAsync(tempDir);
    });

    test('empties an existing folder but keeps the folder itself', async () => {
      await FileSystem.ensureFolderAsync(`${tempDir}/sub`);
      await FileSystem.writeFileAsync(`${tempDir}/a.txt`, 'a');
      await FileSystem.writeFileAsync(`${tempDir}/sub/b.txt`, 'b');

      await FileSystem.ensureEmptyFolderAsync(tempDir);

      expect(fs.existsSync(tempDir)).toBe(true);
      expect(fs.readdirSync(tempDir)).toEqual([]);
    });

    test('creates the folder when it does not exist', async () => {
      expect(fs.existsSync(tempDir)).toBe(false);

      await FileSystem.ensureEmptyFolderAsync(tempDir);

      expect(fs.existsSync(tempDir)).toBe(true);
      expect(fs.readdirSync(tempDir)).toEqual([]);
    });

    test('re-throws errors from readFolderItemsAsync that are not not-exist errors', async () => {
      const permError: NodeJS.ErrnoException = Object.assign(new Error('EACCES: permission denied'), {
        code: 'EACCES'
      });
      const spy: jest.SpyInstance = jest
        .spyOn(FileSystem, 'readFolderItemsAsync')
        .mockRejectedValueOnce(permError);

      try {
        await expect(FileSystem.ensureEmptyFolderAsync(tempDir)).rejects.toThrow(/EACCES/);
      } finally {
        spy.mockRestore();
      }
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
