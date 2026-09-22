// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { detectAgent } from '../config/AgentDetection';
import { isLegacyEmergencyFallbackRequested } from '../reporters/LegacyReporter';
import { REPORTER_PERFORMANCE_BUDGETS } from '../perf/PerformanceBudgets';

/**
 * The version of the machine-readable AI reporter qualification result.
 *
 * @beta
 */
export const AI_REPORTER_QUALIFICATION_SCHEMA_VERSION: '1.0' = '1.0';

/**
 * The blocking thresholds for the deterministic AI reporter corpus.
 *
 * @beta
 */
export interface IAiReporterQualificationThresholds {
  readonly minimumFailureCases: number;
  readonly minimumControlCases: number;
  readonly minimumActionableFailurePercent: number;
  readonly maximumOutputBytesPerCase: number;
  readonly maximumCompactCaseAiOutputBytes: number;
  readonly minimumComparableBaselineBytes: number;
  readonly maximumPerCaseAiToBaselinePercent: number;
  readonly maximumAggregateAiToLegacyPercent: number;
  readonly maximumAggregateAiToPlaintextPercent: number;
  readonly deterministicRunCount: number;
  readonly minimumPrivacyPassPercent: number;
  readonly minimumFullLogPassPercent: number;
  readonly minimumStdoutContractPassPercent: number;
  readonly minimumWarningContractPassPercent: number;
}

/**
 * The frozen qualification thresholds used by CI.
 *
 * @beta
 */
export const AI_REPORTER_QUALIFICATION_THRESHOLDS: IAiReporterQualificationThresholds = {
  minimumFailureCases: 10,
  minimumControlCases: 2,
  minimumActionableFailurePercent: 100,
  maximumOutputBytesPerCase: REPORTER_PERFORMANCE_BUDGETS.maxAiOutputBytes,
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
};

/**
 * A safe, path-free measurement for one deterministic corpus case.
 *
 * @beta
 */
export interface IAiReporterQualificationCaseResult {
  readonly name: string;
  readonly scenario: string;
  readonly expectedResult: 'succeeded' | 'failed';
  readonly aiOutputBytes: number;
  readonly plaintextOutputBytes: number;
  readonly legacyOutputBytes: number;
  readonly normalizedAiOutputSha256: string;
  readonly actionable: boolean;
  readonly deterministic: boolean;
  readonly privacySafe: boolean;
  readonly fullLogValid: boolean;
  readonly stdoutContractValid: boolean;
  readonly warningContractValid: boolean;
  readonly failures: readonly string[];
}

/**
 * The result of one blocking qualification gate.
 *
 * @beta
 */
export interface IAiReporterQualificationGateResult {
  readonly id: string;
  readonly passed: boolean;
  readonly actual: number;
  readonly threshold: string;
  readonly failedCases: readonly string[];
}

/**
 * The complete machine-readable AI reporter qualification result.
 *
 * @beta
 */
export interface IAiReporterQualificationResult {
  readonly schemaVersion: typeof AI_REPORTER_QUALIFICATION_SCHEMA_VERSION;
  readonly passed: boolean;
  readonly thresholds: IAiReporterQualificationThresholds;
  readonly cases: readonly IAiReporterQualificationCaseResult[];
  readonly gates: readonly IAiReporterQualificationGateResult[];
}

function percent(passing: number, total: number): number {
  return total === 0 ? 0 : (passing / total) * 100;
}

function ratioPercent(numerator: number, denominator: number): number {
  return denominator === 0
    ? numerator === 0
      ? 0
      : Number.MAX_SAFE_INTEGER
    : (numerator / denominator) * 100;
}

function getHighestRatioCaseNames(
  cases: readonly IAiReporterQualificationCaseResult[],
  getDenominator: (testCase: IAiReporterQualificationCaseResult) => number
): string[] {
  return [...cases]
    .sort(
      (left, right) =>
        ratioPercent(right.aiOutputBytes, getDenominator(right)) -
        ratioPercent(left.aiOutputBytes, getDenominator(left))
    )
    .slice(0, 3)
    .map(({ name }) => name);
}

function createPerCaseRatioGate(
  id: string,
  cases: readonly IAiReporterQualificationCaseResult[],
  getDenominator: (testCase: IAiReporterQualificationCaseResult) => number,
  minimumComparableBaselineBytes: number,
  maximumPercent: number
): IAiReporterQualificationGateResult {
  const comparableCases: readonly IAiReporterQualificationCaseResult[] = cases.filter(
    (testCase) => getDenominator(testCase) >= minimumComparableBaselineBytes
  );
  const failedCases: string[] = comparableCases
    .filter((testCase) => ratioPercent(testCase.aiOutputBytes, getDenominator(testCase)) > maximumPercent)
    .map(({ name }) => name);
  return {
    id,
    passed: failedCases.length === 0,
    actual: Math.max(
      0,
      ...comparableCases.map((testCase) => ratioPercent(testCase.aiOutputBytes, getDenominator(testCase)))
    ),
    threshold: `<= ${maximumPercent}% when baseline >= ${minimumComparableBaselineBytes} bytes`,
    failedCases
  };
}

