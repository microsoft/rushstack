// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import fs from 'node:fs/promises';
import path from 'node:path';

import {
  invalidateShardFileAsync,
  validateShardPathAsync,
  writeShardFileAtomicallyAsync
} from '../ShardFileSystem';

describe('atomic shard files', () => {
  let folder: string;
  beforeEach(async () => {
    folder = await fs.mkdtemp(path.join(__dirname, 'atomic-shard-'));
  });
  afterEach(async () => {
    jest.restoreAllMocks();
    await fs.rm(folder, { recursive: true, force: true });
  });

  it('replaces a report atomically without leaving staging files', async () => {
    const filename: string = path.join(folder, 'report.json');
    await fs.writeFile(filename, 'old');
    await invalidateShardFileAsync(filename);
    await writeShardFileAtomicallyAsync(filename, '{"success":false}');
    expect(await fs.readFile(filename, 'utf8')).toBe('{"success":false}');
    expect(await fs.readdir(folder)).toEqual(['report.json']);
  });

  it('cleans its staging file when rename fails, without deleting the destination', async () => {
    const filename: string = path.join(folder, 'report.json');
    await fs.mkdir(filename);
    await fs.writeFile(path.join(filename, 'sentinel'), 'preserve');
    await expect(writeShardFileAtomicallyAsync(filename, '{}')).rejects.toThrow();
    expect(await fs.readdir(folder)).toEqual(['report.json']);
    expect(await fs.readFile(path.join(filename, 'sentinel'), 'utf8')).toBe('preserve');
  });

  it('propagates cancellation without creating directories or reports', async () => {
    const controller: AbortController = new AbortController();
    controller.abort(new Error('cancelled write'));
    await expect(
      writeShardFileAtomicallyAsync(path.join(folder, 'nested', 'report.json'), '{}', controller.signal)
    ).rejects.toThrow('cancelled write');
    expect(await fs.readdir(folder)).toEqual([]);
  });

  it('cleans staging files when the publication guard rejects a write', async () => {
    const filename: string = path.join(folder, 'report.json');
    await fs.writeFile(filename, 'previous');
    await expect(
      writeShardFileAtomicallyAsync(filename, 'replacement', undefined, {
        commit: () => {
          throw new Error('ownership revoked');
        }
      })
    ).rejects.toThrow('ownership revoked');
    expect(await fs.readFile(filename, 'utf8')).toBe('previous');
    expect(await fs.readdir(folder)).toEqual(['report.json']);
  });

  it('rejects the build root itself and validates missing descendants without creating them', async () => {
    await expect(validateShardPathAsync(folder, folder)).rejects.toThrow(/below the build folder/);
    await validateShardPathAsync(folder, path.join(folder, 'missing', 'report.json'));
    expect(await fs.readdir(folder)).toEqual([]);
  });

  it('allows a symlinked workspace root but rejects links below that root', async () => {
    const root: string = path.join(folder, 'root');
    const alias: string = path.join(folder, 'alias');
    await fs.mkdir(root);
    await fs.symlink(root, alias, 'junction');
    await validateShardPathAsync(alias, path.join(alias, 'report.json'));
    await fs.symlink(root, path.join(root, 'nested-alias'), 'junction');
    await expect(
      validateShardPathAsync(alias, path.join(alias, 'nested-alias', 'report.json'))
    ).rejects.toThrow(/symbolic link/);
  });

  it('propagates filesystem errors other than absence', async () => {
    jest.spyOn(fs, 'unlink').mockRejectedValue(Object.assign(new Error('access denied'), { code: 'EACCES' }));
    await expect(invalidateShardFileAsync(path.join(folder, 'report.json'))).rejects.toThrow('access denied');
    jest.spyOn(fs, 'lstat').mockRejectedValue(Object.assign(new Error('cannot inspect'), { code: 'EACCES' }));
    await expect(validateShardPathAsync(folder, path.join(folder, 'report.json'))).rejects.toThrow(
      'cannot inspect'
    );
  });

  it('rejects a path that aliases a sibling via a junction', async () => {
    await fs.mkdir(path.join(folder, 'actual'));
    await fs.symlink(path.join(folder, 'actual'), path.join(folder, 'alias'), 'junction');
    await expect(validateShardPathAsync(folder, path.join(folder, 'alias', 'report.json'))).rejects.toThrow(
      /symbolic link/
    );
    await expect(validateShardPathAsync(folder, path.resolve(folder, '..', 'outside'))).rejects.toThrow(
      /below the build folder/
    );
  });
});
