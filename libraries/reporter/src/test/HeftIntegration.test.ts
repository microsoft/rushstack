// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as childProcess from 'node:child_process';
import { PassThrough, type Readable, type Writable } from 'node:stream';

import {
  allocateChildDescriptor,
  encodeNdjsonRecord,
  readChildAckDescriptorFd,
  readChildDescriptorFd,
  REPORTER_PROTOCOL_LIMITS,
  RUSH_REPORTER_CHILD_ACK_FD_ENV_VAR,
  RUSH_REPORTER_CHILD_FD_ENV_VAR,
  HeftChildEmitter,
  HeftDescriptorHost,
  relayHeftChildOutput,
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
  it('allocates inherited event and acknowledgement descriptors', () => {
    const plan: IChildDescriptorPlan = allocateChildDescriptor();
    expect(plan.fdNumber).toBe(3);
    expect(plan.ackFdNumber).toBe(4);
    expect(plan.env[RUSH_REPORTER_CHILD_FD_ENV_VAR]).toBe('3');
    expect(plan.env[RUSH_REPORTER_CHILD_ACK_FD_ENV_VAR]).toBe('4');
    expect(plan.stdio[3]).toBe('pipe');
    expect(plan.stdio[4]).toBe('pipe');
    expect(plan.stdio.slice(0, 3)).toEqual(['inherit', 'pipe', 'pipe']);
  });

  it('reads or rejects descriptor numbers from the environment', () => {
    expect(readChildDescriptorFd({ [RUSH_REPORTER_CHILD_FD_ENV_VAR]: '3' })).toBe(3);
    expect(readChildAckDescriptorFd({ [RUSH_REPORTER_CHILD_ACK_FD_ENV_VAR]: '4' })).toBe(4);
    expect(readChildDescriptorFd({})).toBeUndefined();
    expect(readChildAckDescriptorFd({})).toBeUndefined();
    expect(readChildDescriptorFd({ [RUSH_REPORTER_CHILD_FD_ENV_VAR]: 'abc' })).toBeUndefined();
    expect(readChildAckDescriptorFd({ [RUSH_REPORTER_CHILD_ACK_FD_ENV_VAR]: '4abc' })).toBeUndefined();
    expect(readChildDescriptorFd({ [RUSH_REPORTER_CHILD_FD_ENV_VAR]: '3abc' })).toBeUndefined();
    expect(readChildDescriptorFd({ [RUSH_REPORTER_CHILD_FD_ENV_VAR]: '2' })).toBeUndefined();
  });

  it('rejects descriptor numbers that would replace standard streams', () => {
    expect(() => allocateChildDescriptor(2)).toThrow(/greater than or equal to 3/);
    expect(() => allocateChildDescriptor(3, 2)).toThrow(/greater than or equal to 3/);
    expect(() => allocateChildDescriptor(3, 3)).toThrow(/must be different/);
  });
});

