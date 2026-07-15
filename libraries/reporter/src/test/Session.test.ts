// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import {
  createScopedReporter,
  createScopedLogger,
  createRushDiagnostic,
  RushSessionReporting,
  ReporterManager,
  RUSH_PLUGIN_API_VERSION,
  isPluginApiVersionSupported,
  createPluginApiIncompatibleDiagnostic,
  type IReporter,
  type IReporterEventEnvelope,
  type IReporterEventScope,
  type IReporterEventSink,
  type IReporterEventSource,
  type IReporterExecutionContext,
  type IRushDiagnostic,
  type IScopedLogger,
  type IScopedReporter
} from '../index';

class CapturingSink implements IReporterEventSink {
  public readonly inputs: Record<string, unknown>[] = [];

  public emit(event: Record<string, unknown>): string {
    this.inputs.push(event);
    return `evt_${this.inputs.length}`;
  }
}

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

const SOURCE: IReporterEventSource = { packageName: '@microsoft/rush-lib', packageVersion: '5.177.2' };

describe('createScopedReporter', () => {
  it('emits scoped messages on the activityChanged channel', () => {
    const sink: CapturingSink = new CapturingSink();
    const scope: IReporterEventScope = { commandName: 'build', projectName: '@my/project' };
    const reporter: IScopedReporter = createScopedReporter({
      sink,
      sessionId: 'sess',
      source: SOURCE,
      scope
    });

    reporter.emitMessage({ severity: 'info', text: 'hello' });
    expect(sink.inputs[0].type).toBe('activityChanged');
    expect(sink.inputs[0].scope).toEqual(scope);
    expect(sink.inputs[0].required).toBe(false);
    expect(sink.inputs[0].payload).toEqual({ kind: 'message', severity: 'info', text: 'hello' });
  });

  it('marks warning and error messages as required', () => {
    const sink: CapturingSink = new CapturingSink();
    const reporter: IScopedReporter = createScopedReporter({ sink, sessionId: 'sess', source: SOURCE });
    reporter.emitMessage({ severity: 'warning', text: 'careful' });
    reporter.emitMessage({ severity: 'error', text: 'boom' });
    expect(sink.inputs[0].required).toBe(true);
    expect(sink.inputs[1].required).toBe(true);
  });

  it('emits diagnostics with the envelope privacy floor', () => {
    const sink: CapturingSink = new CapturingSink();
    const reporter: IScopedReporter = createScopedReporter({ sink, sessionId: 'sess', source: SOURCE });
    const diagnostic: IRushDiagnostic = createRushDiagnostic('RUSH_OPERATION_FAILED', {
      parameters: {
        projectName: { value: 'p', privacy: 'public' },
        logPath: { value: '/tmp/x.log', privacy: 'secret' }
      }
    });
    reporter.emitDiagnostic(diagnostic);
    expect(sink.inputs[0].type).toBe('diagnosticEmitted');
    // Least sensitive field is the floor.
    expect(sink.inputs[0].privacy).toBe('public');
    expect(sink.inputs[0].required).toBe(true);
    expect(sink.inputs[0].payload).toBe(diagnostic);
  });

  it('validates and wraps extension events, rejecting non-namespaced names', () => {
    const sink: CapturingSink = new CapturingSink();
    const reporter: IScopedReporter = createScopedReporter({ sink, sessionId: 'sess', source: SOURCE });
    reporter.emitExtension('acme.cache-warmed', { hits: 3 });
    expect(sink.inputs[0].type).toBe('extension');
    expect(sink.inputs[0].payload).toEqual({ name: 'acme.cache-warmed', payload: { hits: 3 } });
    expect(() => reporter.emitExtension('notnamespaced', {})).toThrow(/Invalid extension event name/);
  });

  it('exposes only emit methods, hiding modes, destinations, and thresholds', () => {
    const sink: CapturingSink = new CapturingSink();
    const reporter: IScopedReporter = createScopedReporter({ sink, sessionId: 'sess', source: SOURCE });
    expect(Object.keys(reporter).sort()).toEqual(['emitDiagnostic', 'emitExtension', 'emitMessage']);
  });
});

describe('createScopedLogger', () => {
  it('maps log methods to message severities and has no terminal handle', () => {
    const sink: CapturingSink = new CapturingSink();
    const reporter: IScopedReporter = createScopedReporter({ sink, sessionId: 'sess', source: SOURCE });
    const logger: IScopedLogger = createScopedLogger(reporter);

    logger.writeLine('a');
    logger.writeDebugLine('b');
    logger.writeWarningLine('c');
    logger.writeErrorLine('d');

    const severities: unknown[] = sink.inputs.map(
      (input: Record<string, unknown>) => (input.payload as { severity: string }).severity
    );
    expect(severities).toEqual(['info', 'debug', 'warning', 'error']);
    expect(Object.keys(logger)).not.toContain('terminal');
  });
});

describe('RushSessionReporting', () => {
  it('creates scoped reporters, loggers, and an execution context that reach reporters', async () => {
    const manager: ReporterManager = new ReporterManager();
    const recording: RecordingReporter = new RecordingReporter();
    manager.addReporter(recording);
    await manager.initializeAsync();

    const reporting: RushSessionReporting = new RushSessionReporting({
      sink: manager,
      sessionId: 'sess',
      source: SOURCE
    });

    expect(reporting.getSink()).toBe(manager);

    const context: IReporterExecutionContext = reporting.createExecutionContext({ commandName: 'build' });
    context.reporter.emitMessage({ severity: 'warning', text: 'from action' });

    const logger: IScopedLogger = reporting.createScopedLogger({ projectName: '@my/project' });
    logger.writeErrorLine('from plugin');

    await manager.flushAsync();

    expect(recording.reported).toHaveLength(2);
    expect(recording.reported[0].scope).toEqual({ commandName: 'build' });
    expect(recording.reported[1].scope).toEqual({ projectName: '@my/project' });
  });
});

describe('plugin API compatibility', () => {
  it('accepts a matching major and rejects a mismatched or invalid major', () => {
    expect(isPluginApiVersionSupported(RUSH_PLUGIN_API_VERSION)).toBe(true);
    expect(isPluginApiVersionSupported('1.4.2')).toBe(true);
    expect(isPluginApiVersionSupported('2.0.0')).toBe(false);
    expect(isPluginApiVersionSupported('not-a-version')).toBe(false);
  });

  it('builds a migration diagnostic for an incompatible plugin', () => {
    const diagnostic: IRushDiagnostic = createPluginApiIncompatibleDiagnostic({
      pluginName: '@acme/rush-plugin',
      pluginApiVersion: '2.0.0'
    });
    expect(diagnostic.code).toBe('RUSH_PLUGIN_API_INCOMPATIBLE');
    expect(diagnostic.category).toBe('configuration');
    expect(diagnostic.parameters?.pluginName.value).toBe('@acme/rush-plugin');
    expect(diagnostic.parameters?.declaredApiVersion.value).toBe('2.0.0');
  });
});
