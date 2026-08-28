// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import type { IReporterEventEnvelope } from '../events/IReporterEventEnvelope';
import type { ReporterPrivacyClassification } from '../events/ReporterPrivacyClassification';
import type { IAiDiagnostic, IAiFinalRecord } from '../reporters/AiReporter';
import { AiReporter } from '../reporters/AiReporter';
import { FileReporter, type IFileReporterArtifact } from '../reporters/FileReporter';
import { LegacyReporter } from '../reporters/LegacyReporter';
import { PlaintextReporter } from '../reporters/PlaintextReporter';
import {
  AI_REPORTER_QUALIFICATION_THRESHOLDS,
  evaluateAiReporterQualification,
  type IAiReporterQualificationCaseResult,
  type IAiReporterQualificationResult
} from './AiReporterQualification';

const FIXED_TIMESTAMP: string = '2026-08-28T08:45:34.000Z';
const FIXED_TIME_MS: number = Date.parse(FIXED_TIMESTAMP);
const FIXED_PID: number = 4242;
const RAW_EVIDENCE: string = `deterministic external evidence ${'x'.repeat(4096)}\n`;
const CLASSIFIED_SECRET: string = 'qualification-fake-secret-token';
const PRIVATE_PRODUCER: string = '@private/example-rush-plugin';
const PRIVATE_COMPONENT: string = 'PrivatePluginImplementation';

interface ICorpusDiagnostic {
  readonly code: string;
  readonly category: string;
  readonly summaryKey: string;
  readonly parameters: Readonly<
    Record<
      string,
      { readonly value: string | number | boolean; readonly privacy: ReporterPrivacyClassification }
    >
  >;
  readonly remediation: readonly {
    readonly descriptionKey: string;
    readonly command?: string;
    readonly documentationUrl?: string;
    readonly automatedExecutionSafety: 'safe' | 'requires-confirmation' | 'unsafe';
  }[];
  readonly privacy?: ReporterPrivacyClassification;
  readonly sourcePackage?: string;
  readonly sourceComponent?: string;
}

interface ICorpusCase {
  readonly name: string;
  readonly scenario: string;
  readonly expectedResult: 'succeeded' | 'failed';
  readonly diagnostic?: ICorpusDiagnostic;
  readonly operationStatus?: 'success' | 'failure' | 'aborted' | 'fromCache';
  readonly warningOnly?: boolean;
}

interface ICaseRun {
  readonly normalizedAiOutput: string;
  readonly normalizedPlaintextOutput: string;
  readonly normalizedLegacyOutput: string;
  readonly result: Omit<IAiReporterQualificationCaseResult, 'deterministic' | 'normalizedAiOutputSha256'>;
}

