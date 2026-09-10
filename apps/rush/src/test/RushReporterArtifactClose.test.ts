// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import type { IReporterEventEnvelope } from '@rushstack/rush-reporter';

import { initializeRushReporterHostAsync } from '../RushReporterHost';

describe('reporter artifact completion boundary', () => {
  it.each(['success', 'fsync failure', 'close failure'] as const)(
    'publishes final artifact status only after physical closure: %s',
    async (outcome) => {
      const directory: string = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'rush-artifact-close-'));
      const fsModule: typeof fs = jest.requireActual('node:fs');
      const originalClose: typeof fs.closeSync = fsModule.closeSync;
      const trace: string[] = [];
      let output: string = '';
      const warnings: string[] = [];
      const initialized = await initializeRushReporterHostAsync({
        argv: ['build', '--reporter=json', '--log-level=debug'],
        env: {},
        commonTempFolder: directory,
        stdout: {
          isTTY: false,
          write: (text: string) => {
            output += text;
            const event = JSON.parse(text) as IReporterEventEnvelope<{ complete?: boolean }>;
            if (event.type === 'artifactAvailable' && event.payload.complete === true) {
              trace.push('complete notification');
            }
          }
        }
      });
      const stderrSpy = jest.spyOn(process.stderr, 'write').mockImplementation((text) => {
        warnings.push(String(text));
        return true;
      });
      const closeSpy = jest.spyOn(fsModule, 'closeSync').mockImplementation((fd: number) => {
        trace.push('close attempt');
        originalClose(fd);
        if (outcome === 'close failure') {
          throw new Error('injected close failure');
        }
        trace.push('close succeeded');
      });
      const fsyncSpy = jest.spyOn(fsModule, 'fsyncSync');
      if (outcome === 'fsync failure') {
        fsyncSpy.mockImplementation(() => {
          throw new Error('injected fsync failure');
        });
      }
      const base = {
        protocolVersion: { major: 1, minor: 1 },
        sessionId: 'session',
        source: { packageName: '@microsoft/rush', packageVersion: '5.178.1' }
      };
      try {
        initialized.sink.emit({
          ...base,
          privacy: 'local-sensitive',
          type: 'artifactAvailable',
          payload: { role: 'log', path: initialized.logArtifact?.path, format: 'plaintext', complete: false }
        });
        initialized.sink.emit({
          ...base,
          privacy: 'public',
          type: 'commandResult',
          payload: { commandName: 'build', succeeded: true, exitCode: 0 }
        });
        initialized.sink.emit({
          ...base,
          privacy: 'public',
          type: 'sessionCompleted',
          payload: { exitCode: 0 }
        });
        await initialized.closeAsync();
        await initialized.closeAsync();

        const events: IReporterEventEnvelope<{ complete?: boolean; exitCode?: number }>[] = output
          .trim()
          .split('\n')
          .map((line) => JSON.parse(line));
        const completeEvents = events.filter(
          (event) => event.type === 'artifactAvailable' && event.payload.complete === true
        );
        expect(closeSpy).toHaveBeenCalledTimes(1);
        expect(events.find((event) => event.type === 'commandResult')?.payload.exitCode).toBe(0);
        if (outcome === 'success') {
          expect(completeEvents).toHaveLength(1);
          expect(trace).toEqual(['close attempt', 'close succeeded', 'complete notification']);
          const log: string = await fs.promises.readFile(initialized.logArtifact!.path!, 'utf8');
          expect(log).toContain('"type":"commandResult"');
          expect(log).toContain('"type":"sessionCompleted"');
          const metadata = log
            .split('\n')
            .filter((line) => line.startsWith('# {'))
            .map((line) => JSON.parse(line.slice(2)));
          expect(
            metadata.some((event) => event.type === 'artifactAvailable' && event.payload.complete === true)
          ).toBe(false);
          expect(warnings).toEqual([]);
        } else {
          expect(completeEvents).toHaveLength(0);
          expect(warnings.some((warning) => warning.includes(`injected ${outcome}`))).toBe(true);
        }
      } finally {
        fsyncSpy.mockRestore();
        closeSpy.mockRestore();
        stderrSpy.mockRestore();
        await fs.promises.rm(directory, { recursive: true, force: true });
      }
    }
  );
});
