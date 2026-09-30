// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import {
  describeOutputFileChanges,
  getCleanOnlyReason,
  hasContentHashedOutputChange,
  readOperationOutputManifestAsync,
  type IOperationOutputManifest
} from '../OperationOutputManifest';

describe(getCleanOnlyReason.name, () => {
  it.each([
    [
      'lib/chunk.main_1a2b3c4d.js',
      'its outputs include the content-hashed file "lib/chunk.main_1a2b3c4d.js"'
    ],
    ['lib/0dd8cf755e5195a5.js', 'its outputs include the content-hashed file "lib/0dd8cf755e5195a5.js"'],
    ['lib/app-3f9a1c7b.min.css', 'its outputs include the content-hashed file "lib/app-3f9a1c7b.min.css"'],
    [
      'lib/vendor.4e5f6a7b.js.map',
      'its outputs include the content-hashed file "lib/vendor.4e5f6a7b.js.map"'
    ],
    ['dist/main.js', 'its outputs include the bundle "dist/main.js"'],
    ['dist-cjs/index.cjs', 'its outputs include the bundle "dist-cjs/index.cjs"'],
    ['release/styles.css', 'its outputs include the bundle "release/styles.css"']
  ])('treats %s as a clean-only output', (file: string, reason: string) => {
    expect(getCleanOnlyReason(['lib/index.js', file])).toBe(reason);
  });

  it.each(['lib/index.js', 'lib/facade.js', 'lib/deadbeefcafe.js', 'lib-commonjs/a.js', 'dist/index.d.ts'])(
    'allows incremental builds of %s',
    (file: string) => {
      expect(getCleanOnlyReason([file])).toBeUndefined();
    }
  );
});

describe(describeOutputFileChanges.name, () => {
  it('describes added and removed files, and ignores content-addressed files', () => {
    expect(describeOutputFileChanges(new Set(['lib/a.js']), new Set(['lib/a.js']))).toBeUndefined();
    expect(
      describeOutputFileChanges(
        new Set(['lib/a.js', 'lib/b.js']),
        new Set(['lib/a.js', 'lib/e.js', 'lib/d.js', 'lib/c.js', 'lib/f.js'])
      )
    ).toBe('4 added ("lib/c.js", "lib/d.js", "lib/e.js", ...), 1 removed ("lib/b.js")');
    expect(
      describeOutputFileChanges(
        new Set(['temp/jest-transform-cache-0123456789abcdef-0123456789abcdef/7f/a_1']),
        new Set(['temp/jest-transform-cache-0123456789abcdef-0123456789abcdef/8e/b_2'])
      )
    ).toBeUndefined();
  });

  it.each([
    ['lib/0dd8cf755e5195a5.js', 'lib/7c1e0b4f9a2d3e6f.js'],
    ['lib/2d0bb124b0ce1c65888f.png', 'lib/5c7a3e9f1b2d4068ace1.png'],
    ['dist/app.0123456789abcdef0123.js', 'dist/app.3210fedcba9876543210.js'],
    ['dist/2d0bb124b0ce1c65888f.png', 'dist/5c7a3e9f1b2d4068ace1.png']
  ])(
    'describes a content-hashed output that a bundler renamed from %s to %s',
    (before: string, after: string) => {
      expect(describeOutputFileChanges(new Set([before]), new Set([after]))).toBe(
        `1 added (${JSON.stringify(after)}), 1 removed (${JSON.stringify(before)})`
      );
    }
  );
});

describe(hasContentHashedOutputChange.name, () => {
  it.each<[string[], string[], boolean]>([
    [['lib/a.js'], ['lib/a.js', 'lib/chunk_0123456789abcdef0123.js'], true],
    [['lib/a.js', 'lib/chunk.main_1a2b3c4d.js'], ['lib/a.js'], true],
    [['dist/2d0bb124b0ce1c65888f.png'], ['dist/5c7a3e9f1b2d4068ace1.png'], true],
    [['lib/a.js'], ['lib/a.js', 'lib/b.js'], false],
    [['dist/a.js'], ['dist/a.js', 'dist/b.js'], false],
    [['lib/chunk.main_1a2b3c4d.js'], ['lib/chunk.main_1a2b3c4d.js', 'lib/b.js'], false],
    [['lib/a.js'], ['lib/a.js', 'temp/jest-transform-cache-0123456789abcdef-0123456789abcdef/7f/a_1'], false]
  ])('for %j before and %j after, returns %s', (before: string[], after: string[], expected: boolean) => {
    expect(hasContentHashedOutputChange(new Set(before), new Set(after))).toBe(expected);
  });
});

