// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import glob from 'fast-glob';

import { trySimpleGlobAsync } from '../SimpleGlob';

// These tests verify that trySimpleGlobAsync() returns exactly what fast-glob returns for the options used by
// getFileSelectionSpecifierPathsAsync(), and that it declines (returns undefined) when it cannot guarantee that.

const TREE: string[] = [
  'a.txt',
  '.txt',
  '..txt',
  'b.json',
  'x.d.ts',
  'd.ts',
  'build/a.txt',
  'build.x/b.txt',
  'build./c.json',
  'build.json',
  'lib/nested/deep/file.txt',
  'lib/nested/.hidden/file.json',
  'lib/nested/.hidden/.dotfile',
  '.cache/entry.txt',
  'temp/build/out.d.ts',
  'temp/test/out.js',
  'with space.txt',
  'emptydir/'
];

function createTree(root: string): void {
  for (const entry of TREE) {
    const fullPath: string = path.join(root, entry);
    if (entry.endsWith('/')) {
      fs.mkdirSync(fullPath, { recursive: true });
    } else {
      fs.mkdirSync(path.dirname(fullPath), { recursive: true });
      fs.writeFileSync(fullPath, entry);
    }
  }
}

async function fastGlobAsync(patterns: string[], cwd: string, onlyFiles: boolean): Promise<string[]> {
  const entries: glob.Entry[] = await glob(patterns, {
    cwd,
    onlyFiles,
    dot: true,
    absolute: true,
    objectMode: true
  });
  return describeResults(new Map(entries.map((entry) => [entry.path, entry.dirent as fs.Dirent])));
}

function describeResults(results: Map<string, fs.Dirent>): string[] {
  return Array.from(results, ([filePath, dirent]) =>
    [filePath, dirent.name, dirent.isFile(), dirent.isDirectory(), dirent.isSymbolicLink()].join('|')
  ).sort();
}

describe('trySimpleGlobAsync', () => {
  let root: string;

  beforeAll(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'heft-simple-glob-'));
    createTree(root);
  });

  afterAll(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  const supportedPatternSets: string[][] = [
    ['**/*'],
    ['*'],
    ['**/*.txt'],
    ['**/*.d.ts'],
    ['**/*.{txt,json}'],
    ['build.*'],
    ['build', 'build.*'],
    ['lib', 'temp/build', 'nonexistent', '.cache'],
    ['build.json', '**/*.json'],
    ['a.txt', 'a.txt'],
    ['*', '**/*.txt', 'temp/test']
  ];

  for (const patterns of supportedPatternSets) {
    for (const onlyFiles of [true, false]) {
      it(`matches fast-glob for ${JSON.stringify(patterns)} (onlyFiles: ${onlyFiles})`, async () => {
        const expected: string[] = await fastGlobAsync(patterns, root, onlyFiles);
        const actual: Map<string, fs.Dirent> | undefined = await trySimpleGlobAsync(
          patterns,
          root,
          onlyFiles
        );
        expect(actual).toBeDefined();
        expect(describeResults(actual!)).toEqual(expected);
      });
    }
  }

  it('matches fast-glob when the root folder does not exist', async () => {
    const cwd: string = path.join(root, 'does-not-exist');
    const actual: Map<string, fs.Dirent> | undefined = await trySimpleGlobAsync(['**/*', 'lib'], cwd, false);
    expect(describeResults(actual!)).toEqual(await fastGlobAsync(['**/*', 'lib'], cwd, false));
  });

  const unsupportedPatternSets: string[][] = [
    ['*.txt'],
    ['**'],
    ['lib/**/*.txt'],
    ['!lib'],
    ['[ab].txt'],
    ['**/*.{txt}'],
    ['./lib'],
    ['../lib'],
    ['lib/'],
    ['b*'],
    ['**/*.t?t'],
    ['']
  ];

  for (const patterns of unsupportedPatternSets) {
    it(`declines ${JSON.stringify(patterns)}`, async () => {
      expect(await trySimpleGlobAsync(patterns, root, false)).toBeUndefined();
    });
  }

  it('declines when a symbolic link is encountered', async () => {
    const linkRoot: string = fs.mkdtempSync(path.join(os.tmpdir(), 'heft-simple-glob-link-'));
    try {
      fs.writeFileSync(path.join(linkRoot, 'file.txt'), '');
      try {
        fs.symlinkSync(path.join(linkRoot, 'file.txt'), path.join(linkRoot, 'link.txt'));
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'EPERM') {
          // Creating symbolic links requires elevated privileges on some Windows configurations
          return;
        }
        throw error;
      }
      expect(await trySimpleGlobAsync(['**/*'], linkRoot, false)).toBeUndefined();
      expect(await trySimpleGlobAsync(['link.txt'], linkRoot, false)).toBeUndefined();
    } finally {
      fs.rmSync(linkRoot, { recursive: true, force: true });
    }
  });

  it('declines when the root is not a folder', async () => {
    expect(await trySimpleGlobAsync(['**/*'], path.join(root, 'a.txt'), false)).toBeUndefined();
  });
});
