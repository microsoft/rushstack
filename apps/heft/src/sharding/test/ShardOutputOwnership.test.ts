// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import { execFileSync, spawnSync, type SpawnSyncReturns } from 'node:child_process';

import { FileSystem } from '@rushstack/node-core-library';

import {
  acquireShardOutputLocksAsync,
  getShardOutputIdentity,
  releaseShardOutputLocks,
  resolveShardOutputPathAsync,
  resolveShardPathAsync,
  SHARD_OUTPUT_OWNERSHIP_FOLDER_NAME,
  type IShardOutputLock
} from '../ShardOutputOwnership';
import { writeShardFileAtomicallyAsync } from '../ShardFileSystem';

const compiledFolder: string = path.dirname(__dirname);
const shortCompiledFolderName: string | undefined =
  process.platform === 'win32'
    ? execFileSync(
        'powershell.exe',
        [
          '-NoProfile',
          '-NonInteractive',
          '-Command',
          '(New-Object -ComObject Scripting.FileSystemObject).GetFolder($env:HEFT_SHARD_ALIAS_DIRECTORY).ShortName'
        ],
        {
          encoding: 'utf8',
          env: { ...process.env, HEFT_SHARD_ALIAS_DIRECTORY: compiledFolder }
        }
      ).trim()
    : undefined;
const hasShortPathAlias: boolean =
  !!shortCompiledFolderName &&
  shortCompiledFolderName.toLowerCase() !== path.basename(compiledFolder).toLowerCase();

function setDirectoryCaseSensitivity(folderPath: string, sensitive: boolean): boolean {
  const result: SpawnSyncReturns<string> =
    process.platform === 'win32'
      ? spawnSync(
          'fsutil.exe',
          ['file', 'setCaseSensitiveInfo', folderPath, sensitive ? 'enable' : 'disable'],
          {
            encoding: 'utf8'
          }
        )
      : spawnSync('chattr', [sensitive ? '-F' : '+F', folderPath], { encoding: 'utf8' });
  if (result.error && (!('code' in result.error) || result.error.code !== 'ENOENT')) throw result.error;
  return result.status === 0;
}

function supportsMixedDirectoryCaseSensitivity(): boolean {
  if (process.platform !== 'win32' && process.platform !== 'linux') return false;
  const root: string = fsSync.mkdtempSync(path.join(__dirname, 'shard-case-capability-'));
  try {
    if (!setDirectoryCaseSensitivity(root, true)) return false;
    const insensitive: string = path.join(root, 'insensitive');
    fsSync.mkdirSync(insensitive);
    if (!setDirectoryCaseSensitivity(insensitive, false)) return false;
    fsSync.writeFileSync(path.join(root, 'probe'), '');
    fsSync.writeFileSync(path.join(insensitive, 'probe'), '');
    return !fsSync.existsSync(path.join(root, 'PROBE')) && fsSync.existsSync(path.join(insensitive, 'PROBE'));
  } finally {
    fsSync.rmSync(root, { recursive: true, force: true });
  }
}

const hasMixedDirectoryCaseSensitivity: boolean = supportsMixedDirectoryCaseSensitivity();

