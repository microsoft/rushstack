// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { IDaemonPhasedEngineShape } from '@rushstack/rush-daemon-protocol';

import { validateEngineShape } from '../PhasedRequestSelection';
import type { IWorkspaceEngineShape } from '../WorkspaceEngineComponentFactory';

const WARM_ENGINE_SHAPE: IWorkspaceEngineShape = {
  phaseNames: ['_phase:build', '_phase:test'],
  pluginNames: ['plugin-a', 'plugin-b']
};

describe(validateEngineShape.name, () => {
  it('accepts the warm engine names in any order', () => {
    expect(() =>
      validateEngineShape(
        { phaseNames: ['_phase:test', '_phase:build'], pluginNames: ['plugin-b', 'plugin-a'] },
        WARM_ENGINE_SHAPE
      )
    ).not.toThrow();
  });

  it('accepts an empty plugin list when the warm engine has no plugins', () => {
    const warmShape: IWorkspaceEngineShape = { phaseNames: ['_phase:build'], pluginNames: [] };
    expect(() =>
      validateEngineShape({ phaseNames: ['_phase:build'], pluginNames: [] }, warmShape)
    ).not.toThrow();
  });

  it.each<[string, IDaemonPhasedEngineShape]>([
    ['phase', { phaseNames: ['_phase:build', '_phase:build'], pluginNames: WARM_ENGINE_SHAPE.pluginNames }],
    ['plugin', { phaseNames: WARM_ENGINE_SHAPE.phaseNames, pluginNames: ['plugin-a', 'plugin-a'] }]
  ])(
    'rejects a %s list that repeats one warm name in place of another',
    (kind: string, requestShape: IDaemonPhasedEngineShape) => {
      expect(() => validateEngineShape(requestShape, WARM_ENGINE_SHAPE)).toThrow(
        `The phased request ${kind} shape does not match the warm workspace engine.`
      );
    }
  );

  it.each<[string, IDaemonPhasedEngineShape]>([
    ['phase', { phaseNames: ['_phase:build', '_phase:lint'], pluginNames: WARM_ENGINE_SHAPE.pluginNames }],
    ['plugin', { phaseNames: WARM_ENGINE_SHAPE.phaseNames, pluginNames: ['plugin-a', 'plugin-c'] }]
  ])(
    'rejects a %s list that has an unknown name in place of a warm one',
    (kind: string, requestShape: IDaemonPhasedEngineShape) => {
      expect(() => validateEngineShape(requestShape, WARM_ENGINE_SHAPE)).toThrow(
        `The phased request ${kind} shape does not match the warm workspace engine.`
      );
    }
  );
});
