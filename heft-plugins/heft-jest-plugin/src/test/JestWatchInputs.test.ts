// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as fs from 'node:fs';
import * as path from 'node:path';

import type { Config } from '@jest/types';

import type { IWatchFileSystem } from '@rushstack/heft';
import { FileSystem } from '@rushstack/node-core-library';

import {
  collectTestInputFileTimes,
  getJestWatchInputOptions,
  haveTestInputsChanged,
  type IJestWatchInputOptions
} from '../JestWatchInputs';

const TEST_FOLDER_PATH: string = path.resolve(__dirname, '../../temp/jest-watch-inputs-test');

class RecordingWatchFileSystem {
  public readonly trackedFolderPaths: string[] = [];

  public readdirSync(folderPath: string): string[] {
    this.trackedFolderPaths.push(folderPath);
    return fs.readdirSync(folderPath);
  }

  public statSync(filePath: string): fs.Stats {
    return fs.statSync(filePath);
  }
}

function createFiles(rootPath: string, relativePaths: string[]): void {
  for (const relativePath of relativePaths) {
    FileSystem.writeFile(path.join(rootPath, relativePath), '', { ensureFolderExists: true });
  }
}

function collect(options: Partial<IJestWatchInputOptions> & Pick<IJestWatchInputOptions, 'rootPaths'>): {
  fileTimes: Map<string, number>;
  trackedFolderPaths: string[];
} {
  const watchFs: RecordingWatchFileSystem = new RecordingWatchFileSystem();
  const fileTimes: Map<string, number> = collectTestInputFileTimes(watchFs as unknown as IWatchFileSystem, {
    excludedFolderPaths: new Set(),
    ignorePatterns: [],
    ...options
  });
  return { fileTimes, trackedFolderPaths: watchFs.trackedFolderPaths.sort() };
}

