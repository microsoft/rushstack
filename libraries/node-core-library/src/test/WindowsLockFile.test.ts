// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as fs from 'node:fs';
import * as path from 'node:path';
import { execFileSync, spawn } from 'node:child_process';
import { once } from 'node:events';

import { LockFile, type ITryAcquireResult } from '../LockFile';
import { FileSystem } from '../FileSystem';
import { tryAcquireWindowsLockFile } from '../WindowsLockFile';

describe('Windows lock failure handling', () => {
  const filename: string = path.resolve(__dirname, 'mock-resource.lock');
  const nativeFs: typeof fs = jest.requireActual('node:fs');

  beforeEach(() => {
    jest.spyOn(nativeFs, 'closeSync').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('returns undefined and closes both descriptors when a volume ignores exclusive sharing', () => {
    jest.spyOn(nativeFs, 'openSync').mockReturnValueOnce(123).mockReturnValueOnce(124);
    const stat = jest.spyOn(nativeFs, 'fstatSync');
    const write = jest.spyOn(nativeFs, 'writeFileSync');
    expect(tryAcquireWindowsLockFile(filename)).toBeUndefined();
    expect(nativeFs.closeSync).toHaveBeenNthCalledWith(1, 124);
    expect(nativeFs.closeSync).toHaveBeenNthCalledWith(2, 123);
    expect(stat).not.toHaveBeenCalled();
    expect(write).not.toHaveBeenCalled();
  });

  it.each(['EPERM', 'EACCES', 'EIO'])('does not mistake probe error %s for proof of exclusion', (code) => {
    const error: NodeJS.ErrnoException = Object.assign(new Error('probe failure'), { code });
    jest
      .spyOn(nativeFs, 'openSync')
      .mockReturnValueOnce(123)
      .mockImplementationOnce(() => {
        throw error;
      });
    expect(() => tryAcquireWindowsLockFile(filename)).toThrow(error);
    expect(nativeFs.closeSync).toHaveBeenCalledWith(123);
  });

  it.each(['EPERM', 'EACCES', 'EIO'])('surfaces initial and existing-file open errors %s', (code) => {
    const error: NodeJS.ErrnoException = Object.assign(new Error('open failure'), { code });
    const open = jest.spyOn(nativeFs, 'openSync').mockImplementation(() => {
      throw error;
    });
    expect(() => tryAcquireWindowsLockFile(filename)).toThrow(error);
    open.mockImplementationOnce(() => {
      throw Object.assign(new Error('exists'), { code: 'EEXIST' });
    });
    expect(() => tryAcquireWindowsLockFile(filename)).toThrow(error);
    expect(nativeFs.closeSync).not.toHaveBeenCalled();
  });

  it.each(['EBUSY', 'ENOENT'])('returns undefined on existing-file acquisition race %s', (code) => {
    jest
      .spyOn(nativeFs, 'openSync')
      .mockImplementationOnce(() => {
        throw Object.assign(new Error('exists'), { code: 'EEXIST' });
      })
      .mockImplementationOnce(() => {
        throw Object.assign(new Error('race'), { code });
      });
    expect(tryAcquireWindowsLockFile(filename)).toBeUndefined();
    expect(nativeFs.closeSync).not.toHaveBeenCalled();
  });

  it('returns undefined when the initial open is sharing-denied', () => {
    jest.spyOn(nativeFs, 'openSync').mockImplementation(() => {
      throw Object.assign(new Error('sharing violation'), { code: 'EBUSY' });
    });
    expect(tryAcquireWindowsLockFile(filename)).toBeUndefined();
  });

  it('restores the dirty companion if closing a prepared handle fails', () => {
    jest
      .spyOn(nativeFs, 'openSync')
      .mockReturnValueOnce(123)
      .mockImplementationOnce(() => {
        throw Object.assign(new Error('sharing violation'), { code: 'EBUSY' });
      });
    const stats: fs.BigIntStats = {
      isFile: () => true,
      nlink: 1n,
      dev: 1n,
      ino: 1n,
      size: 0n
    } as fs.BigIntStats;
    jest.spyOn(nativeFs, 'fstatSync').mockReturnValue(stats);
    jest.spyOn(nativeFs, 'lstatSync').mockReturnValueOnce(stats).mockReturnValueOnce(undefined!);
    const write = jest.spyOn(nativeFs, 'writeFileSync').mockImplementation(() => {});
    jest.spyOn(nativeFs, 'ftruncateSync').mockImplementation(() => {});
    jest.spyOn(nativeFs, 'writeSync').mockReturnValue(Buffer.byteLength('rushstack-lockfile-clean-v1\n'));
    jest.spyOn(nativeFs, 'unlinkSync').mockImplementation(() => {});
    const result: ITryAcquireResult = tryAcquireWindowsLockFile(filename)!;
    result.fileWriter.prepareForRelease!(true);
    const closeError: Error = new Error('close failure');
    jest.mocked(nativeFs.closeSync).mockImplementationOnce(() => {
      throw closeError;
    });
    expect(() => result.fileWriter.close()).toThrow(closeError);
    expect(write).toHaveBeenCalledTimes(2);
    expect(write).toHaveBeenLastCalledWith(`${filename}.dirty`, '', { flag: 'wx', mode: 0o600 });
    result.fileWriter.close();
    expect(nativeFs.closeSync).toHaveBeenCalledTimes(2);
  });
});

(process.platform === 'win32' ? describe : describe.skip)('native Windows file mutex', () => {
  let folder: string;
  let filename: string;

  beforeEach(() => {
    folder = fs.mkdtempSync(path.join(__dirname, 'rush-native-lock-'));
    filename = LockFile.getLockFilePath(folder, 'resource');
  });

  afterEach(() => {
    jest.restoreAllMocks();
    fs.rmSync(folder, { recursive: true, force: true });
  });

  it('excludes a second live process and prevents deletion while held', () => {
    const owner: LockFile = LockFile.tryAcquire(folder, 'resource')!;
    try {
      const output: string = execFileSync(
        process.execPath,
        [
          '-e',
          `
        const { LockFile } = require(${JSON.stringify(require.resolve('../LockFile'))});
        const lock = LockFile.tryAcquire(${JSON.stringify(fs.realpathSync.native(folder))}, 'resource');
        process.stdout.write(JSON.stringify({ acquired: !!lock }));
        if (lock) lock.release(false);
      `
        ],
        { cwd: folder, encoding: 'utf8' }
      );
      expect(JSON.parse(output)).toEqual({ acquired: false });
      expect(() => fs.unlinkSync(filename)).toThrow(expect.objectContaining({ code: 'EBUSY' }));
      expect(owner.isReleased).toBe(false);
    } finally {
      owner.release();
    }
  });

  it('does not remove a legacy writer that still holds the file', () => {
    const descriptor: number = fs.openSync(filename, 'wx');
    try {
      expect(LockFile.tryAcquire(folder, 'resource')).toBeUndefined();
      expect(fs.existsSync(filename)).toBe(true);
      expect(fs.existsSync(`${filename}.dirty`)).toBe(false);
    } finally {
      fs.closeSync(descriptor);
    }
    const recovered: LockFile = LockFile.tryAcquire(folder, 'resource')!;
    expect(recovered.dirtyWhenAcquired).toBe(true);
    recovered.release();
  });

  it('distinguishes clean release from a deliberately retained dirty lock', () => {
    const first: LockFile = LockFile.tryAcquire(folder, 'resource')!;
    expect(first.dirtyWhenAcquired).toBe(false);
    first.release();
    expect(fs.existsSync(filename)).toBe(false);
    expect(fs.existsSync(`${filename}.dirty`)).toBe(false);
    const second: LockFile = LockFile.tryAcquire(folder, 'resource')!;
    expect(second.dirtyWhenAcquired).toBe(false);
    second.release(false);
    expect(fs.existsSync(filename)).toBe(true);
    expect(fs.existsSync(`${filename}.dirty`)).toBe(true);
    const recovered: LockFile = LockFile.tryAcquire(folder, 'resource')!;
    expect(recovered.dirtyWhenAcquired).toBe(true);
    recovered.release();
    expect(fs.readdirSync(folder)).toEqual([]);
  });

  it('retains interrupted-owner dirtiness after actual process termination', async () => {
    const child = spawn(
      process.execPath,
      [
        '-e',
        `
      const { LockFile } = require(${JSON.stringify(require.resolve('../LockFile'))});
      const lock = LockFile.tryAcquire(${JSON.stringify(folder)}, 'resource');
      if (!lock) throw new Error('Fixture could not acquire the lock.');
      process.send({ acquired: true });
      setInterval(() => {}, 1000);
    `
      ],
      { cwd: folder, stdio: ['ignore', 'ignore', 'pipe', 'ipc'] }
    );
    const closed = once(child, 'close');
    try {
      expect((await once(child, 'message'))[0]).toEqual({ acquired: true });
      expect(LockFile.tryAcquire(folder, 'resource')).toBeUndefined();
    } finally {
      if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
      await closed;
    }
    const recovered: LockFile = LockFile.tryAcquire(folder, 'resource')!;
    expect(recovered.dirtyWhenAcquired).toBe(true);
    recovered.release();
  }, 15000);

  it('does not delete a live successor that acquires during close/unlink', () => {
    const owner: LockFile = LockFile.tryAcquire(folder, 'resource')!;
    const remove: typeof FileSystem.deleteFile = FileSystem.deleteFile;
    let successor: LockFile | undefined;
    const deletion = jest.spyOn(FileSystem, 'deleteFile').mockImplementation((file, options) => {
      if (file === filename && !successor) successor = LockFile.tryAcquire(folder, 'resource');
      remove(file, options);
    });
    try {
      owner.release();
      expect(owner.isReleased).toBe(true);
      expect(successor).toBeDefined();
      expect(successor!.dirtyWhenAcquired).toBe(false);
      expect(successor!.isReleased).toBe(false);
      expect(fs.existsSync(filename)).toBe(true);
    } finally {
      deletion.mockRestore();
      if (!owner.isReleased) owner.release();
      successor?.release();
    }
  });

  it('preserves dirtiness if a successor exits before the predecessor finishes unlinking', () => {
    const owner: LockFile = LockFile.tryAcquire(folder, 'resource')!;
    const remove: typeof FileSystem.deleteFile = FileSystem.deleteFile;
    let raced: boolean = false;
    const deletion = jest.spyOn(FileSystem, 'deleteFile').mockImplementation((file, options) => {
      if (file === filename && !raced) {
        raced = true;
        const successor: LockFile = LockFile.tryAcquire(folder, 'resource')!;
        expect(successor.dirtyWhenAcquired).toBe(false);
        successor.release(false);
      }
      remove(file, options);
    });
    try {
      owner.release();
    } finally {
      deletion.mockRestore();
    }
    expect(raced).toBe(true);
    expect(fs.existsSync(filename)).toBe(false);
    expect(fs.existsSync(`${filename}.dirty`)).toBe(true);
    const recovered: LockFile = LockFile.tryAcquire(folder, 'resource')!;
    expect(recovered.dirtyWhenAcquired).toBe(true);
    recovered.release();
  });

  it('refuses a shared file instead of modifying its other link', () => {
    const other: string = path.join(folder, 'not-a-lock.txt');
    fs.writeFileSync(other, 'unchanged');
    fs.linkSync(other, filename);
    expect(() => LockFile.tryAcquire(folder, 'resource')).toThrow('unshared regular file');
    expect(fs.readFileSync(other, 'utf8')).toBe('unchanged');
    expect(fs.existsSync(`${filename}.dirty`)).toBe(false);
  });

  it('surfaces unexpected open failures instead of pretending another process owns the lock', () => {
    const failure: NodeJS.ErrnoException = Object.assign(new Error('fixture IO failure'), { code: 'EIO' });
    const nativeFs: typeof fs = jest.requireActual('node:fs');
    jest.spyOn(nativeFs, 'openSync').mockImplementation(() => {
      throw failure;
    });
    expect(() => LockFile.tryAcquire(folder, 'resource')).toThrow(failure);
  });

  it('fails closed if the runtime does not honor exclusive sharing', () => {
    const nativeFs: typeof fs = jest.requireActual('node:fs');
    const open: typeof fs.openSync = nativeFs.openSync;
    const exclusiveSharing: number = 0x10000000;
    jest
      .spyOn(nativeFs, 'openSync')
      .mockImplementation((file, flags, mode) =>
        open(
          file,
          typeof flags === 'number' && flags >= exclusiveSharing ? flags - exclusiveSharing : flags,
          mode
        )
      );
    expect(LockFile.tryAcquire(folder, 'resource')).toBeUndefined();
    expect(fs.existsSync(`${filename}.dirty`)).toBe(false);
  });

  it.each(['truncate', 'write', 'unlink'])(
    'closes after clean-release %s fails and recovers dirty',
    (operation) => {
      const owner: LockFile = LockFile.tryAcquire(folder, 'resource')!;
      const nativeFs: typeof fs = jest.requireActual('node:fs');
      const error: Error = new Error('preparation failure');
      const fail = (): never => {
        throw error;
      };
      if (operation === 'truncate') jest.spyOn(nativeFs, 'ftruncateSync').mockImplementationOnce(fail);
      else if (operation === 'write') jest.spyOn(nativeFs, 'writeSync').mockReturnValueOnce(0);
      else jest.spyOn(nativeFs, 'unlinkSync').mockImplementationOnce(fail);
      expect(() => owner.release()).toThrow();
      expect(owner.isReleased).toBe(true);
      expect(fs.existsSync(filename)).toBe(true);
      expect(fs.existsSync(`${filename}.dirty`)).toBe(true);
      const recovered: LockFile = LockFile.tryAcquire(folder, 'resource')!;
      expect(recovered.dirtyWhenAcquired).toBe(true);
      recovered.release();
    }
  );
});
