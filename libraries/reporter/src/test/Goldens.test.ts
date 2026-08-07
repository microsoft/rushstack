// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import {
  createRushDiagnostic,
  encodeNdjsonRecord,
  NdjsonDecoder,
  negotiateReporterHello,
  REPORTER_PROTOCOL_VERSION,
  type IReporterEventEnvelope,
  type IReporterHello,
  type IReporterHelloAck,
  type IReporterProtocolVersion,
  type IRushDiagnostic
} from '../index';

// Golden schema tests freeze the serialized wire form of the protocol so that
// any accidental change is a visible, reviewable diff.
describe('protocol goldens', () => {
  const goldenEnvelope: IReporterEventEnvelope<{ commandName: string; argv: readonly string[] }> = {
    protocolVersion: { major: 1, minor: 0 },
    eventId: 'evt_0001',
    sessionId: 'sess_root',
    parentSessionId: 'sess_parent',
    parentOperationId: 'op_17',
    sequence: 5,
    sourceSequence: 2,
    timestamp: '2026-07-12T00:00:00.000Z',
    source: {
      packageName: '@microsoft/rush-lib',
      packageVersion: '5.177.2',
      component: 'PhasedScriptAction'
    },
    scope: {
      commandName: 'build',
      operationId: 'op_17',
      projectName: '@my-company/project-a',
      phaseName: '_phase:build'
    },
    privacy: 'public',
    required: true,
    type: 'commandStarted',
    payload: { commandName: 'build', argv: ['--to', '@my-company/project-a'] }
  };

  const goldenDiagnostic: IRushDiagnostic = createRushDiagnostic('RUSH_DEPENDENCY_TOOL_FAILED', {
    diagnosticId: 'diag_0001',
    parameters: {
      exitCode: { value: 1, privacy: 'public' },
      command: { value: 'pnpm install', privacy: 'public' },
      logPath: { value: '/repo/common/temp/install.log', privacy: 'local-sensitive' }
    },
    remediation: [
      {
        descriptionKey: 'remediation.reinstall',
        command: 'rush update --purge',
        documentationUrl: 'https://rushjs.io/pages/commands/rush_update/',
        automatedExecutionSafety: 'requires-confirmation'
      }
    ],
    source: { file: 'common/config/rush/pnpm-config.json', toolName: 'pnpm' },
    causeDiagnosticIds: ['diag_0000'],
    retryable: true,
    relatedArtifactIds: ['artifact_install_log']
  });

  it('freezes the event envelope schema', () => {
    expect(goldenEnvelope).toMatchSnapshot();
  });

  it('freezes the diagnostic schema', () => {
    expect(goldenDiagnostic).toMatchSnapshot();
  });

  it('freezes the handshake hello and helloAck schemas', () => {
    const hello: IReporterHello = {
      kind: 'hello',
      protocolVersion: { major: 1, minor: 0 },
      producerVersion: '@rushstack/heft 1.2.19',
      capabilities: ['color', 'watch'],
      requiredFeatures: ['ordered-sequence']
    };
    const ack: IReporterHelloAck = {
      kind: 'helloAck',
      protocolVersion: { major: 1, minor: 0 },
      acceptedCapabilities: ['color', 'watch'],
      rejectedRequiredFeatures: []
    };
    expect(hello).toMatchSnapshot('hello');
    expect(ack).toMatchSnapshot('helloAck');
  });

  it('round-trips the golden envelope and diagnostic through NDJSON without loss', () => {
    for (const value of [goldenEnvelope, goldenDiagnostic]) {
      const decoder: NdjsonDecoder = new NdjsonDecoder();
      const [decoded] = decoder.decode(encodeNdjsonRecord(value));
      expect(decoded).toEqual(JSON.parse(JSON.stringify(value)));
    }
  });
});

