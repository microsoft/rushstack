// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { IRushDiagnostic } from '../diagnostics/IRushDiagnostic';
import type { IClassifiedDiagnosticValue } from '../diagnostics/IClassifiedDiagnosticValue';
import { RUSH_DIAGNOSTIC_TEMPLATES } from '../diagnostics/RushDiagnosticCodeRegistry';
import type { IReporterEventEnvelope } from '../events/IReporterEventEnvelope';

export function formatHumanReadableDiagnostic(event: IReporterEventEnvelope<unknown>): string {
  if (event.privacy === 'secret') {
    return '[secret]';
  }

  const diagnostic: Partial<IRushDiagnostic> = event.payload as Partial<IRushDiagnostic>;
  const templates: Readonly<Record<string, string>> = RUSH_DIAGNOSTIC_TEMPLATES;
  const template: string | undefined = diagnostic.summaryKey ? templates[diagnostic.summaryKey] : undefined;
  const summary: string | undefined =
    typeof template === 'string'
      ? template.replace(/\{([^}]+)\}/g, (placeholder: string, name: string) => {
          const parameter: IClassifiedDiagnosticValue | undefined = diagnostic.parameters?.[name];
          if (!parameter) {
            return placeholder;
          }
          return parameter.privacy === 'secret'
            ? '[secret]'
            : typeof parameter.value === 'string'
              ? parameter.value
              : JSON.stringify(parameter.value);
        })
      : undefined;

  const source: IRushDiagnostic['source'] = diagnostic.source;
  let location: string = '';
  if (source?.kind === 'file') {
    location = source.file;
    if (source.line !== undefined) {
      location += `:${source.line}`;
      if (source.column !== undefined) {
        location += `:${source.column}`;
      }
    }
  }
  if (source?.toolName && diagnostic.parameters?.tool === undefined) {
    location = location ? `[${source.toolName}] ${location}` : source.toolName;
  }

  const detail: string = [location, summary].filter(Boolean).join(' - ');
  return `[${diagnostic.severity ?? 'error'}] ${diagnostic.code ?? 'unknown'}${detail ? `: ${detail}` : ''}`;
}
