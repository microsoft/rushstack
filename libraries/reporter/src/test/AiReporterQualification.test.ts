// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as fs from 'node:fs';

import {
  AiReporter,
  AI_REPORTER_QUALIFICATION_THRESHOLDS,
  evaluateAiReporterQualification,
  formatAiReporterQualificationFailures,
  getQualifiedAiReporterDecision,
  runAiReporterQualificationCorpusAsync,
  type IAiDiagnostic,
  type IAiReporterQualificationCaseResult,
  type IAiReporterQualificationGateResult,
  type IAiReporterQualificationResult
} from '../index';
import {
  hasExpectedAiQualificationDiagnostic,
  normalizeAiReporterQualificationOutput
} from '../qualification/AiReporterQualificationCorpus';
import {
  AiQualificationTestSession,
  QUALIFICATION_CLEANUP_TIMEOUT_MS,
  QUALIFICATION_TEST_TIMEOUT_MS
} from './helpers/AiQualificationTestSession';
import type { AiQualificationMutation } from './helpers/AiQualificationWorker';

describe('AI reporter deterministic qualification corpus', () => {
  let qualification: IAiReporterQualificationResult;
  const sessions: Set<AiQualificationTestSession> = new Set();

  function startSession(
    mutation: AiQualificationMutation,
    options?: ConstructorParameters<typeof AiQualificationTestSession>[1]
  ): AiQualificationTestSession {
    const session: AiQualificationTestSession = new AiQualificationTestSession(mutation, options);
    sessions.add(session);
    return session;
  }

  afterEach(async () => {
    const results: PromiseSettledResult<void>[] = await Promise.allSettled(
      [...sessions].map((session) => session.stopAsync())
    );
    sessions.clear();
    const errors: unknown[] = results
      .filter((result): result is PromiseRejectedResult => result.status === 'rejected')
      .map((result) => result.reason);
    if (errors.length > 0) {
      throw new AggregateError(errors, 'Failed to join qualification test workers');
    }
  }, QUALIFICATION_CLEANUP_TIMEOUT_MS + 1000);

  // Three file-backed corpus passes can exceed Jest's default setup allowance on Windows CI.
  beforeAll(async () => {
    qualification = await runAiReporterQualificationCorpusAsync();
  }, 15000);

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
    expect(qualification.gates.find(({ id }) => id === 'size.invocation-boundary')).toMatchObject({
      passed: true,
      failedCases: []
    });
  });

  it(
    'measures unnormalized emitted UTF-8 output including every delimiter',
    async () => {
      const { qualification: result, outputs } = await startSession('capture-bytes').resultAsync();
      expect(result.passed).toBe(true);
      const outputByLogPath: Map<string, string> = new Map();
      for (const value of outputs) {
        const final: { kind?: string; log?: { path?: string } } = JSON.parse(
          value.trimEnd().split('\n').at(-1)!
        );
        if (final.kind === 'ai.final' && final.log?.path !== undefined) {
          const previous: string | undefined = outputByLogPath.get(final.log.path);
          if (
            previous === undefined ||
            Buffer.byteLength(value, 'utf8') > Buffer.byteLength(previous, 'utf8')
          ) {
            outputByLogPath.set(final.log.path, value);
          }
        }
      }
      const capturedOutput: string[] = [...outputByLogPath.values()].slice(0, result.cases.length);
      expect(capturedOutput).toHaveLength(result.cases.length);
      expect(capturedOutput.every((output) => output.endsWith('\n'))).toBe(true);
      expect(capturedOutput.every((output) => !output.includes('<ABSOLUTE_LOG_PATH>'))).toBe(true);
      expect(capturedOutput.map((output) => Buffer.byteLength(output, 'utf8'))).toEqual(
        result.cases.map(({ aiOutputBytes }) => aiOutputBytes)
      );
    },
    QUALIFICATION_TEST_TIMEOUT_MS
  );

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
    const { qualification: failed } = await startSession('missing-log').resultAsync();
    expect(failed.passed).toBe(false);
    expect(formatAiReporterQualificationFailures(failed)).toContain(
      'full-log: actual=0.00, required=>= 100%; cases='
    );
    expect(
      failed.cases.every(({ failures }) =>
        failures.includes('full log path, permissions, completeness, or correlation invalid')
      )
    ).toBe(true);
  });

  it(
    'fails qualification when a renderer substitutes unrelated remediation',
    async () => {
      const { qualification: result } = await startSession('unrelated-remediation').resultAsync();
      const actionability: IAiReporterQualificationGateResult | undefined = result.gates.find(
        ({ id }) => id === 'actionability'
      );
      expect(actionability?.passed).toBe(false);
      expect(actionability?.failedCases).toContain('bootstrap-unsupported-node');
      expect(actionability?.failedCases).toContain('configuration-invalid-json');
      expect(result.passed).toBe(false);
    },
    QUALIFICATION_TEST_TIMEOUT_MS
  );

  it(
    'keeps a delayed mutation isolated while another actual corpus completes',
    async () => {
      const report: typeof AiReporter.prototype.report = AiReporter.prototype.report;
      const delayed: AiQualificationTestSession = startSession('missing-log', { waitForRelease: true });
      await delayed.ready;
      expect(AiReporter.prototype.report).toBe(report);
      const { qualification: next } = await startSession('unrelated-remediation').resultAsync();
      expect(next.gates.find(({ id }) => id === 'full-log')?.passed).toBe(true);
      expect(next.gates.find(({ id }) => id === 'actionability')?.passed).toBe(false);
      expect(delayed.worker.threadId).not.toBe(-1);
      delayed.worker.postMessage('run');
      const { qualification: previous } = await delayed.resultAsync();
      expect(previous.gates.find(({ id }) => id === 'full-log')?.actual).toBe(0);
      expect(delayed.worker.threadId).toBe(-1);
      expect(fs.existsSync(delayed.tempRoot)).toBe(false);
    },
    QUALIFICATION_TEST_TIMEOUT_MS
  );

  it.each(['timeout', 'reject', 'cancel'] as const)(
    'joins %s mutation work before the next negative corpus',
    async (failure) => {
      const report: typeof AiReporter.prototype.report = AiReporter.prototype.report;
      const interrupted: AiQualificationTestSession = startSession('missing-log', {
        waitForRelease: true,
        timeoutAfterReadyMs: failure === 'timeout' ? 50 : undefined
      });
      await interrupted.ready;
      expect(AiReporter.prototype.report).toBe(report);
      if (failure === 'reject') {
        interrupted.worker.postMessage('reject');
      } else if (failure === 'cancel') {
        await interrupted.stopAsync();
      }
      const outcome = await interrupted.done;
      expect(outcome.success).toBe(false);
      if (!outcome.success) {
        expect(outcome.error.message).toContain(
          failure === 'timeout' ? 'timed out' : failure === 'reject' ? 'rejection' : 'cancelled'
        );
      }
      expect(interrupted.worker.threadId).toBe(-1);
      expect(fs.existsSync(interrupted.tempRoot)).toBe(false);
      expect(AiReporter.prototype.report).toBe(report);
      const { qualification: next } = await startSession('unrelated-remediation').resultAsync();
      expect(next.gates.find(({ id }) => id === 'full-log')?.passed).toBe(true);
      expect(next.gates.find(({ id }) => id === 'actionability')?.passed).toBe(false);
    },
    QUALIFICATION_TEST_TIMEOUT_MS
  );
});

