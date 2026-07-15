// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import {
  normalizeAnsi,
  ProblemMatcherRegistry,
  runProblemMatchers,
  OperationStreamEmitter,
  type IProblemMatch,
  type IProblemMatcher,
  type IProblemMatcherResult,
  type IReporterEmitEventInput,
  type IReporterEventEnvelope,
  type IReporterEventSink,
  type IReporterEventSource
} from '../index';

class CapturingSink implements IReporterEventSink {
  public readonly inputs: IReporterEmitEventInput<unknown>[] = [];
  public emit<TPayload>(event: IReporterEmitEventInput<TPayload>): string {
    this.inputs.push(event);
    return `evt_${this.inputs.length}`;
  }
}

const SOURCE: IReporterEventSource = { packageName: '@microsoft/rush-lib', packageVersion: '5.177.2' };

const TSC_ERROR_MATCHER: IProblemMatcher = {
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

function emitOutput(lines: string[]): IReporterEventEnvelope<unknown>[] {
  const sink: CapturingSink = new CapturingSink();
  const emitter: OperationStreamEmitter = new OperationStreamEmitter({
    sink,
    sessionId: 'sess',
    source: SOURCE,
    scope: { commandName: 'build' }
  });
  for (const line of lines) {
    emitter.writeOutput('op1', 'stdout', line);
  }
  return sink.inputs as unknown as IReporterEventEnvelope<unknown>[];
}

describe('normalizeAnsi', () => {
  it('strips ANSI escape sequences', () => {
    expect(normalizeAnsi('\u001b[31mred\u001b[0m text')).toBe('red text');
  });
});

describe('ProblemMatcherRegistry', () => {
  it('scopes matchers by tool, version, and default enablement', () => {
    const registry: ProblemMatcherRegistry = new ProblemMatcherRegistry();
    registry.register(TSC_ERROR_MATCHER);
    const oldHeft: IProblemMatcher = {
      ...TSC_ERROR_MATCHER,
      name: 'heft-old',
      tool: 'heft',
      matchesVersion: (version: string) => Number.parseInt(version, 10) < 1
    };
    const experimental: IProblemMatcher = {
      ...TSC_ERROR_MATCHER,
      name: 'tsc-experimental',
      enabledByDefault: false
    };
    registry.register(oldHeft);
    registry.register(experimental);

    expect(registry.getMatchers('tsc').map((m) => m.name)).toEqual(['tsc-error']);
    expect(registry.getMatchers('tsc', { includeDisabled: true }).map((m) => m.name)).toEqual([
      'tsc-error',
      'tsc-experimental'
    ]);
    expect(registry.getMatchers('heft', { version: '0.9.0' }).map((m) => m.name)).toEqual(['heft-old']);
    expect(registry.getMatchers('heft', { version: '1.2.0' })).toEqual([]);
  });
});

describe('runProblemMatchers', () => {
  it('recovers a linked diagnostic without modifying the raw evidence', () => {
    const events: IReporterEventEnvelope<unknown>[] = emitOutput([
      "src/example.ts(12,5): error TS1005: ';' expected.\n",
      'plain build log line that matches nothing\n'
    ]);
    const before: string = JSON.stringify(events);

    const result: IProblemMatcherResult = runProblemMatchers(events, [TSC_ERROR_MATCHER]);

    expect(result.diagnostics).toHaveLength(1);
    const diagnostic = result.diagnostics[0];
    expect(diagnostic.code).toBe('RUSH_EXTERNAL_TOOL_PROBLEM');
    expect(diagnostic.severity).toBe('error');
    expect(diagnostic.source).toEqual({ file: 'src/example.ts', line: 12, column: 5, toolName: 'tsc' });
    expect(diagnostic.parameters?.code.value).toBe('TS1005');
    expect(diagnostic.relatedArtifactIds).toEqual(['op1']);
    expect(result.matchedLineCount).toBe(1);
    expect(result.unmatchedLineCount).toBe(1);

    // The raw output events are untouched.
    expect(JSON.stringify(events)).toBe(before);
  });

  it('reassembles a diagnostic split across chunks and normalizes ANSI', () => {
    const splitEvents: IReporterEventEnvelope<unknown>[] = emitOutput([
      'src/y.ts(1,1): error TS100',
      '0: bad\n'
    ]);
    const splitResult: IProblemMatcherResult = runProblemMatchers(splitEvents, [TSC_ERROR_MATCHER]);
    expect(splitResult.diagnostics).toHaveLength(1);
    expect(splitResult.diagnostics[0].parameters?.code.value).toBe('TS1000');

    const ansiEvents: IReporterEventEnvelope<unknown>[] = emitOutput([
      '\u001b[31msrc/z.ts(2,2): error TS2000: red message\u001b[0m\n'
    ]);
    const ansiResult: IProblemMatcherResult = runProblemMatchers(ansiEvents, [TSC_ERROR_MATCHER]);
    expect(ansiResult.diagnostics).toHaveLength(1);
    expect(ansiResult.diagnostics[0].parameters?.code.value).toBe('TS2000');
  });

  it('caps duplicate diagnostics', () => {
    const line: string = "src/dup.ts(1,1): error TS1005: ';' expected.\n";
    const events: IReporterEventEnvelope<unknown>[] = emitOutput([line, line, line, line, line]);
    const result: IProblemMatcherResult = runProblemMatchers(events, [TSC_ERROR_MATCHER], {
      maxDuplicates: 3
    });
    expect(result.diagnostics).toHaveLength(3);
    expect(result.suppressedDuplicateCount).toBe(2);
  });

  it('recovers the expected diagnostics from a representative corpus', () => {
    const events: IReporterEventEnvelope<unknown>[] = emitOutput([
      'src/a.ts(1,1): error TS1005: one\n',
      'info: not a problem\n',
      'src/b.ts(2,2): error TS2304: two\n',
      'Build succeeded with 0 errors\n'
    ]);
    const result: IProblemMatcherResult = runProblemMatchers(events, [TSC_ERROR_MATCHER]);
    expect(result.diagnostics.map((d) => d.parameters?.code.value)).toEqual(['TS1005', 'TS2304']);
    expect(result.matchedLineCount).toBe(2);
    expect(result.unmatchedLineCount).toBe(2);
  });
});
