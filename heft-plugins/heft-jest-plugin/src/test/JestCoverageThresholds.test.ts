// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { stripVTControlCharacters } from 'node:util';

import { runCLI } from '@jest/core';
import { CoverageReporter, type BaseReporter, type Config } from '@jest/reporters';
import { createEmptyTestResult, makeEmptyAggregatedTestResult } from '@jest/test-result';
import { readConfigs } from 'jest-config';
import { createCoverageMap, type CoverageMap, type FileCoverageData } from 'istanbul-lib-coverage';

import { evaluateThresholdsAsync } from '../JestCoverageThresholds';

function createMap(rootDir: string, filename: string, hits: [number, number]): CoverageMap {
  /* eslint-disable @typescript-eslint/naming-convention -- Istanbul coverage IDs are numeric strings. */
  const data: FileCoverageData = {
    path: path.join(rootDir, filename),
    statementMap: {
      '0': { start: { line: 1, column: 0 }, end: { line: 1, column: 10 } },
      '1': { start: { line: 2, column: 0 }, end: { line: 2, column: 10 } }
    },
    fnMap: {
      '0': {
        name: 'first',
        decl: { start: { line: 1, column: 0 }, end: { line: 1, column: 5 } },
        loc: { start: { line: 1, column: 0 }, end: { line: 1, column: 10 } },
        line: 1
      },
      '1': {
        name: 'second',
        decl: { start: { line: 2, column: 0 }, end: { line: 2, column: 5 } },
        loc: { start: { line: 2, column: 0 }, end: { line: 2, column: 10 } },
        line: 2
      }
    },
    branchMap: {
      '0': {
        type: 'if',
        line: 1,
        loc: { start: { line: 1, column: 0 }, end: { line: 2, column: 10 } },
        locations: [
          { start: { line: 1, column: 0 }, end: { line: 1, column: 10 } },
          { start: { line: 2, column: 0 }, end: { line: 2, column: 10 } }
        ]
      }
    },
    s: { '0': hits[0], '1': hits[1] },
    f: { '0': hits[0], '1': hits[1] },
    b: { '0': [...hits] }
  };
  /* eslint-enable @typescript-eslint/naming-convention */
  return createCoverageMap({ [data.path]: data });
}

