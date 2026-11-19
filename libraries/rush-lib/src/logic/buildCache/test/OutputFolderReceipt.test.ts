// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import {
  createStampAsync,
  isNewerThanStamp,
  OutputFolderReceipt,
  type IOutputFolderStamp,
  type PendingOutputFolderReceipt
} from '../OutputFolderReceipt';

describe(isNewerThanStamp.name, () => {
  const stamp: IOutputFolderStamp = { timeNs: 1000n, dev: 7n };

  it('T15: does not count a file whose times are both before the stamp', () => {
    expect(isNewerThanStamp({ dev: 7n, mtimeNs: 999n, ctimeNs: 999n }, stamp)).toBe(false);
  });

  it.each([
    ['its modification time equals the stamp', { dev: 7n, mtimeNs: 1000n, ctimeNs: 999n }],
    ['its status change time equals the stamp', { dev: 7n, mtimeNs: 999n, ctimeNs: 1000n }],
    ['its modification time is after the stamp', { dev: 7n, mtimeNs: 1001n, ctimeNs: 999n }],
    ['it is on another device', { dev: 8n, mtimeNs: 1n, ctimeNs: 1n }]
  ])(
    'T15: counts a file if %s',
    (description: string, stats: { dev: bigint; mtimeNs: bigint; ctimeNs: bigint }) => {
      expect(isNewerThanStamp(stats, stamp)).toBe(true);
    }
  );
});

describe(createStampAsync.name, () => {
  let folder: string;

  beforeEach(() => {
    folder = fs.mkdtempSync(path.join(os.tmpdir(), 'rush-output-folder-receipt-'));
  });

  afterEach(() => {
    jest.restoreAllMocks();
    fs.rmSync(folder, { recursive: true, force: true });
  });

  // Makes the file system report these times, one for each stat call, and then the last one again.
  function useStatTimes(times: bigint[]): jest.SpyInstance {
    let call: number = 0;
    return jest.spyOn(fs.promises, 'stat').mockImplementation((async () => {
      const timeNs: bigint = times[Math.min(call, times.length - 1)];
      call++;
      return { dev: 7n, mtimeNs: timeNs, ctimeNs: timeNs };
    }) as never);
  }

  it('T19: takes a stamp that is strictly after the times of a file written just before it', async () => {
    const folderDev: bigint = fs.statSync(folder, { bigint: true }).dev;
    for (let i: number = 0; i < 20; i++) {
      const filePath: string = path.join(folder, `file-${i}.txt`);
      fs.writeFileSync(filePath, `content ${i}`);
      const stamp: IOutputFolderStamp | undefined = await createStampAsync(
        path.join(folder, `stamp-${i}.tmp`)
      );
      const { mtimeNs, ctimeNs } = fs.statSync(filePath, { bigint: true });
      expect({
        isDefined: !!stamp,
        isBeforeStamp: !!stamp && mtimeNs < stamp.timeNs && ctimeNs < stamp.timeNs
      }).toEqual({
        isDefined: true,
        isBeforeStamp: true
      });
      expect(stamp?.dev).toBe(folderDev);
    }
  });

  it('fails if the file already exists', async () => {
    const filePath: string = path.join(folder, 'stamp.tmp');
    fs.writeFileSync(filePath, '');
    await expect(createStampAsync(filePath)).rejects.toThrow(/EEXIST/);
  });

  it('T27: waits until the file system clock moves past the time the file was created', async () => {
    const stat: jest.SpyInstance = useStatTimes([1000n, 1000n, 2000n]);

    const stamp: IOutputFolderStamp | undefined = await createStampAsync(path.join(folder, 'stamp.tmp'));

    expect(stamp).toEqual({ timeNs: 2000n, dev: 7n });
    expect(stat).toHaveBeenCalledTimes(3);
  });

  it('T27: takes no stamp if the file system clock does not move within 100 ms', async () => {
    useStatTimes([1000n]);

    expect(await createStampAsync(path.join(folder, 'stamp.tmp'))).toBeUndefined();
  });
});