describe('AI qualification actionable diagnostic contract', () => {
  const expected: Parameters<typeof hasExpectedAiQualificationDiagnostic>[1] = {
    code: 'RUSH_COMMAND_FAILED',
    category: 'command',
    summaryKey: 'diagnostic.RUSH_COMMAND_FAILED.summary',
    parameters: { commandName: { value: 'build', privacy: 'public' } },
    remediation: [
      {
        descriptionKey: 'remediation.review-command-usage',
        command: 'rush build --help',
        automatedExecutionSafety: 'safe'
      }
    ]
  };
  const valid: IAiDiagnostic = {
    code: expected.code,
    category: expected.category,
    severity: 'error',
    summary: 'The requested command could not be parsed.',
    context: { commandName: 'build' },
    remediation: expected.remediation
  };

  it('accepts genuinely retained fallback context and the correct usage action', () => {
    expect(hasExpectedAiQualificationDiagnostic(valid, expected)).toBe(true);
  });

  it.each<Partial<IAiDiagnostic>>([
    { context: undefined, remediation: undefined },
    { context: { commandName: 'other' } },
    { remediation: [] },
    { remediation: [{ ...expected.remediation[0], command: 'rush --version' }] },
    { remediation: [{ ...expected.remediation[0], automatedExecutionSafety: 'unsafe' }] }
  ])('rejects missing or incorrect fallback evidence: %j', (change) => {
    expect(hasExpectedAiQualificationDiagnostic({ ...valid, ...change }, expected)).toBe(false);
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