const CORPUS: readonly ICorpusCase[] = [
  {
    name: 'bootstrap-unsupported-node',
    scenario: 'Rush bootstrap rejects an unsupported Node.js version',
    expectedResult: 'failed',
    diagnostic: {
      code: 'RUSH_ENVIRONMENT_UNSUPPORTED_NODE',
      category: 'environment',
      summaryKey: 'diagnostic.RUSH_ENVIRONMENT_UNSUPPORTED_NODE.summary',
      parameters: {
        actualVersion: { value: '16.20.0', privacy: 'public' },
        expectedRange: { value: '>=20.0.0', privacy: 'public' }
      },
      remediation: [
        {
          descriptionKey: 'remediation.install-supported-node',
          documentationUrl: 'https://rushjs.io/pages/maintainer/setup_new_repo/',
          automatedExecutionSafety: 'requires-confirmation'
        }
      ]
    }
  },
  {
    name: 'configuration-invalid-json',
    scenario: 'rush.json contains invalid JSON',
    expectedResult: 'failed',
    diagnostic: {
      code: 'RUSH_CONFIG_INVALID_JSON',
      category: 'configuration',
      summaryKey: 'diagnostic.RUSH_CONFIG_INVALID_JSON.summary',
      parameters: {
        file: { value: 'rush.json', privacy: 'public' }
      },
      remediation: [
        {
          descriptionKey: 'remediation.fix-rush-json',
          command: 'node common/scripts/install-run-rush.js check',
          automatedExecutionSafety: 'safe'
        }
      ]
    }
  },
  {
    name: 'input-unknown-project',
    scenario: 'an invalid --only project is rejected',
    expectedResult: 'failed',
    diagnostic: {
      code: 'RUSH_INPUT_UNKNOWN_PROJECT',
      category: 'input',
      summaryKey: 'diagnostic.RUSH_INPUT_UNKNOWN_PROJECT.summary',
      parameters: {
        projectName: { value: '@example/missing', privacy: 'public' }
      },
      remediation: [
        {
          descriptionKey: 'remediation.list-projects',
          command: 'rush list',
          automatedExecutionSafety: 'safe'
        }
      ]
    }
  },
  {
    name: 'dependency-package-manager',
    scenario: 'pnpm install exits unsuccessfully',
    expectedResult: 'failed',
    operationStatus: 'failure',
    diagnostic: {
      code: 'RUSH_DEPENDENCY_TOOL_FAILED',
      category: 'dependency-tool',
      summaryKey: 'diagnostic.RUSH_DEPENDENCY_TOOL_FAILED.summary',
      parameters: {
        command: { value: 'pnpm install', privacy: 'public' },
        exitCode: { value: 1, privacy: 'public' },
        logPath: { value: '/private/install.log', privacy: 'local-sensitive' }
      },
      remediation: [
        {
          descriptionKey: 'remediation.rush-update-purge',
          command: 'rush update --purge',
          automatedExecutionSafety: 'requires-confirmation'
        }
      ]
    }
  },
  {
    name: 'operation-build-failure',
    scenario: 'a project build operation fails',
    expectedResult: 'failed',
    operationStatus: 'failure',
    diagnostic: {
      code: 'RUSH_OPERATION_FAILED',
      category: 'operation',
      summaryKey: 'diagnostic.RUSH_OPERATION_FAILED.summary',
      parameters: {
        projectName: { value: '@example/app', privacy: 'public' }
      },
      remediation: [
        {
          descriptionKey: 'remediation.rebuild-project',
          command: 'rush rebuild --to @example/app',
          automatedExecutionSafety: 'safe'
        }
      ]
    }
  },
  {
    name: 'cache-restore-failure',
    scenario: 'a build-cache restore is invalid and requires a local rebuild',
    expectedResult: 'failed',
    operationStatus: 'failure',
    diagnostic: {
      code: 'RUSH_OPERATION_FAILED',
      category: 'operation',
      summaryKey: 'diagnostic.RUSH_OPERATION_FAILED.summary',
      parameters: {
        cacheKey: { value: 'cache-entry-42', privacy: 'public' },
        projectName: { value: '@example/cache-consumer', privacy: 'public' }
      },
      remediation: [
        {
          descriptionKey: 'remediation.disable-build-cache',
          command: 'rush rebuild --to @example/cache-consumer --disable-build-cache',
          automatedExecutionSafety: 'safe'
        }
      ]
    }
  },
  {
    name: 'network-auth-unauthorized',
    scenario: 'the registry returns an authentication-shaped failure',
    expectedResult: 'failed',
    diagnostic: {
      code: 'RUSH_NETWORK_AUTH_UNAUTHORIZED',
      category: 'network-auth',
      summaryKey: 'diagnostic.RUSH_NETWORK_AUTH_UNAUTHORIZED.summary',
      parameters: {
        registryUrl: { value: 'https://registry.example.test/', privacy: 'public' },
        token: { value: CLASSIFIED_SECRET, privacy: 'secret' }
      },
      remediation: [
        {
          descriptionKey: 'remediation.refresh-registry-auth',
          documentationUrl: 'https://rushjs.io/pages/maintainer/npm_registry_auth/',
          automatedExecutionSafety: 'requires-confirmation'
        }
      ]
    }
  },
  {
    name: 'plugin-api-incompatible',
    scenario: 'a private plugin is incompatible with the current Rush API',
    expectedResult: 'failed',
    diagnostic: {
      code: 'RUSH_PLUGIN_API_INCOMPATIBLE',
      category: 'configuration',
      summaryKey: 'diagnostic.RUSH_PLUGIN_API_INCOMPATIBLE.summary',
      parameters: {
        pluginName: { value: PRIVATE_PRODUCER, privacy: 'secret' },
        rushVersion: { value: '5.200.0', privacy: 'public' },
        rushVersionRange: { value: '^5.100.0', privacy: 'public' }
      },
      remediation: [
        {
          descriptionKey: 'remediation.update-plugin',
          command: 'rush update',
          automatedExecutionSafety: 'requires-confirmation'
        }
      ],
      privacy: 'local-sensitive',
      sourcePackage: PRIVATE_PRODUCER,
      sourceComponent: PRIVATE_COMPONENT
    }
  },
  {
    name: 'logical-cancellation',
    scenario: 'a command is cancelled and reports an aborted operation',
    expectedResult: 'failed',
    operationStatus: 'aborted',
    diagnostic: {
      code: 'RUSH_COMMAND_FAILED',
      category: 'operation',
      summaryKey: 'diagnostic.RUSH_COMMAND_FAILED.summary',
      parameters: {
        commandName: { value: 'build', privacy: 'public' },
        reason: { value: 'cancelled', privacy: 'public' }
      },
      remediation: [
        {
          descriptionKey: 'remediation.retry-command',
          command: 'rush build',
          automatedExecutionSafety: 'safe'
        }
      ]
    }
  },
  {
    name: 'internal-unexpected-error',
    scenario: 'Rush reports an unexpected internal failure',
    expectedResult: 'failed',
    diagnostic: {
      code: 'RUSH_INTERNAL_UNEXPECTED',
      category: 'internal',
      summaryKey: 'diagnostic.RUSH_INTERNAL_UNEXPECTED.summary',
      parameters: {
        incident: { value: 'incident-42', privacy: 'public' },
        stack: { value: CLASSIFIED_SECRET, privacy: 'secret' }
      },
      remediation: [
        {
          descriptionKey: 'remediation.report-rush-bug',
          documentationUrl: 'https://github.com/microsoft/rushstack/issues/new/choose',
          automatedExecutionSafety: 'unsafe'
        }
      ]
    }
  },
  {
    name: 'success-no-warning',
    scenario: 'a successful operation emits no warnings',
    expectedResult: 'succeeded',
    operationStatus: 'success'
  },
  {
    name: 'success-warning-only',
    scenario: 'a successful command emits one bounded warning',
    expectedResult: 'succeeded',
    operationStatus: 'fromCache',
    warningOnly: true,
    diagnostic: {
      code: 'RUSH_EXTERNAL_TOOL_PROBLEM',
      category: 'operation',
      summaryKey: 'diagnostic.RUSH_EXTERNAL_TOOL_PROBLEM.summary',
      parameters: {
        code: { value: 'W42', privacy: 'public' },
        message: { value: 'deprecated option', privacy: 'public' },
        tool: { value: 'fixture-tool', privacy: 'public' }
      },
      remediation: [
        {
          descriptionKey: 'remediation.remove-deprecated-option',
          command: 'rush check',
          automatedExecutionSafety: 'safe'
        }
      ]
    }
  }
];

