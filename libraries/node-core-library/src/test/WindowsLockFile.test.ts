// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { execFileSync, spawn } from 'node:child_process';
import { once } from 'node:events';

import { LockFile } from '../LockFile';
import { FileSystem } from '../FileSystem';

(process.platform === 'win32' ? describe : describe.skip)('native Windows file mutex', () => {
  let folder: string;
  let filename: string;

  beforeEach(() => {
    folder = fs.mkdtempSync(path.join(os.tmpdir(), 'rush-native-lock-'));
    filename = LockFile.getLockFilePath(folder, 'resource');
  });

  afterEach(() => {
    jest.restoreAllMocks();
    fs.rmSync(folder, { recursive: true, force: true });
  });

  it('excludes a second live process and prevents deletion while held', () => {
    const owner: LockFile = LockFile.tryAcquire(folder, 'resource')!;
    try {
      const output: string = execFileSync(process.execPath, ['-e', `
        const { LockFile } = require(${JSON.stringify(require.resolve('../LockFile'))});
        const lock = LockFile.tryAcquire(${JSON.stringify(fs.realpathSync.native(folder))}, 'resource');
        process.stdout.write(JSON.stringify({ acquired: !!lock }));
        if (lock) lock.release(false);
      `], { cwd: os.tmpdir(), encoding: 'utf8' });
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
    const child = spawn(process.execPath, ['-e', `
      const { LockFile } = require(${JSON.stringify(require.resolve('../LockFile'))});
      const lock = LockFile.tryAcquire(${JSON.stringify(folder)}, 'resource');
      if (!lock) throw new Error('Fixture could not acquire the lock.');
      process.send({ acquired: true });
      setInterval(() => {}, 1000);
    `], { cwd: os.tmpdir(), stdio: ['ignore', 'ignore', 'pipe', 'ipc'] });
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
    jest.spyOn(nativeFs, 'openSync').mockImplementation(() => { throw failure; });
    expect(() => LockFile.tryAcquire(folder, 'resource')).toThrow(failure);
  });

  it('fails closed if the runtime does not honor exclusive sharing', () => {
    const nativeFs: typeof fs = jest.requireActual('node:fs');
    const open: typeof fs.openSync = nativeFs.openSync;
    const exclusiveSharing: number = 0x10000000;
    jest.spyOn(nativeFs, 'openSync').mockImplementation((file, flags, mode) =>
      open(file, typeof flags === 'number' && flags >= exclusiveSharing ? flags - exclusiveSharing : flags, mode)
    );
    expect(() => LockFile.tryAcquire(folder, 'resource')).toThrow('did not enforce native exclusive');
    expect(fs.existsSync(`${filename}.dirty`)).toBe(false);
  });
});
