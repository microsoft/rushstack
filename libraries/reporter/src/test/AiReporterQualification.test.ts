// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import {
  AiReporter,
  AI_REPORTER_QUALIFICATION_THRESHOLDS,
  evaluateAiReporterQualification,
  formatAiReporterQualificationFailures,
  getQualifiedAiReporterDecision,
  runAiReporterQualificationCorpusAsync,
  type IReporterEventEnvelope,
  type IAiReporterQualificationCaseResult,
  type IAiReporterQualificationResult
} from '../index';
import { normalizeAiReporterQualificationOutput } from '../qualification/AiReporterQualificationCorpus';

describe('AI reporter deterministic qualification corpus', () => {
  let qualification: IAiReporterQualificationResult;

  beforeAll(async () => {
    qualification = await runAiReporterQualificationCorpusAsync();
  });

  it('passes every blocking gate with machine-readable safe results', () => {
    if (!qualification.passed) {
      throw new Error(formatAiReporterQualificationFailures(qualification));
    }
    expect(qualification.schemaVersion).toBe('1.0');
    expect(qualification.cases).toHaveLength(13);
    expect(qualification.cases.filter(({ expectedResult }) => expectedResult === 'failed')).toHaveLength(11);
    expect(qualification.cases.every(({ failures }) => failures.length === 0)).toBe(true);
    const serialized: string = JSON.stringify(qualification);
    expect(serialized).not.toContain('rush-ai-reporter-qualification-');
    expect(serialized).not.toContain('qualification-fake-secret-token');
    expect(serialized).not.toContain('qualification-secret-command');
    expect(serialized).not.toContain('qualification-secret-operation');
    expect(serialized).not.toContain('@private/qualification-secret-project');
    expect(serialized).not.toContain('qualification-secret-phase');
    expect(serialized).not.toContain('qualification-secret-parent-session');
    expect(serialized).not.toContain('qualification-secret-parent-operation');
    expect(serialized).not.toContain('qualification-secret-message-text');
    expect(serialized).not.toContain('qualification-secret-diagnostic-summary');
    expect(serialized).not.toContain('qualification-local-sensitive-fallback-message');
    expect(serialized).not.toContain('qualification-oversized-local-sensitive-value');
    expect(serialized).not.toContain('@private/oversized-qualification-fixture');
    expect(serialized).not.toContain('@private/example-rush-plugin');
  });

  it('enforces the documented size and repeat thresholds', () => {
    expect(AI_REPORTER_QUALIFICATION_THRESHOLDS).toMatchObject({
      minimumActionableFailurePercent: 100,
      maximumOutputBytesPerCase: 64 * 1024,
      maximumCompactCaseAiOutputBytes: 2 * 1024,
      minimumComparableBaselineBytes: 1024,
      maximumPerCaseAiToBaselinePercent: 100,
      maximumAggregateAiToLegacyPercent: 50,
      maximumAggregateAiToPlaintextPercent: 50,
      deterministicRunCount: 3,
      minimumPrivacyPassPercent: 100,
      minimumFullLogPassPercent: 100,
      minimumStdoutContractPassPercent: 100,
      minimumWarningContractPassPercent: 100
    });
  });

  it('normalizes Windows and POSIX paths without storing machine-specific separators', () => {
    expect(
      normalizeAiReporterQualificationOutput(
        '{"path":"C:\\\\repo\\\\temp\\\\rush.log"}',
        'C:\\repo\\temp\\rush.log',
        'C:\\repo\\temp'
      )
    ).toBe('{"path":"<ABSOLUTE_LOG_PATH>"}');
    expect(
      normalizeAiReporterQualificationOutput(
        '{"path":"/repo/temp/rush.log","root":"/repo/temp"}',
        '/repo/temp/rush.log',
        '/repo/temp'
      )
    ).toBe('{"path":"<ABSOLUTE_LOG_PATH>","root":"<TEMP_ROOT>"}');
  });

  it('reports actionable per-case failures when a blocking gate regresses', () => {
    const cases: IAiReporterQualificationCaseResult[] = qualification.cases.map(
      (testCase: IAiReporterQualificationCaseResult, index: number) =>
        index === 0 ? { ...testCase, actionable: false } : testCase
    );
    const failed: IAiReporterQualificationResult = evaluateAiReporterQualification(cases);

    expect(failed.passed).toBe(false);
    expect(formatAiReporterQualificationFailures(failed)).toContain(
      'actionability: actual=90.91, required=>= 100%; cases=bootstrap-unsupported-node'
    );
  });

  it('fails with an actionable case list when the AI reporter omits its log reference', async () => {
    const originalReport: typeof AiReporter.prototype.report = AiReporter.prototype.report;
    const reportSpy: jest.SpiedFunction<typeof AiReporter.prototype.report> = jest
      .spyOn(AiReporter.prototype, 'report')
      .mockImplementation(function (this: AiReporter, event: IReporterEventEnvelope<unknown>): void {
        if (event.type !== 'artifactAvailable') {
          originalReport.call(this, event);
        }
      });
    try {
      const failed: IAiReporterQualificationResult = await runAiReporterQualificationCorpusAsync();
      expect(failed.passed).toBe(false);
      expect(formatAiReporterQualificationFailures(failed)).toContain(
        'full-log: actual=0.00, required=>= 100%; cases='
      );
      expect(
        failed.cases.every(({ failures }) =>
          failures.includes('full log path, permissions, completeness, or correlation invalid')
        )
      ).toBe(true);
    } finally {
      reportSpy.mockRestore();
    }
  });
});

