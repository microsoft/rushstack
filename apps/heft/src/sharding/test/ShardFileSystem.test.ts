// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import fs from 'node:fs/promises';
import path from 'node:path';

import { FileSystem } from '@rushstack/node-core-library';

import {
  invalidateShardFileAsync,
  validateShardPath,
  validateShardRelativePath,
  writeShardFileAtomicallyAsync
} from '../ShardFileSystem';

describe('atomic shard files', () => {
  const folder: string = path.join(__dirname, 'atomic-shard-files');
  const staging: string = path.join(folder, 'report.partial.json');
  let created: boolean;

  beforeEach(async () => {
    created = false;
    await fs.mkdir(folder);
    created = true;
  });
  afterEach(async () => {
    jest.restoreAllMocks();
    if (created) await fs.rm(folder, { recursive: true });
  });

  it('replaces a report with only the declared deterministic staging path', async () => {
    const filename: string = path.join(folder, 'report.json');
    const open = jest.spyOn(fs, 'open');
    await fs.writeFile(filename, 'old');
    await fs.writeFile(staging, 'abandoned partial result');
    await invalidateShardFileAsync(filename);
    await writeShardFileAtomicallyAsync(filename, '{"success":false}', staging);
    expect(open).toHaveBeenCalledWith(staging, 'w');
    expect(await fs.readFile(filename, 'utf8')).toBe('{"success":false}');
    expect(await fs.readdir(folder)).toEqual(['report.json']);
  });

  it.each([
    { description: '200-character ASCII', name: 'a'.repeat(200) },
    { description: '255-character ASCII', name: 'a'.repeat(255) },
    {
      description: 'near-limit Unicode',
      name: process.platform === 'win32' ? '\u00e9'.repeat(255) : `${'\u00e9'.repeat(127)}a`
    }
  ])('publishes valid $description leaf and ancestor names without lengthening them', async ({ name }) => {
    const ancestor: string = path.join(folder, name);
    await fs.mkdir(ancestor);
    const filename: string = path.join(ancestor, name);
    await fs.writeFile(filename, 'previous');
    expect(await fs.readFile(filename, 'utf8')).toBe('previous');
    await writeShardFileAtomicallyAsync(filename, 'replacement', path.join(ancestor, 'result.partial'));
    expect(await fs.readFile(filename, 'utf8')).toBe('replacement');
    expect(await fs.readdir(ancestor)).toEqual([name]);
  });

  it('cleans staging after rename fails without deleting the destination', async () => {
    const filename: string = path.join(folder, 'report.json');
    await fs.mkdir(filename);
    await fs.writeFile(path.join(filename, 'sentinel'), 'preserve');
    await expect(writeShardFileAtomicallyAsync(filename, '{}', staging)).rejects.toThrow();
    expect(await fs.readdir(folder)).toEqual(['report.json']);
    expect(await fs.readFile(path.join(filename, 'sentinel'), 'utf8')).toBe('preserve');
  });

  it('propagates cancellation without creating directories or reports', async () => {
    const controller: AbortController = new AbortController();
    controller.abort(new Error('cancelled write'));
    await expect(
      writeShardFileAtomicallyAsync(
        path.join(folder, 'nested', 'report.json'),
        '{}',
        path.join(folder, 'nested', 'report.partial.json'),
        controller.signal
      )
    ).rejects.toThrow('cancelled write');
    expect(await fs.readdir(folder)).toEqual([]);
  });

  it('cleans staging and preserves the old output when writing fails', async () => {
    const filename: string = path.join(folder, 'report.json');
    await fs.writeFile(filename, 'previous');
    const originalOpen: typeof fs.open = fs.open;
    jest.spyOn(fs, 'open').mockImplementation(async (...args) => {
      const handle: fs.FileHandle = await originalOpen(...args);
      jest.spyOn(handle, 'writeFile').mockRejectedValue(new Error('cannot write'));
      return handle;
    });
    await expect(writeShardFileAtomicallyAsync(filename, '{}', staging)).rejects.toThrow('cannot write');
    expect(await fs.readFile(filename, 'utf8')).toBe('previous');
    expect(await fs.readdir(folder)).toEqual(['report.json']);
  });

  it('rejects invalid staging paths before changing files', async () => {
    const filename: string = path.join(folder, 'report.json');
    for (const invalid of [filename, path.join(folder, 'REPORT.JSON'), path.join(folder, 'other', 'stage')]) {
      await expect(writeShardFileAtomicallyAsync(filename, '{}', invalid)).rejects.toThrow(
        /distinct staging file/
      );
    }
    expect(await fs.readdir(folder)).toEqual([]);
  });

  it('surfaces staging cleanup errors', async () => {
    jest.spyOn(fs, 'rename').mockRejectedValue(new Error('cannot rename'));
    jest.spyOn(FileSystem, 'deleteFileAsync').mockRejectedValue(new Error('cannot remove staging'));
    await expect(
      writeShardFileAtomicallyAsync(path.join(folder, 'report.json'), '{}', staging)
    ).rejects.toThrow('cannot remove staging');
  });

  it('does not remove a staging path it failed to open', async () => {
    await fs.mkdir(staging);
    await fs.writeFile(path.join(staging, 'sentinel'), 'preserve');
    await expect(
      writeShardFileAtomicallyAsync(path.join(folder, 'report.json'), '{}', staging)
    ).rejects.toThrow();
    expect(await fs.readFile(path.join(staging, 'sentinel'), 'utf8')).toBe('preserve');
  });

  it('propagates invalidation errors other than absence', async () => {
    const filename: string = path.join(folder, 'report.json');
    await invalidateShardFileAsync(filename);
    jest.spyOn(fs, 'unlink').mockRejectedValue(Object.assign(new Error('access denied'), { code: 'EACCES' }));
    await expect(invalidateShardFileAsync(filename)).rejects.toThrow('access denied');
  });
});

describe('lexical shard paths', () => {
  it.each(['.rush/operations/test/shards', 'temp/other/../shards', 'temp\\shards', 'temp/shards/'])(
    'accepts a relative descendant without resolving it: %s',
    (relative) => {
      expect(() => validateShardRelativePath(relative)).not.toThrow();
    }
  );

  it.each([
    '',
    '.',
    'temp/..',
    '../temp',
    'temp/../../out',
    '\\\\server\\share',
    '/out',
    'C:\\out',
    'C:out',
    'temp/.. /../out',
    'temp/result:stream'
  ])('rejects root escapes and non-relative paths: %s', (relative) => {
    expect(() => validateShardRelativePath(relative)).toThrow();
  });

  it('validates normalized absolute paths without any filesystem probes, even at an absent root', () => {
    const lstat = jest.spyOn(fs, 'lstat').mockRejectedValue(new Error('must not probe'));
    const realpath = jest.spyOn(fs, 'realpath').mockRejectedValue(new Error('must not resolve'));
    const root: string = path.resolve('absent-shard-root');
    try {
      expect(() => validateShardPath(root, path.join(root, 'missing', 'result.json'))).not.toThrow();
      expect(() => validateShardPath(root, root)).toThrow(/below the build folder/);
      expect(() => validateShardPath(root, `${root}-sibling${path.sep}result.json`)).toThrow();
      expect(() => validateShardPath(root, `${root}${path.sep}..${path.sep}result.json`)).toThrow();
      expect(lstat).not.toHaveBeenCalled();
      expect(realpath).not.toHaveBeenCalled();
    } finally {
      jest.restoreAllMocks();
    }
  });
});
