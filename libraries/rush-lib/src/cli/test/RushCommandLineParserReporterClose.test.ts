// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { RushCommandLineParser } from '../RushCommandLineParser';
import { EnvironmentConfiguration } from '../../api/EnvironmentConfiguration';
import { RushConfiguration } from '../../api/RushConfiguration';
import { ConsoleTerminalProvider } from '@rushstack/terminal';

describe('RushCommandLineParser reporter close', () => {
  let originalExitCode: string | number | undefined;
  const originalArgv: string[] = process.argv;

  beforeEach(() => {
    originalExitCode = process.exitCode;
    process.exitCode = undefined;
  });

  afterEach(() => {
    process.exitCode = originalExitCode;
    process.argv = originalArgv;
    EnvironmentConfiguration.reset();
    jest.restoreAllMocks();
  });

  it('does not treat pass-through quiet, debug, or json arguments as Rush controls', async () => {
    process.argv = ['node', 'rush', 'build', '--', '--quiet', '-q', '--debug', '-d', '--json'];

    expect(RushCommandLineParser.shouldRestrictConsoleOutput()).toBe(false);

    const parser: RushCommandLineParser = new RushCommandLineParser({
      cwd: `${__dirname}/repo`,
      reporterCloseAsync: async () => undefined
    });
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    await parser.executeAsync(['not-a-rush-command']);

    const terminalProvider = parser.rushSession.terminalProvider;
    if (!(terminalProvider instanceof ConsoleTerminalProvider)) {
      throw new Error('Expected the native console terminal provider.');
    }
    expect(terminalProvider.debugEnabled).toBe(false);
    expect(terminalProvider.verboseEnabled).toBe(false);
  });

  it('closes after command-line parser rejection', async () => {
    const closeAsync: jest.Mock<Promise<void>, []> = jest.fn(async () => undefined);
    const parser: RushCommandLineParser = new RushCommandLineParser({
      cwd: `${__dirname}/repo`,
      reporterCloseAsync: closeAsync
    });
    jest.spyOn(console, 'error').mockImplementation(() => undefined);

    await expect(parser.executeAsync(['not-a-rush-command'])).resolves.toBe(false);

    expect(closeAsync).toHaveBeenCalledTimes(1);
  });

  it.each(['build', 'rebuild', 'check'])('accepts post-command --verbose for %s', async (commandName) => {
    const parser: RushCommandLineParser = new RushCommandLineParser({
      cwd: `${__dirname}/repo`,
      reporterCloseAsync: async () => undefined
    });
    jest.spyOn(console, 'log').mockImplementation(() => undefined);
    jest.spyOn(console, 'error').mockImplementation(() => undefined);

    await expect(parser.executeAsync([commandName, '--verbose', '--help'])).resolves.toBe(true);
  });

  it('waits for reporter close before an explicit parser exit', async () => {
    let resolveClose: (() => void) | undefined;
    const closeAsync: jest.Mock<Promise<void>, []> = jest.fn(
      () =>
        new Promise<void>((resolve: () => void) => {
          resolveClose = resolve;
        })
    );
    const exitSpy: jest.SpyInstance<never, [code?: string | number | null | undefined]> = jest
      .spyOn(process, 'exit')
      .mockImplementation(() => undefined as never);
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    process.exitCode = 0;
    jest.spyOn(RushConfiguration, 'tryFindRushJsonLocation').mockImplementation(() => {
      throw new Error('parser failed');
    });
    const parser: RushCommandLineParser = new RushCommandLineParser({
      cwd: `${__dirname}/repo`,
      reporterCloseAsync: closeAsync
    });
    const execution: Promise<boolean> = parser.executeAsync();

    expect(closeAsync).toHaveBeenCalledTimes(1);
    expect(exitSpy).not.toHaveBeenCalled();
    process.exitCode = 0;

    resolveClose!();
    await expect(execution).resolves.toBe(false);
    await new Promise<void>((resolve: () => void) => setImmediate(resolve));

    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('does not execute after an initialization failure', async () => {
    let resolveClose: (() => void) | undefined;
    const closeAsync: jest.Mock<Promise<void>, []> = jest.fn(
      () =>
        new Promise<void>((resolve: () => void) => {
          resolveClose = resolve;
        })
    );
    jest.spyOn(RushConfiguration, 'tryFindRushJsonLocation').mockImplementation(() => {
      throw new Error('configuration failed');
    });
    const exitSpy: jest.SpyInstance<never, [code?: string | number | null | undefined]> = jest
      .spyOn(process, 'exit')
      .mockImplementation(() => undefined as never);
    jest.spyOn(console, 'error').mockImplementation(() => undefined);

    const parser: RushCommandLineParser = new RushCommandLineParser({
      cwd: `${__dirname}/repo`,
      reporterCloseAsync: closeAsync
    });
    const executePromise: Promise<boolean> = parser.executeAsync();

    expect(closeAsync).toHaveBeenCalledTimes(1);
    resolveClose!();
    await expect(executePromise).resolves.toBe(false);
    await new Promise<void>((resolve: () => void) => setImmediate(resolve));
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('reports close failure without rejecting from parser finalization', async () => {
    const parser: RushCommandLineParser = new RushCommandLineParser({
      cwd: `${__dirname}/repo`,
      reporterCloseAsync: async () => {
        throw new Error('close failed');
      }
    });
    const errorSpy: jest.SpyInstance = jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
    jest.spyOn(process.stdout, 'write').mockImplementation(() => true);
    process.exitCode = 0;

    await expect(parser.executeAsync(['--help'])).resolves.toBe(true);

    expect(process.exitCode).toBe(1);
    expect(errorSpy).toHaveBeenCalledWith('[reporter] Unable to finalize reporters: close failed\n');
  });
});
