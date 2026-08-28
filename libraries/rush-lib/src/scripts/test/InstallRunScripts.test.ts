// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as childProcess from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { NPM_OUTPUT_CAPTURE_SCRIPT } from '../install-run';

async function withTempDir(action: (directory: string) => Promise<void>): Promise<void> {
  const directory: string = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'install-run-script-test-'));
  try {
    await action(directory);
  } finally {
    await fs.promises.rm(directory, { recursive: true, force: true });
  }
}

describe('install-run script integration', () => {
  it('tees npm output live to the matching streams while capturing ordered records once', async () => {
    await withTempDir(async (directory: string) => {
      const capturePath: string = path.join(directory, 'capture.ndjson');
      await fs.promises.writeFile(capturePath, '');
      const childScript: string = [
        "process.stdout.write('stdout 1\\n');",
        "setTimeout(() => process.stderr.write('stderr 1\\n'), 25);",
        "setTimeout(() => process.stdout.write('stdout 2\\n'), 50);"
      ].join('');
      const wrapper: childProcess.ChildProcessWithoutNullStreams = childProcess.spawn(
        process.execPath,
        [
          '-e',
          NPM_OUTPUT_CAPTURE_SCRIPT,
          process.execPath,
          JSON.stringify(['-e', childScript]),
          capturePath,
          '0',
          String(1024 * 1024),
          '1',
          '1'
        ],
        { cwd: directory }
      );

      let stdoutText: string = '';
      let stderrText: string = '';
      let sawLiveOutputBeforeClose: boolean = false;
      let closed: boolean = false;
      wrapper.stdout.on('data', (chunk: Buffer) => {
        stdoutText += chunk.toString();
        sawLiveOutputBeforeClose ||= !closed;
      });
      wrapper.stderr.on('data', (chunk: Buffer) => {
        stderrText += chunk.toString();
        sawLiveOutputBeforeClose ||= !closed;
      });
      const exitCode: number | null = await new Promise((resolve, reject) => {
        wrapper.on('error', reject);
        wrapper.on('close', (code: number | null) => {
          closed = true;
          resolve(code);
        });
      });

      expect(exitCode).toBe(0);
      expect(sawLiveOutputBeforeClose).toBe(true);
      expect(stdoutText).toBe('stdout 1\nstdout 2\n');
      expect(stderrText).toBe('stderr 1\n');
      expect(
        (await fs.promises.readFile(capturePath, 'utf8'))
          .trim()
          .split('\n')
          .map((line: string) => JSON.parse(line))
      ).toEqual([
        { stream: 'stdout', text: 'stdout 1\n', wasRendered: true },
        { stream: 'stderr', text: 'stderr 1\n', wasRendered: true },
        { stream: 'stdout', text: 'stdout 2\n', wasRendered: true }
      ]);
    });
  });

  it('keeps machine-reporter stdout structured while stderr remains live', async () => {
    await withTempDir(async (directory: string) => {
      const capturePath: string = path.join(directory, 'capture.ndjson');
      await fs.promises.writeFile(capturePath, '');
      const wrapper: childProcess.SpawnSyncReturns<string> = childProcess.spawnSync(
        process.execPath,
        [
          '-e',
          NPM_OUTPUT_CAPTURE_SCRIPT,
          process.execPath,
          JSON.stringify([
            '-e',
            "process.stdout.write('stdout\\n'); setTimeout(() => process.stderr.write('stderr\\n'), 25);"
          ]),
          capturePath,
          '0',
          String(1024 * 1024),
          '0',
          '1'
        ],
        { cwd: directory, encoding: 'utf8' }
      );

      expect(wrapper.status).toBe(0);
      expect(wrapper.stdout).toBe('');
      expect(wrapper.stderr).toBe('stderr\n');
      expect(
        (await fs.promises.readFile(capturePath, 'utf8'))
          .trim()
          .split('\n')
          .map((line: string) => JSON.parse(line))
      ).toEqual([
        { stream: 'stdout', text: 'stdout\n', wasRendered: false },
        { stream: 'stderr', text: 'stderr\n', wasRendered: true }
      ]);
    });
  });

  it('reports missing and invalid rush.json errors without an unhandled stack', async () => {
    await withTempDir(async (directory: string) => {
      const builtScriptPath: string = path.resolve(__dirname, '../../../dist/scripts/install-run-rush.js');
      const scriptPath: string = path.join(directory, 'install-run-rush.js');
      await fs.promises.copyFile(builtScriptPath, scriptPath);
      await fs.promises.copyFile(
        path.resolve(__dirname, '../../../dist/scripts/install-run.js'),
        path.join(directory, 'install-run.js')
      );

      const missingResult: childProcess.SpawnSyncReturns<string> = childProcess.spawnSync(
        process.execPath,
        [scriptPath, 'build'],
        { cwd: directory, encoding: 'utf8', env: { ...process.env, RUSH_PREVIEW_VERSION: undefined } }
      );
      expect(missingResult.status).toBe(1);
      expect(missingResult.stderr).toContain('Error: Unable to find rush.json.');
      expect(missingResult.stderr).not.toMatch(/\n\s+at /);

      await fs.promises.writeFile(path.join(directory, 'rush.json'), '{ "rushVersion": false }\n');
      const invalidResult: childProcess.SpawnSyncReturns<string> = childProcess.spawnSync(
        process.execPath,
        [scriptPath, 'build'],
        { cwd: directory, encoding: 'utf8', env: { ...process.env, RUSH_PREVIEW_VERSION: undefined } }
      );
      expect(invalidResult.status).toBe(1);
      expect(invalidResult.stderr).toContain(
        'Error: Unable to determine the required version of Rush from rush.json'
      );
      expect(invalidResult.stderr).not.toMatch(/\n\s+at /);
    });
  });
});
