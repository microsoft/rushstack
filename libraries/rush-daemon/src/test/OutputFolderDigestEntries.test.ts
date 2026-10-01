// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { digestOutputFolders, type IOutputFolderDigest, type IOutputFolderSet } from '../OutputFolderDigest';

/** A whole second, so the modification time that a test sets reads back exactly. */
const MODIFIED_TIME: Date = new Date('2026-01-01T00:00:00.000Z');

describe(digestOutputFolders.name, () => {
  let projectFolder: string;
  let nestedFolder: string;
  let filePath: string;
  let folderSet: IOutputFolderSet;

  beforeEach(() => {
    projectFolder = fs.mkdtempSync(path.join(os.tmpdir(), 'rushd-output-entries-'));
    nestedFolder = path.join(projectFolder, 'lib', 'nested');
    filePath = path.join(nestedFolder, 'output.js');
    fs.mkdirSync(nestedFolder, { recursive: true });
    fs.writeFileSync(filePath, 'one');
    fs.utimesSync(filePath, MODIFIED_TIME, MODIFIED_TIME);
    folderSet = { projectFolder, folderNames: ['lib'] };
  });

  afterEach(() => {
    fs.rmSync(projectFolder, { recursive: true, force: true });
  });

  it('changes when only the size of a nested file changes', () => {
    const { ino, mtimeMs } = fs.statSync(filePath);
    const before: string | undefined = digestOutputFolders(folderSet).digest;
    fs.appendFileSync(filePath, ' more');
    fs.utimesSync(filePath, MODIFIED_TIME, MODIFIED_TIME);
    expect(fs.statSync(filePath)).toMatchObject({ ino, mtimeMs });
    expect(digestOutputFolders(folderSet).digest).not.toBe(before);
  });

  it('changes when a nested file is replaced by one with the same size and modification time', () => {
    // Outside the output folder, so the listing is the same before and after the rename.
    const replacementPath: string = path.join(projectFolder, 'replacement.js');
    fs.writeFileSync(replacementPath, 'one');
    fs.utimesSync(replacementPath, MODIFIED_TIME, MODIFIED_TIME);
    const { ino, size, mtimeMs } = fs.statSync(filePath);
    const before: string | undefined = digestOutputFolders(folderSet).digest;
    fs.renameSync(replacementPath, filePath);
    const replaced: fs.Stats = fs.statSync(filePath);
    expect(replaced).toMatchObject({ size, mtimeMs });
    expect(replaced.ino).not.toBe(ino);
    expect(digestOutputFolders(folderSet).digest).not.toBe(before);
  });

  const canRevokeReadAccess: boolean = process.platform !== 'win32' && process.getuid?.() !== 0;
  (canRevokeReadAccess ? it : it.skip)('has no digest while a nested folder cannot be read', () => {
    const readable: IOutputFolderDigest = digestOutputFolders(folderSet);
    expect(readable.digest).toEqual(expect.any(String));
    fs.chmodSync(nestedFolder, 0);
    try {
      expect(digestOutputFolders(folderSet).digest).toBeUndefined();
    } finally {
      fs.chmodSync(nestedFolder, 0o755);
    }
    expect(digestOutputFolders(folderSet)).toEqual(readable);
  });
});
