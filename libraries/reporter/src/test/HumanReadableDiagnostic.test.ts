// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { IRushDiagnostic } from '../diagnostics/IRushDiagnostic';
import type { IReporterEventEnvelope } from '../events/IReporterEventEnvelope';
import { formatHumanReadableDiagnostic } from '../reporters/HumanReadableDiagnostic';

function diagnosticEvent(
  payload: Partial<IRushDiagnostic>
): IReporterEventEnvelope<Partial<IRushDiagnostic>> {
  return {
    protocolVersion: { major: 1, minor: 1 },
    eventId: 'diagnostic',
    sessionId: 'session',
    sequence: 1,
    timestamp: '2026-09-09T00:00:00Z',
    source: { packageName: '@microsoft/rush-lib', packageVersion: '5.200.0' },
    privacy: 'local-sensitive',
    required: true,
    type: 'diagnosticEmitted',
    payload
  };
}

describe(formatHumanReadableDiagnostic.name, () => {
  it('does not reveal a secret plugin parameter through its source tool alias', () => {
    const pluginName: string = '@private/example-rush-plugin';
    const output: string = formatHumanReadableDiagnostic(
      diagnosticEvent({
        code: 'RUSH_PLUGIN_API_INCOMPATIBLE',
        severity: 'error',
        parameters: { pluginName: { value: pluginName, privacy: 'secret' } },
        source: { kind: 'tool', toolName: pluginName }
      })
    );
    expect(output).toContain('RUSH_PLUGIN_API_INCOMPATIBLE');
    expect(output).toContain('[secret]');
    expect(output).not.toContain(pluginName);
  });

  it('redacts a source file alias while preserving its useful line, column and non-secret tool', () => {
    const file: string = '/private/project/input.ts';
    const output: string = formatHumanReadableDiagnostic(
      diagnosticEvent({
        code: 'RUSH_EXTERNAL_TOOL_PROBLEM',
        severity: 'error',
        parameters: { location: { value: file, privacy: 'secret' } },
        source: { kind: 'file', file, line: 5, column: 2, toolName: 'tsc' }
      })
    );
    expect(output).toContain('[tsc] [secret]:5:2');
    expect(output).not.toContain(file);
  });

  it('retains unrelated local-sensitive source details even when another parameter is secret', () => {
    const output: string = formatHumanReadableDiagnostic(
      diagnosticEvent({
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
      })
    );
    expect(output).toContain('[private-compiler] /private/project/input.ts:5:2');
    expect(output).not.toContain('classified-token');
  });
});
