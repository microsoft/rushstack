// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import {
  AI_REPORTER_QUALIFICATION_THRESHOLDS,
  evaluateAiReporterQualification,
  formatAiReporterQualificationFailures,
  getQualifiedAiReporterDecision,
  runAiReporterQualificationCorpusAsync,
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
    expect(qualification.cases).toHaveLength(12);
    expect(qualification.cases.filter(({ expectedResult }) => expectedResult === 'failed')).toHaveLength(10);
    expect(qualification.cases.every(({ failures }) => failures.length === 0)).toBe(true);
    const serialized: string = JSON.stringify(qualification);
    expect(serialized).not.toContain('rush-ai-reporter-qualification-');
    expect(serialized).not.toContain('qualification-fake-secret-token');
    expect(serialized).not.toContain('@private/example-rush-plugin');
  });

  it('enforces the documented size and repeat thresholds', () => {
    expect(AI_REPORTER_QUALIFICATION_THRESHOLDS).toMatchObject({
      minimumActionableFailurePercent: 100,
      maximumOutputBytesPerCase: 64 * 1024,
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
      'actionability: actual=90.00, required=>= 100%; cases=bootstrap-unsupported-node'
    );
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

  it('recognizes built-in COPILOT_CLI and configured agent variables', () => {
    expect(getQualifiedAiReporterDecision({ COPILOT_CLI: '1' }, [], passedQualification())).toMatchObject({
      agentDetected: true,
      eligible: true,
      reporter: 'ai'
    });
    expect(
      getQualifiedAiReporterDecision({ MY_AGENT: 'yes' }, ['MY_AGENT'], passedQualification())
    ).toMatchObject({
      agentDetected: true,
      eligible: true,
      reporter: 'ai'
    });
  });

  it('blocks selection when qualification is absent or failed', () => {
    expect(getQualifiedAiReporterDecision({ COPILOT_CLI: '1' }, [], undefined)).toMatchObject({
      eligible: false,
      reason: 'qualification unavailable'
    });
    expect(
      getQualifiedAiReporterDecision({ COPILOT_CLI: '1' }, [], { ...passedQualification(), passed: false })
    ).toMatchObject({
      eligible: false,
      reason: 'qualification failed'
    });
  });

  it('keeps RUSH_REPORTER=legacy authoritative even after qualification passes', () => {
    expect(
      getQualifiedAiReporterDecision({ COPILOT_CLI: '1', RUSH_REPORTER: 'legacy' }, [], passedQualification())
    ).toMatchObject({
      agentDetected: true,
      eligible: false,
      reason: 'RUSH_REPORTER=legacy'
    });
  });
});