export function normalizeAiReporterQualificationOutput(
  text: string,
  logPath: string,
  tempRoot: string
): string {
  const replacePath = (value: string, machinePath: string, token: string): string => {
    const jsonEscapedPath: string = JSON.stringify(machinePath).slice(1, -1);
    return value.split(machinePath).join(token).split(jsonEscapedPath).join(token);
  };
  return replacePath(replacePath(text, logPath, '<ABSOLUTE_LOG_PATH>'), tempRoot, '<TEMP_ROOT>').replace(
    /\\/g,
    '/'
  );
}

function sha256(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

function parseAiOutput(output: string): {
  readonly records: readonly Record<string, unknown>[];
  readonly valid: boolean;
} {
  try {
    const records: Record<string, unknown>[] = output
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line) as Record<string, unknown>);
    return { records, valid: records.length > 0 && output.endsWith('\n') };
  } catch {
    return { records: [], valid: false };
  }
}

function createEvents(testCase: ICorpusCase, logPath: string): IReporterEventEnvelope<unknown>[] {
  const events: IReporterEventEnvelope<unknown>[] = [];
  let sequence: number = 0;
  const add = (
    type: IReporterEventEnvelope<unknown>['type'],
    payload: unknown,
    options: {
      readonly privacy?: ReporterPrivacyClassification;
      readonly sourcePackage?: string;
      readonly sourceComponent?: string;
      readonly scope?: IReporterEventEnvelope<unknown>['scope'];
    } = {}
  ): void => {
    sequence++;
    events.push({
      protocolVersion: { major: 1, minor: 1 },
      eventId: `${testCase.name}-event-${sequence}`,
      sessionId: `${testCase.name}-session`,
      sequence,
      timestamp: FIXED_TIMESTAMP,
      source: {
        packageName: options.sourcePackage ?? '@microsoft/rush-lib',
        packageVersion: '5.200.0',
        component: options.sourceComponent
      },
      scope: options.scope,
      privacy: options.privacy ?? 'public',
      required: type !== 'activityChanged',
      type,
      payload
    });
  };

  add('commandStarted', { commandName: 'build' }, { scope: { commandName: 'build' } });
  if (testCase.operationStatus) {
    add(
      'operationRegistered',
      { operationId: 'fixture#build', projectName: '@example/app', phaseName: '_phase:build' },
      {
        scope: {
          commandName: 'build',
          operationId: 'fixture#build',
          projectName: '@example/app',
          phaseName: '_phase:build'
        }
      }
    );
  }
  add(
    'externalOutput',
    { stream: 'stderr', text: RAW_EVIDENCE },
    testCase.operationStatus
      ? {
          privacy: 'local-sensitive',
          scope: {
            commandName: 'build',
            operationId: 'fixture#build',
            projectName: '@example/app',
            phaseName: '_phase:build'
          }
        }
      : { privacy: 'local-sensitive', scope: { commandName: 'build' } }
  );
  if (testCase.operationStatus) {
    add(
      'operationStatusChanged',
      { operationId: 'fixture#build', status: testCase.operationStatus, durationMs: 250 },
      { scope: { commandName: 'build', operationId: 'fixture#build', projectName: '@example/app' } }
    );
    add(
      'operationCompleted',
      { operationId: 'fixture#build', status: testCase.operationStatus, durationMs: 250 },
      { scope: { commandName: 'build', operationId: 'fixture#build', projectName: '@example/app' } }
    );
  }
  if (testCase.diagnostic) {
    const diagnosticId: string = `${testCase.name}-diagnostic`;
    add(
      'diagnosticEmitted',
      {
        diagnosticId,
        code: testCase.diagnostic.code,
        category: testCase.diagnostic.category,
        severity: testCase.warningOnly ? 'warning' : 'error',
        summaryKey: testCase.diagnostic.summaryKey,
        parameters: testCase.diagnostic.parameters,
        remediation: testCase.diagnostic.remediation,
        source: {
          kind: 'tool',
          toolName: testCase.diagnostic.sourcePackage ?? 'rush'
        }
      },
      {
        privacy: testCase.diagnostic.privacy,
        sourcePackage: testCase.diagnostic.sourcePackage,
        sourceComponent: testCase.diagnostic.sourceComponent,
        scope: { commandName: 'build' }
      }
    );
  }
  if (testCase.expectedResult === 'failed') {
    add(
      'diagnosticEmitted',
      {
        diagnosticId: `${testCase.name}-warning`,
        code: 'RUSH_EXTERNAL_TOOL_PROBLEM',
        category: 'operation',
        severity: 'warning',
        summaryKey: 'diagnostic.RUSH_EXTERNAL_TOOL_PROBLEM.summary',
        parameters: {
          tool: { value: 'fixture-tool', privacy: 'public' },
          code: { value: 'W01', privacy: 'public' },
          message: { value: 'secondary warning', privacy: 'public' }
        }
      },
      { scope: { commandName: 'build' } }
    );
  }
  add(
    'extension',
    { name: 'private.fixture.secret', payload: { token: CLASSIFIED_SECRET } },
    {
      privacy: 'secret',
      sourcePackage: PRIVATE_PRODUCER,
      sourceComponent: PRIVATE_COMPONENT,
      scope: { commandName: 'build' }
    }
  );
  add(
    'artifactAvailable',
    { artifactId: `${testCase.name}-log`, role: 'log', path: logPath, format: 'plaintext', complete: true },
    { privacy: 'local-sensitive', scope: { commandName: 'build' } }
  );
  add(
    'commandResult',
    {
      commandName: 'build',
      succeeded: testCase.expectedResult === 'succeeded',
      exitCode: testCase.expectedResult === 'succeeded' ? 0 : 1
    },
    { scope: { commandName: 'build' } }
  );
  add(
    'sessionCompleted',
    { exitCode: testCase.expectedResult === 'succeeded' ? 0 : 1 },
    { scope: { commandName: 'build' } }
  );
  return events;
}

