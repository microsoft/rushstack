// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import {
  OperationStreamEmitter,
  regroupOperationOutput,
  iterateExternalOutput,
  PlaintextReporter,
  DefaultInteractiveReporter,
  type IExternalOutputChunk,
  type IInteractiveTerminal,
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

class FakeTerminal implements IInteractiveTerminal {
  public columns: number = 80;
  public isTTY: boolean = true;
  public output: string = '';
  public write(text: string): void {
    this.output += text;
  }
}

const SOURCE: IReporterEventSource = { packageName: '@microsoft/rush-lib', packageVersion: '5.177.2' };

function asEnvelopes(inputs: IReporterEmitEventInput<unknown>[]): IReporterEventEnvelope<unknown>[] {
  return inputs as unknown as IReporterEventEnvelope<unknown>[];
}

function makeEmitter(sink: CapturingSink, maxChunkBytes?: number): OperationStreamEmitter {
  return new OperationStreamEmitter({
    sink,
    sessionId: 'sess',
    source: SOURCE,
    scope: { commandName: 'build' },
    maxChunkBytes
  });
}

describe('OperationStreamEmitter', () => {
  it('emits registration, status, output, and result with operation scope', () => {
    const sink: CapturingSink = new CapturingSink();
    const emitter: OperationStreamEmitter = makeEmitter(sink);
    emitter.registerOperation('op1', 'project-a', 'build');
    emitter.changeStatus('op1', 'executing');
    emitter.writeOutput('op1', 'stdout', 'hello\n');
    emitter.changeStatus('op1', 'success', 100);
    emitter.completeCommand('build', true, 0, { success: 1 });

    expect(sink.inputs.map((i) => i.type)).toEqual([
      'operationRegistered',
      'operationStatusChanged',
      'externalOutput',
      'operationStatusChanged',
      'commandResult'
    ]);
    expect(sink.inputs[2].scope).toEqual({ commandName: 'build', operationId: 'op1' });
    expect(sink.inputs[2].privacy).toBe('local-sensitive');
    expect(sink.inputs[2].required).toBe(false);
  });

  it('splits raw output into uncollated chunks', () => {
    const sink: CapturingSink = new CapturingSink();
    const emitter: OperationStreamEmitter = makeEmitter(sink, 4);
    const ids: string[] = emitter.writeOutput('op1', 'stdout', 'abcdefgh');
    expect(ids.length).toBe(2);
    const text: string = sink.inputs.map((i) => (i.payload as { text: string }).text).join('');
    expect(text).toBe('abcdefgh');
  });

  it('emits interleaved output uncollated, in call order', () => {
    const sink: CapturingSink = new CapturingSink();
    const emitter: OperationStreamEmitter = makeEmitter(sink);
    emitter.writeOutput('op1', 'stdout', 'A1\n');
    emitter.writeOutput('op2', 'stdout', 'B1\n');
    emitter.writeOutput('op1', 'stdout', 'A2\n');
    emitter.writeOutput('op2', 'stdout', 'B2\n');

    const chunks: IExternalOutputChunk[] = iterateExternalOutput(asEnvelopes(sink.inputs));
    expect(chunks.map((c) => c.text)).toEqual(['A1\n', 'B1\n', 'A2\n', 'B2\n']);
  });
});

describe('regroupOperationOutput', () => {
  it('reconstructs per-operation output from the uncollated stream', () => {
    const sink: CapturingSink = new CapturingSink();
    const emitter: OperationStreamEmitter = makeEmitter(sink);
    emitter.writeOutput('op1', 'stdout', 'A1\n');
    emitter.writeOutput('op2', 'stdout', 'B1\n');
    emitter.writeOutput('op1', 'stdout', 'A2\n');
    emitter.writeOutput('op2', 'stdout', 'B2\n');

    const groups: Map<string, string> = regroupOperationOutput(asEnvelopes(sink.inputs));
    expect(groups.get('op1')).toBe('A1\nA2\n');
    expect(groups.get('op2')).toBe('B1\nB2\n');
  });
});

describe('reporter parity with StreamCollator', () => {
  it('lets the detailed plaintext reporter regroup interleaved output', () => {
    const sink: CapturingSink = new CapturingSink();
    const emitter: OperationStreamEmitter = makeEmitter(sink);
    emitter.registerOperation('op1', 'project-a', 'build');
    emitter.registerOperation('op2', 'project-b', 'build');
    emitter.changeStatus('op1', 'executing');
    emitter.changeStatus('op2', 'executing');
    emitter.writeOutput('op1', 'stdout', 'A1\n');
    emitter.writeOutput('op2', 'stdout', 'B1\n');
    emitter.writeOutput('op1', 'stdout', 'A2\n');
    emitter.writeOutput('op2', 'stdout', 'B2\n');
    emitter.changeStatus('op1', 'success', 100);
    emitter.changeStatus('op2', 'success', 200);
    emitter.completeCommand('build', true, 0);

    let output: string = '';
    const reporter: PlaintextReporter = new PlaintextReporter({
      write: (text: string) => (output += text),
      variant: 'detailed',
      nowMs: () => 0
    });
    for (const envelope of asEnvelopes(sink.inputs)) {
      reporter.report(envelope);
    }

    // Despite interleaved emission, project-a output is grouped and flushed
    // before project-b output.
    expect(output).toContain('==[ project-a (build) ]');
    expect(output.indexOf('A1')).toBeLessThan(output.indexOf('A2'));
    expect(output.indexOf('A2')).toBeLessThan(output.indexOf('B1'));
  });

  it('lets the concise reporter derive activity without buffering project output', async () => {
    const sink: CapturingSink = new CapturingSink();
    const emitter: OperationStreamEmitter = makeEmitter(sink);
    emitter.registerOperation('op1', 'project-a', 'build');
    emitter.changeStatus('op1', 'executing');
    emitter.writeOutput('op1', 'stdout', 'RAW-PROJECT-OUTPUT\n');
    emitter.changeStatus('op1', 'success', 100);
    emitter.completeCommand('build', true, 0);

    const terminal: FakeTerminal = new FakeTerminal();
    const reporter: DefaultInteractiveReporter = new DefaultInteractiveReporter({
      terminal,
      color: false,
      nowMs: () => 0
    });
    for (const envelope of asEnvelopes(sink.inputs)) {
      reporter.report(envelope);
    }
    await reporter.closeAsync();

    // The concise reporter never echoes raw project output.
    expect(terminal.output).not.toContain('RAW-PROJECT-OUTPUT');
  });
});