describe('JestWatchInputs', () => {
  let rootPath: string;

  beforeEach(() => {
    FileSystem.ensureEmptyFolder(TEST_FOLDER_PATH);
    rootPath = path.join(TEST_FOLDER_PATH, 'root');
  });

  afterAll(() => {
    FileSystem.deleteFolder(TEST_FOLDER_PATH);
  });

  describe(collectTestInputFileTimes.name, () => {
    it('tracks a root that contains only test inputs as a whole', () => {
      createFiles(rootPath, ['a.js', 'sub/b.js']);

      const { fileTimes, trackedFolderPaths } = collect({ rootPaths: new Set([rootPath]) });

      expect(Array.from(fileTimes.keys()).sort()).toEqual([
        path.join(rootPath, 'a.js'),
        path.join(rootPath, 'sub', 'b.js')
      ]);
      expect(trackedFolderPaths).toEqual([rootPath]);
    });

    it('skips excluded and ignored paths, and does not track the folders that contain them', () => {
      createFiles(rootPath, [
        'a.js',
        'sub/b.js',
        'node_modules/x.js',
        '.git/HEAD',
        'coverage/lcov.info',
        'e2e/c.js',
        'report.xml'
      ]);

      const { fileTimes, trackedFolderPaths } = collect({
        rootPaths: new Set([rootPath]),
        excludedFolderPaths: new Set([path.join(rootPath, 'coverage')]),
        ignorePatterns: [/[\\/]e2e[\\/]/, /report\.xml$/]
      });

      expect(Array.from(fileTimes.keys()).sort()).toEqual([
        path.join(rootPath, 'a.js'),
        path.join(rootPath, 'sub', 'b.js')
      ]);
      expect(trackedFolderPaths).toEqual([path.join(rootPath, 'sub')]);
    });

    it('tracks the siblings of a nested excluded folder', () => {
      createFiles(rootPath, ['lib/x.js', 'lib/inner/y.js', 'lib/coverage/lcov.info', 'src/z.js']);

      const { fileTimes, trackedFolderPaths } = collect({
        rootPaths: new Set([rootPath]),
        excludedFolderPaths: new Set([path.join(rootPath, 'lib', 'coverage')])
      });

      expect(Array.from(fileTimes.keys()).sort()).toEqual([
        path.join(rootPath, 'lib', 'inner', 'y.js'),
        path.join(rootPath, 'lib', 'x.js'),
        path.join(rootPath, 'src', 'z.js')
      ]);
      expect(trackedFolderPaths).toEqual([path.join(rootPath, 'lib', 'inner'), path.join(rootPath, 'src')]);
    });

    it('does not apply the ignore patterns to a root itself', () => {
      createFiles(rootPath, ['a.js']);

      const { fileTimes, trackedFolderPaths } = collect({
        rootPaths: new Set([rootPath]),
        ignorePatterns: [/[\\/]root[\\/]?$/]
      });

      expect(Array.from(fileTimes.keys())).toEqual([path.join(rootPath, 'a.js')]);
      expect(trackedFolderPaths).toEqual([rootPath]);
    });

    it('watches a missing root for its creation', () => {
      const { fileTimes, trackedFolderPaths } = collect({ rootPaths: new Set([rootPath]) });

      expect(fileTimes.size).toBe(0);
      expect(trackedFolderPaths).toEqual([rootPath]);
    });

    it('skips a root that is an excluded folder', () => {
      createFiles(rootPath, ['a.js']);

      const { fileTimes, trackedFolderPaths } = collect({
        rootPaths: new Set([rootPath]),
        excludedFolderPaths: new Set([rootPath])
      });

      expect(fileTimes.size).toBe(0);
      expect(trackedFolderPaths).toEqual([]);
    });
  });

  describe(haveTestInputsChanged.name, () => {
    const fileTimes: Map<string, number> = new Map([
      ['a.js', 1],
      ['b.js', 2]
    ]);

    it('returns true if there was no previous run', () => {
      expect(haveTestInputsChanged(undefined, fileTimes)).toBe(true);
    });

    it('returns false if no file changed', () => {
      expect(haveTestInputsChanged(new Map(fileTimes), fileTimes)).toBe(false);
    });

    it.each([
      [
        'modified',
        [
          ['a.js', 1],
          ['b.js', 3]
        ]
      ],
      [
        'added',
        [
          ['a.js', 1],
          ['b.js', 2],
          ['c.js', 3]
        ]
      ],
      ['deleted', [['a.js', 1]]],
      [
        'renamed',
        [
          ['a.js', 1],
          ['c.js', 2]
        ]
      ]
    ] as [string, [string, number][]][])('returns true if a file was %s', (change, entries) => {
      expect(haveTestInputsChanged(fileTimes, new Map(entries))).toBe(true);
    });
  });

  describe(getJestWatchInputOptions.name, () => {
    it('resolves symbolic links and combines the ignore patterns of all projects', () => {
      const realFolderPath: string = path.join(TEST_FOLDER_PATH, 'real');
      const linkFolderPath: string = path.join(TEST_FOLDER_PATH, 'link');
      FileSystem.ensureFolder(path.join(realFolderPath, 'lib'));
      fs.symlinkSync(realFolderPath, linkFolderPath, 'junction');
      const resolvedFolderPath: string = fs.realpathSync(realFolderPath);

      const globalConfig: Partial<Config.GlobalConfig> = {
        coverageDirectory: path.join(linkFolderPath, 'coverage')
      };
      const configs: Partial<Config.ProjectConfig>[] = [
        {
          roots: [path.join(linkFolderPath, 'lib')],
          cacheDirectory: path.join(linkFolderPath, 'temp', 'test', 'jest'),
          modulePathIgnorePatterns: ['a'],
          watchPathIgnorePatterns: ['b']
        },
        {
          roots: [path.join(linkFolderPath, 'missing')],
          cacheDirectory: path.join(linkFolderPath, 'temp', 'test', 'jest'),
          modulePathIgnorePatterns: [],
          watchPathIgnorePatterns: ['c']
        }
      ];

      const options: IJestWatchInputOptions = getJestWatchInputOptions(
        globalConfig as Config.GlobalConfig,
        configs as Config.ProjectConfig[],
        path.join(linkFolderPath, 'temp')
      );

      expect(Array.from(options.rootPaths)).toEqual([
        path.join(resolvedFolderPath, 'lib'),
        path.join(resolvedFolderPath, 'missing')
      ]);
      expect(Array.from(options.excludedFolderPaths)).toEqual([
        path.join(resolvedFolderPath, 'temp'),
        path.join(resolvedFolderPath, 'coverage'),
        path.join(resolvedFolderPath, 'temp', 'test', 'jest')
      ]);
      expect(options.ignorePatterns.map((pattern: RegExp) => pattern.source)).toEqual(['a', 'b', 'c']);
    });
  });
});