describe('qualified AI reporter decision', () => {
  function passedQualification(): IAiReporterQualificationResult {
    const emptyCases: readonly IAiReporterQualificationCaseResult[] = [];
    return {
      schemaVersion: '1.0',
      passed: true,
      thresholds: AI_REPORTER_QUALIFICATION_THRESHOLDS,
      cases: emptyCases,
      gates: []
    };
  }

  it('recognizes agent variables without activating selection before the privacy prerequisite', () => {
    expect(getQualifiedAiReporterDecision({ COPILOT_CLI: '1' }, [], passedQualification())).toMatchObject({
      agentDetected: true,
      eligible: false,
      reason: 'privacy prerequisite unavailable'
    });
    expect(
      getQualifiedAiReporterDecision({ MY_AGENT: 'yes' }, ['MY_AGENT'], passedQualification())
    ).toMatchObject({
      agentDetected: true,
      eligible: false,
      reason: 'privacy prerequisite unavailable'
    });
  });

  it('returns a reusable AI decision only after qualification and privacy are accepted', () => {
    expect(
      getQualifiedAiReporterDecision({ COPILOT_CLI: '1' }, [], passedQualification(), true)
    ).toMatchObject({
      agentDetected: true,
      eligible: true,
      reporter: 'ai',
      reason: 'qualified'
    });
  });

  it('blocks selection when qualification is absent or failed', () => {
    expect(getQualifiedAiReporterDecision({ COPILOT_CLI: '1' }, [], undefined, true)).toMatchObject({
      eligible: false,
      reason: 'qualification unavailable'
    });
    expect(
      getQualifiedAiReporterDecision(
        { COPILOT_CLI: '1' },
        [],
        { ...passedQualification(), passed: false },
        true
      )
    ).toMatchObject({
      eligible: false,
      reason: 'qualification failed'
    });
  });

  it('keeps RUSH_REPORTER=legacy authoritative even after qualification passes', () => {
    expect(
      getQualifiedAiReporterDecision(
        { COPILOT_CLI: '1', RUSH_REPORTER: 'legacy' },
        [],
        passedQualification(),
        true
      )
    ).toMatchObject({
      agentDetected: true,
      eligible: false,
      reason: 'RUSH_REPORTER=legacy'
    });
  });
});
