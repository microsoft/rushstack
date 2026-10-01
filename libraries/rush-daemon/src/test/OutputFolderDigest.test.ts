// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { digestOutputFolders, type IOutputFolderDigest } from '../OutputFolderDigest';

describe(digestOutputFolders.name, () => {
  let projectFolder: string;

  beforeEach(() => {
    projectFolder = fs.mkdtempSync(path.join(os.tmpdir(), 'rushd-output-folder-digest-'));
  });

  afterEach(() => {
    fs.rmSync(projectFolder, { recursive: true, force: true });
  });

  function writeFile(relativePath: string, text: string): void {
    fs.mkdirSync(path.dirname(path.join(projectFolder, relativePath)), { recursive: true });
    fs.writeFileSync(path.join(projectFolder, relativePath), text);
  }

  function symlinkDirectory(targetPath: string, linkPath: string): void {
    fs.symlinkSync(targetPath, linkPath, process.platform === 'win32' ? 'junction' : 'dir');
  }

  /** The line of an entry that is not a folder. */
  function entryLine(relativePath: string): string {
    const stats: fs.Stats = fs.lstatSync(path.join(projectFolder, relativePath));
    const kind: string = stats.isSymbolicLink() ? 'link' : 'file';
    return `${relativePath}\0${kind}\0${stats.size}\0${stats.mtimeMs}\0${stats.ino}\n`;
  }

  it('hashes one line per entry, in code unit order and depth first', () => {
    writeFile('lib/a.js', 'a');
    writeFile('lib/Z.js', 'upper case sorts first');
    writeFile('lib/b/c.js', 'c');
    fs.mkdirSync(path.join(projectFolder, 'lib/b/d'));
    writeFile('lib/e.js', 'e, after a folder');
    fs.symlinkSync('a.js', path.join(projectFolder, 'lib/f.link'));
    writeFile('lib/g/h.js', 'h');
    writeFile('lib/g/\u00fc.js', 'non-ASCII');
    writeFile('lib.d.ts', 'a file named as an output folder');

    const lines: string[] = [
      `lib\0folder\0${fs.statSync(path.join(projectFolder, 'lib')).ino}\n`,
      entryLine('lib/Z.js'),
      entryLine('lib/a.js'),
      'lib/b\0folder\n',
      entryLine('lib/b/c.js'),
      'lib/b/d\0folder\n',
      entryLine('lib/e.js'),
      entryLine('lib/f.link'),
      'lib/g\0folder\n',
      entryLine('lib/g/h.js'),
      entryLine('lib/g/\u00fc.js'),
      entryLine('lib.d.ts'),
      'missing\0missing\n'
    ];
    expect(digestOutputFolders({ projectFolder, folderNames: ['lib', 'lib.d.ts', 'missing'] })).toEqual({
      digest: createHash('sha1').update(lines.join('')).digest('hex'),
      entryCount: 10
    });
  });

  it('records links without following them', () => {
    writeFile('lib/a.js', 'a');
    fs.symlinkSync('does-not-exist', path.join(projectFolder, 'lib/dangling'));
    const lines: string[] = [
      `lib\0folder\0${fs.statSync(path.join(projectFolder, 'lib')).ino}\n`,
      entryLine('lib/a.js'),
      entryLine('lib/dangling')
    ];
    expect(lines[2]).toMatch(/^lib\/dangling\0link\0/);
    expect(digestOutputFolders({ projectFolder, folderNames: ['lib'] })).toEqual({
      digest: createHash('sha1').update(lines.join('')).digest('hex'),
      entryCount: 2
    });
  });

  it('follows a declared output folder link', () => {
    writeFile('real-lib/a.js', 'a');
    symlinkDirectory(path.join(projectFolder, 'real-lib'), path.join(projectFolder, 'lib'));
    const lines: string[] = [
      `lib\0folder\0${fs.statSync(path.join(projectFolder, 'lib')).ino}\n`,
      entryLine('lib/a.js')
    ];
    const before: IOutputFolderDigest = digestOutputFolders({ projectFolder, folderNames: ['lib'] });

    expect(before).toEqual({
      digest: createHash('sha1').update(lines.join('')).digest('hex'),
      entryCount: 1
    });

    fs.rmSync(path.join(projectFolder, 'real-lib/a.js'));
    expect(digestOutputFolders({ projectFolder, folderNames: ['lib'] }).digest).not.toBe(before.digest);
  });

  (process.platform === 'win32' || os.userInfo().uid === 0 ? it.skip : it)(
    'has no digest if a folder cannot be read',
    () => {
      writeFile('lib/a.js', 'a');
      const unreadable: string = path.join(projectFolder, 'lib/unreadable');
      fs.mkdirSync(unreadable);
      fs.chmodSync(unreadable, 0);
      try {
        expect(digestOutputFolders({ projectFolder, folderNames: ['lib'] })).toEqual({
          digest: undefined,
          entryCount: 2
        });
      } finally {
        fs.chmodSync(unreadable, 0o755);
      }
    }
  );
});
