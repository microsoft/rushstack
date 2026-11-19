// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { DaemonRushCommandOrigin, IDaemonRequestEnvelope } from '@rushstack/rush-daemon-protocol';

import { ProductionDaemonRequestResolver } from '../ProductionDaemonRequestResolver';
import { BUILT_IN_RUSH_COMMAND_CLASSIFICATION } from '../RushCommandRequestPolicy';
import {
  wrapWorkspaceResolverLifecycle,
  type IWorkspaceResolverLifecycle
} from '../WorkspaceResolverLifecycle';
import { createWireEnvelope } from './DaemonRequestWireTestUtilities';

const ORIGINS: DaemonRushCommandOrigin[] = ['built-in', 'custom'];

function createEnvelope(
  commandName: string,
  overrides: Partial<IDaemonRequestEnvelope> = {}
): IDaemonRequestEnvelope {
  return createWireEnvelope(`request-${commandName}`, commandName, '/repo', overrides);
}

describe(ProductionDaemonRequestResolver.prototype.getUnsupportedCommandError.name, () => {
  const resolver: ProductionDaemonRequestResolver = new ProductionDaemonRequestResolver({
    startupEnvironment: {}
  });

  it('rejects every built-in command except build and rebuild, whatever its origin', () => {
    const names: string[] = Object.keys(BUILT_IN_RUSH_COMMAND_CLASSIFICATION);
    for (const commandOrigin of ORIGINS) {
      const rejected: string[] = names.filter(
        (name) => resolver.getUnsupportedCommandError(createEnvelope(name, { commandOrigin })) !== undefined
      );
      expect(rejected).toEqual(names.filter((name) => name !== 'build' && name !== 'rebuild'));
    }
    // rush-client sends every command other than build, rebuild, install and update as a custom command.
    expect(resolver.getUnsupportedCommandError(createEnvelope('list'))).toMatchObject({
      code: 'unsupported',
      message: '"list" is a built-in command that is not phased.'
    });
  });

  it('never rejects a custom command, since only its parse can tell whether the resolver serves it', () => {
    for (const commandOrigin of ORIGINS) {
      for (const name of ['test', 'hello', 'build:watch']) {
        expect(resolver.getUnsupportedCommandError(createEnvelope(name, { commandOrigin }))).toBeUndefined();
      }
    }
  });

  it('rejects a rushx script, even one named like a phased command', () => {
    for (const name of ['build', 'test']) {
      expect(
        resolver.getUnsupportedCommandError(createEnvelope(name, { invocationKind: 'rushx' }))
      ).toMatchObject({
        code: 'unsupported',
        message: 'A rushx script is not a phased command request.'
      });
    }
  });

  it('is forwarded by a resolver decorator', () => {
    const lifecycle: IWorkspaceResolverLifecycle | undefined = wrapWorkspaceResolverLifecycle(
      resolver,
      (inner) => inner
    );
    expect(lifecycle?.getUnsupportedCommandError?.(createEnvelope('list'))).toMatchObject({
      code: 'unsupported',
      message: '"list" is a built-in command that is not phased.'
    });
    expect(lifecycle?.getUnsupportedCommandError?.(createEnvelope('test'))).toBeUndefined();
  });
});
