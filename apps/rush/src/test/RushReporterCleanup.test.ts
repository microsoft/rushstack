// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import {
  BootstrapEventBuffer,
  ReporterManager,
  RUSH_REPORTER_BOOTSTRAP_HANDOFF_ENV_VAR,
  RUSH_REPORTER_BOOTSTRAP_NONCE_ENV_VAR,
  writeBootstrapHandoffFileAsync,
  type IReporterContext
} from '@rushstack/rush-reporter';

import { initializeRushReporterHostAsync } from '../RushReporterHost';

describe('selected reporter initialization cleanup', () => {
  it.each(['incompatible-protocol', 'unsupported-required-event'])(
    'closes initialized output descriptors when rejecting %s',
    async (skipReason: string) => {
      const directory: string = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'rush-host-disposal-'));
      const outputPath: string = path.join(directory, 'output.ndjson');
      let outputDescriptor: number | undefined;
      const filesystem: typeof fs = jest.requireActual<typeof fs>('node:fs');
      const originalOpen: typeof fs.openSync = filesystem.openSync;
      const openSpy: jest.SpyInstance = jest
        .spyOn(filesystem, 'openSync')
        .mockImplementation((filePath, flags, mode) => {
          const descriptor: number = originalOpen(filePath, flags, mode);
          if (filePath === outputPath) outputDescriptor = descriptor;
          return descriptor;
        });
      try {
        const buffer: BootstrapEventBuffer = new BootstrapEventBuffer({
          sessionId: 'bootstrap-session',
          source: { packageName: 'install-run-rush', packageVersion: '5.178.1' }
        });
        buffer.emit({ type: 'sessionStarted', payload: {} });
        const { handoffPath, nonce } = await writeBootstrapHandoffFileAsync(buffer, { directory });
        const lines: string[] = (await fs.promises.readFile(handoffPath, 'utf8')).trimEnd().split('\n');
        const event: Record<string, unknown> = JSON.parse(lines[1]);
        if (skipReason === 'incompatible-protocol') {
          event.protocolVersion = { major: 99, minor: 0 };
        } else {
          event.type = 'futureRequiredEvent';
          event.required = true;
        }
        lines[1] = JSON.stringify(event);
        await fs.promises.writeFile(handoffPath, `${lines.join('\n')}\n`);
        const env: Record<string, string | undefined> = {
          [RUSH_REPORTER_BOOTSTRAP_HANDOFF_ENV_VAR]: handoffPath,
          [RUSH_REPORTER_BOOTSTRAP_NONCE_ENV_VAR]: nonce
        };
        await expect(
          initializeRushReporterHostAsync({
            argv: ['build', '--reporter=json', `--output=json://${outputPath}`],
            env,
            handoffDirectory: directory,
            includeDefaultFileReporter: false,
            stdout: { isTTY: false, write: () => undefined },
            stderr: { write: () => undefined }
          })
        ).rejects.toThrow(/bootstrap reporter/);
        expect(outputDescriptor).toBeDefined();
        expect(() => fs.fstatSync(outputDescriptor!)).toThrow(expect.objectContaining({ code: 'EBADF' }));
        expect(fs.existsSync(handoffPath)).toBe(false);
        expect(env).toEqual({});
      } finally {
        openSpy.mockRestore();
        if (outputDescriptor !== undefined) {
          try {
            fs.closeSync(outputDescriptor);
          } catch (error) {
            expect(error).toMatchObject({ code: 'EBADF' });
          }
        }
        await fs.promises.rm(directory, { recursive: true, force: true });
      }
    }
  );

  it.each([new Error('original initialization failure'), 'original non-Error failure'])(
    'preserves the initialization failure after cleanup and emergency reporting fail: %s',
    async (originalError) => {
      const manager: ReporterManager = new ReporterManager();
      let context: IReporterContext | undefined;
      const close: jest.Mock = jest.fn(async () => {
        throw new Error('cleanup failure');
      });
      manager.addReporter({
        name: 'partially-initialized',
        initializeAsync: async (value) => {
          context = value;
          throw originalError;
        },
        report: () => undefined,
        flushAsync: async () => undefined,
        closeAsync: close
      });
      await expect(
        initializeRushReporterHostAsync({
          argv: [],
          env: {},
          manager,
          includeDefaultFileReporter: false,
          stderr: {
            write: () => {
              throw new Error('emergency output failed');
            }
          }
        })
      ).rejects.toBe(originalError);
      expect(close).toHaveBeenCalledTimes(1);
      expect(context?.abortSignal?.aborted).toBe(true);
      if (originalError instanceof Error) {
        expect(context?.abortSignal?.reason).toBe(originalError);
      } else {
        expect(context?.abortSignal?.reason.cause).toBe(originalError);
      }
    }
  );
});