describe('evaluateThresholdsAsync', () => {
  let rootDir: string;
  let logSpy: jest.SpyInstance<void, [string]>;

  function normalize(message: string): string {
    return stripVTControlCharacters(message)
      .replaceAll('\\', '/')
      .replaceAll(`${rootDir.replaceAll('\\', '/')}/`, '');
  }

  async function expectThresholdsAsync(
    thresholds: Config.GlobalConfig['coverageThreshold'],
    map: CoverageMap,
    expected: string[],
    buildFolderPath: string = rootDir
  ): Promise<void> {
    logSpy.mockClear();
    const original: string = JSON.stringify(map);
    expect(await evaluateThresholdsAsync(buildFolderPath, thresholds, map)).toEqual(expected);
    expect(logSpy.mock.calls.map(([message]) => normalize(message))).toEqual(
      expected.length ? [expected.join('\n')] : []
    );
    expect(JSON.stringify(map)).toBe(original);
  }

  beforeEach(async () => {
    const tempFolder: string = path.resolve(__dirname, '../../temp');
    await fs.mkdir(tempFolder, { recursive: true });
    rootDir = await fs.realpath(await fs.mkdtemp(path.join(tempFolder, 'jest-thresholds-')));
    logSpy = jest.spyOn(CoverageReporter.prototype, 'log').mockImplementation(() => {});
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    await fs.rm(rootDir, { recursive: true, force: true });
  });

  it.each(['branches', 'functions', 'lines', 'statements'] as const)(
    'preserves percentage boundaries and uncovered-count limits for %s',
    async (metric) => {
      const map: CoverageMap = createMap(rootDir, 'source.js', [1, 0]);
      await expectThresholdsAsync({ global: { [metric]: 50 } }, map, []);
      await expectThresholdsAsync({ global: { [metric]: 51 } }, map, [
        `Jest: "global" coverage threshold for ${metric} (51%) not met: 50%`
      ]);
      await expectThresholdsAsync({ global: { [metric]: -1 } }, map, []);
      const uncovered: CoverageMap = createMap(rootDir, 'source.js', [0, 0]);
      await expectThresholdsAsync({ global: { [metric]: -2 } }, uncovered, []);
      await expectThresholdsAsync({ global: { [metric]: -1 } }, uncovered, [
        `Jest: Uncovered count for ${metric} (2) exceeds global threshold (1)`
      ]);
    }
  );

  it('skips absent thresholds and accepts disabled metrics and an empty map', async () => {
    const map: CoverageMap = createMap(rootDir, 'source.js', [0, 0]);
    await expectThresholdsAsync(undefined, map, [], path.join(rootDir, 'does-not-exist'));
    await expectThresholdsAsync({ global: {} }, map, []);
    await expectThresholdsAsync({ global: { statements: 0 } }, map, []);
    await expectThresholdsAsync({ global: { statements: 100 } }, createCoverageMap({}), []);
  });

  it.each(['./src/', `.${path.sep}src${path.sep}`])(
    'resolves directory scope %s against the build folder and excludes it from global',
    async (scope) => {
      const map: CoverageMap = createMap(rootDir, 'src/first.js', [1, 1]);
      map.merge(createMap(rootDir, 'src/second.js', [0, 0]));
      map.merge(createMap(rootDir, 'src-other/third.js', [1, 1]));
      await expectThresholdsAsync({ global: { statements: 100 }, [scope]: { statements: 50 } }, map, []);
      await expectThresholdsAsync(
        { global: { statements: 100 }, [scope]: { statements: 51 } },
        map,
        ['Jest: "src/" coverage threshold for statements (51%) not met: 50%'],
        `${rootDir}${path.sep}`
      );
    }
  );

  it('supports absolute and root-relative file scopes, including overlapping scopes', async () => {
    const map: CoverageMap = createMap(rootDir, 'src/first.js', [1, 0]);
    map.merge(createMap(rootDir, 'other.js', [1, 1]));
    for (const scope of ['./src/first.js', path.join(rootDir, 'src/first.js')]) {
      await expectThresholdsAsync(
        { global: { statements: 100 }, [scope]: { statements: 51 }, './src/': { statements: 51 } },
        map,
        [
          'Jest: "src/first.js" coverage threshold for statements (51%) not met: 50%',
          'Jest: "src/" coverage threshold for statements (51%) not met: 50%'
        ]
      );
    }
  });

  it('checks each glob-matched file rather than averaging the directory', async () => {
    await fs.mkdir(path.join(rootDir, 'src'));
    await fs.writeFile(path.join(rootDir, 'src/first.js'), '');
    await fs.writeFile(path.join(rootDir, 'src/second.js'), '');
    const map: CoverageMap = createMap(rootDir, 'src/first.js', [1, 1]);
    map.merge(createMap(rootDir, 'src/second.js', [0, 0]));
    await expectThresholdsAsync({ global: { statements: 100 }, './src/*.js': { statements: 50 } }, map, [
      'Jest: "src/second.js" coverage threshold for statements (50%) not met: 0%'
    ]);
  });

  it.each(['./missing.js', './missing/', './missing/*.js'])('reports a missing scope %s', async (scope) => {
    await expectThresholdsAsync(
      { global: {}, [scope]: { statements: 100 } },
      createMap(rootDir, 'source.js', [1, 1]),
      [`Jest: Coverage data for ${scope.slice(2)} was not found.`]
    );
  });

  it('returns identical messages after relocating the build root', async () => {
    const thresholds: Config.GlobalConfig['coverageThreshold'] = {
      global: {},
      './src/': { statements: 100 }
    };
    const first: string[] = await evaluateThresholdsAsync(
      rootDir,
      thresholds,
      createMap(rootDir, 'src/first.js', [1, 0])
    );
    const relocated: string = path.join(rootDir, 'relocated');
    await fs.mkdir(relocated);
    const second: string[] = await evaluateThresholdsAsync(
      relocated,
      thresholds,
      createMap(relocated, 'src/first.js', [1, 0])
    );
    expect(first).toEqual(['Jest: "src/" coverage threshold for statements (100%) not met: 50%']);
    expect(second).toEqual(first);
    expect(logSpy.mock.calls.map(([message]) => normalize(message))).toEqual([
      first.join('\n'),
      first.join('\n').replace('"src/', '"relocated/src/')
    ]);
  });

  it.each([false, true])(
    'rejects aliased scopes instead of hiding native Jest failures (reverse: %s)',
    async (reverse) => {
      const entries: [string, { statements?: number; functions?: number }][] = [
        ['./source.js', { statements: 100 }],
        ['source.js', { statements: 0, functions: 100 }]
      ];
      if (reverse) {
        entries.reverse();
      }
      const thresholds: NonNullable<Config.GlobalConfig['coverageThreshold']> = {
        global: {},
        ...Object.fromEntries(entries)
      };
      const map: CoverageMap = createMap(rootDir, 'source.js', [0, 0]);
      const { globalConfig } = await readConfigs(
        {
          $0: 'jest-alias-parity',
          _: [],
          useStderr: true,
          config: JSON.stringify({
            rootDir,
            coverageReporters: [],
            coverageThreshold: {
              global: {},
              ...Object.fromEntries(entries.map(([name, threshold]) => [`${rootDir}/${name}`, threshold]))
            }
          })
        },
        [rootDir]
      );
      const reporter: BaseReporter = new CoverageReporter(globalConfig, {
        firstRun: true,
        previousSuccess: true
      });
      reporter.onTestResult(undefined, { ...createEmptyTestResult(), coverage: map.toJSON() });
      await reporter.onRunComplete(new Set(), makeEmptyAggregatedTestResult());
      const expected: string[] = [
        'Jest: "./source.js" coverage threshold for statements (100%) not met: 0%',
        'Jest: "source.js" coverage threshold for functions (100%) not met: 0%'
      ];
      if (reverse) {
        expected.reverse();
      }
      expect(normalize(reporter.getLastError()!.message)).toBe(expected.join('\n'));
      expect(logSpy.mock.calls.map(([message]) => normalize(message))).toEqual([expected.join('\n')]);
      logSpy.mockClear();
      await expect(evaluateThresholdsAsync(rootDir, thresholds, map)).rejects.toThrow(
        'resolve to the same path'
      );
      expect(logSpy).not.toHaveBeenCalled();
    }
  );

  it.each(['.', './', 'absolute'])(
    'normalizes root scope %s for percentage and count failures after relocation',
    async (scope) => {
      const relocated: string = path.join(rootDir, 'relocated');
      await fs.mkdir(relocated);
      for (const folder of [rootDir, relocated]) {
        for (const threshold of [100, -1]) {
          logSpy.mockClear();
          const messages: string[] = await evaluateThresholdsAsync(
            folder,
            { global: {}, [scope === 'absolute' ? folder : scope]: { statements: threshold } },
            createMap(folder, 'source.js', [0, 0])
          );
          expect(messages).toEqual([
            threshold === 100
              ? 'Jest: "." coverage threshold for statements (100%) not met: 0%'
              : 'Jest: Uncovered count for statements (2) exceeds . threshold (1)'
          ]);
          const absoluteScope: string = `${folder}${scope === './' ? path.sep : ''}`.replaceAll('\\', '/');
          expect(
            logSpy.mock.calls.map(([message]) => stripVTControlCharacters(message).replaceAll('\\', '/'))
          ).toEqual([
            threshold === 100
              ? `Jest: "${absoluteScope}" coverage threshold for statements (100%) not met: 0%`
              : `Jest: Uncovered count for statements (2) exceeds ${absoluteScope} threshold (1)`
          ]);
        }
      }
    }
  );

  it('uses the public lifecycle without recollecting sources or generating reports', async () => {
    await fs.writeFile(path.join(rootDir, 'uncollected.js'), 'throw new Error("must not be collected");');
    const before: string[] = await fs.readdir(rootDir, { recursive: true });
    const onTestResultSpy = jest.spyOn(CoverageReporter.prototype, 'onTestResult');
    const onRunCompleteSpy = jest.spyOn(CoverageReporter.prototype, 'onRunComplete');
    const getLastErrorSpy = jest.spyOn(CoverageReporter.prototype, 'getLastError');
    await expectThresholdsAsync(
      { global: { statements: 100 } },
      createMap(rootDir, 'not-on-disk.js', [1, 1]),
      []
    );
    expect(onTestResultSpy).toHaveBeenCalledTimes(1);
    expect(onRunCompleteSpy).toHaveBeenCalledTimes(1);
    expect(onRunCompleteSpy.mock.calls[0][0].size).toBe(0);
    expect(getLastErrorSpy).toHaveBeenCalledTimes(1);
    expect(await fs.readdir(rootDir, { recursive: true })).toEqual(before);
  });

  it('matches real Jest runs and passes only after complementary coverage is combined', async () => {
    await fs.writeFile(
      path.join(rootDir, 'source.js'),
      'exports.left = () => 1;\nexports.right = () => 2;\n'
    );
    await fs.copyFile(path.join(rootDir, 'source.js'), path.join(rootDir, 'global.js'));
    const thresholds: NonNullable<Config.GlobalConfig['coverageThreshold']> = {
      global: { functions: 100 },
      './source.js': { functions: 100 },
      './source*.js': { functions: 100 }
    };
    const maps: CoverageMap[] = [];
    for (const [name, value] of [
      ['left', 1],
      ['right', 2]
    ] as const) {
      await fs.writeFile(
        path.join(rootDir, 'source.test.js'),
        `test('${name}', () => {
          expect(require('./source').${name}()).toBe(${value});
          expect(require('./global').${name}()).toBe(${value});
        });\n`
      );
      logSpy.mockClear();
      const { results } = await runCLI(
        {
          $0: 'jest-threshold-parity',
          _: [],
          runInBand: true,
          useStderr: true,
          config: JSON.stringify({
            rootDir,
            cache: false,
            testEnvironment: require.resolve('jest-environment-node'),
            testMatch: ['**/source.test.js'],
            collectCoverage: true,
            coverageProvider: 'babel',
            coverageReporters: [],
            reporters: [],
            coverageThreshold: {
              global: thresholds.global,
              [path.join(rootDir, 'source.js')]: thresholds['./source.js'],
              [path.join(rootDir, 'source*.js')]: thresholds['./source*.js']
            }
          })
        },
        [rootDir]
      );
      expect(results.numPassedTests).toBe(1);
      expect(results.numFailedTests).toBe(0);
      expect(results.coverageMap?.files().sort()).toEqual(
        [path.join(rootDir, 'global.js'), path.join(rootDir, 'source.js')].sort()
      );
      const expected: string[] = [
        'Jest: "global" coverage threshold for functions (100%) not met: 50%',
        'Jest: "source.js" coverage threshold for functions (100%) not met: 50%',
        'Jest: "source.js" coverage threshold for functions (100%) not met: 50%'
      ];
      expect(logSpy.mock.calls.map(([message]) => normalize(message))).toEqual([expected.join('\n')]);
      if (!results.coverageMap) {
        throw new Error('Jest did not return a coverage map.');
      }
      const map: CoverageMap = createCoverageMap(results.coverageMap.toJSON());
      maps.push(map);
      await expectThresholdsAsync(thresholds, map, expected);
    }
    const combined: CoverageMap = createCoverageMap({});
    for (const map of maps) {
      combined.merge(map);
    }
    expect(combined.getCoverageSummary().functions.pct).toBe(100);
    await expectThresholdsAsync(thresholds, combined, []);
  });
});
