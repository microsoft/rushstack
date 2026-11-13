// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import {
  serializeJestJUnitReport,
  type IJestJUnitAssertion,
  type IJestJUnitReport
} from '../JestJUnitReporting';

function fixture(
  statuses: IJestJUnitAssertion['status'][] = ['passed', 'failed', 'pending', 'skipped', 'disabled', 'todo']
): IJestJUnitReport {
  const failed: number = statuses.filter((status) => status === 'failed').length;
  return {
    passWithNoTests: true,
    success: failed === 0,
    snapshotFailure: false,
    testFiles: [
      {
        path: 'example.test.js',
        failed,
        failureMessage: null,
        executionError: null,
        snapshotFailure: false,
        assertions: statuses.map((status) => ({
          fullName: `group ${status}`,
          ancestorTitles: ['group'],
          status,
          durationMs: status === 'passed' ? 1250 : null,
          failureMessages: status === 'failed' ? ['actual <failure> & "detail"', 'second line'] : []
        }))
      }
    ],
    shards: [
      { shardIndex: 1, failureReasons: failed ? ['failed-tests', 'failed-suites', 'jest-unsuccessful'] : [] }
    ],
    coverage: { messages: [] }
  };
}

describe('serializeJestJUnitReport', () => {
  it('uses every real test identity and outcome, with milliseconds converted to seconds', () => {
    expect(serializeJestJUnitReport(fixture())).toBe(
      '<?xml version="1.0" encoding="UTF-8"?>\n' +
        '<testsuites tests="6" failures="1" errors="0" skipped="4">\n' +
        '<testsuite name="example.test.js" tests="6" failures="1" errors="0" skipped="4">\n' +
        '<testcase name="group passed" classname="group" file="example.test.js" time="1.25"></testcase>\n' +
        '<testcase name="group failed" classname="group" file="example.test.js">' +
        '<failure message="group failed">actual &lt;failure&gt; &amp; &quot;detail&quot;&#10;second line</failure></testcase>\n' +
        '<testcase name="group pending" classname="group" file="example.test.js"><skipped message="pending"/></testcase>\n' +
        '<testcase name="group skipped" classname="group" file="example.test.js"><skipped message="skipped"/></testcase>\n' +
        '<testcase name="group disabled" classname="group" file="example.test.js"><skipped message="disabled"/></testcase>\n' +
        '<testcase name="group todo" classname="group" file="example.test.js"><skipped message="todo"/></testcase>\n' +
        '</testsuite>\n</testsuites>\n'
    );
  });

  it('preserves nesting, file-local order and zero durations, falling back to the file for unnamed groups', () => {
    const report: IJestJUnitReport = fixture(['passed', 'passed']);
    const [nested, ungrouped] = report.testFiles[0].assertions!;
    nested.fullName = 'z group first';
    nested.ancestorTitles = ['z', 'group'];
    nested.durationMs = 0;
    ungrouped.fullName = 'a second';
    ungrouped.ancestorTitles = [];
    ungrouped.durationMs = null;
    const xml: string = serializeJestJUnitReport(report);
    expect(xml).toContain(
      '<testcase name="z group first" classname="z group" file="example.test.js" time="0"></testcase>\n' +
        '<testcase name="a second" classname="example.test.js" file="example.test.js"></testcase>'
    );
  });

  it('escapes attributes and text, removes ANSI, and replaces XML-invalid characters without losing surrogate pairs', () => {
    const report: IJestJUnitReport = fixture(['failed']);
    const raw: string =
      'quotes "\' & < >\n\r\t\u0000\u000b\uD800x\uDC00\uFFFE\uFFFF\u{1F600}\u001b[31mred\u001b[0m';
    const escaped: string =
      'quotes &quot;&apos; &amp; &lt; &gt;&#10;&#13;&#9;\uFFFD\uFFFD\uFFFDx\uFFFD\uFFFD\uFFFD\u{1F600}red';
    const assertion: IJestJUnitAssertion = report.testFiles[0].assertions![0];
    report.testFiles[0].path = raw;
    assertion.fullName = raw;
    assertion.ancestorTitles = [raw];
    assertion.failureMessages = [raw];
    const xml: string = serializeJestJUnitReport(report);
    expect(xml).toContain(`<testsuite name="${escaped}" tests="1" failures="1" errors="0" skipped="0">`);
    expect(xml).toContain(
      `<testcase name="${escaped}" classname="${escaped}" file="${escaped}">` +
        `<failure message="${escaped}">${escaped}</failure></testcase>`
    );
    expect(xml).not.toContain('\u001b');
  });

  it.each([
    ['execution', '[suite execution]', 'Cannot load &lt;suite&gt;', true],
    ['suite', '[suite failure]', 'Suite &amp; teardown failed', false],
    ['file snapshot', '[snapshot validation]', 'Jest snapshot validation failed.', false],
    ['global snapshot', '[snapshot validation]', 'Jest snapshot validation failed.', false],
    ['coverage', '[coverage threshold]', 'Coverage threshold was not met', false],
    ['empty', '[empty selection]', 'No Jest tests were selected and passWithNoTests is false.', false],
    ['shard', '[shard 1]', 'Jest returned an unsuccessful result.', false],
    ['verdict', '[final verdict]', 'Jest collation returned an unsuccessful verdict.', false]
  ] as const)(
    'reports a genuine %s diagnostic without manufacturing passing tests',
    (kind, label, message, error) => {
      const report: IJestJUnitReport = fixture([]);
      report.success = false;
      switch (kind) {
        case 'execution':
          report.testFiles[0].executionError = '\u001b[31mCannot load <suite>\u001b[0m';
          report.testFiles[0].failureMessage = 'Duplicate suite failure';
          break;
        case 'suite':
          report.testFiles[0].failureMessage = 'Suite & teardown failed';
          break;
        case 'file snapshot':
          report.testFiles[0].snapshotFailure = report.snapshotFailure = true;
          break;
        case 'global snapshot':
          report.snapshotFailure = true;
          break;
        case 'coverage':
          report.coverage.messages = ['Coverage threshold was not met'];
          break;
        case 'empty':
          report.testFiles = [];
          report.passWithNoTests = false;
          break;
        case 'shard':
          report.shards[0].failureReasons = ['jest-unsuccessful'];
          break;
      }
      const xml: string = serializeJestJUnitReport(report);
      const element: string = error ? 'error' : 'failure';
      expect(xml).toContain(
        `<testsuites tests="1" failures="${error ? 0 : 1}" errors="${error ? 1 : 0}" skipped="0">`
      );
      expect(xml.match(/<testcase /g)).toHaveLength(1);
      expect(xml).toContain(`<testcase name="${label}"`);
      expect(xml).toContain(`<${element} message="${label}">${message}</${element}></testcase>`);
    }
  );

  it('does not duplicate assertion failures with suite, snapshot, shard or final-verdict diagnostics', () => {
    const report: IJestJUnitReport = fixture(['failed']);
    report.testFiles[0].failureMessage = 'Already represented by the failed assertion';
    report.testFiles[0].snapshotFailure = report.snapshotFailure = true;
    const xml: string = serializeJestJUnitReport(report);
    expect(xml).toContain('<testsuites tests="1" failures="1" errors="0" skipped="0">');
    expect(xml.match(/<testcase /g)).toHaveLength(1);
    expect(xml).toContain('<testcase name="group failed"');
    expect(xml).not.toContain('[snapshot validation]');
    expect(xml).not.toContain('Jest collation checks');
  });

  it('totals multiple suites and final diagnostics without changing caller order or input', () => {
    const report: IJestJUnitReport = fixture();
    const second: IJestJUnitReport = fixture([]);
    second.testFiles[0].path = 'another.test.js';
    second.testFiles[0].executionError = 'Cannot load another suite';
    report.testFiles.push(second.testFiles[0]);
    report.coverage.messages = ['First threshold', 'Second threshold'];
    const before: string = JSON.stringify(report);
    const xml: string = serializeJestJUnitReport(report);
    expect(xml).toContain('<testsuites tests="9" failures="3" errors="1" skipped="4">');
    expect(xml.match(/<testcase /g)).toHaveLength(9);
    expect(xml).toContain('<testsuite name="another.test.js" tests="1" failures="0" errors="1" skipped="0">');
    expect(xml).toContain(
      '<testsuite name="Jest collation checks" tests="2" failures="2" errors="0" skipped="0">'
    );
    expect(xml.indexOf('name="example.test.js"')).toBeLessThan(xml.indexOf('name="another.test.js"'));
    expect(xml.indexOf('First threshold')).toBeLessThan(xml.indexOf('Second threshold'));
    expect(JSON.stringify(report)).toBe(before);
    expect(serializeJestJUnitReport(report)).toBe(xml);
  });

  it('does not fabricate tests for an allowed empty selection', () => {
    const report: IJestJUnitReport = fixture([]);
    report.testFiles = [];
    expect(serializeJestJUnitReport(report)).toBe(
      '<?xml version="1.0" encoding="UTF-8"?>\n' +
        '<testsuites tests="0" failures="0" errors="0" skipped="0">\n\n</testsuites>\n'
    );
  });

  it('refuses legacy test files without assertion details', () => {
    const report: IJestJUnitReport = fixture(['passed']);
    delete report.testFiles[0].assertions;
    expect(() => serializeJestJUnitReport(report)).toThrow(
      'JUnit requires assertion details for "example.test.js". Rerun legacy cached shards.'
    );
  });
});
