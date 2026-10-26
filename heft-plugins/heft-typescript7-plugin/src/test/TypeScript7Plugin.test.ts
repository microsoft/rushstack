// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

jest.mock('../TypeScript7Builder', () => ({
  TypeScript7Builder: jest.fn().mockImplementation(() => ({
    invokeAsync: jest.fn(),
    closeAsync: jest.fn()
  }))
}));

import * as path from 'node:path';

import type { HeftConfiguration, IHeftTaskSession } from '@rushstack/heft';

import TypeScript7Plugin from '../TypeScript7Plugin';
import { TypeScript7Builder } from '../TypeScript7Builder';

describe('TypeScript7Plugin', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('reuses the watch builder and disposes it only when Heft finishes', async () => {
    const run = { tapPromise: jest.fn() };
    const runIncremental = { tapPromise: jest.fn() };
    const toolFinish = { tapPromise: jest.fn() };
    const session = { hooks: { run, runIncremental, toolFinish }, logger: { terminal: {} } };
    const configuration = {
      buildFolderPath: path.resolve('/project'),
      rigPackageResolver: { resolvePackageAsync: jest.fn().mockResolvedValue('/compiler') }
    };
    const plugin: TypeScript7Plugin = new TypeScript7Plugin();
    plugin.apply(session as unknown as IHeftTaskSession, configuration as unknown as HeftConfiguration, {
      project: 'config/tsconfig.json'
    });
    const options = { abortSignal: new AbortController().signal };
    await run.tapPromise.mock.calls[0][1](options);
    expect(configuration.rigPackageResolver.resolvePackageAsync).toHaveBeenCalledWith(
      'typescript',
      session.logger.terminal
    );
    expect(TypeScript7Builder).toHaveBeenLastCalledWith({
      typescriptPackagePath: '/compiler',
      buildFolderPath: configuration.buildFolderPath,
      tsconfigPath: path.resolve('/project/config/tsconfig.json'),
      logger: session.logger,
      watchFs: undefined,
      requestRun: undefined,
      abortSignal: options.abortSignal
    });
    const watchOptions = { ...options, watchFs: {}, requestRun: jest.fn() };
    await runIncremental.tapPromise.mock.calls[0][1](watchOptions);
    await runIncremental.tapPromise.mock.calls[0][1](watchOptions);
    expect(TypeScript7Builder).toHaveBeenCalledTimes(2);
    expect(TypeScript7Builder).toHaveBeenLastCalledWith(
      expect.objectContaining({ watchFs: watchOptions.watchFs })
    );
    const watchBuilder = (TypeScript7Builder as jest.Mock).mock.results[1].value;
    expect(watchBuilder.invokeAsync).toHaveBeenLastCalledWith(options.abortSignal, watchOptions.watchFs);
    expect(watchBuilder.closeAsync).not.toHaveBeenCalled();
    await toolFinish.tapPromise.mock.calls[0][1]({});
    expect(watchBuilder.closeAsync).toHaveBeenCalledTimes(1);
  });

  it.each([false, true])('waits for active compilation before shutdown (failure=%s)', async (failure) => {
    const run = { tapPromise: jest.fn() };
    const runIncremental = { tapPromise: jest.fn() };
    const toolFinish = { tapPromise: jest.fn() };
    const session = { hooks: { run, runIncremental, toolFinish }, logger: { terminal: {} } };
    const configuration = {
      buildFolderPath: path.resolve('/project'),
      rigPackageResolver: { resolvePackageAsync: jest.fn().mockResolvedValue('/compiler') }
    };
    let finish!: () => void;
    const pending = new Promise<void>((resolve, reject) => {
      finish = () => failure ? reject(new Error('compile failure')) : resolve();
    });
    const builder = {
      invokeAsync: jest.fn().mockReturnValue(pending),
      closeAsync: jest.fn().mockResolvedValue(undefined)
    };
    (TypeScript7Builder as jest.Mock).mockImplementationOnce(() => builder);
    new TypeScript7Plugin().apply(
      session as unknown as IHeftTaskSession,
      configuration as unknown as HeftConfiguration
    );
    const options = { abortSignal: new AbortController().signal, watchFs: {}, requestRun: jest.fn() };
    const invocation = runIncremental.tapPromise.mock.calls[0][1](options).catch(() => {});
    await new Promise<void>((resolve) => setImmediate(resolve));
    const shutdown = toolFinish.tapPromise.mock.calls[0][1]({});
    await Promise.resolve();
    expect(builder.closeAsync).not.toHaveBeenCalled();
    finish();
    await Promise.all([invocation, shutdown]);
    expect(builder.closeAsync).toHaveBeenCalledTimes(1);
    await runIncremental.tapPromise.mock.calls[0][1](options);
    expect(builder.invokeAsync).toHaveBeenCalledTimes(1);
  });

  it('supports one-shot builds on older Heft but clearly rejects unsupported persistent watch mode', async () => {
    const run = { tapPromise: jest.fn() };
    const runIncremental = { tapPromise: jest.fn() };
    const session = { hooks: { run, runIncremental }, logger: { terminal: {} } };
    const configuration = {
      buildFolderPath: path.resolve('/project'),
      rigPackageResolver: { resolvePackageAsync: jest.fn().mockResolvedValue('/compiler') }
    };
    new TypeScript7Plugin().apply(
      session as unknown as IHeftTaskSession,
      configuration as unknown as HeftConfiguration
    );
    const options = { abortSignal: new AbortController().signal, watchFs: {}, requestRun: jest.fn() };
    await run.tapPromise.mock.calls[0][1](options);
    await expect(runIncremental.tapPromise.mock.calls[0][1](options)).rejects.toThrow(
      'requires a Heft release with IHeftTaskHooks.toolFinish'
    );
    expect(TypeScript7Builder).toHaveBeenCalledTimes(1);
  });
});