describe('HeftChildEmitter', () => {
  it('emits structured NDJSON only after a compatible acknowledgement', () => {
    let descriptor: string = '';
    const env: Record<string, string | undefined> = {
      [RUSH_REPORTER_CHILD_FD_ENV_VAR]: '3',
      [RUSH_REPORTER_CHILD_ACK_FD_ENV_VAR]: '4'
    };
    const emitter: HeftChildEmitter = new HeftChildEmitter({
      env,
      childSessionId: 'child-sess',
      source: SOURCE,
      producerVersion: '@rushstack/heft 1.2.19',
      now: () => '2026-01-01T00:00:00.000Z',
      writeDescriptor: (text: string) => (descriptor += text)
    });
    expect(emitter.mode).toBe('negotiation-pending');
    expect(env[RUSH_REPORTER_CHILD_FD_ENV_VAR]).toBeUndefined();
    expect(env[RUSH_REPORTER_CHILD_ACK_FD_ENV_VAR]).toBeUndefined();
    expect(emitter.sendHello()).toBe(true);
    expect(emitter.emitEvent({ type: 'commandStarted', payload: {} })).toBeUndefined();
    expect(
      emitter.acceptHelloAck({
        kind: 'helloAck',
        protocolVersion: { major: 1, minor: 0 },
        acceptedCapabilities: ['heft-child-events-v1', 'reporter-context-v1'],
        rejectedRequiredFeatures: [],
        context: {
          reporter: 'plaintext',
          logLevel: 'verbose',
          color: false,
          terminalWidth: 100
        }
      })
    ).toBe(true);
    expect(emitter.mode).toBe('structured');
    expect(emitter.context).toEqual({
      reporter: 'plaintext',
      logLevel: 'verbose',
      color: false,
      terminalWidth: 100
    });
    const eventId: string | undefined = emitter.emitEvent({
      type: 'commandStarted',
      payload: {}
    });
    emitter.emitEvent({ type: 'activityChanged', payload: {} });
    expect(eventId).toBe('child_1');

    const records: Record<string, unknown>[] = descriptor
      .trim()
      .split('\n')
      .map((line: string) => JSON.parse(line) as Record<string, unknown>);
    expect(records[0].kind).toBe('hello');
    expect(records[1].sessionId).toBe('child-sess');
    expect(records[1].type).toBe('commandStarted');
    expect(records[1].required).toBe(true);
    expect(records[2].required).toBe(false);
  });

  it('falls back for unsupported, malformed, or missing acknowledgements', () => {
    const makeEmitter = (): HeftChildEmitter => {
      const emitter: HeftChildEmitter = new HeftChildEmitter({
        env: {
          [RUSH_REPORTER_CHILD_FD_ENV_VAR]: '3',
          [RUSH_REPORTER_CHILD_ACK_FD_ENV_VAR]: '4'
        },
        childSessionId: 'child-sess',
        source: SOURCE,
        producerVersion: '@rushstack/heft 1.2.19',
        writeDescriptor: () => undefined
      });
      emitter.sendHello();
      return emitter;
    };

    const unsupported: HeftChildEmitter = makeEmitter();
    expect(
      unsupported.acceptHelloAck({
        kind: 'helloAck',
        protocolVersion: { major: 1, minor: 0 },
        acceptedCapabilities: [],
        rejectedRequiredFeatures: []
      })
    ).toBe(false);
    expect(unsupported.mode).toBe('raw-fallback');

    const malformed: HeftChildEmitter = makeEmitter();
    expect(malformed.acceptHelloAck({ kind: 'helloAck' })).toBe(false);
    expect(malformed.mode).toBe('raw-fallback');

    const missing: HeftChildEmitter = makeEmitter();
    missing.handleAckDescriptorClose();
    expect(missing.mode).toBe('raw-fallback');
  });

  it('chunks UTF-8 output into local-sensitive external output events', () => {
    let descriptor: string = '';
    const emitter: HeftChildEmitter = new HeftChildEmitter({
      env: {
        [RUSH_REPORTER_CHILD_FD_ENV_VAR]: '3',
        [RUSH_REPORTER_CHILD_ACK_FD_ENV_VAR]: '4'
      },
      childSessionId: 'child-sess',
      source: SOURCE,
      producerVersion: '@rushstack/heft 1.2.19',
      writeDescriptor: (text: string) => (descriptor += text)
    });
    emitter.sendHello();
    emitter.acceptHelloAck({
      kind: 'helloAck',
      protocolVersion: { major: 1, minor: 0 },
      acceptedCapabilities: ['heft-child-events-v1'],
      rejectedRequiredFeatures: []
    });
    const text: string = '😀'.repeat(Math.floor(REPORTER_PROTOCOL_LIMITS.externalOutputChunkBytes / 4) + 1);
    const eventIds: readonly string[] = emitter.emitOutput('stderr', text, {
      operationId: 'op-1'
    });
    const records: Record<string, unknown>[] = descriptor
      .trim()
      .split('\n')
      .map((line: string) => JSON.parse(line) as Record<string, unknown>);
    const outputRecords: Record<string, unknown>[] = records.slice(1);

    expect(eventIds).toHaveLength(2);
    expect(outputRecords.map((record) => (record.payload as { text: string }).text).join('')).toBe(text);
    expect(
      outputRecords.every(
        (record) =>
          record.type === 'externalOutput' &&
          record.privacy === 'local-sensitive' &&
          (record.scope as { operationId: string }).operationId === 'op-1' &&
          Buffer.byteLength((record.payload as { text: string }).text, 'utf8') <=
            REPORTER_PROTOCOL_LIMITS.externalOutputChunkBytes
      )
    ).toBe(true);
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
    expect(emitter.emitEvent({ type: 'commandStarted' })).toBeUndefined();
    emitter.writeRaw('stdout', 'raw heft log\n');
    expect(stdout).toBe('raw heft log\n');
  });
});

