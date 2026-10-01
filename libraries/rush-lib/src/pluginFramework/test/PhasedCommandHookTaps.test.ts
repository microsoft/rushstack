// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { AsyncSeriesHook } from 'tapable';

import {
  applyAndAttributeTaps,
  getRunAnyPhasedCommandBlocker,
  type IPhasedCommandHookTapOwner
} from '../PhasedCommandHookTaps';
import type { IPhasedCommand } from '../RushLifeCycle';

function createHook(): AsyncSeriesHook<IPhasedCommand> {
  return new AsyncSeriesHook<IPhasedCommand>(['command'], 'runAnyPhasedCommand');
}

function createOwner(pluginName: string, isCommandAgnostic: boolean): IPhasedCommandHookTapOwner {
  return { pluginName, packageName: `@example/${pluginName}`, isCommandAgnostic };
}

describe('PhasedCommandHookTaps', () => {
  it('does not block a hook that nothing taps or intercepts', () => {
    const hook: AsyncSeriesHook<IPhasedCommand> = createHook();
    applyAndAttributeTaps(hook, createOwner('rush-a-plugin', false), () => {});
    expect(getRunAnyPhasedCommandBlocker(hook)).toBeUndefined();
  });

  it('attributes only the taps that apply() adds, including taps with options', () => {
    const hook: AsyncSeriesHook<IPhasedCommand> = createHook();
    applyAndAttributeTaps(hook, createOwner('rush-a-plugin', true), () => {
      hook.tapPromise('a', async () => {});
      hook.withOptions({ stage: -1 }).tap('a-early', () => {});
    });
    expect(getRunAnyPhasedCommandBlocker(hook)).toBeUndefined();

    applyAndAttributeTaps(hook, createOwner('rush-b-plugin', false), () => {
      hook.tap({ name: 'b', before: 'a' }, () => {});
    });
    expect(getRunAnyPhasedCommandBlocker(hook)).toBe(
      'the plugin "rush-b-plugin" (@example/rush-b-plugin) taps the runAnyPhasedCommand hook and is not ' +
        'declared command-agnostic'
    );
  });

  it('blocks a tap that no apply() added', () => {
    const hook: AsyncSeriesHook<IPhasedCommand> = createHook();
    hook.tap('before', () => {});
    applyAndAttributeTaps(hook, createOwner('rush-a-plugin', true), () => {
      hook.tap('a', () => {});
    });
    expect(getRunAnyPhasedCommandBlocker(hook)).toBe(
      'a plugin taps the runAnyPhasedCommand hook outside its apply() (the tap "before")'
    );

    const later: AsyncSeriesHook<IPhasedCommand> = createHook();
    applyAndAttributeTaps(later, createOwner('rush-a-plugin', true), () => {
      later.tap('a', () => {});
    });
    later.tap('after', () => {});
    expect(getRunAnyPhasedCommandBlocker(later)).toBe(
      'a plugin taps the runAnyPhasedCommand hook outside its apply() (the tap "after")'
    );
  });

  it('attributes the taps of an apply() that throws', () => {
    const hook: AsyncSeriesHook<IPhasedCommand> = createHook();
    expect(() =>
      applyAndAttributeTaps(hook, createOwner('rush-a-plugin', false), () => {
        hook.tap('a', () => {});
        throw new Error('apply failed');
      })
    ).toThrow('apply failed');
    expect(getRunAnyPhasedCommandBlocker(hook)).toBe(
      'the plugin "rush-a-plugin" (@example/rush-a-plugin) taps the runAnyPhasedCommand hook and is not ' +
        'declared command-agnostic'
    );
  });

  it('blocks an intercepted hook, even without taps', () => {
    const hook: AsyncSeriesHook<IPhasedCommand> = createHook();
    applyAndAttributeTaps(hook, createOwner('rush-a-plugin', true), () => {
      hook.intercept({ call: () => {} });
    });
    expect(getRunAnyPhasedCommandBlocker(hook)).toBe('a plugin intercepts the runAnyPhasedCommand hook');
  });
});
