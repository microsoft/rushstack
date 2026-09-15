// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import {
  AiReporter,
  FileReporter,
  JsonReporter,
  type IReporterEventEnvelope,
  type IRushDiagnostic
} from '../index';

const PRIVATE_PRODUCER: string = '@private/review-plugin';
const PRIVATE_COMPONENT: string = 'ReviewPluginImplementation';

function diagnosticEvent(oversized: boolean = false): IReporterEventEnvelope<IRushDiagnostic> {
  return {
    protocolVersion: { major: 1, minor: 1 },
    eventId: 'private-plugin-diagnostic',
    sessionId: 'redaction-review',
    sequence: 1,
    timestamp: '2026-09-11T00:00:00.000Z',
    source: { packageName: PRIVATE_PRODUCER, packageVersion: '1.0.0', component: PRIVATE_COMPONENT },
    privacy: 'local-sensitive',
    required: true,
    type: 'diagnosticEmitted',
    payload: {
      diagnosticId: 'private-plugin-diagnostic',
      code: 'RUSH_PLUGIN_API_INCOMPATIBLE',
      category: 'configuration',
      severity: 'error',
      summaryKey: 'diagnostic.RUSH_PLUGIN_API_INCOMPATIBLE.summary',
      parameters: {
        pluginName: { value: PRIVATE_PRODUCER, privacy: 'secret' },
        rushVersion: { value: '5.200.0', privacy: 'public' },
        rushVersionRange: { value: '^5.100.0', privacy: 'public' },
        detail: { value: oversized ? 'x'.repeat(4096) : 'visible context', privacy: 'public' }
      },
      source: { kind: 'tool', toolName: `loader for ${PRIVATE_PRODUCER}` }
    }
  };
}

describe('classified source aliases in machine reporters', () => {
  it.each([false, true])('does not expose a private producer in JSON (oversized: %s)', (oversized) => {
    const event = diagnosticEvent(oversized);
    const original: string = JSON.stringify(event);
    let output: string = '';
    const reporter = new JsonReporter({
      write: (text) => { output += text; },
      maxRecordBytes: oversized ? 768 : undefined
    });
    reporter.report(event);

    expect(output).not.toContain(PRIVATE_PRODUCER);
    expect(output).not.toContain(PRIVATE_COMPONENT);
    const projected = JSON.parse(output);
    expect(projected.source).toEqual({
      packageName: '[private-producer]',
      packageVersion: '[private-version]'
    });
    if (oversized) {
      expect(projected.payload.name).toBe('rush.reporter.record-too-large');
      expect(Buffer.byteLength(output)).toBeLessThanOrEqual(768);
    } else {
      expect(projected.type).toBe('diagnosticEmitted');
      expect(projected.payload.source).toEqual({ kind: 'tool', toolName: '[secret]' });
      expect(projected.payload.parameters.rushVersion.value).toBe('5.200.0');
    }
    expect(JSON.stringify(event)).toBe(original);
  });

  it.each([false, true])('keeps source aliases out of bounded AI output (oversized: %s)', async (oversized) => {
    const event = diagnosticEvent(oversized);
    const original: string = JSON.stringify(event);
    let output: string = '';
    const reporter = new AiReporter({ write: (text) => { output += text; }, maxBytes: oversized ? 512 : 65536 });
    reporter.report(event);
    reporter.report({ ...event, type: 'artifactAvailable', payload: { role: 'log', path: '/protected/full.log', complete: true } });
    reporter.report({ ...event, type: 'commandResult', payload: { succeeded: false, exitCode: 1 } });
    await reporter.closeAsync();

    expect(output).not.toContain(PRIVATE_PRODUCER);
    expect(output).not.toContain(PRIVATE_COMPONENT);
    expect(Buffer.byteLength(output)).toBeLessThanOrEqual(oversized ? 512 : 65536);
    expect(JSON.parse(output).log.path).toBe('/protected/full.log');
    expect(JSON.stringify(event)).toBe(original);
  });

  it('preserves unrelated machine source and location fields', () => {
    const event: IReporterEventEnvelope<IRushDiagnostic> = {
      ...diagnosticEvent(),
      source: { packageName: '@public/tool', packageVersion: '2.0.0', component: 'PublicComponent' },
      payload: {
        ...diagnosticEvent().payload,
        source: { kind: 'file', file: '/repo/src/index.ts', line: 3, column: 2, toolName: 'typescript' }
      }
    };
    let output: string = '';
    new JsonReporter({ write: (text) => { output += text; } }).report(event);
    const projected = JSON.parse(output);
    expect(projected.source).toEqual(event.source);
    expect(projected.payload.source).toEqual(event.payload.source);
    expect(output).not.toContain(PRIVATE_PRODUCER);
    expect(projected.payload.parameters.pluginName.value).toBe('[secret]');
  });

  it('redacts matching version, component, and file fields without stripping unrelated identity or tool data', () => {
    const event: IReporterEventEnvelope<IRushDiagnostic> = {
      ...diagnosticEvent(),
      source: { packageName: '@public/tool', packageVersion: `version-${PRIVATE_PRODUCER}`, component: PRIVATE_PRODUCER },
      payload: {
        ...diagnosticEvent().payload,
        source: { kind: 'file', file: `/repo/${PRIVATE_PRODUCER}/index.ts`, line: 3, toolName: 'typescript' }
      }
    };
    let output: string = '';
    new JsonReporter({ write: (text) => { output += text; } }).report(event);
    const projected = JSON.parse(output);
    expect(output).not.toContain(PRIVATE_PRODUCER);
    expect(projected.source).toEqual({ packageName: '@public/tool', packageVersion: '[private-version]' });
    expect(projected.payload.source).toEqual({ kind: 'file', file: '[secret]', line: 3, toolName: 'typescript' });
  });

  it('does not classify every source field as secret for an empty secret value', () => {
    const event: IReporterEventEnvelope<IRushDiagnostic> = {
      ...diagnosticEvent(),
      payload: { ...diagnosticEvent().payload, parameters: { empty: { value: '', privacy: 'secret' } } }
    };
    let output: string = '';
    new JsonReporter({ write: (text) => { output += text; } }).report(event);
    const projected = JSON.parse(output);
    expect(projected.source).toEqual(event.source);
    expect(projected.payload.source).toEqual(event.payload.source);
  });

  it('retains source context in the complete owner-only log without mutating the diagnostic', async () => {
    const directory: string = fs.mkdtempSync(path.join(os.tmpdir(), 'reporter-source-alias-'));
    const event = diagnosticEvent();
    const original: string = JSON.stringify(event);
    const reporter = new FileReporter({ commonTempFolder: directory });
    try {
      reporter.report(event);
      await reporter.closeAsync();
      const artifact = reporter.getArtifact();
      expect(artifact.available).toBe(true);
      expect(artifact.complete).toBe(true);
      const content: string = fs.readFileSync(artifact.path!, 'utf8');
      const metadata = JSON.parse(content.split('\n').find((line) => line.startsWith('# {'))!.slice(2));
      expect(metadata.source).toEqual(event.source);
      expect(metadata.payload.source).toEqual(event.payload.source);
      expect(metadata.payload.parameters.pluginName.value).toBe('[secret]');
      if (process.platform !== 'win32') expect(fs.statSync(artifact.path!).mode % 0o1000).toBe(0o600);
      expect(JSON.stringify(event)).toBe(original);
    } finally {
      await reporter.closeAsync();
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });
});