describe('HeftDescriptorHost new descriptor path', () => {
  it('negotiates the hello and correlates forwarded child events', async () => {
    let descriptor: string = '';
    const child: HeftChildEmitter = new HeftChildEmitter({
      env: {
        [RUSH_REPORTER_CHILD_FD_ENV_VAR]: '3',
        [RUSH_REPORTER_CHILD_ACK_FD_ENV_VAR]: '4'
      },
      childSessionId: 'child-sess',
      source: SOURCE,
      producerVersion: '@rushstack/heft 1.2.19',
      now: () => '2026-01-01T00:00:00.000Z',
      writeDescriptor: (text: string) => (descriptor += text)
    });

    const manager: ReporterManager = new ReporterManager();
    const recording: RecordingReporter = new RecordingReporter();
    manager.addReporter(recording);
    await manager.initializeAsync();

    const host: HeftDescriptorHost = new HeftDescriptorHost({
      parentSessionId: 'parent-sess',
      parentRequestId: 'parent-request',
      parentOperationId: 'op-42',
      supportedProtocolVersion: { major: 1, minor: 0 },
      context: {
        reporter: 'plaintext',
        logLevel: 'normal',
        color: false,
        terminalWidth: 120
      },
      forwardEnvelope: (envelope: IReporterEventEnvelope<unknown>) => manager.ingestForeignEnvelope(envelope),
      sendHelloAck: (ack) => child.acceptHelloAck(ack)
    });

    child.sendHello();
    host.processChildNdjson(descriptor);
    descriptor = '';
    expect(child.mode).toBe('structured');
    expect(child.context?.terminalWidth).toBe(120);
    child.emitEvent({
      type: 'operationStatusChanged',
      privacy: 'local-sensitive',
      payload: { operationId: 'c1', status: 'success' }
    });
    child.emitEvent({
      type: 'activityChanged',
      payload: { operationId: 'c1' }
    });
    const result: IHeftChildResult = host.processChildNdjson(descriptor);
    await manager.flushAsync();

    expect(result.accepted).toBe(true);
    expect(result.eventCount).toBe(2);

    const forwarded: IReporterEventEnvelope<unknown> = recording.reported[0];
    expect(forwarded.sessionId).toBe('child-sess');
    expect(forwarded.parentSessionId).toBe('parent-sess');
    expect(forwarded.parentRequestId).toBe('parent-request');
    expect(forwarded.parentOperationId).toBe('op-42');
    expect(forwarded.sourceSequence).toBe(1);
    expect(forwarded.privacy).toBe('local-sensitive');
    expect(recording.reported[1].sourceSequence).toBe(2);
    expect(recording.reported[1].sequence).toBeGreaterThan(recording.reported[0].sequence);
  });

  it('drains a spawned child descriptor before the child exits and exceeds pipe capacity', async () => {
    const manager: ReporterManager = new ReporterManager();
    const recording: RecordingReporter = new RecordingReporter();
    manager.addReporter(recording);
    await manager.initializeAsync();

    let childExited: boolean = false;
    let forwardedBeforeExit: boolean = false;
    const plan: IChildDescriptorPlan = allocateChildDescriptor();
    const eventCount: number = 2_000;
    const script: string = `
      const fs = require('node:fs');
      const fd = Number(process.env.${RUSH_REPORTER_CHILD_FD_ENV_VAR});
      const ackFd = Number(process.env.${RUSH_REPORTER_CHILD_ACK_FD_ENV_VAR});
      const source = ${JSON.stringify(SOURCE)};
      fs.writeSync(fd, JSON.stringify({
        kind: 'hello',
        protocolVersion: { major: 1, minor: 0 },
        producerVersion: '@rushstack/heft 1.2.19',
        capabilities: ['heft-child-events-v1'],
        requiredFeatures: []
      }) + '\\n');
      const ack = JSON.parse(fs.readFileSync(ackFd, 'utf8').trim());
      if (!ack.acceptedCapabilities.includes('heft-child-events-v1')) {
        process.exit(2);
      }
      for (let i = 0; i < ${eventCount}; i++) {
        fs.writeSync(fd, JSON.stringify({
          protocolVersion: { major: 1, minor: 0 },
          eventId: 'child_' + i,
          sessionId: 'child-sess',
          sequence: i + 1,
          timestamp: '2026-01-01T00:00:00.000Z',
          source,
          privacy: 'public',
          required: true,
          type: 'operationStatusChanged',
          payload: { operationId: 'operation-' + i, status: 'success', padding: 'x'.repeat(128) }
        }) + '\\n');
      }
    `;
    const spawned: childProcess.ChildProcess = childProcess.spawn(process.execPath, ['-e', script], {
      env: { ...process.env, ...plan.env },
      stdio: plan.stdio as childProcess.StdioOptions
    });
    const acknowledgementDescriptor: Writable = spawned.stdio[plan.ackFdNumber] as Writable;
    const host: HeftDescriptorHost = new HeftDescriptorHost({
      parentSessionId: 'parent-sess',
      supportedProtocolVersion: { major: 1, minor: 0 },
      forwardEnvelope: (envelope: IReporterEventEnvelope<unknown>) => {
        forwardedBeforeExit ||= !childExited;
        manager.ingestForeignEnvelope(envelope);
      },
      sendHelloAck: (ack) => acknowledgementDescriptor.end(encodeNdjsonRecord(ack))
    });
    const processor = host.createStreamProcessor();
    const descriptor: Readable = spawned.stdio[plan.fdNumber] as Readable;
    descriptor.setEncoding('utf8');
    descriptor.on('data', (chunk: string) => processor.write(chunk));
    await new Promise<void>((resolve, reject) => {
      spawned.once('error', reject);
      spawned.once('exit', (code: number | null) => {
        childExited = true;
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`Spawned Heft fixture exited with code ${code}.`));
        }
      });
    });
    const result: IHeftChildResult = processor.flush();
    await manager.flushAsync();

    expect(result.accepted).toBe(true);
    expect(result.eventCount).toBe(eventCount);
    expect(recording.reported).toHaveLength(eventCount);
    expect(forwardedBeforeExit).toBe(true);
    expect(recording.reported[0].sessionId).toBe('child-sess');
  });

  it('rejects an unsupported child protocol with an update-global-Rush diagnostic', () => {
    let descriptor: string = '';
    const child: HeftChildEmitter = new HeftChildEmitter({
      env: {
        [RUSH_REPORTER_CHILD_FD_ENV_VAR]: '3',
        [RUSH_REPORTER_CHILD_ACK_FD_ENV_VAR]: '4'
      },
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

  it('lets a 1.0 consumer skip an unknown optional 1.1 event and continue the stream', () => {
    const forwarded: IReporterEventEnvelope<unknown>[] = [];
    const host: HeftDescriptorHost = new HeftDescriptorHost({
      parentSessionId: 'parent-sess',
      supportedProtocolVersion: { major: 1, minor: 0 },
      forwardEnvelope: (envelope: IReporterEventEnvelope<unknown>) => forwarded.push(envelope)
    });

    expect(
      host.processChildRecord({
        kind: 'hello',
        protocolVersion: { major: 1, minor: 1 },
        producerVersion: '@rushstack/heft 1.2.19',
        capabilities: [],
        requiredFeatures: []
      })
    ).toBe(true);
    expect(
      host.processChildRecord({
        protocolVersion: { major: 1, minor: 1 },
        eventId: 'future_optional',
        sessionId: 'child-sess',
        sequence: 1,
        timestamp: '2026-01-01T00:00:00.000Z',
        source: SOURCE,
        privacy: 'public',
        required: false,
        type: 'futureMinorEvent',
        payload: {}
      })
    ).toBe(true);
    expect(
      host.processChildRecord({
        protocolVersion: { major: 1, minor: 1 },
        eventId: 'known_after_future',
        sessionId: 'child-sess',
        sequence: 2,
        timestamp: '2026-01-01T00:00:00.001Z',
        source: SOURCE,
        privacy: 'public',
        required: true,
        type: 'commandCompleted',
        payload: { commandName: 'build', exitCode: 0 }
      })
    ).toBe(true);

    const result: IHeftChildResult = host.processChildRecords([]);
    expect(result).toMatchObject({ accepted: true, eventCount: 1 });
    expect(forwarded.map(({ eventId }) => eventId)).toEqual(['known_after_future']);
  });

  it('rejects malformed records without throwing from the streaming drain', () => {
    const negotiationResults: boolean[] = [];
    const host: HeftDescriptorHost = new HeftDescriptorHost({
      parentSessionId: 'parent-sess',
      supportedProtocolVersion: { major: 1, minor: 0 },
      forwardEnvelope: () => {
        throw new Error('Malformed records must not be forwarded.');
      },
      onNegotiation: (result) => negotiationResults.push(result.accepted)
    });
    const processor = host.createStreamProcessor();

    expect(() => processor.write('not json\n')).not.toThrow();
    expect(() => processor.write('null\n')).not.toThrow();
    const result: IHeftChildResult = processor.flush();

    expect(result.accepted).toBe(false);
    expect(result.eventCount).toBe(0);
    expect(result.diagnostic?.code).toBe('RUSH_PROTOCOL_INVALID_CHILD_STREAM');
    expect(negotiationResults).toEqual([false]);
  });

  it.each([
    ['malformed', 'not-json\n'],
    ['truncated', '{"eventId":'],
    ['oversized', `${'x'.repeat(REPORTER_PROTOCOL_LIMITS.ndjsonRecordBytes + 1)}\n`]
  ])('forwards a valid prefix before rejecting a %s record', (kind: string, suffix: string) => {
    expect(kind.length).toBeGreaterThan(0);
    const forwarded: IReporterEventEnvelope<unknown>[] = [];
    const host: HeftDescriptorHost = new HeftDescriptorHost({
      parentSessionId: 'parent-sess',
      supportedProtocolVersion: { major: 1, minor: 0 },
      forwardEnvelope: (envelope: IReporterEventEnvelope<unknown>) => forwarded.push(envelope)
    });
    const hello: string = encodeNdjsonRecord({
      kind: 'hello',
      protocolVersion: { major: 1, minor: 0 },
      producerVersion: '@rushstack/heft 1.2.19',
      capabilities: ['heft-child-events-v1'],
      requiredFeatures: []
    });
    const event: string = encodeNdjsonRecord({
      protocolVersion: { major: 1, minor: 0 },
      eventId: 'child_1',
      sessionId: 'child-sess',
      sequence: 1,
      timestamp: '2026-01-01T00:00:00.000Z',
      source: SOURCE,
      privacy: 'local-sensitive',
      required: true,
      type: 'externalOutput',
      payload: { stream: 'stdout', text: 'valid\n' }
    });
    const processor = host.createStreamProcessor();

    processor.write(hello + event + suffix);
    const result: IHeftChildResult = processor.flush();

    expect(forwarded).toHaveLength(1);
    expect(forwarded[0].eventId).toBe('child_1');
    expect(result.eventCount).toBe(1);
    expect(result.accepted).toBe(false);
    expect(result.diagnostic?.code).toBe('RUSH_PROTOCOL_INVALID_CHILD_STREAM');
  });

  it('rejects an incomplete hello instead of dereferencing missing fields', () => {
    const host: HeftDescriptorHost = new HeftDescriptorHost({
      parentSessionId: 'parent-sess',
      supportedProtocolVersion: { major: 1, minor: 0 },
      forwardEnvelope: () => undefined
    });

    expect(() => host.processChildRecord({ kind: 'hello' })).not.toThrow();
    const result: IHeftChildResult = host.processChildRecords([]);
    expect(result.accepted).toBe(false);
    expect(result.diagnostic?.code).toBe('RUSH_PROTOCOL_INVALID_CHILD_STREAM');
  });

  it('rejects malformed envelopes and derives required at the host boundary', () => {
    const forwarded: IReporterEventEnvelope<unknown>[] = [];
    const host: HeftDescriptorHost = new HeftDescriptorHost({
      parentSessionId: 'parent-sess',
      supportedProtocolVersion: { major: 1, minor: 0 },
      forwardEnvelope: (envelope: IReporterEventEnvelope<unknown>) => forwarded.push(envelope)
    });

    expect(
      host.processChildRecord({
        kind: 'hello',
        protocolVersion: { major: 1, minor: 0 },
        producerVersion: '@rushstack/heft 1.2.19',
        capabilities: ['heft-child-events-v1'],
        requiredFeatures: []
      })
    ).toBe(true);
    expect(
      host.processChildRecord({
        protocolVersion: { major: 1, minor: 0 },
        eventId: 'child_1',
        sessionId: 'child-sess',
        sequence: 1,
        timestamp: '2026-01-01T00:00:00.000Z',
        source: SOURCE,
        privacy: 'public',
        required: true,
        type: 'activityChanged',
        payload: {}
      })
    ).toBe(true);
    expect(forwarded[0].required).toBe(false);

    expect(host.processChildRecord(null)).toBe(false);
    const result: IHeftChildResult = host.processChildRecords([]);
    expect(result.accepted).toBe(false);
    expect(result.eventCount).toBe(1);
    expect(result.diagnostic?.code).toBe('RUSH_PROTOCOL_INVALID_CHILD_STREAM');
  });

  it('rejects event envelopes whose protocol major differs from the accepted hello', () => {
    const host: HeftDescriptorHost = new HeftDescriptorHost({
      parentSessionId: 'parent-sess',
      supportedProtocolVersion: { major: 1, minor: 0 },
      forwardEnvelope: () => {
        throw new Error('A mismatched protocol envelope must not be forwarded.');
      }
    });
    expect(
      host.processChildRecord({
        kind: 'hello',
        protocolVersion: { major: 1, minor: 0 },
        producerVersion: '@rushstack/heft 1.2.19',
        capabilities: ['heft-child-events-v1'],
        requiredFeatures: []
      })
    ).toBe(true);
    expect(
      host.processChildRecord({
        protocolVersion: { major: 2, minor: 0 },
        eventId: 'child_1',
        sessionId: 'child-sess',
        sequence: 1,
        timestamp: '2026-01-01T00:00:00.000Z',
        source: SOURCE,
        privacy: 'public',
        required: true,
        type: 'commandStarted',
        payload: {}
      })
    ).toBe(false);
    expect(host.processChildRecords([]).diagnostic?.code).toBe('RUSH_PROTOCOL_INVALID_CHILD_STREAM');
  });

  it('drops unknown optional events and rejects unknown required events or invalid privacy', () => {
    const host: HeftDescriptorHost = new HeftDescriptorHost({
      parentSessionId: 'parent-sess',
      supportedProtocolVersion: { major: 1, minor: 0 },
      forwardEnvelope: () => {
        throw new Error('Unknown events must not be forwarded.');
      }
    });
    expect(
      host.processChildRecord({
        kind: 'hello',
        protocolVersion: { major: 1, minor: 0 },
        producerVersion: '@rushstack/heft 1.2.19',
        capabilities: ['heft-child-events-v1'],
        requiredFeatures: []
      })
    ).toBe(true);
    const unknownEvent = {
      protocolVersion: { major: 1, minor: 0 },
      eventId: 'child_1',
      sessionId: 'child-sess',
      sequence: 1,
      timestamp: '2026-01-01T00:00:00.000Z',
      source: SOURCE,
      privacy: 'public',
      type: 'futureEvent',
      payload: {}
    };
    expect(host.processChildRecord({ ...unknownEvent, required: false })).toBe(true);
    expect(host.processChildRecord({ ...unknownEvent, eventId: 'child_2', required: true })).toBe(false);

    const invalidPrivacyHost: HeftDescriptorHost = new HeftDescriptorHost({
      parentSessionId: 'parent-sess',
      supportedProtocolVersion: { major: 1, minor: 0 },
      forwardEnvelope: () => {
        throw new Error('Invalid privacy must not be forwarded.');
      }
    });
    invalidPrivacyHost.processChildRecord({
      kind: 'hello',
      protocolVersion: { major: 1, minor: 0 },
      producerVersion: '@rushstack/heft 1.2.19',
      capabilities: ['heft-child-events-v1'],
      requiredFeatures: []
    });
    expect(
      invalidPrivacyHost.processChildRecord({
        ...unknownEvent,
        type: 'commandStarted',
        required: true,
        privacy: 'private'
      })
    ).toBe(false);
  });
});

describe('Heft old raw-stream path', () => {
  it('pipes and relays fallback stdout and stderr while retaining the reporter descriptor', async () => {
    const plan: IChildDescriptorPlan = allocateChildDescriptor();
    const spawned: childProcess.ChildProcess = childProcess.spawn(
      process.execPath,
      ['-e', "process.stdout.write('old stdout'); process.stderr.write('old stderr');"],
      {
        env: { ...process.env, ...plan.env },
        stdio: plan.stdio as childProcess.StdioOptions
      }
    );
    const stdout: PassThrough = new PassThrough();
    const stderr: PassThrough = new PassThrough();
    let stdoutText: string = '';
    let stderrText: string = '';
    stdout.setEncoding('utf8').on('data', (chunk: string) => (stdoutText += chunk));
    stderr.setEncoding('utf8').on('data', (chunk: string) => (stderrText += chunk));
    relayHeftChildOutput({ stdout: spawned.stdout, stderr: spawned.stderr }, { stdout, stderr });

    await new Promise<void>((resolve, reject) => {
      spawned.once('error', reject);
      spawned.once('exit', (code: number | null) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`Spawned old-Heft fixture exited with code ${code}.`));
        }
      });
    });

    expect(stdoutText).toBe('old stdout');
    expect(stderrText).toBe('old stderr');
    expect(spawned.stdio[plan.fdNumber]).not.toBeNull();
    expect(spawned.stdio[plan.ackFdNumber]).not.toBeNull();
  });

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
