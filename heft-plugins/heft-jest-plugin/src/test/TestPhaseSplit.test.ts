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

    const restoredJunitXml: string = await FileSystem.readFileAsync(
      path.join(tempDir, 'test-results/junit.xml')
    );
    const restoredThresholdsJson: string = await FileSystem.readFileAsync(
      path.join(tempDir, 'test-results/coverage-thresholds.json')
    );
    const restoredThresholds: { global?: { lines?: number } } = JSON.parse(restoredThresholdsJson) as {
      global?: { lines?: number };
    };

    expect(restoredJunitXml).toContain('<failure');
    expect(restoredThresholds.global?.lines).toBe(90);
  });
});
