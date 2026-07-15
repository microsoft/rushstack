// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import {
  resolveReporterCompatibility,
  createEngineSink,
  LegacyFallbackSink,
  OldEngineOutputAdapter,
  ReporterManager,
  type IEngineSinkResolution,
  type IReporter,
  type IReporterCompatibilityDecision,
  type IReporterEventEnvelope,
  type IReporterEventSink
} from '../index';

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

describe('resolveReporterCompatibility', () => {
  it('uses the structured path when the frontend and engine share a protocol major', () => {
    const decision: IReporterCompatibilityDecision = resolveReporterCompatibility(
      { protocolMajor: 1, hasManager: true },
      { supportsStructuredSink: true, protocolMajor: 1 }
    );
    expect(decision.mode).toBe('structured');
    expect(decision.provideSinkToEngine).toBe(true);
    expect(decision.engineRendersLegacy).toBe(false);
    expect(decision.legacyRenderingVisible).toBe(true);
  });

  it('bridges a new frontend with an old engine', () => {
    const decision: IReporterCompatibilityDecision = resolveReporterCompatibility(
      { protocolMajor: 1, hasManager: true },
      { supportsStructuredSink: false }
    );
    expect(decision.mode).toBe('new-frontend-old-engine');
    expect(decision.provideSinkToEngine).toBe(false);
    expect(decision.engineRendersLegacy).toBe(true);
    expect(decision.legacyRenderingVisible).toBe(true);
  });

  it('falls back when an old frontend selects a new engine', () => {
    const decision: IReporterCompatibilityDecision = resolveReporterCompatibility(
      { protocolMajor: 1, hasManager: false },
      { supportsStructuredSink: true, protocolMajor: 1 }
    );
    expect(decision.mode).toBe('old-frontend-new-engine');
    expect(decision.provideSinkToEngine).toBe(false);
    expect(decision.engineRendersLegacy).toBe(true);
    expect(decision.legacyRenderingVisible).toBe(true);
  });

  it('classifies a newer engine major as an old-frontend-new-engine fallback', () => {
    const decision: IReporterCompatibilityDecision = resolveReporterCompatibility(
      { protocolMajor: 1, hasManager: true },
      { supportsStructuredSink: true, protocolMajor: 2 }
    );
    expect(decision.mode).toBe('old-frontend-new-engine');
    expect(decision.legacyRenderingVisible).toBe(true);
  });

  it('uses the pure legacy path when neither side is structured', () => {
    const decision: IReporterCompatibilityDecision = resolveReporterCompatibility(
      { protocolMajor: 1, hasManager: false },
      { supportsStructuredSink: false }
    );
    expect(decision.mode).toBe('legacy');
    expect(decision.legacyRenderingVisible).toBe(true);
  });
});

describe('createEngineSink', () => {
  it('uses the provided sink for the structured path', () => {
    const manager: ReporterManager = new ReporterManager();
    const resolution: IEngineSinkResolution = createEngineSink(manager);
    expect(resolution.mode).toBe('structured');
    expect(resolution.sink).toBe(manager);
  });

  it('supplies a legacy fallback sink when none is provided', () => {
    const resolution: IEngineSinkResolution = createEngineSink();
    expect(resolution.mode).toBe('legacy-fallback');
    expect(resolution.sink).toBeInstanceOf(LegacyFallbackSink);

    // The fallback sink accepts emits and returns ids without a manager.
    const id: string = resolution.sink.emit({
      protocolVersion: { major: 1, minor: 0 },
      sessionId: 'sess',
      source: { packageName: '@microsoft/rush-lib', packageVersion: '5.177.2' },
      privacy: 'public',
      required: true,
      type: 'commandStarted',
      payload: {}
    });
    expect(typeof id).toBe('string');
    expect(id.length).toBeGreaterThan(0);
  });
});

describe('OldEngineOutputAdapter', () => {
  it('bridges old engine output into structured externalOutput events', async () => {
    const manager: ReporterManager = new ReporterManager();
    const reporter: RecordingReporter = new RecordingReporter();
    manager.addReporter(reporter);
    await manager.initializeAsync();

    const sink: IReporterEventSink = manager;
    const adapter: OldEngineOutputAdapter = new OldEngineOutputAdapter({
      sink,
      sessionId: 'sess',
      source: { packageName: '@microsoft/rush-lib', packageVersion: '5.60.0' }
    });

    const ids: string[] = adapter.capture('stdout', 'Building project-a...\nproject-a done.\n');
    await manager.flushAsync();

    expect(ids.length).toBe(1);
    expect(reporter.reported).toHaveLength(1);
    const event: IReporterEventEnvelope<unknown> = reporter.reported[0];
    expect(event.type).toBe('externalOutput');
    expect(event.privacy).toBe('local-sensitive');
    expect(event.payload).toEqual({
      stream: 'stdout',
      text: 'Building project-a...\nproject-a done.\n'
    });
  });

  it('splits output that exceeds the chunk limit into multiple events', async () => {
    const manager: ReporterManager = new ReporterManager();
    const reporter: RecordingReporter = new RecordingReporter();
    manager.addReporter(reporter);
    await manager.initializeAsync();

    const adapter: OldEngineOutputAdapter = new OldEngineOutputAdapter({
      sink: manager,
      sessionId: 'sess',
      source: { packageName: '@microsoft/rush-lib', packageVersion: '5.60.0' },
      maxChunkBytes: 8
    });

    const ids: string[] = adapter.capture('stderr', 'abcdefghijklmnop');
    await manager.flushAsync();

    expect(ids.length).toBe(2);
    expect(reporter.reported).toHaveLength(2);
    const text: string = reporter.reported
      .map((e: IReporterEventEnvelope<unknown>) => (e.payload as { text: string }).text)
      .join('');
    expect(text).toBe('abcdefghijklmnop');
  });
});
