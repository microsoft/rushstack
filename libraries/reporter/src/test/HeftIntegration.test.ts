// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import {
  allocateChildDescriptor,
  readChildDescriptorFd,
  RUSH_REPORTER_CHILD_FD_ENV_VAR,
  HeftChildEmitter,
  HeftDescriptorHost,
  ReporterManager,
  runProblemMatchers,
  type IChildDescriptorPlan,
  type IHeftChildResult,
  type IProblemMatch,
  type IProblemMatcher,
  type IReporter,
  type IReporterEventEnvelope,
  type IReporterEventSource
} from '../index';

const SOURCE: IReporterEventSource = { packageName: '@rushstack/heft', packageVersion: '1.2.19' };

class RecordingReporter implements IReporter {
  public readonly name: string = 'recording';
  public readonly reported: IReporterEventEnvelope<unknown>[] = [];
  public async initializeAsync(): Promise<void> {
    /* no-op */
  }
  public report(event: IReporterEventEnvelope<unknown>): void {
    this.reported.push(event);
  }
  public async flushAsync(): Promise<void> {
    /* no-op */
  }
  public async closeAsync(): Promise<void> {
    /* no-op */
  }
}

const TSC_MATCHER: IProblemMatcher = {
  name: 'tsc-error',
  tool: 'tsc',
  severity: 'error',
  enabledByDefault: true,
  pattern: /^(.+)\((\d+),(\d+)\): error (TS\d+): (.+)$/,
  extract(match: RegExpMatchArray): IProblemMatch {
    return {
      file: match[1],
      line: Number(match[2]),
      column: Number(match[3]),
      code: match[4],
      message: match[5]
    };
  }
};

describe('Heft descriptor allocation', () => {
  it('allocates an inherited descriptor and communicates it by env var', () => {
    const plan: IChildDescriptorPlan = allocateChildDescriptor();
    expect(plan.fdNumber).toBe(3);
    expect(plan.env[RUSH_REPORTER_CHILD_FD_ENV_VAR]).toBe('3');
    expect(plan.stdio[3]).toBe('pipe');
    expect(plan.stdio.slice(0, 3)).toEqual(['inherit', 'inherit', 'inherit']);
  });

  it('reads or rejects the descriptor number from the environment', () => {
    expect(readChildDescriptorFd({ [RUSH_REPORTER_CHILD_FD_ENV_VAR]: '3' })).toBe(3);
    expect(readChildDescriptorFd({})).toBeUndefined();
    expect(readChildDescriptorFd({ [RUSH_REPORTER_CHILD_FD_ENV_VAR]: 'abc' })).toBeUndefined();
  });
});

describe('HeftChildEmitter', () => {
  it('emits structured NDJSON when the descriptor is present', () => {
    let descriptor: string = '';
    const emitter: HeftChildEmitter = new HeftChildEmitter({
      env: { [RUSH_REPORTER_CHILD_FD_ENV_VAR]: '3' },
      childSessionId: 'child-sess',
      source: SOURCE,
      producerVersion: '@rushstack/heft 1.2.19',
      now: () => '2026-01-01T00:00:00.000Z',
      writeDescriptor: (text: string) => (descriptor += text)
    });
    expect(emitter.mode).toBe('structured');
    expect(emitter.sendHello()).toBe(true);
    const eventId: string | undefined = emitter.emitEvent({
      type: 'commandStarted',
      required: true,
      payload: {}
    });
    expect(eventId).toBe('child_1');

    const records: Record<string, unknown>[] = descriptor
      .trim()
      .split('\n')
      .map((line: string) => JSON.parse(line) as Record<string, unknown>);
    expect(records[0].kind).toBe('hello');
    expect(records[1].sessionId).toBe('child-sess');
    expect(records[1].type).toBe('commandStarted');
  });

  it('falls back to raw streams when descriptor negotiation is unavailable', () => {
    let stdout: string = '';
    const emitter: HeftChildEmitter = new HeftChildEmitter({
      env: {},
      childSessionId: 'child-sess',
      source: SOURCE,
      producerVersion: '@rushstack/heft 1.2.19',
      writeStdout: (text: string) => (stdout += text)
    });
    expect(emitter.mode).toBe('raw-fallback');
    expect(emitter.sendHello()).toBe(false);
    expect(emitter.emitEvent({ type: 'commandStarted', required: true })).toBeUndefined();
    emitter.writeRaw('stdout', 'raw heft log\n');
    expect(stdout).toBe('raw heft log\n');
  });
});

