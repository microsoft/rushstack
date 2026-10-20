// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

jest.mock('../TypeScript7Builder', () => ({
  TypeScript7Builder: jest.fn().mockImplementation(() => ({ invokeAsync: jest.fn() }))
}));

import * as path from 'node:path';

import type { HeftConfiguration, IHeftTaskSession } from '@rushstack/heft';

import TypeScript7Plugin from '../TypeScript7Plugin';
import { TypeScript7Builder } from '../TypeScript7Builder';

describe('TypeScript7Plugin', () => {
  it('resolves the consumer compiler and wires independent build and watch invocations', async () => {
    const run = { tapPromise: jest.fn() };
    const runIncremental = { tapPromise: jest.fn() };
    const session = { hooks: { run, runIncremental }, logger: { terminal: {} } };
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
      abortSignal: options.abortSignal
    });
    const watchOptions = { ...options, watchFs: {}, requestRun: jest.fn() };
    await runIncremental.tapPromise.mock.calls[0][1](watchOptions);
    await runIncremental.tapPromise.mock.calls[0][1](watchOptions);
    expect(TypeScript7Builder).toHaveBeenCalledTimes(3);
    expect(TypeScript7Builder).toHaveBeenLastCalledWith(
      expect.objectContaining({ watchFs: watchOptions.watchFs })
    );
  });
});
