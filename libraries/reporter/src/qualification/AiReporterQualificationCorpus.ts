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
import { JsonReporter } from '../reporters/JsonReporter';
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
const CLASSIFIED_SECRET: string = 'qualification-fake-secret-token';
const CLASSIFIED_SECRET_PRODUCER: string = '@secret/qualification-fixture';
const CLASSIFIED_SECRET_COMPONENT: string = 'SecretQualificationFixture';
const PRIVATE_PRODUCER: string = '@private/example-rush-plugin';
const PRIVATE_COMPONENT: string = 'PrivatePluginImplementation';
const LOCAL_SENSITIVE_FALLBACK_MESSAGE: string = 'qualification-local-sensitive-fallback-message';
const OVERSIZED_LOCAL_SENSITIVE_VALUE: string = 'qualification-oversized-local-sensitive-value';
const OVERSIZED_LOCAL_SENSITIVE_PRODUCER: string = '@private/oversized-qualification-fixture';
const OVERSIZED_LOCAL_SENSITIVE_COMPONENT: string = 'OversizedPrivateQualificationFixture';
const OVERSIZED_LOCAL_SENSITIVE_SCOPE: string = '@private/oversized-qualification-project';

function createExternalOutput(lines: readonly string[], repetitions: number): string {
  const output: string[] = [];
  for (let index: number = 0; index < repetitions; index++) {
    output.push(lines[index % lines.length].split('{index}').join(String(index + 1)));
  }
  return `${output.join('\n')}\n`;
}

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
  readonly externalOutput?: string;
  readonly fallbackMessages?: readonly {
    readonly text: string;
    readonly privacy: ReporterPrivacyClassification;
  }[];
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
    externalOutput: createExternalOutput(
      [
        'ERR_PNPM_FETCH_401 GET https://registry.example.test/@example/pkg: Unauthorized - 401',
        'Progress: resolved {index}, reused 0, downloaded 0, added 0',
        'The authorization header was rejected while resolving @example/pkg.'
      ],
      60
    ),
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
    externalOutput: createExternalOutput(
      [
        'src/example-{index}.ts(12,7): error TS2322: Type string is not assignable to type number.',
        'Found 1 error in src/example-{index}.ts',
        'Project @example/app failed during the _phase:build operation.'
      ],
      66
    ),
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
    externalOutput: createExternalOutput(
      [
        'Build cache entry cache-entry-42 failed integrity validation for @example/cache-consumer.',
        'Expected archive member lib/index.js but the restored file was missing.',
        'Discarding invalid cache entry and requiring a local rebuild ({index}).'
      ],
      30
    ),
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
    externalOutput: createExternalOutput(
      [
        'GET https://registry.example.test/@example/private returned 401 Unauthorized.',
        'The registry challenge did not include credentials; refresh the configured authentication.',
        'Request attempt {index} failed without exposing an authorization value.'
      ],
      24
    ),
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
    externalOutput: createExternalOutput(
      [
        'Loading the configured Rush plugin from the repository plugin manifest.',
        'Validating plugin API compatibility before invoking plugin hooks ({index}).',
        'Plugin activation stopped because the declared Rush version range is incompatible.'
      ],
      15
    ),
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
    externalOutput: createExternalOutput(
      [
        'Building @example/app: completed work item {index}.',
        'Cancellation requested; waiting for the active child process to stop.',
        'The _phase:build operation exited before producing final outputs.'
      ],
      24
    ),
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
    externalOutput: createExternalOutput(
      [
        'Unexpected internal failure while finalizing the command graph.',
        'Diagnostic incident incident-42 was recorded for correlation.',
        'See the owner-only full-detail log for stack frame {index}.'
      ],
      30
    ),
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
    name: 'fallback-mixed-privacy',
    scenario: 'legacy parser errors include public and local-sensitive fallback messages',
    expectedResult: 'failed',
    fallbackMessages: [
      {
        text: 'The requested command could not be parsed.',
        privacy: 'public'
      },
      {
        text: LOCAL_SENSITIVE_FALLBACK_MESSAGE,
        privacy: 'local-sensitive'
      }
    ]
  },
  {
    name: 'success-no-warning',
    scenario: 'a successful operation emits no warnings',
    expectedResult: 'succeeded',
    externalOutput: createExternalOutput(
      [
        'Building @example/app source file {index}.',
        'Emitted lib/example-{index}.js and lib/example-{index}.d.ts.',
        'Completed incremental compilation work item {index}.'
      ],
      42
    ),
    operationStatus: 'success'
  },
  {
    name: 'success-warning-only',
    scenario: 'a successful command emits one bounded warning',
    expectedResult: 'succeeded',
    externalOutput: createExternalOutput(
      [
        'Restored @example/app output group {index} from the local build cache.',
        'Validated cached output metadata for work item {index}.',
        'The deprecated option warning is represented by a structured diagnostic.'
      ],
      24
    ),
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
  if (testCase.externalOutput !== undefined) {
    add(
      'externalOutput',
      { stream: 'stderr', text: testCase.externalOutput },
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
  }
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
  for (const message of testCase.fallbackMessages ?? []) {
    add(
      'messageEmitted',
      {
        severity: 'error',
        text: message.text
      },
      {
        privacy: message.privacy,
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
    {
      name: 'qualification.oversized-local-sensitive',
      payload: OVERSIZED_LOCAL_SENSITIVE_VALUE.repeat(128)
    },
    {
      privacy: 'local-sensitive',
      sourcePackage: OVERSIZED_LOCAL_SENSITIVE_PRODUCER,
      sourceComponent: OVERSIZED_LOCAL_SENSITIVE_COMPONENT,
      scope: {
        commandName: 'build',
        operationId: 'oversized-local-sensitive-operation',
        projectName: OVERSIZED_LOCAL_SENSITIVE_SCOPE
      }
    }
  );
  add(
    'extension',
    { name: 'private.fixture.secret', payload: { token: CLASSIFIED_SECRET } },
    {
      privacy: 'secret',
      sourcePackage: CLASSIFIED_SECRET_PRODUCER,
      sourceComponent: CLASSIFIED_SECRET_COMPONENT,
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
  let jsonOutput: string = '';
  let plaintextOutput: string = '';
  let legacyOutput: string = '';
  const fileReporter: FileReporter = new FileReporter({
    commonTempFolder: caseDirectory,
    actionName: testCase.name,
    pid: FIXED_PID,
    nowMs: () => FIXED_TIME_MS
  });
  const aiReporter: AiReporter = new AiReporter({ write: (text: string) => (aiOutput += text) });
  const jsonReporter: JsonReporter = new JsonReporter({
    write: (text: string) => (jsonOutput += text),
    maxRecordBytes: 1024
  });
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
    jsonReporter.report(event);
    plaintextReporter.report(event);
    legacyReporter.report(event);
  }
  await fileReporter.closeAsync();
  await aiReporter.closeAsync();
  await jsonReporter.closeAsync();
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
  const parsedJson: {
    readonly records: readonly Record<string, unknown>[];
    readonly valid: boolean;
  } = parseAiOutput(jsonOutput);
  const final: IAiFinalRecord | undefined = parsedAi.records.at(-1) as IAiFinalRecord | undefined;
  const diagnostic: ICorpusDiagnostic | undefined = testCase.diagnostic;
  const matchingDiagnostic: IAiDiagnostic | undefined = diagnostic
    ? final?.diagnostics.find(({ code }) => code === diagnostic.code)
    : undefined;
  const expectedContextKeys: readonly string[] = diagnostic ? Object.keys(diagnostic.parameters).sort() : [];
  const actualContextKeys: readonly string[] = Object.keys(matchingDiagnostic?.context ?? {}).sort();
  const contextValuesMatch: boolean = diagnostic
    ? Object.entries(diagnostic.parameters).every(([name, parameter]) => {
        const expectedValue: string | number | boolean =
          parameter.privacy === 'public' ? parameter.value : `[${parameter.privacy}]`;
        return matchingDiagnostic?.context?.[name] === expectedValue;
      })
    : true;
  const fallbackMessages: readonly {
    readonly text: string;
    readonly privacy: ReporterPrivacyClassification;
  }[] = testCase.fallbackMessages ?? [];
  const publicFallbackMessages: readonly string[] = fallbackMessages
    .filter(({ privacy }) => privacy === 'public')
    .map(({ text }) => text);
  const actionable: boolean =
    testCase.expectedResult === 'succeeded'
      ? true
      : diagnostic
        ? Boolean(
            final?.result === 'failed' &&
              final.errorCodes.includes(diagnostic.code) &&
              matchingDiagnostic?.category === diagnostic.category &&
              matchingDiagnostic.summaryKey === diagnostic.summaryKey &&
              expectedContextKeys.every((key) => actualContextKeys.includes(key)) &&
              contextValuesMatch &&
              matchingDiagnostic.remediation?.some(({ command, documentationUrl }) =>
                Boolean(command || documentationUrl)
              )
          )
        : Boolean(
            fallbackMessages.length > 0 &&
              final?.result === 'failed' &&
              final.errorCodes.includes('RUSH_COMMAND_FAILED') &&
              final.errorCount === fallbackMessages.length &&
              final.diagnosticCategoryCounts.command === fallbackMessages.length &&
              final.diagnostics.length === publicFallbackMessages.length &&
              final.diagnostics.every(
                ({ category, severity, summary }, index) =>
                  category === 'command' && severity === 'error' && summary === publicFallbackMessages[index]
              ) &&
              final.truncated
          );

  const artifact: IFileReporterArtifact = fileReporter.getArtifact();
  const aiLogPath: string | undefined = final?.log?.path;
  const logExists: boolean = aiLogPath !== undefined && fs.existsSync(aiLogPath);
  const logContent: string =
    logExists && aiLogPath !== undefined ? await fs.promises.readFile(aiLogPath, 'utf8') : '';
  const ownerOnly: boolean =
    process.platform === 'win32' ||
    (logExists && aiLogPath !== undefined && (await fs.promises.stat(aiLogPath)).mode % 0o1000 === 0o600);
  const failureCorrelated: boolean =
    testCase.expectedResult === 'succeeded' ||
    (diagnostic
      ? logContent.includes(diagnostic.code) &&
        logContent.includes(`${testCase.name}-diagnostic`) &&
        logContent.includes(`${testCase.name}-session`)
      : fallbackMessages.length > 0 &&
        fallbackMessages.every(({ text }) => logContent.includes(text)) &&
        logContent.includes(`${testCase.name}-session`));
  const localSensitiveProducerPreserved: boolean =
    diagnostic?.sourcePackage === undefined ||
    (logContent.includes(diagnostic.sourcePackage) &&
      (diagnostic.sourceComponent === undefined || logContent.includes(diagnostic.sourceComponent)));
  const fullLogValid: boolean = Boolean(
    final?.log &&
      final.log.path === artifact.path &&
      final.log.format === 'plaintext' &&
      final.log.complete === artifact.complete &&
      artifact.available &&
      artifact.complete &&
      aiLogPath &&
      path.isAbsolute(aiLogPath) &&
      logExists &&
      ownerOnly &&
      logContent.includes('"type":"commandStarted"') &&
      logContent.includes('"type":"commandResult"') &&
      logContent.includes('"type":"sessionCompleted"') &&
      (testCase.externalOutput === undefined || logContent.includes(testCase.externalOutput.trim())) &&
      failureCorrelated &&
      localSensitiveProducerPreserved &&
      logContent.includes(OVERSIZED_LOCAL_SENSITIVE_VALUE) &&
      logContent.includes(OVERSIZED_LOCAL_SENSITIVE_PRODUCER) &&
      logContent.includes(OVERSIZED_LOCAL_SENSITIVE_COMPONENT) &&
      logContent.includes(OVERSIZED_LOCAL_SENSITIVE_SCOPE)
  );
  const oversizedMarker: Record<string, unknown> | undefined = parsedJson.records.find(
    ({ payload }) =>
      (
        payload as
          | { readonly name?: string; readonly payload?: { readonly originalType?: string } }
          | undefined
      )?.name === 'rush.reporter.record-too-large' &&
      (payload as { readonly payload?: { readonly originalType?: string } }).payload?.originalType ===
        'extension'
  );
  const oversizedMarkerValid: boolean =
    oversizedMarker?.privacy === 'local-sensitive' &&
    oversizedMarker.scope === undefined &&
    (oversizedMarker.source as { readonly packageName?: string; readonly packageVersion?: string })
      ?.packageName === '[private-producer]' &&
    (oversizedMarker.source as { readonly packageName?: string; readonly packageVersion?: string })
      ?.packageVersion === '[private-version]';
  const machinePresentedOutput: string = `${aiOutput}\n${jsonOutput}`;
  const humanPresentedOutput: string = `${plaintextOutput}\n${legacyOutput}`;
  const allLocalOutput: string = `${machinePresentedOutput}\n${humanPresentedOutput}\n${logContent}`;
  const privacySafe: boolean =
    !allLocalOutput.includes(CLASSIFIED_SECRET) &&
    !allLocalOutput.includes(CLASSIFIED_SECRET_PRODUCER) &&
    !allLocalOutput.includes(CLASSIFIED_SECRET_COMPONENT) &&
    !machinePresentedOutput.includes(LOCAL_SENSITIVE_FALLBACK_MESSAGE) &&
    !machinePresentedOutput.includes(OVERSIZED_LOCAL_SENSITIVE_VALUE) &&
    !machinePresentedOutput.includes(OVERSIZED_LOCAL_SENSITIVE_PRODUCER) &&
    !machinePresentedOutput.includes(OVERSIZED_LOCAL_SENSITIVE_COMPONENT) &&
    !machinePresentedOutput.includes(OVERSIZED_LOCAL_SENSITIVE_SCOPE) &&
    !aiOutput.includes(PRIVATE_PRODUCER) &&
    !aiOutput.includes(PRIVATE_COMPONENT) &&
    !humanPresentedOutput.includes(PRIVATE_PRODUCER) &&
    !humanPresentedOutput.includes(PRIVATE_COMPONENT);
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
  if (!parsedAi.valid || !parsedJson.valid || !oversizedMarkerValid) {
    failures.push('machine stdout or oversized-record marker contract regressed');
  }
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
      stdoutContractValid: parsedAi.valid && parsedJson.valid && oversizedMarkerValid,
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
