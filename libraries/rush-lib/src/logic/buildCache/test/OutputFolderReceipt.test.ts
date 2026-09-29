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
    fs.rmSync(folder, { recursive: true, force: true });
  });

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
});

describe(OutputFolderReceipt.name, () => {
  let projectFolder: string;
  let projectRushTempFolder: string;

  beforeEach(() => {
    projectFolder = fs.mkdtempSync(path.join(os.tmpdir(), 'rush-output-folder-receipt-'));
    projectRushTempFolder = path.join(projectFolder, '.rush', 'temp');
  });

  afterEach(() => {
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
});