describe('HeftDescriptorHost new descriptor path', () => {
  it('negotiates the hello and correlates forwarded child events', async () => {
    // Child produces a structured stream.
    let descriptor: string = '';
    const child: HeftChildEmitter = new HeftChildEmitter({
      env: { [RUSH_REPORTER_CHILD_FD_ENV_VAR]: '3' },
      childSessionId: 'child-sess',
      source: SOURCE,
      producerVersion: '@rushstack/heft 1.2.19',
      now: () => '2026-01-01T00:00:00.000Z',
      writeDescriptor: (text: string) => (descriptor += text)
    });
    child.sendHello();
    child.emitEvent({
      type: 'operationStatusChanged',
      required: true,
      payload: { operationId: 'c1', status: 'success' }
    });

    // Parent host forwards into a manager.
    const manager: ReporterManager = new ReporterManager();
    const recording: RecordingReporter = new RecordingReporter();
    manager.addReporter(recording);
    await manager.initializeAsync();

    const host: HeftDescriptorHost = new HeftDescriptorHost({
      parentSessionId: 'parent-sess',
      parentOperationId: 'op-42',
      supportedProtocolVersion: { major: 1, minor: 0 },
      forwardEnvelope: (envelope: IReporterEventEnvelope<unknown>) => manager.ingestForeignEnvelope(envelope)
    });
    const result: IHeftChildResult = host.processChildNdjson(descriptor);
    await manager.flushAsync();

    expect(result.accepted).toBe(true);
    expect(result.eventCount).toBe(1);

    const forwarded: IReporterEventEnvelope<unknown> = recording.reported[0];
    expect(forwarded.sessionId).toBe('child-sess');
    expect(forwarded.parentSessionId).toBe('parent-sess');
    expect(forwarded.parentOperationId).toBe('op-42');
    // ingestForeignEnvelope assigns a new global sequence and preserves the child's.
    expect(forwarded.sourceSequence).toBe(1);
  });

  it('rejects an unsupported child protocol with an update-global-Rush diagnostic', () => {
    let descriptor: string = '';
    const child: HeftChildEmitter = new HeftChildEmitter({
      env: { [RUSH_REPORTER_CHILD_FD_ENV_VAR]: '3' },
      childSessionId: 'child-sess',
      source: SOURCE,
      producerVersion: '@rushstack/heft 2.0.0',
      protocolVersion: { major: 2, minor: 0 },
      writeDescriptor: (text: string) => (descriptor += text)
    });
    child.sendHello();

    const host: HeftDescriptorHost = new HeftDescriptorHost({
      parentSessionId: 'parent-sess',
      supportedProtocolVersion: { major: 1, minor: 0 },
      forwardEnvelope: () => undefined
    });
    const result: IHeftChildResult = host.processChildNdjson(descriptor);
    expect(result.accepted).toBe(false);
    expect(result.diagnostic?.code).toBe('RUSH_PROTOCOL_UPDATE_REQUIRED');
  });
});

describe('Heft old raw-stream path', () => {
  it('recovers diagnostics from an old Heft version through problem matchers', () => {
    // Old Heft writes raw output to stdout; Rush captures it as external output.
    let stdout: string = '';
    const child: HeftChildEmitter = new HeftChildEmitter({
      env: {},
      childSessionId: 'child-sess',
      source: SOURCE,
      producerVersion: '@rushstack/heft 0.60.0',
      writeStdout: (text: string) => (stdout += text)
    });
    expect(child.mode).toBe('raw-fallback');
    child.writeRaw('stdout', 'src/legacy.ts(3,7): error TS2551: old heft problem\n');

    const capturedEvents: IReporterEventEnvelope<unknown>[] = [
      {
        type: 'externalOutput',
        scope: { operationId: 'heft-op' },
        payload: { stream: 'stdout', text: stdout }
      } as unknown as IReporterEventEnvelope<unknown>
    ];
    const diagnostics = runProblemMatchers(capturedEvents, [TSC_MATCHER]).diagnostics;
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0].parameters?.code.value).toBe('TS2551');
  });
});
