// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as childProcess from 'node:child_process';
import { PassThrough, type Readable } from 'node:stream';

import {
  allocateChildDescriptor,
  readChildDescriptorFd,
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
  it('allocates an inherited descriptor and communicates it by env var', () => {
    const plan: IChildDescriptorPlan = allocateChildDescriptor();
    expect(plan.fdNumber).toBe(3);
    expect(plan.env[RUSH_REPORTER_CHILD_FD_ENV_VAR]).toBe('3');
    expect(plan.stdio[3]).toBe('pipe');
    expect(plan.stdio.slice(0, 3)).toEqual(['inherit', 'pipe', 'pipe']);
  });

  it('reads or rejects the descriptor number from the environment', () => {
    expect(readChildDescriptorFd({ [RUSH_REPORTER_CHILD_FD_ENV_VAR]: '3' })).toBe(3);
    expect(readChildDescriptorFd({})).toBeUndefined();
    expect(readChildDescriptorFd({ [RUSH_REPORTER_CHILD_FD_ENV_VAR]: 'abc' })).toBeUndefined();
    expect(readChildDescriptorFd({ [RUSH_REPORTER_CHILD_FD_ENV_VAR]: '3abc' })).toBeUndefined();
    expect(readChildDescriptorFd({ [RUSH_REPORTER_CHILD_FD_ENV_VAR]: '2' })).toBeUndefined();
  });

  it('rejects descriptor numbers that would replace standard streams', () => {
    expect(() => allocateChildDescriptor(2)).toThrow(/greater than or equal to 3/);
  });
});

describe('HeftChildEmitter', () => {
  it('emits structured NDJSON when the descriptor is present', () => {
    let descriptor: string = '';
    const env: Record<string, string | undefined> = { [RUSH_REPORTER_CHILD_FD_ENV_VAR]: '3' };
    const emitter: HeftChildEmitter = new HeftChildEmitter({
      env,
      childSessionId: 'child-sess',
      source: SOURCE,
      producerVersion: '@rushstack/heft 1.2.19',
      now: () => '2026-01-01T00:00:00.000Z',
      writeDescriptor: (text: string) => (descriptor += text)
    });
    expect(emitter.mode).toBe('structured');
    expect(env[RUSH_REPORTER_CHILD_FD_ENV_VAR]).toBeUndefined();
    expect(emitter.sendHello()).toBe(true);
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

  it('drains a spawned child descriptor before the child exits and exceeds pipe capacity', async () => {
    const manager: ReporterManager = new ReporterManager();
    const recording: RecordingReporter = new RecordingReporter();
    manager.addReporter(recording);
    await manager.initializeAsync();

    let childExited: boolean = false;
    let forwardedBeforeExit: boolean = false;
    const host: HeftDescriptorHost = new HeftDescriptorHost({
      parentSessionId: 'parent-sess',
      supportedProtocolVersion: { major: 1, minor: 0 },
      forwardEnvelope: (envelope: IReporterEventEnvelope<unknown>) => {
        forwardedBeforeExit ||= !childExited;
        manager.ingestForeignEnvelope(envelope);
      }
    });
    const processor = host.createStreamProcessor();
    const plan: IChildDescriptorPlan = allocateChildDescriptor();
    const eventCount: number = 2_000;
    const script: string = `
      const fs = require('node:fs');
      const fd = Number(process.env.${RUSH_REPORTER_CHILD_FD_ENV_VAR});
      const source = ${JSON.stringify(SOURCE)};
      fs.writeSync(fd, JSON.stringify({
        kind: 'hello',
        protocolVersion: { major: 1, minor: 0 },
        producerVersion: '@rushstack/heft 1.2.19',
        capabilities: [],
        requiredFeatures: []
      }) + '\\n');
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
        capabilities: [],
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
        capabilities: [],
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
