// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as childProcess from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type { Readable, Writable } from 'node:stream';

import { HeftChildReporter } from './HeftChildReporter';

describe(HeftChildReporter.name, () => {
  it('preserves standalone behavior when no parent descriptors are present', () => {
    expect(HeftChildReporter.tryInitialize({})).toBeUndefined();
  });

  it('does not write to or close descriptors that are not pipes', () => {
    const folderPath: string = fs.mkdtempSync(path.join(os.tmpdir(), 'heft-child-reporter-'));
    const eventPath: string = path.join(folderPath, 'event');
    const acknowledgementPath: string = path.join(folderPath, 'ack');
    const eventFd: number = fs.openSync(eventPath, 'w+');
    const acknowledgementFd: number = fs.openSync(acknowledgementPath, 'w+');
    try {
      expect(
        HeftChildReporter.tryInitialize({
          _RUSH_REPORTER_CHILD_FD: String(eventFd),
          _RUSH_REPORTER_CHILD_ACK_FD: String(acknowledgementFd)
        })
      ).toBeUndefined();
      expect(fs.readFileSync(eventPath, 'utf8')).toBe('');
      expect(() => fs.writeSync(acknowledgementFd, 'still open')).not.toThrow();
    } finally {
      fs.closeSync(eventFd);
      fs.closeSync(acknowledgementFd);
      fs.rmSync(folderPath, { recursive: true });
    }
  });

  it('negotiates context and emits ordered structured output and diagnostics', async () => {
    const modulePath: string = require.resolve('./HeftChildReporter');
    const childScript: string = `
      const { HeftChildReporter } = require(process.argv[1]);
      const reporter = HeftChildReporter.tryInitialize(process.env);
      if (!reporter) {
        process.stdout.write('fallback');
        process.exit(2);
      }
      if (reporter.parentReporterName !== 'json' || reporter.terminalWidth !== 132) process.exit(3);
      reporter.setCommandName('build');
      reporter.write('visible output\\n', 0);
      reporter.write('hidden verbose output\\n', 3);
      reporter.emitDiagnostic('typescript', new Error('structured failure'), 'error');
    `;
    const child: childProcess.ChildProcess = childProcess.spawn(
      process.execPath,
      ['-e', childScript, modulePath],
      {
        env: {
          ...process.env,
          _RUSH_REPORTER_CHILD_FD: '3',
          _RUSH_REPORTER_CHILD_ACK_FD: '4'
        },
        stdio: ['ignore', 'pipe', 'pipe', 'pipe', 'pipe']
      }
    );
    const descriptor: Readable = child.stdio[3] as Readable;
    const acknowledgement: Writable = child.stdio[4] as Writable;
    let descriptorText: string = '';
    let acknowledgementSent: boolean = false;
    descriptor.setEncoding('utf8');
    descriptor.on('data', (chunk: string) => {
      descriptorText += chunk;
      if (!acknowledgementSent && descriptorText.includes('\n')) {
        acknowledgementSent = true;
        acknowledgement.end(
          `${JSON.stringify({
            kind: 'helloAck',
            protocolVersion: { major: 1, minor: 2 },
            acceptedCapabilities: ['heft-child-events-v1', 'reporter-context-v1'],
            rejectedRequiredFeatures: [],
            context: {
              reporter: 'json',
              logLevel: 'normal',
              color: false,
              terminalWidth: 132
            }
          })}\n`
        );
      }
    });

    let stdout: string = '';
    child.stdout?.setEncoding('utf8').on('data', (chunk: string) => {
      stdout += chunk;
    });
    const exitCode: number | null = await new Promise((resolve, reject) => {
      child.once('error', reject);
      child.once('close', resolve);
    });

    expect(exitCode).toBe(0);
    expect(stdout).toBe('');
    const records: Array<Record<string, unknown>> = descriptorText
      .trim()
      .split('\n')
      .map((line: string) => JSON.parse(line) as Record<string, unknown>);
    expect(records[0].kind).toBe('hello');
    expect(records.slice(1).map((record) => record.type)).toEqual(['externalOutput', 'diagnosticEmitted']);
    expect(records.slice(1).map((record) => record.sequence)).toEqual([1, 2]);
    expect((records[1].scope as { commandName?: string }).commandName).toBe('build');
    expect((records[1].payload as { text?: string }).text).toBe('visible output\n');
    expect((records[2].payload as { severity?: string }).severity).toBe('error');
  });

  it('uses safe context defaults when the accepted context capability has no payload', async () => {
    const modulePath: string = require.resolve('./HeftChildReporter');
    const childScript: string = `
      const { HeftChildReporter } = require(process.argv[1]);
      const reporter = HeftChildReporter.tryInitialize(process.env);
      if (!reporter) process.exit(2);
      if (reporter.parentReporterName !== 'plaintext' || reporter.terminalWidth !== 80) process.exit(3);
      reporter.write('structured with defaults\\n', 0);
    `;
    const child: childProcess.ChildProcess = childProcess.spawn(
      process.execPath,
      ['-e', childScript, modulePath],
      {
        env: {
          ...process.env,
          _RUSH_REPORTER_CHILD_FD: '3',
          _RUSH_REPORTER_CHILD_ACK_FD: '4'
        },
        stdio: ['ignore', 'pipe', 'pipe', 'pipe', 'pipe']
      }
    );
    const descriptor: Readable = child.stdio[3] as Readable;
    const acknowledgement: Writable = child.stdio[4] as Writable;
    let descriptorText: string = '';
    descriptor.setEncoding('utf8');
    descriptor.on('data', (chunk: string) => {
      descriptorText += chunk;
      if (descriptorText.split('\n').length === 2) {
        acknowledgement.end(
          `${JSON.stringify({
            kind: 'helloAck',
            protocolVersion: { major: 1, minor: 2 },
            acceptedCapabilities: ['heft-child-events-v1', 'reporter-context-v1'],
            rejectedRequiredFeatures: []
          })}\n`
        );
      }
    });

    const exitCode: number | null = await new Promise((resolve, reject) => {
      child.once('error', reject);
      child.once('close', resolve);
    });

    expect(exitCode).toBe(0);
    expect(descriptorText).toContain('structured with defaults');
  });

  it.each([0, 'wide'])(
    'falls back safely for invalid parent terminal width %p',
    async (terminalWidth: unknown) => {
      const modulePath: string = require.resolve('./HeftChildReporter');
      const childScript: string = `
      const { HeftChildReporter } = require(process.argv[1]);
      const reporter = HeftChildReporter.tryInitialize(process.env);
      if (reporter) process.exit(2);
      process.stdout.write('context fallback');
    `;
      const child: childProcess.ChildProcess = childProcess.spawn(
        process.execPath,
        ['-e', childScript, modulePath],
        {
          env: {
            ...process.env,
            _RUSH_REPORTER_CHILD_FD: '3',
            _RUSH_REPORTER_CHILD_ACK_FD: '4'
          },
          stdio: ['ignore', 'pipe', 'pipe', 'pipe', 'pipe']
        }
      );
      const descriptor: Readable = child.stdio[3] as Readable;
      const acknowledgement: Writable = child.stdio[4] as Writable;
      let descriptorText: string = '';
      let acknowledgementSent: boolean = false;
      descriptor.setEncoding('utf8');
      descriptor.on('data', (chunk: string) => {
        descriptorText += chunk;
        if (!acknowledgementSent && descriptorText.includes('\n')) {
          acknowledgementSent = true;
          acknowledgement.end(
            `${JSON.stringify({
              kind: 'helloAck',
              protocolVersion: { major: 1, minor: 2 },
              acceptedCapabilities: ['heft-child-events-v1', 'reporter-context-v1'],
              rejectedRequiredFeatures: [],
              context: {
                reporter: 'json',
                logLevel: 'normal',
                color: false,
                terminalWidth
              }
            })}\n`
          );
        }
      });
      let stdout: string = '';
      child.stdout?.setEncoding('utf8').on('data', (chunk: string) => {
        stdout += chunk;
      });

      const exitCode: number | null = await new Promise((resolve, reject) => {
        child.once('error', reject);
        child.once('close', resolve);
      });

      expect(exitCode).toBe(0);
      expect(stdout).toBe('context fallback');
    }
  );
});