describe('Heft output claims and attempt fences', () => {
  let folder: string;
  let output: string;
  const locks: IShardOutputLock[] = [];

  beforeEach(async () => {
    folder = await fs.mkdtemp(path.join(__dirname, 'shard-claims-'));
    output = path.join(folder, 'result.json');
  });
  afterEach(async () => {
    jest.restoreAllMocks();
    for (const lock of locks) if (!lock.isReleased) lock.release();
    locks.length = 0;
    await fs.rm(folder, { recursive: true, force: true });
  });

  async function acquireAsync(signal?: AbortSignal): Promise<IShardOutputLock> {
    const [lock] = await acquireShardOutputLocksAsync(
      folder,
      [output],
      { project: 'example', phase: 'test', task: 'jest', shardIndex: 2, shardCount: 4, generation: 'G' },
      signal
    );
    locks.push(lock);
    return lock;
  }

  it('reports the current holder without stealing its output claim', async () => {
    const lock = await acquireAsync();
    const metadata = JSON.parse(await fs.readFile(lock.filePath, 'utf8'));
    expect(metadata).toMatchObject({
      version: 2,
      kind: 'output',
      destination: 'result.json',
      project: 'example',
      phase: 'test',
      task: 'jest',
      shardIndex: 2,
      shardCount: 4,
      generation: 'G',
      attemptId: lock.attemptId,
      pid: process.pid,
      host: expect.any(String),
      acquiredAt: expect.any(String),
      processStartedAt: expect.any(String)
    });
    await expect(acquireAsync()).rejects.toThrow(lock.attemptId);
    await expect(acquireAsync()).rejects.toThrow(/state=contended retryCount=0.*claimAgeMs/);
    expect(await fs.readFile(lock.filePath, 'utf8')).toBe(JSON.stringify(metadata));
  });

  it('resolves missing inputs without materializing them and outputs without creating result files', async () => {
    const target: string = path.join(folder, 'new-parent', 'report.json');
    expect(await resolveShardPathAsync(target)).toBe(target);
    expect(await fs.readdir(folder)).toEqual([]);
    expect(await resolveShardOutputPathAsync(folder, target, false)).toBe(target);
    expect(await fs.readdir(path.dirname(target))).toEqual([]);
    await expect(resolveShardOutputPathAsync(folder, folder, true)).rejects.toThrow(/below the build folder/);
    await expect(
      resolveShardOutputPathAsync(folder, path.resolve(folder, '..', 'escape'), false)
    ).rejects.toThrow(/below the build folder/);
    await expect(
      resolveShardOutputPathAsync(
        folder,
        path.join(folder, SHARD_OUTPUT_OWNERSHIP_FOLDER_NAME, 'report.json'),
        false
      )
    ).rejects.toThrow(/reserved/);
  });

  it('shares canonical output claims through a symlinked workspace root', async () => {
    const alias: string = path.join(folder, 'workspace-alias');
    await fs.symlink(folder, alias, 'junction');
    const canonical: string = await resolveShardOutputPathAsync(
      alias,
      path.join(alias, 'result.json'),
      false
    );
    expect(canonical).toBe(output);
    locks.push(...(await acquireShardOutputLocksAsync(alias, [canonical])));
    await expect(acquireAsync()).rejects.toThrow(/already owned/);
  });

  (hasShortPathAlias ? it : it.skip).each([false, true])(
    'canonicalizes Windows short-path ancestors (output already exists: %s)',
    async (exists) => {
      const buildFolder: string = path.dirname(compiledFolder);
      const target: string = path.join(folder, 'new-parent', 'report.json');
      const alias: string = path.join(
        buildFolder,
        shortCompiledFolderName!,
        path.relative(compiledFolder, target)
      );
      if (exists) {
        await fs.mkdir(path.dirname(target), { recursive: true });
        await fs.writeFile(target, 'preserve');
      }
      const canonical: string = await resolveShardOutputPathAsync(buildFolder, target, false);
      expect(await resolveShardOutputPathAsync(buildFolder, alias, false)).toBe(canonical);
      // Canonicalization must not replace an existing report or create an absent one.
      if (exists) expect(await fs.readFile(target, 'utf8')).toBe('preserve');
      else expect(await FileSystem.existsAsync(target)).toBe(false);
    }
  );

  it('normalizes Unicode composition without approximating filesystem case folding', () => {
    const composed: string = path.join(folder, 'reports', '\u00e9.json');
    const decomposed: string = path.join(folder, 'reports', 'e\u0301.json');
    expect(getShardOutputIdentity(folder, composed)).toBe(getShardOutputIdentity(folder, decomposed));
    expect(getShardOutputIdentity(folder, path.join(folder, 'Reports', '\u00e9.json'))).not.toBe(
      getShardOutputIdentity(folder, composed)
    );
  });

  it.each([
    ['report.json', 'REPORT.JSON'],
    ['\u00df.json', '\u1e9e.json']
  ])('uses filesystem name equivalence for missing leaves: %s / %s', async (first, second) => {
    const parent: string = path.join(folder, 'reports');
    const firstPath: string = await resolveShardOutputPathAsync(folder, path.join(parent, first), false);
    const secondPath: string = await resolveShardOutputPathAsync(folder, path.join(parent, second), false);
    const probe: string = path.join(parent, first);
    await fs.writeFile(probe, '');
    const aliases: boolean = await FileSystem.existsAsync(path.join(parent, second));
    await fs.unlink(probe);
    locks.push(...(await acquireShardOutputLocksAsync(folder, [firstPath])));
    if (aliases) {
      await expect(acquireShardOutputLocksAsync(folder, [secondPath])).rejects.toThrow(/already owned/);
    } else {
      const secondLocks: IShardOutputLock[] = await acquireShardOutputLocksAsync(folder, [secondPath]);
      locks.push(...secondLocks);
      expect(secondLocks[0].filePath).not.toBe(locks[0].filePath);
    }
  });

  it.each([true, false])(
    'uses destination-parent semantics, not lock-directory semantics (modeled case-sensitive output: %s)',
    async (sensitive) => {
      const parent: string = path.join(folder, 'reports');
      const first: string = await resolveShardOutputPathAsync(
        folder,
        path.join(parent, 'result.json'),
        false
      );
      const second: string = await resolveShardOutputPathAsync(
        folder,
        path.join(parent, 'RESULT.JSON'),
        false
      );
      const lockFolder: string = path.join(folder, SHARD_OUTPUT_OWNERSHIP_FOLDER_NAME);
      const realpath: typeof fs.realpath = fs.realpath;
      jest.spyOn(fs, 'realpath').mockImplementation(async (filename, options) => {
        if (filename === path.join(folder, SHARD_OUTPUT_OWNERSHIP_FOLDER_NAME.toUpperCase())) {
          if (sensitive) return lockFolder;
          throw Object.assign(new Error('case-sensitive lock directory'), {
            code: 'ENOENT',
            errno: -2,
            syscall: 'realpath'
          });
        }
        return realpath(filename, options);
      });
      const lstat: typeof fs.lstat = fs.lstat;
      jest.spyOn(fs, 'lstat').mockImplementation(async (filename, options) => {
        if (
          typeof filename === 'string' &&
          filename.includes('.heft-shard-name-probe-') &&
          /result\.json$/i.test(filename)
        ) {
          // Model opposite lookup rules in reports and lock storage; this is not native filesystem evidence.
          const aliases: boolean = path.dirname(filename) === parent ? !sensitive : sensitive;
          const names: string[] = await fs.readdir(path.dirname(filename));
          const actual: string | undefined = names.find(
            (name) => name.toLowerCase() === path.basename(filename).toLowerCase()
          );
          if (actual && (aliases || actual === path.basename(filename))) {
            return lstat(path.join(path.dirname(filename), actual), options);
          }
          throw Object.assign(new Error('case-distinct name'), {
            code: 'ENOENT',
            errno: -2,
            syscall: 'lstat'
          });
        }
        return lstat(filename, options);
      });
      const firstLocks: IShardOutputLock[] = await acquireShardOutputLocksAsync(folder, [first]);
      locks.push(...firstLocks);
      const acquireSecondAsync = async (): Promise<IShardOutputLock[]> => {
        const acquired: IShardOutputLock[] = await acquireShardOutputLocksAsync(folder, [second]);
        locks.push(...acquired);
        return acquired;
      };
      if (sensitive) {
        expect(await acquireSecondAsync()).toHaveLength(1);
      } else {
        await expect(acquireSecondAsync()).rejects.toThrow(/already owned/);
      }
      releaseShardOutputLocks(locks);
      if (sensitive) {
        const acquired: IShardOutputLock[] = await acquireShardOutputLocksAsync(folder, [first, second]);
        locks.push(...acquired);
        expect(acquired).toHaveLength(2);
      } else {
        await expect(acquireShardOutputLocksAsync(folder, [first, second])).rejects.toThrow(
          /overlap within one operation/
        );
      }
      expect(await fs.readdir(parent)).toEqual([]);
    }
  );

  (hasMixedDirectoryCaseSensitivity ? it : it.skip).each([true, false])(
    'uses native mixed directory semantics for absent outputs (case-sensitive output: %s)',
    async (sensitive) => {
      expect(setDirectoryCaseSensitivity(folder, !sensitive)).toBe(true);
      const parent: string = path.join(folder, 'reports');
      await fs.mkdir(parent);
      expect(setDirectoryCaseSensitivity(parent, sensitive)).toBe(true);
      await fs.writeFile(path.join(parent, 'probe'), '');
      expect(await FileSystem.existsAsync(path.join(parent, 'PROBE'))).toBe(!sensitive);
      await fs.unlink(path.join(parent, 'probe'));
      const first: string = await resolveShardOutputPathAsync(
        folder,
        path.join(parent, 'result.json'),
        false
      );
      const second: string = await resolveShardOutputPathAsync(
        folder,
        path.join(parent, 'RESULT.JSON'),
        false
      );
      locks.push(...(await acquireShardOutputLocksAsync(folder, [first])));
      const acquireSecondAsync = async (): Promise<IShardOutputLock[]> => {
        const acquired: IShardOutputLock[] = await acquireShardOutputLocksAsync(folder, [second]);
        locks.push(...acquired);
        return acquired;
      };
      if (sensitive) {
        expect(await acquireSecondAsync()).toHaveLength(1);
      } else {
        await expect(acquireSecondAsync()).rejects.toThrow(/already owned/);
      }
      releaseShardOutputLocks(locks);
      if (!sensitive) {
        await expect(acquireShardOutputLocksAsync(folder, [first, second])).rejects.toThrow(
          /overlap within one operation/
        );
      }
      expect(await fs.readdir(parent)).toEqual([]);
    }
  );

  it('uses the physical spelling of a Unicode-normalized destination parent', async () => {
    const parent: string = path.join(folder, 'e\u0301');
    const first: string = await resolveShardOutputPathAsync(folder, path.join(parent, 'first.json'), false);
    const second: string = await resolveShardOutputPathAsync(folder, path.join(parent, 'second.json'), false);
    locks.push(...(await acquireShardOutputLocksAsync(folder, [first, second])));
    expect(locks).toHaveLength(2);
    expect(await fs.readdir(parent)).toEqual([]);
  });

  it('fails closed if a destination parent disappears before a name comparison', async () => {
    const parent: string = path.join(folder, 'reports');
    const first: string = await resolveShardOutputPathAsync(folder, path.join(parent, 'first.json'), false);
    const second: string = await resolveShardOutputPathAsync(folder, path.join(parent, 'second.json'), false);
    locks.push(...(await acquireShardOutputLocksAsync(folder, [first])));
    await fs.rmdir(parent);
    await expect(
      acquireShardOutputLocksAsync(folder, [second]).then((acquired) => {
        locks.push(...acquired);
        return acquired;
      })
    ).rejects.toThrow(/ENOENT/);
    expect(await fs.readdir(path.join(folder, SHARD_OUTPUT_OWNERSHIP_FOLDER_NAME))).toEqual([
      path.basename(locks[0].filePath)
    ]);
  });

  it('surfaces probe lookup errors, removes its probe and releases the registration gate', async () => {
    const parent: string = path.join(folder, 'reports');
    const first: string = await resolveShardOutputPathAsync(folder, path.join(parent, 'first.json'), false);
    const second: string = await resolveShardOutputPathAsync(folder, path.join(parent, 'second.json'), false);
    locks.push(...(await acquireShardOutputLocksAsync(folder, [first])));
    const lstat: typeof fs.lstat = fs.lstat;
    jest.spyOn(fs, 'lstat').mockImplementation(async (filename, options) => {
      if (typeof filename === 'string' && filename.includes('.heft-shard-name-probe-')) {
        throw Object.assign(new Error('probe lookup denied'), { code: 'EACCES' });
      }
      return lstat(filename, options);
    });
    await expect(acquireShardOutputLocksAsync(folder, [second])).rejects.toThrow('probe lookup denied');
    expect(await fs.readdir(parent)).toEqual([]);
    expect(await fs.readdir(path.join(folder, SHARD_OUTPUT_OWNERSHIP_FOLDER_NAME))).toEqual([
      path.basename(locks[0].filePath)
    ]);
  });

  it.each([false, true])('excludes ancestor and descendant claims (reverse: %s)', async (reverse) => {
    const parent: string = path.join(folder, 'reports');
    const child: string = path.join(parent, 'nested', 'report.json');
    locks.push(...(await acquireShardOutputLocksAsync(folder, [reverse ? child : parent])));
    await expect(acquireShardOutputLocksAsync(folder, [reverse ? parent : child])).rejects.toThrow(
      /already owned/
    );
  });

  it('rejects overlapping outputs within one registration', async () => {
    const parent: string = path.join(folder, 'reports');
    await expect(
      acquireShardOutputLocksAsync(folder, [parent, path.join(parent, 'report.json')])
    ).rejects.toThrow(/overlap within one operation/);
    expect(await fs.readdir(path.join(folder, SHARD_OUTPUT_OWNERSHIP_FOLDER_NAME))).toEqual([]);
  });

  it('registers disjoint claim sets concurrently and deduplicates exact destinations', async () => {
    const [first, second] = await Promise.all([
      acquireShardOutputLocksAsync(folder, [output, output]),
      acquireShardOutputLocksAsync(folder, [path.join(folder, 'other.json'), path.join(folder, 'coverage')])
    ]);
    locks.push(...first, ...second);
    expect(first).toHaveLength(1);
    expect(second).toHaveLength(2);
    expect(first[0].attemptId).not.toBe(second[0].attemptId);
    expect(second[0].attemptId).toBe(second[1].attemptId);
    expect(await fs.readdir(path.join(folder, SHARD_OUTPUT_OWNERSHIP_FOLDER_NAME))).toHaveLength(3);
    releaseShardOutputLocks(locks);
    expect(await fs.readdir(path.join(folder, SHARD_OUTPUT_OWNERSHIP_FOLDER_NAME))).toEqual([]);
  });

  it('releases all partial claims after a registration write error', async () => {
    const writeFile: typeof fsSync.writeFileSync = fsSync.writeFileSync;
    jest.spyOn(fsSync, 'writeFileSync').mockImplementation((filename, data, options) => {
      if (typeof data === 'string' && JSON.parse(data).destination === 'two.json') {
        throw new Error('claim registration denied');
      }
      writeFile(filename, data, options);
    });
    const paths: string[] = [output, path.join(folder, 'two.json')];
    await expect(acquireShardOutputLocksAsync(folder, paths)).rejects.toThrow('claim registration denied');
    jest.restoreAllMocks();
    expect(await fs.readdir(path.join(folder, SHARD_OUTPUT_OWNERSHIP_FOLDER_NAME))).toEqual([]);
    locks.push(...(await acquireShardOutputLocksAsync(folder, paths)));
  });

  it('cleans a newly created lock when its filesystem identity cannot be read', async () => {
    jest.spyOn(fsSync, 'fstatSync').mockImplementationOnce(() => {
      throw new Error('identity unavailable');
    });
    await expect(acquireAsync()).rejects.toThrow('identity unavailable');
    expect(await fs.readdir(path.join(folder, SHARD_OUTPUT_OWNERSHIP_FOLDER_NAME))).toEqual([]);
    await acquireAsync();
  });

  it('releases registered outputs but preserves a replaced registration gate', async () => {
    const gate: string = path.join(folder, SHARD_OUTPUT_OWNERSHIP_FOLDER_NAME, 'acquire.lock');
    const writeFile: typeof fsSync.writeFileSync = fsSync.writeFileSync;
    jest.spyOn(fsSync, 'writeFileSync').mockImplementation((filename, data, options) => {
      writeFile(filename, data, options);
      if (typeof data === 'string' && JSON.parse(data).kind === 'output') {
        fsSync.unlinkSync(gate);
        writeFile(gate, 'replacement');
      }
    });
    await expect(acquireAsync()).rejects.toThrow(/finalize managed shard output ownership registration/);
    jest.restoreAllMocks();
    expect(await fs.readdir(path.dirname(gate))).toEqual(['acquire.lock']);
    expect(await fs.readFile(gate, 'utf8')).toBe('replacement');
  });

  it('does not unlink a claim that gained another hard link while owned', async () => {
    const lock: IShardOutputLock = await acquireAsync();
    const link: string = path.join(folder, 'preserve-claim');
    await fs.link(lock.filePath, link);
    const contents: string = await fs.readFile(link, 'utf8');
    expect(() => lock.release()).toThrow(/changed while in use/);
    expect(lock.isReleased).toBe(true);
    expect(await fs.readFile(lock.filePath, 'utf8')).toBe(contents);
    await expect(acquireAsync()).rejects.toThrow(/already owned/);
  });

  it('rejects a junction at the ownership folder without changing its target', async () => {
    const target: string = path.join(folder, 'other-locks');
    await fs.mkdir(target);
    await fs.symlink(target, path.join(folder, SHARD_OUTPUT_OWNERSHIP_FOLDER_NAME), 'junction');
    await expect(acquireAsync()).rejects.toThrow(/symbolic link/);
    expect(await fs.readdir(target)).toEqual([]);
  });

  it('rejects malformed or legacy claims without reclaiming them', async () => {
    const lock: IShardOutputLock = await acquireAsync();
    lock.release();
    await fs.writeFile(lock.filePath, '{"version":1}');
    await expect(acquireAsync()).rejects.toThrow(/malformed or from an older runtime/);
    expect(await fs.readFile(lock.filePath, 'utf8')).toBe('{"version":1}');
  });

  it('revokes A before releasing its claim and rejects a late A promotion after B starts', async () => {
    const controller = new AbortController();
    const first = await acquireAsync(controller.signal);
    controller.abort();
    expect(first.state).toBe('revoked');
    await expect(acquireAsync()).rejects.toThrow(/already owned/);
    first.release();
    const second = await acquireAsync();
    expect(second.attemptId).not.toBe(first.attemptId);
    await writeShardFileAtomicallyAsync(output, 'B', undefined, second);

    // A queued continuation still carries A's capability, even if it loses the abort signal.
    await expect(writeShardFileAtomicallyAsync(output, 'late A', undefined, first)).rejects.toThrow(
      /released/
    );
    expect(await fs.readFile(output, 'utf8')).toBe('B');
    expect(await fs.readdir(folder)).toEqual(
      expect.arrayContaining(['result.json', SHARD_OUTPUT_OWNERSHIP_FOLDER_NAME])
    );
    expect((await fs.readdir(folder)).filter((name) => name.endsWith('.tmp'))).toEqual([]);
  });

  it('does not release a claim between the final fence check and manifest promotion', async () => {
    const lock = await acquireAsync();
    const rename = fsSync.renameSync;
    jest.spyOn(fsSync, 'renameSync').mockImplementation((source, destination) => {
      expect(lock.state).toBe('publishing');
      expect(() => lock.release()).toThrow(/Cannot release a publishing/);
      rename(source, destination);
    });
    await writeShardFileAtomicallyAsync(output, 'complete', undefined, lock);
    expect(lock.state).toBe('held');
    expect(await fs.readFile(output, 'utf8')).toBe('complete');
  });

  it('does not close a reused descriptor when a released claim is released again', async () => {
    const first = await acquireAsync();
    first.release();
    const descriptor = fsSync.openSync(output, 'w');
    try {
      expect(() => first.release()).toThrow(/already released/);
      fsSync.writeSync(descriptor, 'still owned by the caller');
    } finally {
      fsSync.closeSync(descriptor);
    }
    expect(await fs.readFile(output, 'utf8')).toBe('still owned by the caller');
  });

  it('invalidates a just-promoted result when cancellation arrives before returning to the caller', async () => {
    const controller = new AbortController();
    const lock = await acquireAsync(controller.signal);
    const rename = fsSync.renameSync;
    jest.spyOn(fsSync, 'renameSync').mockImplementation((source, destination) => {
      rename(source, destination);
      controller.abort();
    });
    await expect(
      writeShardFileAtomicallyAsync(output, 'cancelled', controller.signal, lock)
    ).rejects.toThrow();
    expect(lock.state).toBe('revoked');
    await expect(fs.stat(output)).rejects.toThrow(/ENOENT/);
    await expect(acquireAsync()).rejects.toThrow(/already owned/);
  });

  it('reports bounded registration exhaustion and preserves an abandoned gate for verified cleanup', async () => {
    const lock = await acquireAsync();
    const metadata = JSON.parse(await fs.readFile(lock.filePath, 'utf8'));
    lock.release();
    const gate = path.join(folder, SHARD_OUTPUT_OWNERSHIP_FOLDER_NAME, 'acquire.lock');
    metadata.kind = 'registration';
    metadata.acquiredAt = '2000-01-01T00:00:00.000Z';
    const contents = JSON.stringify(metadata);
    await fs.writeFile(gate, contents);
    await expect(acquireAsync()).rejects.toThrow(
      /state=retry-exhausted retryCount=\d+ retryDeadline=.*Never steal a claim based only on PID or age/
    );
    expect(await fs.readFile(gate, 'utf8')).toBe(contents);
    // This test owns the synthetic gate; production recovery requires verified process termination.
    await fs.unlink(gate);
    expect((await acquireAsync()).state).toBe('held');
  });
});