describe('compatibility goldens', () => {
  interface INegotiationCase {
    readonly name: string;
    readonly producer: IReporterProtocolVersion;
    readonly capabilities: string[];
    readonly requiredFeatures: string[];
  }

  const supportedCapabilities: readonly string[] = ['color', 'watch', 'ordered-sequence'];

  const cases: readonly INegotiationCase[] = [
    {
      name: 'same major and minor',
      producer: { major: 1, minor: 0 },
      capabilities: [],
      requiredFeatures: []
    },
    {
      name: 'same major, newer additive minor',
      producer: { major: 1, minor: 5 },
      capabilities: ['color'],
      requiredFeatures: []
    },
    {
      name: 'unknown optional capability is ignored',
      producer: { major: 1, minor: 0 },
      capabilities: ['color', 'future-cap'],
      requiredFeatures: []
    },
    {
      name: 'unknown required feature is rejected',
      producer: { major: 1, minor: 0 },
      capabilities: [],
      requiredFeatures: ['future-required']
    },
    {
      name: 'unsupported newer major is rejected',
      producer: { major: 2, minor: 0 },
      capabilities: [],
      requiredFeatures: []
    }
  ];

  it('freezes negotiation outcomes across supported majors and minors', () => {
    const outcomes: unknown[] = cases.map((testCase: INegotiationCase) => {
      const result = negotiateReporterHello(
        {
          kind: 'hello',
          protocolVersion: testCase.producer,
          producerVersion: 'producer 1.0.0',
          capabilities: testCase.capabilities,
          requiredFeatures: testCase.requiredFeatures
        },
        { supportedProtocolVersion: { major: 1, minor: 0 }, supportedCapabilities }
      );
      // Normalize away the non-deterministic diagnostic id.
      return {
        name: testCase.name,
        accepted: result.accepted,
        acceptedCapabilities: result.ack.acceptedCapabilities,
        rejectedRequiredFeatures: result.ack.rejectedRequiredFeatures,
        diagnosticCode: result.diagnostic?.code
      };
    });
    expect(outcomes).toMatchSnapshot();
  });

  it('retains unknown optional fields from a newer minor (additive) event', () => {
    // A newer minor may add optional fields. Decoding must preserve them so a
    // full-detail reporter can retain the complete record.
    const forwardCompatible: Record<string, unknown> = {
      ...({
        protocolVersion: { major: 1, minor: 1 },
        eventId: 'evt_future',
        sessionId: 'sess_root',
        sequence: 9,
        timestamp: '2026-07-12T00:00:00.000Z',
        source: { packageName: '@microsoft/rush-lib', packageVersion: '5.177.2' },
        privacy: 'public',
        required: false,
        type: 'activityChanged',
        payload: {}
      } satisfies IReporterEventEnvelope<Record<string, never>>),
      futureOptionalField: { detail: 'added in a later minor' }
    };

    const decoder: NdjsonDecoder = new NdjsonDecoder();
    const [decoded] = decoder.decode(encodeNdjsonRecord(forwardCompatible));
    expect(decoded).toEqual(forwardCompatible);
    expect((decoded as Record<string, unknown>).futureOptionalField).toEqual({
      detail: 'added in a later minor'
    });
  });

  it('advertises the current protocol version as the negotiation baseline', () => {
    expect(REPORTER_PROTOCOL_VERSION).toMatchSnapshot();
  });
});

describe('legacy output snapshots', () => {
  // The current Rush legacy renderer is the baseline the future legacy reporter
  // must reproduce. These representative samples are frozen so parity work has a
  // stable reference. Durations are normalized because they vary per run.
  function normalizeDurations(text: string): string {
    return text.replace(/\d+\.\d+ seconds/g, 'X.XX seconds');
  }

  const legacySuccessOutput: string = [
    'Starting "rush build"',
    '',
    'Executing a maximum of 4 simultaneous processes...',
    '',
    '==[ @my-company/project-a (build) ]================================[ 1 of 2 ]==',
    'Building project-a...',
    'project-a done.',
    '',
    '==[ @my-company/project-b (build) ]================================[ 2 of 2 ]==',
    'Building project-b...',
    'project-b done.',
    '',
    '',
    '==[ SUCCESS: 2 operations ]====================================================',
    '',
    'These operations completed successfully:',
    '  @my-company/project-a (build)    1.23 seconds',
    '  @my-company/project-b (build)    2.34 seconds',
    '',
    'rush build (3.70 seconds)'
  ].join('\n');

  const legacyFailureOutput: string = [
    'Starting "rush build"',
    '',
    '==[ @my-company/project-a (build) ]================================[ 1 of 2 ]==',
    'Building project-a...',
    'Error: Command failed with exit code 1',
    '',
    '==[ @my-company/project-b (build) ]================================[ 2 of 2 ]==',
    '"@my-company/project-b" is blocked by a failed dependency.',
    '',
    '==[ FAILURE: 1 operation ]=====================================================',
    '',
    'The following projects failed to build:',
    '  @my-company/project-a (build)    0.50 seconds',
    '',
    'rush build (0.75 seconds) ==> ERROR: Project(s) failed to build'
  ].join('\n');

  it('freezes the legacy success output', () => {
    expect(normalizeDurations(legacySuccessOutput)).toMatchSnapshot();
  });

  it('freezes the legacy failure output', () => {
    expect(normalizeDurations(legacyFailureOutput)).toMatchSnapshot();
  });
});