function createPercentageGate(
  id: string,
  cases: readonly IAiReporterQualificationCaseResult[],
  predicate: (testCase: IAiReporterQualificationCaseResult) => boolean,
  minimumPercent: number
): IAiReporterQualificationGateResult {
  const failedCases: string[] = cases.filter((testCase) => !predicate(testCase)).map(({ name }) => name);
  return {
    id,
    passed: percent(cases.length - failedCases.length, cases.length) >= minimumPercent,
    actual: percent(cases.length - failedCases.length, cases.length),
    threshold: `>= ${minimumPercent}%`,
    failedCases
  };
}

/**
 * Evaluates safe corpus measurements against the frozen blocking thresholds.
 *
 * @beta
 */
export function evaluateAiReporterQualification(
  cases: readonly IAiReporterQualificationCaseResult[],
  thresholds: IAiReporterQualificationThresholds = AI_REPORTER_QUALIFICATION_THRESHOLDS
): IAiReporterQualificationResult {
  const failureCases: readonly IAiReporterQualificationCaseResult[] = cases.filter(
    ({ expectedResult }) => expectedResult === 'failed'
  );
  const controlCases: readonly IAiReporterQualificationCaseResult[] = cases.filter(
    ({ expectedResult }) => expectedResult === 'succeeded'
  );
  const totalAiBytes: number = cases.reduce((sum, testCase) => sum + testCase.aiOutputBytes, 0);
  const totalLegacyBytes: number = cases.reduce((sum, testCase) => sum + testCase.legacyOutputBytes, 0);
  const totalPlaintextBytes: number = cases.reduce((sum, testCase) => sum + testCase.plaintextOutputBytes, 0);
  const aggregateAiToLegacyPercent: number = ratioPercent(totalAiBytes, totalLegacyBytes);
  const aggregateAiToPlaintextPercent: number = ratioPercent(totalAiBytes, totalPlaintextBytes);

  const gates: IAiReporterQualificationGateResult[] = [
    {
      id: 'corpus.failure-cases',
      passed: failureCases.length >= thresholds.minimumFailureCases,
      actual: failureCases.length,
      threshold: `>= ${thresholds.minimumFailureCases}`,
      failedCases: []
    },
    {
      id: 'corpus.control-cases',
      passed: controlCases.length >= thresholds.minimumControlCases,
      actual: controlCases.length,
      threshold: `>= ${thresholds.minimumControlCases}`,
      failedCases: []
    },
    createPercentageGate(
      'actionability',
      failureCases,
      ({ actionable }) => actionable,
      thresholds.minimumActionableFailurePercent
    ),
    {
      id: 'size.absolute',
      passed: cases.every(({ aiOutputBytes }) => aiOutputBytes <= thresholds.maximumOutputBytesPerCase),
      actual: Math.max(0, ...cases.map(({ aiOutputBytes }) => aiOutputBytes)),
      threshold: `<= ${thresholds.maximumOutputBytesPerCase} bytes`,
      failedCases: cases
        .filter(({ aiOutputBytes }) => aiOutputBytes > thresholds.maximumOutputBytesPerCase)
        .map(({ name }) => name)
    },
    {
      id: 'size.compact-case',
      passed: cases.every(
        ({ aiOutputBytes, legacyOutputBytes, plaintextOutputBytes }) =>
          Math.max(legacyOutputBytes, plaintextOutputBytes) >= thresholds.minimumComparableBaselineBytes ||
          aiOutputBytes <= thresholds.maximumCompactCaseAiOutputBytes
      ),
      actual: Math.max(
        0,
        ...cases
          .filter(
            ({ legacyOutputBytes, plaintextOutputBytes }) =>
              Math.max(legacyOutputBytes, plaintextOutputBytes) < thresholds.minimumComparableBaselineBytes
          )
          .map(({ aiOutputBytes }) => aiOutputBytes)
      ),
      threshold:
        `<= ${thresholds.maximumCompactCaseAiOutputBytes} bytes when both baselines are below ` +
        `${thresholds.minimumComparableBaselineBytes} bytes`,
      failedCases: cases
        .filter(
          ({ aiOutputBytes, legacyOutputBytes, plaintextOutputBytes }) =>
            Math.max(legacyOutputBytes, plaintextOutputBytes) < thresholds.minimumComparableBaselineBytes &&
            aiOutputBytes > thresholds.maximumCompactCaseAiOutputBytes
        )
        .map(({ name }) => name)
    },
    createPerCaseRatioGate(
      'size.per-case-vs-legacy',
      cases,
      ({ legacyOutputBytes }) => legacyOutputBytes,
      thresholds.minimumComparableBaselineBytes,
      thresholds.maximumPerCaseAiToBaselinePercent
    ),
    createPerCaseRatioGate(
      'size.per-case-vs-plaintext',
      cases,
      ({ plaintextOutputBytes }) => plaintextOutputBytes,
      thresholds.minimumComparableBaselineBytes,
      thresholds.maximumPerCaseAiToBaselinePercent
    ),
    {
      id: 'size.vs-legacy',
      passed: aggregateAiToLegacyPercent <= thresholds.maximumAggregateAiToLegacyPercent,
      actual: aggregateAiToLegacyPercent,
      threshold: `<= ${thresholds.maximumAggregateAiToLegacyPercent}%`,
      failedCases:
        aggregateAiToLegacyPercent <= thresholds.maximumAggregateAiToLegacyPercent
          ? []
          : getHighestRatioCaseNames(cases, ({ legacyOutputBytes }) => legacyOutputBytes)
    },
    {
      id: 'size.vs-plaintext',
      passed: aggregateAiToPlaintextPercent <= thresholds.maximumAggregateAiToPlaintextPercent,
      actual: aggregateAiToPlaintextPercent,
      threshold: `<= ${thresholds.maximumAggregateAiToPlaintextPercent}%`,
      failedCases:
        aggregateAiToPlaintextPercent <= thresholds.maximumAggregateAiToPlaintextPercent
          ? []
          : getHighestRatioCaseNames(cases, ({ plaintextOutputBytes }) => plaintextOutputBytes)
    },
    createPercentageGate('determinism', cases, ({ deterministic }) => deterministic, 100),
    createPercentageGate(
      'privacy',
      cases,
      ({ privacySafe }) => privacySafe,
      thresholds.minimumPrivacyPassPercent
    ),
    createPercentageGate(
      'full-log',
      cases,
      ({ fullLogValid }) => fullLogValid,
      thresholds.minimumFullLogPassPercent
    ),
    createPercentageGate(
      'stdout-contract',
      cases,
      ({ stdoutContractValid }) => stdoutContractValid,
      thresholds.minimumStdoutContractPassPercent
    ),
    createPercentageGate(
      'warning-contract',
      cases,
      ({ warningContractValid }) => warningContractValid,
      thresholds.minimumWarningContractPassPercent
    )
  ];

  return {
    schemaVersion: AI_REPORTER_QUALIFICATION_SCHEMA_VERSION,
    passed: gates.every(({ passed }) => passed),
    thresholds,
    cases,
    gates
  };
}