async function runCaseAsync(
  testCase: ICorpusCase,
  caseDirectory: string,
  tempRoot: string
): Promise<ICaseRun> {
  let aiOutput: string = '';
  let plaintextOutput: string = '';
  let legacyOutput: string = '';
  const fileReporter: FileReporter = new FileReporter({
    commonTempFolder: caseDirectory,
    actionName: testCase.name,
    pid: FIXED_PID,
    nowMs: () => FIXED_TIME_MS
  });
  const aiReporter: AiReporter = new AiReporter({ write: (text: string) => (aiOutput += text) });
  const plaintextReporter: PlaintextReporter = new PlaintextReporter({
    write: (text: string) => (plaintextOutput += text),
    variant: 'detailed',
    color: false,
    nowMs: () => FIXED_TIME_MS
  });
  const legacyReporter: LegacyReporter = new LegacyReporter({
    write: (text: string) => (legacyOutput += text),
    maxParallelism: 4
  });

  await fileReporter.initializeAsync();
  const logPath: string = fileReporter.getArtifact().path!;
  const events: readonly IReporterEventEnvelope<unknown>[] = createEvents(testCase, logPath);
  for (const event of events) {
    fileReporter.report(event);
    aiReporter.report(event);
    plaintextReporter.report(event);
    legacyReporter.report(event);
  }
  await fileReporter.closeAsync();
  await aiReporter.closeAsync();
  await plaintextReporter.closeAsync();
  await legacyReporter.closeAsync();

  const normalizedAiOutput: string = normalizeAiReporterQualificationOutput(aiOutput, logPath, tempRoot);
  const normalizedPlaintextOutput: string = normalizeAiReporterQualificationOutput(
    plaintextOutput,
    logPath,
    tempRoot
  );
  const normalizedLegacyOutput: string = normalizeAiReporterQualificationOutput(
    legacyOutput,
    logPath,
    tempRoot
  );
  const parsedAi: {
    readonly records: readonly Record<string, unknown>[];
    readonly valid: boolean;
  } = parseAiOutput(aiOutput);
  const final: IAiFinalRecord | undefined = parsedAi.records.at(-1) as IAiFinalRecord | undefined;
  const diagnostic: ICorpusDiagnostic | undefined = testCase.diagnostic;
  const matchingDiagnostic: IAiDiagnostic | undefined = diagnostic
    ? final?.diagnostics.find(({ code }) => code === diagnostic.code)
    : undefined;
  const expectedContextKeys: readonly string[] = diagnostic ? Object.keys(diagnostic.parameters).sort() : [];
  const actualContextKeys: readonly string[] = Object.keys(matchingDiagnostic?.context ?? {}).sort();
  const actionable: boolean =
    testCase.expectedResult === 'succeeded'
      ? true
      : Boolean(
          final?.result === 'failed' &&
            diagnostic &&
            final.errorCodes.includes(diagnostic.code) &&
            matchingDiagnostic?.category === diagnostic.category &&
            matchingDiagnostic.summaryKey === diagnostic.summaryKey &&
            expectedContextKeys.every((key) => actualContextKeys.includes(key)) &&
            matchingDiagnostic.remediation?.some(({ command, documentationUrl }) =>
              Boolean(command || documentationUrl)
            )
        );

  const artifact: IFileReporterArtifact = fileReporter.getArtifact();
  const logExists: boolean = artifact.path !== undefined && fs.existsSync(artifact.path);
  const logContent: string = logExists ? await fs.promises.readFile(artifact.path!, 'utf8') : '';
  const ownerOnly: boolean =
    process.platform === 'win32' ||
    (logExists && (await fs.promises.stat(artifact.path!)).mode % 0o1000 === 0o600);
  const failureCorrelated: boolean =
    testCase.expectedResult === 'succeeded' ||
    Boolean(
      diagnostic &&
        logContent.includes(diagnostic.code) &&
        logContent.includes(`${testCase.name}-diagnostic`) &&
        logContent.includes(`${testCase.name}-session`)
    );
  const fullLogValid: boolean = Boolean(
    artifact.available &&
      artifact.complete &&
      artifact.path &&
      path.isAbsolute(artifact.path) &&
      logExists &&
      ownerOnly &&
      logContent.includes('"type":"commandResult"') &&
      logContent.includes(RAW_EVIDENCE.trim()) &&
      failureCorrelated
  );
  const combinedPresentedOutput: string = `${aiOutput}\n${plaintextOutput}\n${legacyOutput}\n${logContent}`;
  const privacySafe: boolean =
    !combinedPresentedOutput.includes(CLASSIFIED_SECRET) &&
    !combinedPresentedOutput.includes(PRIVATE_PRODUCER) &&
    !combinedPresentedOutput.includes(PRIVATE_COMPONENT);
  const warningContractValid: boolean =
    testCase.expectedResult === 'failed'
      ? final?.warningCount === 1 && final.diagnostics.every(({ severity }) => severity === 'error')
      : testCase.warningOnly
        ? final?.warningCount === 1 && final.diagnostics.some(({ severity }) => severity === 'warning')
        : final?.warningCount === 0;
  const failures: string[] = [];
  if (!actionable) failures.push('missing stable code/category/context/remediation');
  if (!privacySafe) failures.push('classified secret or private producer identity leaked');
  if (!fullLogValid) failures.push('full log path, permissions, completeness, or correlation invalid');
  if (!parsedAi.valid) failures.push('AI stdout was not payload-only NDJSON');
  if (!warningContractValid) failures.push('warning suppression/detail contract regressed');

  return {
    normalizedAiOutput,
    normalizedPlaintextOutput,
    normalizedLegacyOutput,
    result: {
      name: testCase.name,
      scenario: testCase.scenario,
      expectedResult: testCase.expectedResult,
      aiOutputBytes: Buffer.byteLength(normalizedAiOutput, 'utf8'),
      plaintextOutputBytes: Buffer.byteLength(normalizedPlaintextOutput, 'utf8'),
      legacyOutputBytes: Buffer.byteLength(normalizedLegacyOutput, 'utf8'),
      actionable,
      privacySafe,
      fullLogValid,
      stdoutContractValid: parsedAi.valid,
      warningContractValid,
      failures
    }
  };
}

