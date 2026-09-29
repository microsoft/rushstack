// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'node:path';

import { PhasedCommandEngine } from '@microsoft/rush-lib';

import type { IResolveDaemonRequestOptions } from '../DaemonRequestDispatcher';
import { ProductionDaemonRequestResolver } from '../ProductionDaemonRequestResolver';
import type { IWorkspaceSession } from '../WorkspaceSession';
import { createWireEnvelope } from './DaemonRequestWireTestUtilities';

describe('ProductionDaemonRequestResolver environment identity', () => {
  const ADDED_NAME: string = 'RUSHD_TEST_PLUGIN_ADDED';
  const STARTUP_NAME: string = 'RUSHD_TEST_STARTUP';
  let parse: jest.SpyInstance;
  beforeEach(() => {
    parse = jest.spyOn(PhasedCommandEngine, 'parseAsync').mockResolvedValue({
      commandName: 'build',
      parameterIdentity: 'parameters'
    } as PhasedCommandEngine);
  });
  afterEach(() => {
    parse.mockRestore();
    delete process.env[ADDED_NAME];
    delete process.env[STARTUP_NAME];
  });

  function getEnvironment(): Record<string, string> {
    return Object.fromEntries(
      Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined)
    );
  }
  function createOptions(environment: Record<string, string>): IResolveDaemonRequestOptions {
    return {
      abortSignal: new AbortController().signal,
      envelope: createWireEnvelope('identity', 'build', process.cwd(), {
        commandOrigin: 'built-in',
        environment
      }),
      workspaceSession: { rushConfiguration: {} } as IWorkspaceSession
    };
  }

  it('ignores names that the daemon process added after startup, as a plugin does', async () => {
    const resolver: ProductionDaemonRequestResolver = new ProductionDaemonRequestResolver();
    const startupEnvironment: Record<string, string> = getEnvironment();
    // A plugin that records its iteration id in process.env, in every iteration.
    process.env[ADDED_NAME] = 'iteration-1';
    await expect(
      resolver.getCommandParameterIdentityAsync(createOptions(startupEnvironment))
    ).resolves.toBe('parameters');
    process.env[ADDED_NAME] = 'iteration-2';
    await expect(
      resolver.getCommandParameterIdentityAsync(createOptions(startupEnvironment))
    ).resolves.toBe('parameters');
    // A client that sets the added name is still a different environment.
    await expect(
      resolver.getCommandParameterIdentityAsync(createOptions({ ...startupEnvironment, [ADDED_NAME]: 'x' }))
    ).rejects.toThrow('differs from the daemon startup environment');
  });

  it('still rejects a live change to, or removal of, a startup name, and names it', async () => {
    process.env[STARTUP_NAME] = 'startup';
    const resolver: ProductionDaemonRequestResolver = new ProductionDaemonRequestResolver();
    const options: IResolveDaemonRequestOptions = createOptions(getEnvironment());
    const message: string = `The daemon's own environment changed after it started (${STARTUP_NAME})`;
    process.env[STARTUP_NAME] = 'changed';
    await expect(resolver.getCommandParameterIdentityAsync(options)).rejects.toThrow(message);
    delete process.env[STARTUP_NAME];
    await expect(resolver.getCommandParameterIdentityAsync(options)).rejects.toThrow(message);
    process.env[STARTUP_NAME] = 'startup';
    await expect(resolver.getCommandParameterIdentityAsync(options)).resolves.toBe('parameters');
  });

  it('keeps serving with a startup PATH that repeats an entry, and still names a changed PATH', async () => {
    const originalPath: string | undefined = process.env.PATH;
    const repeatedEntry: string = path.resolve('/rushd-test-repeated-path-entry');
    const otherEntries: string[] = originalPath === undefined ? [] : [originalPath];
    try {
      process.env.PATH = [repeatedEntry, repeatedEntry, ...otherEntries].join(path.delimiter);
      const resolver: ProductionDaemonRequestResolver = new ProductionDaemonRequestResolver();
      const options: IResolveDaemonRequestOptions = createOptions(getEnvironment());
      await expect(resolver.getCommandParameterIdentityAsync(options)).resolves.toBe('parameters');
      // Only the repeated entry differs, so the fingerprint is the same.
      process.env.PATH = [repeatedEntry, ...otherEntries].join(path.delimiter);
      await expect(resolver.getCommandParameterIdentityAsync(options)).resolves.toBe('parameters');
      process.env.PATH = otherEntries.join(path.delimiter);
      await expect(resolver.getCommandParameterIdentityAsync(options)).rejects.toThrow(
        "The daemon's own environment changed after it started (PATH)"
      );
    } finally {
      if (originalPath === undefined) delete process.env.PATH;
      else process.env.PATH = originalPath;
    }
  });

  it('keeps the startup environment for a replacement session', async () => {
    const resolver: ProductionDaemonRequestResolver = new ProductionDaemonRequestResolver();
    const options: IResolveDaemonRequestOptions = createOptions(getEnvironment());
    process.env[ADDED_NAME] = 'iteration-1';
    const replacement: ProductionDaemonRequestResolver = resolver.createForSession();
    await expect(replacement.getCommandParameterIdentityAsync(options)).resolves.toBe('parameters');
  });

  it('ignores insertion order for distinct environment names with identical locale collation', async () => {
    const names: string[] = ['RUSHD_TEST_\u00e9', 'RUSHD_TEST_e\u0301'];
    const original: (string | undefined)[] = names.map((name) => process.env[name]);
    try {
      process.env[names[0]] = 'composed';
      process.env[names[1]] = 'decomposed';
      const resolver: ProductionDaemonRequestResolver = new ProductionDaemonRequestResolver();
      const environment: Record<string, string> = Object.fromEntries(
        Object.entries(process.env)
          .filter((entry): entry is [string, string] => entry[1] !== undefined)
          .reverse()
      );
      const options = {
        abortSignal: new AbortController().signal,
        envelope: createWireEnvelope('identity', 'build', process.cwd(), {
          commandOrigin: 'built-in',
          environment
        }),
        workspaceSession: { rushConfiguration: {} } as IWorkspaceSession
      };
      await expect(resolver.getCommandParameterIdentityAsync(options)).resolves.toBe('parameters');
      environment[names[1]] = 'changed';
      await expect(resolver.getCommandParameterIdentityAsync(options)).rejects.toThrow(
        'differs from the daemon startup environment'
      );
    } finally {
      names.forEach((name, index) => {
        if (original[index] === undefined) delete process.env[name];
        else process.env[name] = original[index];
      });
    }
  });
});
