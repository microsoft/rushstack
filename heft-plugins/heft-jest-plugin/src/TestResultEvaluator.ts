// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'node:path';

import { FileSystem } from '@rushstack/node-core-library';

import type { ICoverageThresholdArtifact, ICoverageThresholds } from './TestResultArtifacts';

export const DEFAULT_SYNTHETIC_COVERAGE_TEST_NAME: string = 'global code coverage';
export const DEFAULT_SYNTHETIC_JUNIT_RELATIVE_PATH: string =
  'test-results-evaluate/synthetic-coverage.junit.xml';

export interface IJUnitFailure {
  suiteName: string;
  testName: string;
  message: string;
}

export interface ICoverageMetric {
  lines?: number;
  branches?: number;
  functions?: number;
  statements?: number;
}

export interface ICoverageViolation {
  metric: keyof ICoverageMetric;
  actual: number;
  required: number;
}

export async function readJunitFailuresAsync(junitAbsolutePath: string): Promise<IJUnitFailure[]> {
  const xml: string = await FileSystem.readFileAsync(junitAbsolutePath);
  return parseJunitFailures(xml);
}

export function parseJunitFailures(xml: string): IJUnitFailure[] {
  const failures: IJUnitFailure[] = [];

  const testSuiteRegex: RegExp = /<testsuite\b([^>]*)>([\s\S]*?)<\/testsuite>/g;
  for (const suiteMatch of xml.matchAll(testSuiteRegex)) {
    const suiteAttributes: Record<string, string> = parseAttributes(suiteMatch[1]);
    const suiteName: string = suiteAttributes.name || 'test suite';
    const suiteBody: string = suiteMatch[2];

    const testcaseRegex: RegExp = /<testcase\b([^>]*)>([\s\S]*?)<\/testcase>|<testcase\b([^>]*)\/>/g;
    for (const testCaseMatch of suiteBody.matchAll(testcaseRegex)) {
      const testcaseAttributes: Record<string, string> = parseAttributes(
        testCaseMatch[1] || testCaseMatch[3] || ''
      );
      const testcaseBody: string = testCaseMatch[2] || '';
      if (!testcaseBody) {
        continue;
      }

      const failureMatch: RegExpMatchArray | null = testcaseBody.match(
        /<(failure|error)\b([^>]*)>([\s\S]*?)<\/\1>/
      );
      if (!failureMatch) {
        continue;
      }

      const failureAttributes: Record<string, string> = parseAttributes(failureMatch[2] || '');
      const message: string =
        failureAttributes.message || collapseWhitespace(failureMatch[3]) || 'Test failed';

      failures.push({
        suiteName,
        testName: testcaseAttributes.name || 'unnamed test',
        message
      });
    }

    const suiteLevelFailureMatch: RegExpMatchArray | null = suiteBody.match(/<(failure|error)\b([^>]*)>/);
    if (suiteLevelFailureMatch && failures.every((failure) => failure.suiteName !== suiteName)) {
      const suiteFailureAttributes: Record<string, string> = parseAttributes(suiteLevelFailureMatch[2] || '');
      failures.push({
        suiteName,
        testName: 'test suite execution',
        message: suiteFailureAttributes.message || 'Test suite execution failed'
      });
    }
  }

  return failures;
}

export async function readCoberturaMetricsAsync(
  coberturaAbsolutePath: string
): Promise<ICoverageMetric | undefined> {
  const xml: string = await FileSystem.readFileAsync(coberturaAbsolutePath);
  return parseCoberturaMetrics(xml);
}

