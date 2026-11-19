// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type * as childProcess from 'node:child_process';
import { EventEmitter } from 'node:events';

import { PackageJsonLookup } from '@rushstack/node-core-library';
import { StringBufferTerminalProvider, Terminal } from '@rushstack/terminal';

import { RushXCommand } from '../RushXCommandLine';

type EndScript = (child: EventEmitter, controller: AbortController) => void;

interface IServedResult {
  exitCode: number;
  stderr: string;
}

async function runOwnedScriptAsync(endScript: EndScript): Promise<IServedResult> {
  const controller: AbortController = new AbortController();
  const terminalProvider: StringBufferTerminalProvider = new StringBufferTerminalProvider();
  const terminal: Terminal = new Terminal(terminalProvider);
  const exitCode: number = await RushXCommand.executeAsync({
    arguments: RushXCommand.parseArguments(['-q', 'nap'], {}),
    abortSignal: controller.signal,
    cwd: '/repo/app',
    environment: {},
    rushConfiguration: undefined,
    terminal,
    consoleTerminal: terminal,
    launchOptions: { isManaged: false },
    spawn: () => {
      const child: EventEmitter = new EventEmitter();
      setImmediate(() => endScript(child, controller));
      return child as childProcess.ChildProcess;
    }
  });
  return { exitCode, stderr: terminalProvider.getErrorOutput({ normalizeSpecialCharacters: false }) };
}

describe(`${RushXCommand.name} with an owned spawn`, () => {
  beforeEach(() => {
    jest
      .spyOn(PackageJsonLookup.prototype, 'tryGetPackageJsonFilePathFor')
      .mockReturnValue('/repo/app/package.json');
    jest
      .spyOn(PackageJsonLookup.prototype, 'loadPackageJson')
      .mockReturnValue({ name: 'app', version: '1.0.0', scripts: { nap: 'sleep 60' } });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('prints nothing for a script that ends because the request was aborted', async () => {
    const result: IServedResult = await runOwnedScriptAsync((child, controller) => {
      controller.abort(new Error('The request was cancelled.'));
      child.emit('close', null, 'SIGTERM');
    });
    expect(result).toEqual({ exitCode: 1, stderr: '' });
  });

  it('prints an error that is not the abort reason, even after an abort', async () => {
    const result: IServedResult = await runOwnedScriptAsync((child, controller) => {
      controller.abort(new Error('The request was cancelled.'));
      child.emit('error', new Error('spawn sh EACCES'));
    });
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('Error: spawn sh EACCES');
  });

  it('names the signal that ended a script when the request was not aborted', async () => {
    const result: IServedResult = await runOwnedScriptAsync((child) => {
      child.emit('close', null, 'SIGKILL');
    });
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('Error: The script was ended by SIGKILL.');
  });
});