/**
 * Formats failed gates with actionable case names for CI output.
 *
 * @beta
 */
export function formatAiReporterQualificationFailures(result: IAiReporterQualificationResult): string {
  return result.gates
    .filter(({ passed }) => !passed)
    .map(
      ({ id, actual, threshold, failedCases }) =>
        `${id}: actual=${Number.isFinite(actual) ? actual.toFixed(2) : String(actual)}, ` +
        `required=${threshold}` +
        (failedCases.length > 0 ? `; cases=${failedCases.join(', ')}` : '')
    )
    .join('\n');
}

/**
 * The isolated decision produced for a future automatic-selection integration.
 *
 * @beta
 */
export interface IQualifiedAiReporterDecision {
  readonly agentDetected: boolean;
  readonly eligible: boolean;
  readonly reporter?: 'ai';
  readonly reason:
    | 'RUSH_REPORTER=legacy'
    | 'agent not detected'
    | 'qualification unavailable'
    | 'qualification failed'
    | 'privacy prerequisite unavailable'
    | 'qualified';
}

/**
 * Resolves whether an agent environment is eligible for a future AI reporter selection.
 *
 * @remarks
 * This helper does not alter reporter selection by itself. The pre-major Rush
 * frontend remains opt-in-only until rollout integration explicitly consumes a
 * passing result.
 *
 * @beta
 */
export function getQualifiedAiReporterDecision(
  env: Record<string, string | undefined>,
  configuredAgentEnvironmentVariables: readonly string[],
  qualification: IAiReporterQualificationResult | undefined,
  privacyPrerequisiteAccepted: boolean = false
): IQualifiedAiReporterDecision {
  const agentDetected: boolean = detectAgent(env, configuredAgentEnvironmentVariables);
  if (isLegacyEmergencyFallbackRequested(env)) {
    return { agentDetected, eligible: false, reason: 'RUSH_REPORTER=legacy' };
  }
  if (!agentDetected) {
    return { agentDetected: false, eligible: false, reason: 'agent not detected' };
  }
  if (!qualification) {
    return { agentDetected: true, eligible: false, reason: 'qualification unavailable' };
  }
  if (!qualification.passed) {
    return { agentDetected: true, eligible: false, reason: 'qualification failed' };
  }
  if (!privacyPrerequisiteAccepted) {
    return { agentDetected: true, eligible: false, reason: 'privacy prerequisite unavailable' };
  }
  return { agentDetected: true, eligible: true, reporter: 'ai', reason: 'qualified' };
}