/**
 * Runs the deterministic, network-free AI reporter qualification corpus.
 *
 * @remarks
 * External package-manager, cache, registry, plugin, cancellation, and internal
 * failures are represented by stable canonical event fixtures. Each case runs
 * through AI, detailed plaintext, legacy, and full-detail file reporters three
 * times. Machine-specific paths are normalized before hashing and are never
 * stored in the returned result.
 *
 * @beta
 */
export async function runAiReporterQualificationCorpusAsync(): Promise<IAiReporterQualificationResult> {
  const tempRoot: string = await fs.promises.mkdtemp(
    path.join(os.tmpdir(), 'rush-ai-reporter-qualification-')
  );
  try {
    const runs: ICaseRun[][] = [];
    for (
      let runIndex: number = 0;
      runIndex < AI_REPORTER_QUALIFICATION_THRESHOLDS.deterministicRunCount;
      runIndex++
    ) {
      const runDirectory: string = path.join(tempRoot, `run-${runIndex}`);
      await fs.promises.mkdir(runDirectory);
      const run: ICaseRun[] = [];
      for (const testCase of CORPUS) {
        const caseDirectory: string = path.join(runDirectory, testCase.name);
        await fs.promises.mkdir(caseDirectory);
        run.push(await runCaseAsync(testCase, caseDirectory, tempRoot));
      }
      runs.push(run);
    }

    const results: IAiReporterQualificationCaseResult[] = runs[0].map(
      (firstRun: ICaseRun, caseIndex: number) => {
        const normalizedOutputs: readonly string[] = runs.map(
          (run: readonly ICaseRun[]) => run[caseIndex].normalizedAiOutput
        );
        const deterministic: boolean = normalizedOutputs.every(
          (output: string) => output === normalizedOutputs[0]
        );
        const failures: string[] = [...firstRun.result.failures];
        if (!deterministic) {
          failures.push('normalized AI output differed across repeated runs');
        }
        return {
          ...firstRun.result,
          deterministic,
          normalizedAiOutputSha256: sha256(firstRun.normalizedAiOutput),
          failures
        };
      }
    );
    return evaluateAiReporterQualification(results);
  } finally {
    await fs.promises.rm(tempRoot, { recursive: true, force: true });
  }
}
