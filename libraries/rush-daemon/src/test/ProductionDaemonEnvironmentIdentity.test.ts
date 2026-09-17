// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { PhasedCommandEngine } from '@microsoft/rush-lib';

import { ProductionDaemonRequestResolver } from '../ProductionDaemonRequestResolver';
import type { IWorkspaceSession } from '../WorkspaceSession';
import { createWireEnvelope } from './DaemonRequestWireTestUtilities';

describe('ProductionDaemonRequestResolver environment identity', () => {
  it('ignores insertion order for distinct environment names with identical locale collation', async () => {
    const names: string[] = ['RUSHD_TEST_\u00e9', 'RUSHD_TEST_e\u0301'];
    const original: (string | undefined)[] = names.map((name) => process.env[name]);
    const parse = jest.spyOn(PhasedCommandEngine, 'parseAsync').mockResolvedValue({
      commandName: 'build',
      parameterIdentity: 'parameters'
    } as PhasedCommandEngine);
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
      parse.mockRestore();
      names.forEach((name, index) => {
        if (original[index] === undefined) delete process.env[name];
        else process.env[name] = original[index];
      });
    }
  });
});
