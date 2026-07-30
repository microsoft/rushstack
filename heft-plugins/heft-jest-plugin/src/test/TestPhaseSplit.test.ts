// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as os from 'node:os';
import * as path from 'node:path';

import type { AggregatedResult } from '@jest/reporters';
import { FileSystem } from '@rushstack/node-core-library';

import {
  getJestFailureSummary,
  writeCoverageThresholdArtifactAsync,
  writeJunitArtifactAsync
} from '../TestResultArtifacts';
import {
  evaluateCoverageThresholds,
  loadCoverageThresholdsAsync,
  parseCoberturaMetrics,
  parseJunitFailures,
  readJunitFailuresAsync,
  writeSyntheticCoverageFailureJunitAsync
} from '../TestResultEvaluator';

describe('split test/evaluate flow', () => {
  it('record-only suppresses test-failure exit signal', () => {
    const failedResults: AggregatedResult = {
      numFailedTests: 2,
      numFailedTestSuites: 1,
      success: false
    } as AggregatedResult;

    expect(getJestFailureSummary(failedResults, true)).toBeUndefined();
    expect(getJestFailureSummary(failedResults, false)).toBe('2 Jest tests failed');
  });

  it('evaluator parses failed unit tests from junit', () => {
    const failures = parseJunitFailures(
      `<?xml version="1.0" encoding="UTF-8"?>` +
        `<testsuites tests="1" failures="1">` +
        `<testsuite name="suite-a" tests="1" failures="1">` +
        `<testcase classname="suite-a" name="test-a">` +
        `<failure message="expected true to be false">stack</failure>` +
        `</testcase>` +
        `</testsuite>` +
        `</testsuites>`
    );

    expect(failures).toEqual([
      {
        suiteName: 'suite-a',
        testName: 'test-a',
        message: 'expected true to be false'
      }
    ]);
  });

  it('evaluator produces synthetic "global code coverage" failure', async () => {
    const metrics = parseCoberturaMetrics(
      `<coverage line-rate="0.65" branch-rate="0.91" lines-covered="65" lines-valid="100"></coverage>`
    );
    const violations = evaluateCoverageThresholds(metrics, {
      lines: 80,
      branches: 90
    });
    expect(violations).toHaveLength(1);
    expect(violations[0].metric).toBe('lines');

    const tempDir: string = path.join(os.tmpdir(), 'heft-jest-plugin-evaluator-test');
    await FileSystem.ensureEmptyFolderAsync(tempDir);
    const syntheticPath: string = path.join(tempDir, 'synthetic.junit.xml');
    await writeSyntheticCoverageFailureJunitAsync(syntheticPath, 'global code coverage', violations);

    const syntheticFailures = await readJunitFailuresAsync(syntheticPath);
    expect(syntheticFailures[0].testName).toBe('global code coverage');
  });

  it('artifact files support evaluation after cache restore', async () => {
    const tempDir: string = path.join(os.tmpdir(), 'heft-jest-plugin-cache-test');
    await FileSystem.ensureEmptyFolderAsync(tempDir);

    const mockResults: AggregatedResult = {
      success: false,
      numFailedTests: 1,
      numFailedTestSuites: 0,
      testResults: [
        {
          testFilePath: path.join(tempDir, 'lib', 'sample.test.js'),
          perfStats: { start: 1000, end: 1500 },
          testExecError: undefined,
          testResults: [
            {
              ancestorTitles: ['suite-a'],
              title: 'fails',
              status: 'failed',
              failureMessages: ['boom'],
              duration: 2
            }
          ]
        }
      ]
    } as unknown as AggregatedResult;

    await writeJunitArtifactAsync(tempDir, mockResults);
    await writeCoverageThresholdArtifactAsync(tempDir, { lines: 90 });

    const restoredFailures = await readJunitFailuresAsync(path.join(tempDir, 'test-results/junit.xml'));
    const restoredThresholds = await loadCoverageThresholdsAsync(
      tempDir,
      'test-results/coverage-thresholds.json'
    );

    expect(restoredFailures).toHaveLength(1);
    expect(restoredThresholds?.lines).toBe(90);
  });
});
