// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { AsyncSeriesHook } from 'tapable';

import type { IPhasedCommand } from './RushLifeCycle';

/** The plugin whose `apply()` added a tap to the `runAnyPhasedCommand` hook. */
export interface IPhasedCommandHookTapOwner {
  readonly pluginName: string;
  readonly packageName: string;
  /** Whether the plugin's manifest or the repository declares the plugin command-agnostic. */
  readonly isCommandAgnostic: boolean;
}

type PhasedCommandHook = AsyncSeriesHook<IPhasedCommand>;
type PhasedCommandHookTap = PhasedCommandHook['taps'][number];

// tapable keeps each tap object in `hook.taps` unless a register interceptor replaces it, and an intercepted
// hook prevents sharing anyway.
const tapOwners: WeakMap<PhasedCommandHookTap, IPhasedCommandHookTapOwner> = new WeakMap();

/** Calls `apply` and records `owner` as the owner of every tap that it adds to `hook`. */
export function applyAndAttributeTaps(
  hook: PhasedCommandHook,
  owner: IPhasedCommandHookTapOwner,
  apply: () => void
): void {
  const previousTaps: ReadonlySet<PhasedCommandHookTap> = new Set(hook.taps);
  try {
    apply();
  } finally {
    for (const tap of hook.taps) {
      if (!previousTaps.has(tap)) {
        tapOwners.set(tap, owner);
      }
    }
  }
}

/**
 * Explains why the `runAnyPhasedCommand` hook prevents a daemon engine that one phased command created from
 * serving another phased command, or returns undefined if it does not.
 *
 * @remarks
 * Rush calls the hook once per engine, with the command that created the engine. The hook prevents sharing unless
 * every tap was added by the `apply()` of a plugin that is declared command-agnostic. An interceptor, or a tap
 * that no plugin's `apply()` added, prevents sharing.
 */
export function getRunAnyPhasedCommandBlocker(hook: PhasedCommandHook): string | undefined {
  if (!hook.isUsed()) {
    return undefined;
  }
  // tapable doesn't declare the `interceptors` array that `isUsed()` reads.
  const { interceptors } = hook as unknown as { interceptors?: ReadonlyArray<unknown> };
  if (interceptors?.length !== 0) {
    return 'a plugin intercepts the runAnyPhasedCommand hook';
  }
  for (const tap of hook.taps) {
    const owner: IPhasedCommandHookTapOwner | undefined = tapOwners.get(tap);
    if (!owner) {
      return `a plugin taps the runAnyPhasedCommand hook outside its apply() (the tap "${tap.name}")`;
    }
    if (!owner.isCommandAgnostic) {
      return (
        `the plugin "${owner.pluginName}" (${owner.packageName}) taps the runAnyPhasedCommand hook and is not ` +
        'declared command-agnostic'
      );
    }
  }
  return undefined;
}
