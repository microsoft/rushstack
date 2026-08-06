// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as os from 'node:os';
import * as path from 'node:path';

import { FileSystem } from '@rushstack/node-core-library';

import {
  evaluateCoverageThresholds,
  loadCoverageThresholdsAsync,
  parseCoberturaMetrics,
  parseJunitFailures,
  readJunitFailuresAsync,
  writeSyntheticCoverageFailureJunitAsync
} from '../TestResultEvaluator';

describe('test evaluator', () => {
  it('parses failed unit tests from junit', () => {
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

  it('produces synthetic "global code coverage" failure', async () => {
    const metrics = parseCoberturaMetrics(
      `<coverage line-rate="0.65" branch-rate="0.91" lines-covered="65" lines-valid="100"></coverage>`
    );
    const violations = evaluateCoverageThresholds(metrics, {
      lines: 80,
      branches: 90
    });
    expect(violations).toHaveLength(1);
    expect(violations[0].metric).toBe('lines');

    const tempDir: string = path.join(os.tmpdir(), 'heft-test-evaluator-plugin-evaluator-test');
    await FileSystem.ensureEmptyFolderAsync(tempDir);
    const syntheticPath: string = path.join(tempDir, 'synthetic.junit.xml');
    await writeSyntheticCoverageFailureJunitAsync(syntheticPath, 'global code coverage', violations);

    const syntheticFailures = await readJunitFailuresAsync(syntheticPath);
    expect(syntheticFailures[0].testName).toBe('global code coverage');
  });

  it('reads thresholds artifact after cache restore', async () => {
    const tempDir: string = path.join(os.tmpdir(), 'heft-test-evaluator-plugin-cache-test');
    await FileSystem.ensureEmptyFolderAsync(tempDir);
    await FileSystem.writeFileAsync(
      path.join(tempDir, 'test-results/coverage-thresholds.json'),
      JSON.stringify({ version: 1, global: { lines: 90 } }, undefined, 2),
      { ensureFolderExists: true }
    );

    const restoredThresholds = await loadCoverageThresholdsAsync(
      tempDir,
      'test-results/coverage-thresholds.json'
    );

    expect(restoredThresholds?.lines).toBe(90);
  });
});
