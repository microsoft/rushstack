// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as childProcess from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

jest.setTimeout(30_000);

const HEFT_START_PATH: string = path.resolve(__dirname, '../start.js');

// A project with one task. The task sets process.exitCode to FIXTURE_EXIT_CODE in the Heft process, the
// way a test that Jest runs in band can, and then fails if FIXTURE_FAIL is set.
const FIXTURE_FILES: Record<string, string> = {
  'package.json': JSON.stringify({ name: 'heft-exit-code-fixture', version: '1.0.0', private: true }),
  'heft-plugin.json': JSON.stringify({
    taskPlugins: [{ pluginName: 'exit-code-fixture-plugin', entryPoint: './plugin.js' }]
  }),
  'config/heft.json': JSON.stringify({
    phasesByName: {
      test: { tasksByName: { fixture: { taskPlugin: { pluginPackage: 'heft-exit-code-fixture' } } } }
    }
  }),
  'plugin.js': `module.exports = class {
  apply(taskSession) {
    taskSession.hooks.run.tapPromise('exit-code-fixture-plugin', async () => {
      process.exitCode = Number(process.env.FIXTURE_EXIT_CODE);
      if (process.env.FIXTURE_FAIL) {
        throw new Error('The fixture task failed on purpose');
      }
    });
  }
};
`
};

interface IHeftResult {
  exitCode: number | undefined;
  output: string;
}

describe('HeftCommandLineParser', () => {
  let fixtureFolderPath: string;

  beforeAll(() => {
    fixtureFolderPath = fs.mkdtempSync(path.join(os.tmpdir(), 'heft-exit-code-'));
    for (const [relativePath, contents] of Object.entries(FIXTURE_FILES)) {
      const filePath: string = path.join(fixtureFolderPath, relativePath);
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(filePath, contents);
    }
  });

  afterAll(() => {
    fs.rmSync(fixtureFolderPath, { recursive: true, force: true });
  });

  async function runHeftTestAsync(taskExitCode: number, taskFails: boolean): Promise<IHeftResult> {
    const env: NodeJS.ProcessEnv = { ...process.env, FIXTURE_EXIT_CODE: String(taskExitCode) };
    delete env.FIXTURE_FAIL;
    delete env._RUSH_REPORTER_CHILD_FD;
    delete env._RUSH_REPORTER_CHILD_ACK_FD;
    if (taskFails) {
      env.FIXTURE_FAIL = '1';
    }

    const child: childProcess.ChildProcess = childProcess.spawn(process.execPath, [HEFT_START_PATH, 'test'], {
      cwd: fixtureFolderPath,
      env,
      stdio: ['ignore', 'pipe', 'pipe']
    });
    let output: string = '';
    const appendOutput: (chunk: string) => void = (chunk: string) => {
      output += chunk;
    };
    child.stdout?.setEncoding('utf8').on('data', appendOutput);
    child.stderr?.setEncoding('utf8').on('data', appendOutput);
    const exitCode: number | null = await new Promise((resolve, reject) => {
      child.once('error', reject);
      child.once('close', resolve);
    });

    return { exitCode: exitCode ?? undefined, output };
  }

  it('exits with 1 when a task fails after code in the Heft process set process.exitCode to 0', async () => {
    const { exitCode, output }: IHeftResult = await runHeftTestAsync(0, true);
    expect(output).toContain('The fixture task failed on purpose');
    expect(exitCode).toBe(1);
  });

  it('exits with 1 when a task fails after code in the Heft process set a negative process.exitCode', async () => {
    const { exitCode, output }: IHeftResult = await runHeftTestAsync(-1, true);
    expect(output).toContain('The fixture task failed on purpose');
    expect(exitCode).toBe(1);
  });

  it('keeps a positive process.exitCode when a task fails', async () => {
    const { exitCode, output }: IHeftResult = await runHeftTestAsync(3, true);
    expect(output).toContain('The fixture task failed on purpose');
    expect(exitCode).toBe(3);
  });

  it('exits with 0 when the task succeeds after code in the Heft process set process.exitCode to 0', async () => {
    const { exitCode, output }: IHeftResult = await runHeftTestAsync(0, false);
    expect(output).not.toContain('The fixture task failed on purpose');
    expect(exitCode).toBe(0);
  });
});
