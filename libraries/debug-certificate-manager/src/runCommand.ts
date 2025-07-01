// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { Executable } from '@rushstack/node-core-library';
import type { ITerminal } from '@rushstack/terminal';
import * as child_process from 'node:child_process';
import * as path from 'node:path';
import * as os from 'node:os';
import * as fs from 'node:fs';

export interface IRunResult {
  stdout: string[];
  stderr: string[];
  /**
   * The exit code, or -1 if the child process was terminated by a signal
   */
  exitCode: number;
}

export function randomTmpPath(prefix?: string, suffix?: string): string {
  return path.join(os.tmpdir(), `${prefix || 'tmp-'}${Math.random().toString(36).slice(2)}${suffix || ''}`);
}

export async function darwinRunSudoAsync(
  terminal: ITerminal,
  command: string,
  params: string[]
): Promise<IRunResult> {
  if (process.platform !== 'darwin') {
    throw new Error('This function is only supported on macOS.');
  }

  const tmpPrefix: string = 'sudo-runner-';
  const stdoutFile: string = randomTmpPath(tmpPrefix, '.stdout');
  const stderrFile: string = randomTmpPath(tmpPrefix, '.stderr');
  const exitFile: string = randomTmpPath(tmpPrefix, '.exit');

  const commandStr: string = `${command} ${params.join(' ')}`;
  terminal.writeLine(`Running command with elevated privileges: ${commandStr}`);

  // Wrap the shell command in a bash command and capture stdout, stderr, and exit code
  const shellScript: string = `bash -c 'echo "\\n\\nRunning command with elevated privileges: ${commandStr}"; sudo ${commandStr} > "${stdoutFile}" 2> "${stderrFile}"; echo $? > "${exitFile}"'`;

  // This AppleScript opens a new Terminal window, runs the shell script, waits for it to finish and then closes the Terminal window.
  const appleScript: string = `
  tell application "Terminal"
    activate
    set win to do script "${shellScript.replace(/"/g, '\\"')}"
    repeat
      delay 0.5
      if not busy of window 1 then exit repeat
    end repeat
    close window 1
  end tell
    `;

  terminal.writeLine(`Running AppleScript: ${appleScript}`);

  const child: child_process.ChildProcess = child_process.spawn('osascript', ['-e', appleScript]);

  return await new Promise((resolve, reject) => {
    child.on('close', async (code) => {
      try {
        const stdout: string = fs.readFileSync(stdoutFile, 'utf8');
        const stderr: string = fs.readFileSync(stderrFile, 'utf8');
        const exitCode: string = fs.readFileSync(exitFile, 'utf8');

        fs.unlinkSync(stdoutFile);
        fs.unlinkSync(stderrFile);
        fs.unlinkSync(exitFile);

        resolve({
          stdout: stdout.split('\n'),
          stderr: stderr.split('\n'),
          exitCode: Number(exitCode.trim())
        });
      } catch (err) {
        reject(err);
      }
    });
    child.on('error', reject);
  });
}

export async function runAsync(command: string, params: string[]): Promise<IRunResult> {
  const result: child_process.ChildProcess = Executable.spawn(command, params);
  return await _handleChildProcess(result);
}

async function _handleChildProcess(childProcess: child_process.ChildProcess): Promise<IRunResult> {
  return await new Promise((resolve: (result: IRunResult) => void) => {
    const stderr: string[] = [];
    childProcess.stderr?.on('data', (data: Buffer) => {
      stderr.push(data.toString());
    });

    const stdout: string[] = [];
    childProcess.stdout?.on('data', (data: Buffer) => {
      stdout.push(data.toString());
    });

    childProcess.on('close', (exitCode: number | null, signal: NodeJS.Signals | null) => {
      const normalizedExitCode: number = typeof exitCode === 'number' ? exitCode : signal ? -1 : 0;
      resolve({ exitCode: normalizedExitCode, stdout, stderr });
    });
  });
}