describe(readOperationOutputManifestAsync.name, () => {
  // Whole seconds, so that the time is set exactly
  const KEPT_MODIFICATION_TIME_SECONDS: number = 1_700_000_000;
  let projectFolder: string;

  beforeEach(() => {
    projectFolder = fs.mkdtempSync(path.join(os.tmpdir(), 'rush-output-manifest-'));
    fs.mkdirSync(`${projectFolder}/lib/sub`, { recursive: true });
    fs.writeFileSync(`${projectFolder}/lib/index.js`, 'index');
    fs.writeFileSync(`${projectFolder}/lib/sub/util.js`, 'util');
    fs.writeFileSync(`${projectFolder}/tsconfig.tsbuildinfo`, '{}');
  });

  afterEach(() => {
    fs.rmSync(projectFolder, { recursive: true, force: true });
  });

  async function readAsync(): Promise<IOperationOutputManifest> {
    return await readOperationOutputManifestAsync(projectFolder, ['lib/', 'tsconfig.tsbuildinfo', 'lib-esm']);
  }

  it('lists the output files', async () => {
    const manifest: IOperationOutputManifest = await readAsync();
    expect(Array.from(manifest.files).sort()).toEqual([
      'lib/index.js',
      'lib/sub/util.js',
      'tsconfig.tsbuildinfo'
    ]);
    expect(manifest.cleanOnlyReason).toBeUndefined();
    expect((await readAsync()).signature).toBe(manifest.signature);
  });

  it.each([
    ['with the same size', (filePath: string) => fs.writeFileSync(filePath, 'utiL')],
    ['by an append', (filePath: string) => fs.appendFileSync(filePath, ' 2')]
  ])(
    'changes if a file is rewritten in place %s',
    async (description: string, rewrite: (filePath: string) => void) => {
      const filePath: string = `${projectFolder}/lib/sub/util.js`;
      const { ino } = fs.statSync(filePath);
      const { signature } = await readAsync();
      // File modification times can have a coarse resolution.
      await new Promise((resolve) => setTimeout(resolve, 20));
      rewrite(filePath);
      expect(fs.statSync(filePath).ino).toBe(ino);
      expect((await readAsync()).signature).not.toBe(signature);
    }
  );

  it('does not change if a hard link to a file is created elsewhere', async () => {
    const { signature } = await readAsync();
    await new Promise((resolve) => setTimeout(resolve, 20));
    fs.linkSync(`${projectFolder}/lib/sub/util.js`, `${projectFolder}/util.js`);
    fs.linkSync(`${projectFolder}/tsconfig.tsbuildinfo`, `${projectFolder}/tsbuildinfo.json`);
    expect((await readAsync()).signature).toBe(signature);
  });

  // E.g. `cp -p`, `rsync -t` or `tar -x`, which give the files that they write the modification time of their source.
  it.each([
    [
      'a file is rewritten in place by an append',
      (folder: string) => fs.appendFileSync(`${folder}/lib/sub/util.js`, ' 2')
    ],
    [
      'an output file that is not in a folder is replaced by a rename with the same size',
      (folder: string) => {
        fs.writeFileSync(`${folder}/tsconfig.tsbuildinfo.tmp`, '[]');
        fs.renameSync(`${folder}/tsconfig.tsbuildinfo.tmp`, `${folder}/tsconfig.tsbuildinfo`);
      }
    ]
  ])(
    'changes if %s and its modification time is kept',
    async (description: string, change: (folder: string) => void) => {
      const files: string[] = [`${projectFolder}/lib/sub/util.js`, `${projectFolder}/tsconfig.tsbuildinfo`];
      const keepModificationTimes = (): void => {
        for (const file of files) {
          fs.utimesSync(file, KEPT_MODIFICATION_TIME_SECONDS, KEPT_MODIFICATION_TIME_SECONDS);
        }
      };
      keepModificationTimes();
      const { signature } = await readAsync();
      change(projectFolder);
      keepModificationTimes();
      expect((await readAsync()).signature).not.toBe(signature);
    }
  );

  it.each([
    [
      'a file is added to a subfolder',
      (folder: string) => fs.writeFileSync(`${folder}/lib/sub/new.js`, 'new')
    ],
    ['a file is deleted', (folder: string) => fs.rmSync(`${folder}/lib/sub/util.js`)],
    [
      'an output file that is not in a folder is rewritten in place',
      (folder: string) => fs.appendFileSync(`${folder}/tsconfig.tsbuildinfo`, ' ')
    ],
    [
      'a file in a subfolder is replaced by a rename',
      (folder: string) => {
        fs.writeFileSync(`${folder}/lib/sub/util.js.tmp`, 'util 2');
        fs.renameSync(`${folder}/lib/sub/util.js.tmp`, `${folder}/lib/sub/util.js`);
      }
    ],
    [
      'a folder is recreated',
      (folder: string) => {
        fs.rmSync(`${folder}/lib/sub`, { recursive: true });
        fs.mkdirSync(`${folder}/lib/sub`);
        fs.writeFileSync(`${folder}/lib/sub/util.js`, 'util');
      }
    ],
    ['a missing output folder is created', (folder: string) => fs.mkdirSync(`${folder}/lib-esm`)]
  ])('changes if %s', async (description: string, change: (folder: string) => void) => {
    const { signature } = await readAsync();
    // Folder modification times can have a coarse resolution.
    await new Promise((resolve) => setTimeout(resolve, 20));
    change(projectFolder);
    expect((await readAsync()).signature).not.toBe(signature);
  });
});
