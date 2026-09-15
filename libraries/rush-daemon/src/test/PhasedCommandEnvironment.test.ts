// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'node:path';

import { DaemonGraphTestFixture } from './DaemonGraphTestFixture';
import { createNativeEngineAsync } from './WarmGenerationTestUtilities';

describe('native engine environment preparation', () => {
  it.each(['PATH', 'Path', 'pAtH'])('preserves inherited %s while prepending repository tools', async (name) => {
    const fixture = await DaemonGraphTestFixture.createAsync();
    try {
      const engine = await createNativeEngineAsync(fixture.session.rushConfiguration);
      try {
        const transform = engine.operationGraph.hooks.createEnvironmentForOperation.taps.find(
          (tap) => tap.name === 'PhasedCommandEngine'
        );
        if (!transform) throw new Error('Expected the installed native engine environment transform.');
        const inherited: string = ['native-node-bin', 'native-tools'].join(path.delimiter);
        const input: NodeJS.ProcessEnv = Object.freeze({ [name]: inherited, CUSTOM_VALUE: 'unchanged' });
        const output: NodeJS.ProcessEnv = transform.fn(input);
        const prefix: string = path.join(fixture.session.rushConfiguration.commonTempFolder, 'node_modules', '.bin');
        expect(output.PATH).toBe(
          `${prefix}${path.delimiter}${process.platform === 'win32' || name === 'PATH' ? inherited : ''}`
        );
        expect(output.CUSTOM_VALUE).toBe('unchanged');
        expect(input).toEqual({ [name]: inherited, CUSTOM_VALUE: 'unchanged' });
        if (process.platform === 'win32') {
          expect(Object.keys(output).filter((key) => key.toUpperCase() === 'PATH')).toEqual(['PATH']);
        } else if (name !== 'PATH') {
          expect(output[name]).toBe(inherited);
        }
        expect(fixture.runs()).toEqual([]);
      } finally {
        await engine[Symbol.asyncDispose]();
      }
    } finally {
      await fixture[Symbol.asyncDispose]();
    }
  });
});
