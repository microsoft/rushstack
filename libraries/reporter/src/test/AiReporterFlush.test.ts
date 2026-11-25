// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import {
  AiReporter,
  ReporterManager,
  type IAiFinalRecord,
  type IReporterEventEnvelope
} from '../index';

describe('AI flush and required final-artifact reservation', () => {
  it.each([
    { maxBytes: 2048, logPath: `/protected/${'logs/'.repeat(250)}full.log` },
    { maxBytes: 65536, logPath: `\\\\?\\C:\\${(`${'a'.repeat(250)}\\`).repeat(130)}full.log` }
  ])('retains a representable late reference after signal flush with $maxBytes bytes', async ({ maxBytes, logPath }) => {
    let output: string = '';
    const manager = new ReporterManager();
    manager.addReporter(new AiReporter({ maxBytes, write: (text) => { output += text; } }));
    await manager.initializeAsync();
    const emit = (type: IReporterEventEnvelope<unknown>['type'], payload: unknown): void => {
      manager.emit({
        protocolVersion: { major: 1, minor: 1 },
        sessionId: 'flush-reservation',
        source: { packageName: '@microsoft/rush-lib', packageVersion: '5.179.0' },
        privacy: 'public',
        type,
        payload
      });
    };
    emit('commandStarted', { commandName: 'build' });
    for (let iterationId: number = 0; iterationId < 1000; iterationId++) {
      emit('watchCycleCompleted', { iterationId, succeeded: true });
    }
    await manager.signalFlushAsync();
    expect(output).toBe('');
    emit('artifactAvailable', { role: 'log', path: logPath, complete: true });
    emit('commandResult', { succeeded: false, exitCode: 1 });
    await manager.closeAsync();

    const final: IAiFinalRecord = JSON.parse(output.trimEnd().split('\n').at(-1)!);
    expect(Buffer.byteLength(output, 'utf8')).toBeLessThanOrEqual(maxBytes);
    expect(final.log).toEqual({ path: logPath, complete: true });
    expect(final).toMatchObject({ kind: 'ai.final', result: 'failed', exitCode: 1, truncated: true });
    expect(final.diagnostics.length).toBeLessThanOrEqual(20);
  });

  it.each([512, 65536])('drains on close without inventing a missing artifact at %s bytes', async (maxBytes) => {
    let output: string = '';
    const reporter = new AiReporter({ maxBytes, write: (text) => { output += text; } });
    const event = (type: IReporterEventEnvelope<unknown>['type'], payload: unknown): IReporterEventEnvelope<unknown> => ({
      protocolVersion: { major: 1, minor: 1 },
      eventId: type,
      sessionId: 'no-artifact',
      sequence: 1,
      timestamp: '2026-09-11T00:00:00.000Z',
      source: { packageName: '@microsoft/rush-lib', packageVersion: '5.179.0' },
      privacy: 'public',
      required: true,
      type,
      payload
    });
    reporter.report(event('commandStarted', { commandName: 'build' }));
    for (let iterationId: number = 0; iterationId < 1000; iterationId++) {
      reporter.report(event('watchCycleCompleted', { iterationId, succeeded: true }));
    }
    await reporter.flushAsync();
    expect(output).toBe('');
    reporter.report(event('commandResult', { succeeded: false, exitCode: 1 }));
    await reporter.closeAsync();

    expect(Buffer.byteLength(output, 'utf8')).toBeLessThanOrEqual(maxBytes);
    expect(output.endsWith('\n')).toBe(true);
    const final: IAiFinalRecord = JSON.parse(output.trimEnd().split('\n').at(-1)!);
    expect(final).toMatchObject({ kind: 'ai.final', result: 'failed', exitCode: 1, truncated: true });
    expect(final.log).toBeUndefined();
    const closedOutput: string = output;
    await reporter.flushAsync();
    await reporter.closeAsync();
    expect(output).toBe(closedOutput);
  });
});
