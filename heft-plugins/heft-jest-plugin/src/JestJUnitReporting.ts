// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { AnsiEscape } from '@rushstack/terminal';

export interface IJestJUnitAssertion {
  fullName: string;
  ancestorTitles: string[];
  status: 'passed' | 'failed' | 'pending' | 'skipped' | 'disabled' | 'todo';
  // eslint-disable-next-line @rushstack/no-new-null -- Jest does not time every assertion.
  durationMs: number | null;
  failureMessages: string[];
}

export interface IJestJUnitTestFile {
  path: string;
  failed: number;
  // eslint-disable-next-line @rushstack/no-new-null -- Preserve explicit null in serialized Jest results.
  failureMessage: string | null;
  // eslint-disable-next-line @rushstack/no-new-null -- Preserve explicit null in serialized Jest results.
  executionError: string | null;
  snapshotFailure: boolean;
  /** Legacy results may omit assertion details; the serializer rejects such test files. */
  assertions?: IJestJUnitAssertion[];
}

/** The subset of validated, final Jest results consumed by the JUnit serializer. */
export interface IJestJUnitReport {
  passWithNoTests: boolean;
  success: boolean;
  snapshotFailure: boolean;
  testFiles: IJestJUnitTestFile[];
  shards: { shardIndex: number; failureReasons: string[] }[];
  coverage: { messages: string[] };
}

interface IJUnitSuite {
  name: string;
  cases: string[];
  failures: number;
  errors: number;
  skipped: number;
}

function xml(value: string): string {
  return (
    AnsiEscape.removeCodes(value)
      // XML 1.0 excludes control characters and unpaired UTF-16 surrogates.
      // eslint-disable-next-line no-control-regex
      .replace(/[^\u0009\u000a\u000d\u0020-\ud7ff\ue000-\ufffd\u{10000}-\u{10ffff}]/gu, '\uFFFD')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;')
      .replace(/\n/g, '&#10;')
      .replace(/\r/g, '&#13;')
      .replace(/\t/g, '&#9;')
  );
}

function createSuite(name: string): IJUnitSuite {
  return { name, cases: [], failures: 0, errors: 0, skipped: 0 };
}

function addDiagnostic(suite: IJUnitSuite, name: string, message: string, error: boolean = false): void {
  const element: string = error ? 'error' : 'failure';
  if (error) {
    suite.errors++;
  } else {
    suite.failures++;
  }
  suite.cases.push(
    `<testcase name="${xml(name)}" classname="${xml(suite.name)}">` +
      `<${element} message="${xml(name)}">${xml(message)}</${element}></testcase>`
  );
}

/**
 * Serializes real assertions and labeled diagnostics without writing files or running Jest.
 * The caller must validate identities, counters, statuses, finite nonnegative durations, and the final verdict.
 * Input array order is preserved; callers provide canonical ordering for deterministic merged reports.
 * Missing assertion details are rejected rather than interpreting aggregate counts as passing tests.
 */
export function serializeJestJUnitReport(report: IJestJUnitReport): string {
  const suites: IJUnitSuite[] = [];
  for (const file of report.testFiles) {
    if (!file.assertions) {
      throw new Error(`JUnit requires assertion details for "${file.path}". Rerun legacy cached shards.`);
    }
    const suite: IJUnitSuite = createSuite(file.path);
    for (const assertion of file.assertions) {
      let body: string = '';
      if (assertion.status === 'failed') {
        suite.failures++;
        body = `<failure message="${xml(assertion.fullName)}">${xml(assertion.failureMessages.join('\n'))}</failure>`;
      } else if (assertion.status !== 'passed') {
        suite.skipped++;
        body = `<skipped message="${assertion.status}"/>`;
      }
      const time: string = assertion.durationMs === null ? '' : ` time="${assertion.durationMs / 1000}"`;
      suite.cases.push(
        `<testcase name="${xml(assertion.fullName)}" classname="${xml(
          assertion.ancestorTitles.join(' ') || file.path
        )}" file="${xml(file.path)}"${time}>${body}</testcase>`
      );
    }
    if (file.executionError) {
      addDiagnostic(suite, '[suite execution]', file.executionError, true);
    } else if (file.failureMessage && file.failed === 0) {
      addDiagnostic(suite, '[suite failure]', file.failureMessage);
    }
    if (file.snapshotFailure && suite.failures === 0 && suite.errors === 0) {
      addDiagnostic(suite, '[snapshot validation]', 'Jest snapshot validation failed.');
    }
    suites.push(suite);
  }
  const finalChecks: IJUnitSuite = createSuite('Jest collation checks');
  if (report.testFiles.length === 0 && !report.passWithNoTests) {
    addDiagnostic(
      finalChecks,
      '[empty selection]',
      'No Jest tests were selected and passWithNoTests is false.'
    );
  }
  if (report.snapshotFailure && !report.testFiles.some((file) => file.snapshotFailure)) {
    addDiagnostic(finalChecks, '[snapshot validation]', 'Jest snapshot validation failed.');
  }
  for (const shard of report.shards) {
    if (shard.failureReasons.length === 1 && shard.failureReasons[0] === 'jest-unsuccessful') {
      addDiagnostic(finalChecks, `[shard ${shard.shardIndex}]`, 'Jest returned an unsuccessful result.');
    }
  }
  for (const message of report.coverage.messages) {
    addDiagnostic(finalChecks, '[coverage threshold]', message);
  }
  if (
    !report.success &&
    finalChecks.failures === 0 &&
    suites.every((suite) => suite.failures === 0 && suite.errors === 0)
  ) {
    addDiagnostic(finalChecks, '[final verdict]', 'Jest collation returned an unsuccessful verdict.');
  }
  if (finalChecks.cases.length) {
    suites.push(finalChecks);
  }
  const totals: { tests: number; failures: number; errors: number; skipped: number } = {
    tests: 0,
    failures: 0,
    errors: 0,
    skipped: 0
  };
  for (const suite of suites) {
    totals.tests += suite.cases.length;
    totals.failures += suite.failures;
    totals.errors += suite.errors;
    totals.skipped += suite.skipped;
  }
  const counts = (value: typeof totals): string =>
    `tests="${value.tests}" failures="${value.failures}" errors="${value.errors}" skipped="${value.skipped}"`;
  return (
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    `<testsuites ${counts(totals)}>\n` +
    suites
      .map(
        (suite) =>
          `<testsuite name="${xml(suite.name)}" ${counts({ ...suite, tests: suite.cases.length })}>\n` +
          suite.cases.join('\n') +
          '\n</testsuite>'
      )
      .join('\n') +
    '\n</testsuites>\n'
  );
}
