// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'node:path';

import type { AggregatedResult, AssertionResult, TestResult } from '@jest/reporters';
import { FileSystem } from '@rushstack/node-core-library';

export interface ICoverageThresholds {
  lines?: number;
  branches?: number;
  functions?: number;
  statements?: number;
}

export interface ICoverageThresholdArtifact {
  version: 1;
  global: ICoverageThresholds;
}

export const DEFAULT_JUNIT_ARTIFACT_RELATIVE_PATH: string = 'test-results/junit.xml';
export const DEFAULT_COVERAGE_THRESHOLDS_ARTIFACT_RELATIVE_PATH: string =
  'test-results/coverage-thresholds.json';

export function getCoverageThresholdsFromJestConfig(
  jestConfig: Record<string, unknown>
): ICoverageThresholds | undefined {
  const coverageThreshold: unknown = jestConfig.coverageThreshold;
  if (!coverageThreshold || typeof coverageThreshold !== 'object') {
    return undefined;
  }

  const globalThresholds: unknown = (coverageThreshold as { global?: unknown }).global;
  if (!globalThresholds || typeof globalThresholds !== 'object') {
    return undefined;
  }

  const result: ICoverageThresholds = {};
  for (const metric of ['lines', 'branches', 'functions', 'statements'] as const) {
    const value: unknown = (globalThresholds as Record<string, unknown>)[metric];
    if (typeof value === 'number') {
      result[metric] = value;
    }
  }

  return Object.keys(result).length > 0 ? result : undefined;
}

export function getJestFailureSummary(
  jestResults: AggregatedResult,
  recordOnly: boolean
): string | undefined {
  if (recordOnly) {
    return undefined;
  }

  if (jestResults.numFailedTests > 0) {
    return `${jestResults.numFailedTests} Jest test${jestResults.numFailedTests > 1 ? 's' : ''} failed`;
  }

  if (jestResults.numFailedTestSuites > 0) {
    return `${jestResults.numFailedTestSuites} Jest test suite${
      jestResults.numFailedTestSuites > 1 ? 's' : ''
    } failed`;
  }

  if (!jestResults.success) {
    return 'Jest reported a failed run';
  }

  return undefined;
}

export async function writeJunitArtifactAsync(
  buildFolderPath: string,
  jestResults: AggregatedResult,
  relativeJunitPath: string = DEFAULT_JUNIT_ARTIFACT_RELATIVE_PATH
): Promise<void> {
  const outputPath: string = path.resolve(buildFolderPath, relativeJunitPath);
  await FileSystem.ensureFolderAsync(path.dirname(outputPath));

  const xml: string = serializeJunitResult(buildFolderPath, jestResults);
  await FileSystem.writeFileAsync(outputPath, xml, { ensureFolderExists: true });
}

export async function writeCoverageThresholdArtifactAsync(
  buildFolderPath: string,
  coverageThresholds: ICoverageThresholds | undefined,
  relativeThresholdPath: string = DEFAULT_COVERAGE_THRESHOLDS_ARTIFACT_RELATIVE_PATH
): Promise<void> {
  const outputPath: string = path.resolve(buildFolderPath, relativeThresholdPath);

  if (!coverageThresholds) {
    await FileSystem.deleteFileAsync(outputPath, { throwIfNotExists: false });
    return;
  }

  const artifact: ICoverageThresholdArtifact = {
    version: 1,
    global: coverageThresholds
  };

  await FileSystem.writeFileAsync(outputPath, JSON.stringify(artifact, undefined, 2), {
    ensureFolderExists: true
  });
}

function serializeJunitResult(buildFolderPath: string, jestResults: AggregatedResult): string {
  const testSuitesXml: string[] = [];
  let totalFailures: number = 0;
  let totalErrors: number = 0;
  let totalSkipped: number = 0;
  let totalTests: number = 0;

  for (const testSuiteResult of jestResults.testResults) {
    const relativeSuitePath: string = path.relative(buildFolderPath, testSuiteResult.testFilePath);
    const suiteName: string = relativeSuitePath || testSuiteResult.testFilePath;
    const suiteXml: string[] = [];
    let suiteFailures: number = 0;
    let suiteErrors: number = 0;
    let suiteSkipped: number = 0;
    let suiteTests: number = 0;

    for (const assertionResult of testSuiteResult.testResults) {
      suiteTests++;
      const failureXml: string[] = [];
      if (assertionResult.status === 'failed') {
        suiteFailures++;
        const failureText: string = assertionResult.failureMessages.join('\n');
        failureXml.push(
          `<failure message="${xmlEscape(firstLineOrDefault(failureText, 'Test assertion failed'))}">${xmlEscape(
            failureText
          )}</failure>`
        );
      } else if (assertionResult.status === 'pending' || assertionResult.status === 'todo') {
        suiteSkipped++;
        failureXml.push('<skipped />');
      }

      suiteXml.push(
        `<testcase classname="${xmlEscape(assertionResult.ancestorTitles.join(' > '))}" name="${xmlEscape(
          assertionResult.title
        )}" time="${toTestDurationSeconds(assertionResult)}">${
          failureXml.length ? failureXml.join('') : ''
        }</testcase>`
      );
    }

    if (testSuiteResult.testExecError) {
      suiteTests++;
      suiteErrors++;
      suiteXml.push(
        `<testcase classname="${xmlEscape(suiteName)}" name="test suite execution" time="0">` +
          `<error message="${xmlEscape(
            firstLineOrDefault(testSuiteResult.testExecError.message, 'Test suite execution failed')
          )}">${xmlEscape(testSuiteResult.testExecError.stack || testSuiteResult.testExecError.message)}</error>` +
          `</testcase>`
      );
    }

    totalFailures += suiteFailures;
    totalErrors += suiteErrors;
    totalSkipped += suiteSkipped;
    totalTests += suiteTests;

    testSuitesXml.push(
      `<testsuite name="${xmlEscape(suiteName)}" tests="${suiteTests}" failures="${suiteFailures}" errors="${suiteErrors}" skipped="${suiteSkipped}" time="${toSuiteDurationSeconds(
        testSuiteResult
      )}">${suiteXml.join('')}</testsuite>`
    );
  }

  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<testsuites tests="${totalTests}" failures="${totalFailures}" errors="${totalErrors}" skipped="${totalSkipped}">` +
    `${testSuitesXml.join('')}` +
    `</testsuites>\n`
  );
}

function toSuiteDurationSeconds(testResult: TestResult): string {
  return testResult.perfStats
    ? ((testResult.perfStats.end - testResult.perfStats.start) / 1000).toFixed(3)
    : '0';
}

function toTestDurationSeconds(assertionResult: AssertionResult): string {
  if (typeof assertionResult.duration === 'number') {
    return (assertionResult.duration / 1000).toFixed(3);
  }
  return '0';
}

function firstLineOrDefault(text: string | undefined, defaultText: string): string {
  if (!text) {
    return defaultText;
  }
  const firstLine: string = text.split('\n')[0];
  return firstLine || defaultText;
}

function xmlEscape(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