describe(OutputFolderReceipt.name, () => {
  let projectFolder: string;
  let projectRushTempFolder: string;

  beforeEach(() => {
    projectFolder = fs.mkdtempSync(path.join(os.tmpdir(), 'rush-output-folder-receipt-'));
    projectRushTempFolder = path.join(projectFolder, '.rush', 'temp');
  });

  afterEach(() => {
    jest.restoreAllMocks();
    fs.rmSync(projectFolder, { recursive: true, force: true });
  });

  function tryCreateReceipt(outputFolderNames: string[]): OutputFolderReceipt | undefined {
    return OutputFolderReceipt.tryCreate({
      projectFolder,
      projectRushTempFolder,
      logFilenameIdentifier: '_phase_build',
      outputFolderNames
    });
  }

  // Writes a receipt for the output folders as they are now.
  async function writeReceiptAsync(receipt: OutputFolderReceipt, cacheId: string): Promise<void> {
    const pendingReceipt: PendingOutputFolderReceipt = await receipt.beginAsync();
    try {
      expect(await pendingReceipt.tryCommitAsync(cacheId)).toBeUndefined();
    } finally {
      await pendingReceipt.disposeAsync();
    }
  }

  it('T20: writes no receipt if the output folders do not hold the files that were just archived', async () => {
    fs.mkdirSync(path.join(projectFolder, 'lib'));
    fs.writeFileSync(path.join(projectFolder, 'lib/a.txt'), 'a');
    fs.writeFileSync(path.join(projectFolder, 'lib/b.txt'), 'b');
    const receipt: OutputFolderReceipt = tryCreateReceipt(['lib'])!;
    const pendingReceipt: PendingOutputFolderReceipt = await receipt.beginAsync();

    const reason: string | undefined = await pendingReceipt.tryCommitAsync('acme-hash1', ['lib/a.txt']);

    expect(reason).toBe('the output folders do not hold the same files as the cache entry');
    expect(fs.existsSync(receipt.filePath)).toBe(false);
    expect(fs.readdirSync(projectRushTempFolder)).toEqual([
      expect.stringMatching(/^build-cache-receipt__phase_build\.json\.[0-9a-f]+\.tmp$/)
    ]);
    await pendingReceipt.disposeAsync();
    expect(fs.readdirSync(projectRushTempFolder)).toEqual([]);
  });

  it.each([['.rush'], ['.'], ['.rush/temp']])(
    'T21: has no receipt if the output folder "%s" contains the .rush/temp folder',
    (folderName: string) => {
      expect(tryCreateReceipt(['lib', folderName])).toBeUndefined();
    }
  );

  it('T21: has a receipt if no output folder contains the .rush/temp folder', () => {
    expect(tryCreateReceipt(['lib', '.rush/temp/operation/_phase_build'])).toBeInstanceOf(
      OutputFolderReceipt
    );
  });

  it.each([['../out'], ['lib/../../out'], ['lib\\..\\..\\out'], [path.resolve('/out')]])(
    'T24: has no receipt if the output folder "%s" is absolute or goes up with ".."',
    (folderName: string) => {
      expect(tryCreateReceipt(['lib', folderName])).toBeUndefined();
    }
  );

  it.each([
    ['2', { version: 2 }],
    ['missing', { version: undefined }]
  ])(
    'T25: does not match a receipt whose version is %s',
    async (description: string, change: { version: number | undefined }) => {
      fs.mkdirSync(path.join(projectFolder, 'lib'));
      fs.writeFileSync(path.join(projectFolder, 'lib/a.txt'), 'a');
      const receipt: OutputFolderReceipt = tryCreateReceipt(['lib'])!;
      await writeReceiptAsync(receipt, 'acme-hash1');
      expect(await receipt.isMatchAsync('acme-hash1')).toBe(true);

      const json: Record<string, unknown> = JSON.parse(fs.readFileSync(receipt.filePath, 'utf8'));
      fs.writeFileSync(receipt.filePath, JSON.stringify({ ...json, ...change }));

      expect(await receipt.isMatchAsync('acme-hash1')).toBe(false);
    }
  );

  it('T26: does not match after a symbolic link is added, even if the link is the last entry listed', async () => {
    // The listing stops at the first entry that it can't certify, so only a link listed last leaves the
    // digest as it was. Sorting the children by name makes lib/zz-link the last entry.
    const readdir: (...args: unknown[]) => Promise<fs.Dirent[]> = fs.promises.readdir as unknown as (
      ...args: unknown[]
    ) => Promise<fs.Dirent[]>;
    jest.spyOn(fs.promises, 'readdir').mockImplementation((async (...args: unknown[]) => {
      const children: fs.Dirent[] = await readdir(...args);
      return children.sort((a: fs.Dirent, b: fs.Dirent) => a.name.localeCompare(b.name));
    }) as never);
    fs.mkdirSync(path.join(projectFolder, 'lib/nested'), { recursive: true });
    fs.writeFileSync(path.join(projectFolder, 'lib/a.txt'), 'a');
    fs.writeFileSync(path.join(projectFolder, 'lib/nested/b.txt'), 'b');
    const receipt: OutputFolderReceipt = tryCreateReceipt(['lib'])!;
    await writeReceiptAsync(receipt, 'acme-hash1');
    expect(await receipt.isMatchAsync('acme-hash1')).toBe(true);

    fs.symlinkSync(
      path.join(projectFolder, 'lib/nested'),
      path.join(projectFolder, 'lib/zz-link'),
      'junction'
    );

    expect(await receipt.isMatchAsync('acme-hash1')).toBe(false);
  });
});
