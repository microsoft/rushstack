// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { IRushDiagnostic } from '../diagnostics/IRushDiagnostic';
import type { IReporterEventEnvelope } from '../events/IReporterEventEnvelope';
import { DefaultInteractiveReporter } from '../reporters/DefaultInteractiveReporter';
import { formatHumanReadableDiagnostic } from '../reporters/HumanReadableDiagnostic';
import { PlaintextReporter } from '../reporters/PlaintextReporter';

const PRIVATE_PRODUCER: string = '@private/example-rush-plugin';
const PRIVATE_COMPONENT: string = 'PrivatePluginImplementation';

function createEvent(overrides: Partial<IRushDiagnostic> = {}): IReporterEventEnvelope<IRushDiagnostic> {
  return {
    protocolVersion: { major: 1, minor: 1 },
    eventId: 'plugin-api-incompatible',
    sessionId: 'fixture',
    sequence: 1,
    timestamp: '2026-08-28T08:45:34.000Z',
    source: {
      packageName: PRIVATE_PRODUCER,
      packageVersion: '1.0.0',
      component: PRIVATE_COMPONENT
    },
    privacy: 'local-sensitive',
    required: true,
    type: 'diagnosticEmitted',
    payload: {
      diagnosticId: 'plugin-api-incompatible-diagnostic',
      code: 'RUSH_PLUGIN_API_INCOMPATIBLE',
      category: 'configuration',
      severity: 'error',
      summaryKey: 'diagnostic.RUSH_PLUGIN_API_INCOMPATIBLE.summary',
      parameters: {
        pluginName: { value: PRIVATE_PRODUCER, privacy: 'secret' },
        rushVersion: { value: '5.200.0', privacy: 'public' },
        rushVersionRange: { value: '^5.100.0', privacy: 'public' }
      },
      remediation: [
        {
          descriptionKey: 'remediation.update-plugin',
          command: 'rush update',
          automatedExecutionSafety: 'requires-confirmation'
        }
      ],
      source: { kind: 'tool', toolName: PRIVATE_PRODUCER },
      ...overrides
    }
  };
}

describe(formatHumanReadableDiagnostic.name, () => {
  it('does not redisplay the qualification fixture secret through its source alias', () => {
    const event: IReporterEventEnvelope<IRushDiagnostic> = createEvent();
    const original: string = JSON.stringify(event);
    const output: string = formatHumanReadableDiagnostic(event);

    expect(output).not.toContain(PRIVATE_PRODUCER);
    expect(output).not.toContain(PRIVATE_COMPONENT);
    expect(output).toContain('The plugin [secret] supports Rush ^5.100.0');
    expect(output).toContain('5.200.0');
    expect(JSON.stringify(event)).toBe(original);
  });

  it.each(['default', 'plaintext'] as const)('keeps secret source aliases out of %s output', async (kind) => {
    let output: string = '';
    const write = (text: string): void => {
      output += text;
    };
    const reporter =
      kind === 'default'
        ? new DefaultInteractiveReporter({ terminal: { isTTY: false, columns: 100, write }, color: false })
        : new PlaintextReporter({ write, variant: 'detailed', color: false });
    reporter.report(createEvent());
    await reporter.closeAsync();

    expect(output).not.toContain(PRIVATE_PRODUCER);
    expect(output).not.toContain(PRIVATE_COMPONENT);
    expect(output).toContain('The plugin [secret]');
  });

  it('omits a source path containing a secret alias without losing an unrelated tool', () => {
    const output: string = formatHumanReadableDiagnostic(
      createEvent({
        source: {
          kind: 'file',
          file: `/repo/node_modules/${PRIVATE_PRODUCER}/plugin.js`,
          line: 4,
          column: 2,
          toolName: 'typescript'
        }
      })
    );

    expect(output).not.toContain(PRIVATE_PRODUCER);
    expect(output).not.toContain(':4:2');
    expect(output).toContain('typescript');
  });

  it('redacts a lower-classified template parameter repeating a secret value', () => {
    const output: string = formatHumanReadableDiagnostic(
      createEvent({
        code: 'RUSH_EXTERNAL_TOOL_PROBLEM',
        category: 'operation',
        summaryKey: 'diagnostic.RUSH_EXTERNAL_TOOL_PROBLEM.summary',
        parameters: {
          pluginName: { value: PRIVATE_PRODUCER, privacy: 'secret' },
          tool: { value: 'typescript', privacy: 'public' },
          code: { value: 'TS1005', privacy: 'public' },
          message: { value: `Failure inside ${PRIVATE_PRODUCER}`, privacy: 'local-sensitive' }
        },
        source: { kind: 'tool', toolName: 'typescript' }
      })
    );

    expect(output).not.toContain(PRIVATE_PRODUCER);
    expect(output).toContain('typescript reported TS1005: [secret]');
  });

  it('preserves unrelated local source context', () => {
    const output: string = formatHumanReadableDiagnostic(
      createEvent({
        source: { kind: 'file', file: 'src/index.ts', line: 4, column: 2, toolName: 'typescript' }
      })
    );

    expect(output).toContain('typescript');
    expect(output).toContain('src/index.ts:4:2');
    expect(output).toContain('^5.100.0');
  });

  it('retains unrelated local-sensitive source details even when another parameter is secret', () => {
    const event: IReporterEventEnvelope<Partial<IRushDiagnostic>> = {
      ...createEvent(),
      payload: {
        code: 'RUSH_EXTERNAL_TOOL_PROBLEM',
        severity: 'error',
        parameters: { token: { value: 'classified-token', privacy: 'secret' } },
        source: {
          kind: 'file',
          file: '/private/project/input.ts',
          line: 5,
          column: 2,
          toolName: 'private-compiler'
        }
      }
    };
    const original: string = JSON.stringify(event);
    const output: string = formatHumanReadableDiagnostic(event);

    expect(output).toContain('[private-compiler] /private/project/input.ts:5:2');
    expect(output).not.toContain('classified-token');
    expect(JSON.stringify(event)).toBe(original);
  });

  it('does not treat an empty secret parameter as an alias of every source string', () => {
    const output: string = formatHumanReadableDiagnostic(
      createEvent({
        parameters: { pluginName: { value: '', privacy: 'secret' } },
        source: { kind: 'tool', toolName: 'typescript' }
      })
    );

    expect(output).toContain('typescript');
  });
});