export function parseCoberturaMetrics(xml: string): ICoverageMetric | undefined {
  const coverageMatch: RegExpMatchArray | null = xml.match(/<coverage\b([^>]*)>/);
  if (!coverageMatch) {
    return undefined;
  }

  const coverageAttributes: Record<string, string> = parseAttributes(coverageMatch[1] || '');
  const lineRate: number | undefined = parseNumber(coverageAttributes['line-rate']);
  const branchRate: number | undefined = parseNumber(coverageAttributes['branch-rate']);

  const linesCovered: number | undefined = parseNumber(coverageAttributes['lines-covered']);
  const linesValid: number | undefined = parseNumber(coverageAttributes['lines-valid']);
  const branchesCovered: number | undefined = parseNumber(coverageAttributes['branches-covered']);
  const branchesValid: number | undefined = parseNumber(coverageAttributes['branches-valid']);

  const lines: number | undefined =
    lineRate !== undefined
      ? lineRate * 100
      : linesCovered !== undefined && linesValid
        ? (linesCovered / linesValid) * 100
        : undefined;
  const branches: number | undefined =
    branchRate !== undefined
      ? branchRate * 100
      : branchesCovered !== undefined && branchesValid
        ? (branchesCovered / branchesValid) * 100
        : undefined;

  return {
    lines,
    branches
  };
}

export function evaluateCoverageThresholds(
  actualCoverage: ICoverageMetric | undefined,
  thresholds: ICoverageThresholds | undefined
): ICoverageViolation[] {
  if (!actualCoverage || !thresholds) {
    return [];
  }

  const violations: ICoverageViolation[] = [];
  for (const metric of ['lines', 'branches', 'functions', 'statements'] as const) {
    const required: number | undefined = thresholds[metric];
    const actual: number | undefined = actualCoverage[metric];
    if (required !== undefined && actual !== undefined && actual < required) {
      violations.push({ metric, required, actual });
    }
  }
  return violations;
}

export async function loadCoverageThresholdsAsync(
  buildFolderPath: string,
  relativePath: string
): Promise<ICoverageThresholds | undefined> {
  const absolutePath: string = path.resolve(buildFolderPath, relativePath);
  if (!(await FileSystem.existsAsync(absolutePath))) {
    return undefined;
  }

  const text: string = await FileSystem.readFileAsync(absolutePath);
  const parsed: unknown = JSON.parse(text);
  if (!parsed || typeof parsed !== 'object') {
    return undefined;
  }

  const globalThresholds: unknown = (parsed as ICoverageThresholdArtifact).global;
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

export async function writeSyntheticCoverageFailureJunitAsync(
  outputAbsolutePath: string,
  testName: string,
  violations: ICoverageViolation[]
): Promise<void> {
  const message: string = violations
    .map(
      (violation) => `${violation.metric}: ${violation.actual.toFixed(2)} < ${violation.required.toFixed(2)}`
    )
    .join('\n');
  const xml: string =
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<testsuites tests="1" failures="1" errors="0" skipped="0">` +
    `<testsuite name="coverage" tests="1" failures="1" errors="0" skipped="0" time="0">` +
    `<testcase classname="coverage" name="${xmlEscape(testName)}" time="0">` +
    `<failure message="${xmlEscape(message)}">${xmlEscape(message)}</failure>` +
    `</testcase>` +
    `</testsuite>` +
    `</testsuites>\n`;

  await FileSystem.writeFileAsync(outputAbsolutePath, xml, { ensureFolderExists: true });
}

function parseAttributes(attributesText: string): Record<string, string> {
  const attributes: Record<string, string> = {};
  const attributeRegex: RegExp = /([A-Za-z0-9:_-]+)\s*=\s*"([^"]*)"/g;
  for (const match of attributesText.matchAll(attributeRegex)) {
    attributes[match[1]] = decodeXml(match[2]);
  }
  return attributes;
}

function parseNumber(value: string | undefined): number | undefined {
  if (value === undefined) {
    return undefined;
  }
  const parsed: number = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function decodeXml(value: string): string {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, `'`)
    .replace(/&gt;/g, '>')
    .replace(/&lt;/g, '<')
    .replace(/&amp;/g, '&');
}

function collapseWhitespace(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}

function xmlEscape(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
