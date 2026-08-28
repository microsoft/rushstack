// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { RushCommandLineParser } from '../RushCommandLineParser';
import { EnvironmentConfiguration } from '../../api/EnvironmentConfiguration';
import { RushConfiguration } from '../../api/RushConfiguration';

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

    const terminalProvider: { debugEnabled: boolean; verboseEnabled: boolean } = (
      parser as unknown as {
        _terminalProvider: { debugEnabled: boolean; verboseEnabled: boolean };
      }
    )._terminalProvider;
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
    const parser: RushCommandLineParser = Object.create(RushCommandLineParser.prototype);
    Object.defineProperty(parser, '_debugParameter', { value: { value: false } });
    Object.defineProperty(parser, '_rushOptions', { value: { reporterCloseAsync: closeAsync } });
    const exitSpy: jest.SpyInstance<never, [code?: string | number | null | undefined]> = jest
      .spyOn(process, 'exit')
      .mockImplementation(() => undefined as never);
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    process.exitCode = 0;

    const reportErrorAndSetExitCode: (error: Error) => void = (
      parser as unknown as {
        _reportErrorAndSetExitCode(error: Error): void;
      }
    )._reportErrorAndSetExitCode.bind(parser);
    reportErrorAndSetExitCode(new Error('parser failed'));

    expect(closeAsync).toHaveBeenCalledTimes(1);
    expect(exitSpy).not.toHaveBeenCalled();
    process.exitCode = 0;

    resolveClose!();
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
    const parser: RushCommandLineParser = Object.create(RushCommandLineParser.prototype);
    Object.defineProperty(parser, '_rushOptions', {
      value: { reporterCloseAsync: async () => Promise.reject(new Error('close failed')) }
    });
    const errorSpy: jest.SpyInstance = jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
    process.exitCode = 0;

    const closeReporterAsync: () => Promise<void> = (
      parser as unknown as {
        _closeReporterAsync(): Promise<void>;
      }
    )._closeReporterAsync.bind(parser);
    await expect(closeReporterAsync()).resolves.toBeUndefined();

    expect(process.exitCode).toBe(1);
    expect(errorSpy).toHaveBeenCalledWith('[reporter] Unable to finalize reporters: close failed\n');
  });

  it('shares one reporter close operation across failure and finalization paths', async () => {
    let resolveClose: (() => void) | undefined;
    const closeAsync: jest.Mock<Promise<void>, []> = jest.fn(
      () =>
        new Promise<void>((resolve: () => void) => {
          resolveClose = resolve;
        })
    );
    const parser: RushCommandLineParser = Object.create(RushCommandLineParser.prototype);
    Object.defineProperty(parser, '_rushOptions', { value: { reporterCloseAsync: closeAsync } });

    const closeReporterAsync: () => Promise<void> = (
      parser as unknown as {
        _closeReporterAsync(): Promise<void>;
      }
    )._closeReporterAsync.bind(parser);
    const firstClose: Promise<void> = closeReporterAsync();
    const secondClose: Promise<void> = closeReporterAsync();

    expect(closeAsync).toHaveBeenCalledTimes(1);
    resolveClose!();
    await expect(Promise.all([firstClose, secondClose])).resolves.toEqual([undefined, undefined]);
    expect(closeAsync).toHaveBeenCalledTimes(1);
  });
});
