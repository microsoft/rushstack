// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import fs from 'node:fs';
import fsPromises from 'node:fs/promises';
import * as path from 'node:path';
import fsx from 'fs-extra';

import { Async } from '../Async';
import { FileSystem } from '../FileSystem';
import { PosixModeBits } from '../PosixModeBits';

// Use a deterministic path inside the project's output folder for temp files
const testTempFolder: string = `${__dirname}/temp`;

function createDeletionError(code: string): NodeJS.ErrnoException {
  return Object.assign(new Error(`${code}: deletion failed`), {
    code,
    errno: -1,
    syscall: 'unlink',
    path: 'mock-child'
  });
}

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

    test('re-throws folder read errors other than ENOENT', () => {
      const permError: NodeJS.ErrnoException = Object.assign(new Error('EACCES: permission denied'), {
        code: 'EACCES'
      });
      const spy: jest.SpyInstance = jest.spyOn(fsx, 'readdirSync').mockImplementationOnce(() => {
        throw permError;
      });

      try {
        expect(() => FileSystem.ensureEmptyFolder(tempDir)).toThrow(/EACCES/);
      } finally {
        spy.mockRestore();
      }
    });

    test('supports an unbound call', () => {
      FileSystem.ensureFolder(tempDir);
      FileSystem.writeFile(`${tempDir}/a.txt`, 'a');
      const { ensureEmptyFolder } = FileSystem;

      ensureEmptyFolder(tempDir);

      expect(fs.readdirSync(tempDir)).toEqual([]);
    });

    test('does not delete or replace an existing file', () => {
      FileSystem.ensureFolder(testTempFolder);
      FileSystem.writeFile(tempDir, 'keep');

      expect(() => FileSystem.ensureEmptyFolder(tempDir)).toThrow(/ENOTDIR/);
      expect(FileSystem.readFile(tempDir)).toBe('keep');
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

    test('re-throws folder read errors other than ENOENT', async () => {
      const permError: NodeJS.ErrnoException = Object.assign(new Error('EACCES: permission denied'), {
        code: 'EACCES'
      });
      const spy: jest.SpyInstance = jest.spyOn(fsx, 'readdir').mockRejectedValueOnce(permError);

      try {
        await expect(FileSystem.ensureEmptyFolderAsync(tempDir)).rejects.toThrow(/EACCES/);
      } finally {
        spy.mockRestore();
      }
    });

    test('supports an unbound call', async () => {
      await FileSystem.ensureFolderAsync(tempDir);
      await FileSystem.writeFileAsync(`${tempDir}/a.txt`, 'a');
      const { ensureEmptyFolderAsync } = FileSystem;

      await ensureEmptyFolderAsync(tempDir);

      expect(fs.readdirSync(tempDir)).toEqual([]);
    });

    test('does not delete or replace an existing file', async () => {
      await FileSystem.ensureFolderAsync(testTempFolder);
      await FileSystem.writeFileAsync(tempDir, 'keep');

      await expect(FileSystem.ensureEmptyFolderAsync(tempDir)).rejects.toThrow(/ENOTDIR/);
      expect(FileSystem.readFile(tempDir)).toBe('keep');
    });
  });

  describe.each([
    { name: 'deleteFolder', run: FileSystem.deleteFolder, isAsync: false, emptiesFolder: false },
    { name: 'deleteFolderAsync', run: FileSystem.deleteFolderAsync, isAsync: true, emptiesFolder: false },
    { name: 'ensureEmptyFolder', run: FileSystem.ensureEmptyFolder, isAsync: false, emptiesFolder: true },
    {
      name: 'ensureEmptyFolderAsync',
      run: FileSystem.ensureEmptyFolderAsync,
      isAsync: true,
      emptiesFolder: true
    }
  ])('$name retry policy', ({ run, isAsync, emptiesFolder }) => {
    const folderPath: string = path.join(testTempFolder, 'mock-deletion');
    const platformDescriptor: PropertyDescriptor = Object.getOwnPropertyDescriptor(process, 'platform')!;
    let rmSpy: jest.SpyInstance;
    let readSpy: jest.SpyInstance;
    let sleeps: number[];

    beforeEach(() => {
      Object.defineProperty(process, 'platform', { value: 'win32' });
      sleeps = [];
      jest.spyOn(Atomics, 'wait').mockImplementation((array, index, value, delay) => {
        sleeps.push(delay!);
        return 'timed-out';
      });
      jest.spyOn(Async, 'sleepAsync').mockImplementation(async (delay) => {
        sleeps.push(delay);
      });
      readSpy = isAsync ? jest.spyOn(fsx, 'readdir') : jest.spyOn(fsx, 'readdirSync');
      readSpy.mockImplementation(() => (isAsync ? Promise.resolve(['child']) : ['child']));
      rmSpy = isAsync ? jest.spyOn(fsPromises, 'rm') : jest.spyOn(fs, 'rmSync');
      rmSpy.mockImplementation(() => (isAsync ? Promise.resolve() : undefined));
    });

    afterEach(() => {
      jest.restoreAllMocks();
      Object.defineProperty(process, 'platform', platformDescriptor);
    });

    test.each(['EBUSY', 'ENOTEMPTY', 'EPERM'])(
      'retries %s then succeeds with native retries disabled',
      async (code) => {
        rmSpy.mockImplementationOnce(() => {
          throw createDeletionError(code);
        });

        await run(folderPath);

        expect(sleeps).toEqual([100]);
        expect(rmSpy).toHaveBeenCalledTimes(2);
        for (const call of rmSpy.mock.calls) {
          expect(call).toEqual([
            emptiesFolder ? path.join(folderPath, 'child') : folderPath,
            { recursive: true, force: true, maxRetries: 0, retryDelay: 0 }
          ]);
        }
      }
    );

    test('waits exactly 100, 200 and 300 ms and throws the last failed attempt', async () => {
      const errors: NodeJS.ErrnoException[] = ['EBUSY', 'ENOTEMPTY', 'EPERM', 'EPERM'].map(
        createDeletionError
      );
      let attempt: number = 0;
      rmSpy.mockImplementation(() => {
        throw errors[attempt++];
      });

      await expect(async () => run(folderPath)).rejects.toBe(errors[3]);

      expect(rmSpy).toHaveBeenCalledTimes(4);
      expect(sleeps).toEqual([100, 200, 300]);
      expect(errors[3].message).toContain('File or folder could not be deleted:');
      expect(errors[2].message).not.toContain('File or folder could not be deleted:');
    });

    test.each(['EACCES', 'EMFILE', 'ENFILE', 'EIO', 'ENOTDIR', ''])(
      'does not retry a reported code of %j',
      async (code) => {
        const error: NodeJS.ErrnoException = createDeletionError(code);
        rmSpy.mockImplementation(() => {
          throw error;
        });

        await expect(async () => run(folderPath)).rejects.toBe(error);

        expect(rmSpy).toHaveBeenCalledTimes(1);
        expect(sleeps).toEqual([]);
      }
    );

    test('does not retry an error without a code', async () => {
      const error: Error = new Error('unexpected failure');
      rmSpy.mockImplementation(() => {
        throw error;
      });

      await expect(async () => run(folderPath)).rejects.toBe(error);

      expect(rmSpy).toHaveBeenCalledTimes(1);
      expect(sleeps).toEqual([]);
    });

    test('stops retrying when a subsequent attempt fails with a non-retryable error', async () => {
      const error: NodeJS.ErrnoException = createDeletionError('EACCES');
      rmSpy
        .mockImplementationOnce(() => {
          throw createDeletionError('EPERM');
        })
        .mockImplementationOnce(() => {
          throw error;
        });

      await expect(async () => run(folderPath)).rejects.toBe(error);

      expect(rmSpy).toHaveBeenCalledTimes(2);
      expect(sleeps).toEqual([100]);
    });

    test.each(['linux', 'darwin'])('does not retry on %s', async (platform) => {
      Object.defineProperty(process, 'platform', { value: platform });
      const error: NodeJS.ErrnoException = createDeletionError('EPERM');
      rmSpy.mockImplementation(() => {
        throw error;
      });

      await expect(async () => run(folderPath)).rejects.toBe(error);

      expect(rmSpy).toHaveBeenCalledTimes(1);
      expect(sleeps).toEqual([]);
    });

    if (emptiesFolder) {
      test('re-reads child names after a partially completed attempt', async () => {
        readSpy
          .mockImplementationOnce(() =>
            isAsync ? Promise.resolve(['first', 'second']) : ['first', 'second']
          )
          .mockImplementation(() => (isAsync ? Promise.resolve(['second']) : ['second']));
        let attempt: number = 0;
        rmSpy.mockImplementation(() => {
          if (++attempt === 2) {
            throw createDeletionError('ENOTEMPTY');
          }

          return isAsync ? Promise.resolve() : undefined;
        });

        await run(folderPath);

        expect(rmSpy.mock.calls.map(([childPath]) => childPath)).toEqual(
          ['first', 'second', 'second'].map((name) => path.join(folderPath, name))
        );
        expect(isAsync ? fsx.readdir : fsx.readdirSync).toHaveBeenCalledTimes(2);
        expect(sleeps).toEqual([100]);
      });

      test('retries folder enumeration as part of the whole operation', async () => {
        const error: NodeJS.ErrnoException = createDeletionError('EBUSY');
        if (isAsync) {
          jest.spyOn(fsx, 'readdir').mockRejectedValueOnce(error);
        } else {
          jest.spyOn(fsx, 'readdirSync').mockImplementationOnce(() => {
            throw error;
          });
        }

        await run(folderPath);

        expect(isAsync ? fsx.readdir : fsx.readdirSync).toHaveBeenCalledTimes(2);
        expect(rmSpy).toHaveBeenCalledTimes(1);
        expect(sleeps).toEqual([100]);
      });
    }
  });

  describe('ensureEmptyFolderAsync in-flight deletions', () => {
    const platformDescriptor: PropertyDescriptor = Object.getOwnPropertyDescriptor(process, 'platform')!;

    beforeEach(() => {
      Object.defineProperty(process, 'platform', { value: 'win32' });
    });

    afterEach(() => {
      jest.restoreAllMocks();
      Object.defineProperty(process, 'platform', platformDescriptor);
    });

    test.each([
      { name: 'before retrying', earlierFailures: 0, firstCode: 'EBUSY', secondCode: undefined },
      {
        name: 'before rejecting after exhausting retries',
        earlierFailures: 3,
        firstCode: 'EPERM',
        secondCode: undefined
      },
      {
        name: 'preferring a later non-retryable error',
        earlierFailures: 0,
        firstCode: 'EPERM',
        secondCode: 'EACCES'
      },
      {
        name: 'preserving an earlier non-retryable error',
        earlierFailures: 0,
        firstCode: 'EACCES',
        secondCode: 'EPERM'
      },
      {
        name: 'preserving the first retryable error',
        earlierFailures: 3,
        firstCode: 'EBUSY',
        secondCode: 'EPERM'
      }
    ])(
      'settles started deletes and stops starting new ones $name',
      async ({ earlierFailures, firstCode, secondCode }) => {
        const firstError: NodeJS.ErrnoException = createDeletionError(firstCode);
        const secondError: NodeJS.ErrnoException | undefined = secondCode
          ? createDeletionError(secondCode)
          : undefined;
        const expectedError: NodeJS.ErrnoException = secondCode === 'EACCES' ? secondError! : firstError;
        const shouldRetry: boolean = earlierFailures === 0 && firstCode !== 'EACCES' && !secondError;
        const [started, signalStarted] = Async.getSignal();
        const [firstDelete, , rejectFirst] = Async.getSignal();
        const [otherDeletes, resolveOthers, rejectOthers] = Async.getSignal();
        const sleeps: number[] = [];
        jest.spyOn(Async, 'sleepAsync').mockImplementation(async (delay) => {
          sleeps.push(delay);
        });
        let reads: number = 0;
        const readSpy: jest.SpyInstance = jest.spyOn(fsx, 'readdir').mockImplementation(async () => {
          if (++reads <= earlierFailures) {
            throw createDeletionError('EBUSY');
          }

          return reads === earlierFailures + 1 ? Array.from({ length: 20 }, (value, i) => `child-${i}`) : [];
        });
        let startedDeletes: number = 0;
        const rmSpy: jest.SpyInstance = jest.spyOn(fsPromises, 'rm').mockImplementation(() => {
          if (++startedDeletes === 10) {
            signalStarted();
          }

          return startedDeletes === 1 ? firstDelete : otherDeletes;
        });
        let settled: boolean = false;
        const operation: Promise<void> = FileSystem.ensureEmptyFolderAsync('mock-folder').then(
          () => {
            settled = true;
          },
          (error) => {
            settled = true;
            throw error;
          }
        );
        const result: Promise<void> = shouldRetry
          ? expect(operation).resolves.toBeUndefined()
          : expect(operation).rejects.toBe(expectedError);

        await started;
        rejectFirst(firstError);
        await new Promise<void>((resolve) => setImmediate(resolve));

        expect(rmSpy).toHaveBeenCalledTimes(10);
        expect(readSpy).toHaveBeenCalledTimes(earlierFailures + 1);
        expect(sleeps).toEqual(earlierFailures ? [100, 200, 300] : []);
        expect(settled).toBe(false);

        if (secondError) {
          rejectOthers(secondError);
        } else {
          resolveOthers();
        }

        await result;

        expect(settled).toBe(true);
        expect(rmSpy).toHaveBeenCalledTimes(10);
        expect(readSpy).toHaveBeenCalledTimes(earlierFailures + (shouldRetry ? 2 : 1));
        expect(sleeps).toEqual(shouldRetry ? [100] : earlierFailures ? [100, 200, 300] : []);
      }
    );
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
