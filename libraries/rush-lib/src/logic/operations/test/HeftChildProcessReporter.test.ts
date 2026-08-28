// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as childProcess from 'node:child_process';

import type { IReporterEventEnvelope, IRushDiagnostic } from '@rushstack/rush-reporter';
import { StringBufferTerminalProvider } from '@rushstack/terminal';

import { HeftChildProcessReporter } from '../HeftChildProcessReporter';

const CONTEXT = {
  reporter: 'json',
  logLevel: 'debug',
  color: false,
  terminalWidth: 120
} as const;

// eslint-disable-next-line @rushstack/no-new-null -- ChildProcess.close uses null for signal exits.
function waitForCloseAsync(child: childProcess.ChildProcess): Promise<number | null> {
  return new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('close', resolve);
  });
}

describe(HeftChildProcessReporter.name, () => {
  it('negotiates structured child events and parent context', async () => {
    const envelopes: IReporterEventEnvelope<unknown>[] = [];
    let structuredNegotiated: boolean = false;
    const reporter: HeftChildProcessReporter = new HeftChildProcessReporter({
      parentSessionId: 'parent-session',
      parentRequestId: 'parent-request',
      parentOperationId: 'project#build',
      context: CONTEXT,
      ingestForeignEnvelope: (envelope) => {
        envelopes.push(envelope);
        return envelope.eventId;
      },
      onDiagnostic: () => {
        throw new Error('A compatible child must not emit a protocol diagnostic.');
      },
      onStructuredNegotiated: () => {
        structuredNegotiated = true;
      }
    });
    const script: string = `
      const fs = require('node:fs');
      const eventFd = Number(process.env._RUSH_REPORTER_CHILD_FD);
      const ackFd = Number(process.env._RUSH_REPORTER_CHILD_ACK_FD);
      fs.writeSync(eventFd, JSON.stringify({
        kind: 'hello',
        protocolVersion: { major: 1, minor: 2 },
        producerVersion: '@rushstack/heft 1.2.25',
        capabilities: ['heft-child-events-v1', 'reporter-context-v1'],
        requiredFeatures: []
      }) + '\\n');
      const ack = JSON.parse(fs.readFileSync(ackFd, 'utf8').trim());
      if (ack.context.reporter !== 'json' || ack.context.terminalWidth !== 120) process.exit(3);
      for (let sequence = 1; sequence <= 2; sequence++) {
        fs.writeSync(eventFd, JSON.stringify({
          protocolVersion: { major: 1, minor: 2 },
          eventId: 'child_' + sequence,
          sessionId: 'child-session',
          sequence,
          timestamp: '2026-01-01T00:00:00.000Z',
          source: { packageName: '@rushstack/heft', packageVersion: '1.2.25' },
          privacy: 'local-sensitive',
          required: false,
          type: 'externalOutput',
          payload: { stream: sequence === 1 ? 'stdout' : 'stderr', text: String(sequence) }
        }) + '\\n');
      }
    `;
    const child: childProcess.ChildProcess = childProcess.spawn(process.execPath, ['-e', script], {
      env: { ...process.env, ...reporter.environment },
      stdio: reporter.stdio
    });
    const structuredOutputTerminalProvider: StringBufferTerminalProvider = new StringBufferTerminalProvider();

    const [exitCode]: [number | null, void] = await Promise.all([
      waitForCloseAsync(child),
      reporter.attachAsync(child, structuredOutputTerminalProvider)
    ]);

    expect(exitCode).toBe(0);
    expect(structuredNegotiated).toBe(true);
    expect(reporter.hasWarningOrError).toBe(true);
    expect(envelopes.map((envelope) => envelope.sequence)).toEqual([1, 2]);
    expect(envelopes.map((envelope) => envelope.parentSessionId)).toEqual([
      'parent-session',
      'parent-session'
    ]);
    expect(envelopes.map((envelope) => envelope.parentRequestId)).toEqual([
      'parent-request',
      'parent-request'
    ]);
    expect(envelopes.map((envelope) => envelope.parentOperationId)).toEqual([
      'project#build',
      'project#build'
    ]);
    expect(envelopes.map((envelope) => envelope.scope?.operationId)).toEqual([
      'project#build',
      'project#build'
    ]);
    expect(structuredOutputTerminalProvider.getOutput()).toBe('1');
    expect(structuredOutputTerminalProvider.getErrorOutput()).toBe('2');
  });

  it('preserves old child stdout and stderr when no hello is sent', async () => {
    const diagnostics: IRushDiagnostic[] = [];
    const reporter: HeftChildProcessReporter = new HeftChildProcessReporter({
      parentSessionId: 'parent-session',
      parentRequestId: 'parent-request',
      parentOperationId: 'project#build',
      context: CONTEXT,
      ingestForeignEnvelope: (envelope) => envelope.eventId,
      onDiagnostic: (diagnostic) => diagnostics.push(diagnostic),
      onStructuredNegotiated: () => {
        throw new Error('An old child must remain on raw fallback.');
      }
    });
    const child: childProcess.ChildProcess = childProcess.spawn(
      process.execPath,
      ['-e', "process.stdout.write('old stdout'); process.stderr.write('old stderr');"],
      {
        env: { ...process.env, ...reporter.environment },
        stdio: reporter.stdio
      }
    );
    let stdout: string = '';
    let stderr: string = '';
    child.stdout?.setEncoding('utf8').on('data', (chunk: string) => {
      stdout += chunk;
    });
    child.stderr?.setEncoding('utf8').on('data', (chunk: string) => {
      stderr += chunk;
    });

    const [exitCode]: [number | null, void] = await Promise.all([
      waitForCloseAsync(child),
      reporter.attachAsync(child, new StringBufferTerminalProvider())
    ]);

    expect(exitCode).toBe(0);
    expect(stdout).toBe('old stdout');
    expect(stderr).toBe('old stderr');
    expect(diagnostics).toEqual([]);
  });

  it('keeps raw fallback active when the child event capability is not negotiated', async () => {
    let structuredNegotiated: boolean = false;
    const reporter: HeftChildProcessReporter = new HeftChildProcessReporter({
      parentSessionId: 'parent-session',
      parentRequestId: 'parent-request',
      parentOperationId: 'project#build',
      context: CONTEXT,
      ingestForeignEnvelope: (envelope) => envelope.eventId,
      onDiagnostic: () => undefined,
      onStructuredNegotiated: () => {
        structuredNegotiated = true;
      }
    });
    const script: string = `
      const fs = require('node:fs');
      const eventFd = Number(process.env._RUSH_REPORTER_CHILD_FD);
      const ackFd = Number(process.env._RUSH_REPORTER_CHILD_ACK_FD);
      fs.writeSync(eventFd, JSON.stringify({
        kind: 'hello',
        protocolVersion: { major: 1, minor: 2 },
        producerVersion: '@rushstack/heft 1.2.25',
        capabilities: [],
        requiredFeatures: []
      }) + '\\n');
      fs.readFileSync(ackFd, 'utf8');
      process.stdout.write('capability fallback');
    `;
    const child: childProcess.ChildProcess = childProcess.spawn(process.execPath, ['-e', script], {
      env: { ...process.env, ...reporter.environment },
      stdio: reporter.stdio
    });
    let stdout: string = '';
    child.stdout?.setEncoding('utf8').on('data', (chunk: string) => {
      stdout += chunk;
    });

    const [exitCode]: [number | null, void] = await Promise.all([
      waitForCloseAsync(child),
      reporter.attachAsync(child, new StringBufferTerminalProvider())
    ]);

    expect(exitCode).toBe(0);
    expect(stdout).toBe('capability fallback');
    expect(structuredNegotiated).toBe(false);
  });

  it('surfaces unsupported requirements and retains fallback output', async () => {
    const diagnostics: IRushDiagnostic[] = [];
    const reporter: HeftChildProcessReporter = new HeftChildProcessReporter({
      parentSessionId: 'parent-session',
      parentRequestId: 'parent-request',
      parentOperationId: 'project#build',
      context: CONTEXT,
      ingestForeignEnvelope: (envelope) => envelope.eventId,
      onDiagnostic: (diagnostic) => diagnostics.push(diagnostic),
      onStructuredNegotiated: () => {
        throw new Error('An unsupported child must not negotiate structured reporting.');
      }
    });
    const script: string = `
      const fs = require('node:fs');
      const eventFd = Number(process.env._RUSH_REPORTER_CHILD_FD);
      const ackFd = Number(process.env._RUSH_REPORTER_CHILD_ACK_FD);
      fs.writeSync(eventFd, JSON.stringify({
        kind: 'hello',
        protocolVersion: { major: 2, minor: 0 },
        producerVersion: '@rushstack/heft 2.0.0',
        capabilities: ['heft-child-events-v1'],
        requiredFeatures: ['future-required-feature']
      }) + '\\n');
      fs.readFileSync(ackFd, 'utf8');
      process.stdout.write('fallback after rejection');
    `;
    const child: childProcess.ChildProcess = childProcess.spawn(process.execPath, ['-e', script], {
      env: { ...process.env, ...reporter.environment },
      stdio: reporter.stdio
    });
    let stdout: string = '';
    child.stdout?.setEncoding('utf8').on('data', (chunk: string) => {
      stdout += chunk;
    });

    const [exitCode]: [number | null, void] = await Promise.all([
      waitForCloseAsync(child),
      reporter.attachAsync(child, new StringBufferTerminalProvider())
    ]);

    expect(exitCode).toBe(0);
    expect(stdout).toBe('fallback after rejection');
    expect(diagnostics.map((diagnostic) => diagnostic.code)).toEqual(['RUSH_PROTOCOL_UPDATE_REQUIRED']);
  });

  it('reports a truncated accepted descriptor stream without hanging after child crash', async () => {
    const diagnostics: IRushDiagnostic[] = [];
    const reporter: HeftChildProcessReporter = new HeftChildProcessReporter({
      parentSessionId: 'parent-session',
      parentRequestId: 'parent-request',
      parentOperationId: 'project#build',
      context: CONTEXT,
      ingestForeignEnvelope: (envelope) => envelope.eventId,
      onDiagnostic: (diagnostic) => diagnostics.push(diagnostic),
      onStructuredNegotiated: () => undefined
    });
    const script: string = `
      const fs = require('node:fs');
      const eventFd = Number(process.env._RUSH_REPORTER_CHILD_FD);
      const ackFd = Number(process.env._RUSH_REPORTER_CHILD_ACK_FD);
      fs.writeSync(eventFd, JSON.stringify({
        kind: 'hello',
        protocolVersion: { major: 1, minor: 2 },
        producerVersion: '@rushstack/heft 1.2.25',
        capabilities: ['heft-child-events-v1'],
        requiredFeatures: []
      }) + '\\n');
      fs.readFileSync(ackFd, 'utf8');
      fs.writeSync(eventFd, '{"eventId":');
      process.exit(7);
    `;
    const child: childProcess.ChildProcess = childProcess.spawn(process.execPath, ['-e', script], {
      env: { ...process.env, ...reporter.environment },
      stdio: reporter.stdio
    });

    const [exitCode]: [number | null, void] = await Promise.all([
      waitForCloseAsync(child),
      reporter.attachAsync(child, new StringBufferTerminalProvider())
    ]);

    expect(exitCode).toBe(7);
    expect(diagnostics.map((diagnostic) => diagnostic.code)).toEqual(['RUSH_PROTOCOL_INVALID_CHILD_STREAM']);
  });
});
