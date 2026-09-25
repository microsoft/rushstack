// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import childProcessModule from 'node:child_process';
import { syncBuiltinESMExports } from 'node:module';

type ChildProcessFunction = (...args: unknown[]) => unknown;

/**
 * The index of the options argument of a child_process function, given its arguments.
 */
type OptionsIndexSelector = (args: ReadonlyArray<unknown>) => number;

const installedTargets: WeakSet<object> = new WeakSet();

/** `(command, args?, options?, callback?)`: spawn, spawnSync, execFile, execFileSync and fork. */
function afterOptionalArgs(args: ReadonlyArray<unknown>): number {
  return Array.isArray(args[1]) || (args[1] === undefined && args.length > 2) || args[1] === null ? 2 : 1;
}

/** `(command, options?, callback?)`: exec and execSync. */
function afterCommand(): number {
  return 1;
}

const OPTIONS_INDEX_BY_FUNCTION: ReadonlyMap<string, OptionsIndexSelector> = new Map([
  ['spawn', afterOptionalArgs],
  ['spawnSync', afterOptionalArgs],
  ['execFile', afterOptionalArgs],
  ['execFileSync', afterOptionalArgs],
  ['fork', afterOptionalArgs],
  ['exec', afterCommand],
  ['execSync', afterCommand]
]);

/**
 * Returns the arguments with `windowsHide: true` added to the options, unless the caller specified it.
 */
export function withWindowsHideDefault(args: ReadonlyArray<unknown>, optionsIndex: number): unknown[] {
  const result: unknown[] = [...args];
  const options: unknown = result[optionsIndex];
  if (options === undefined || options === null) {
    result[optionsIndex] = { windowsHide: true };
  } else if (typeof options === 'function') {
    // A callback occupies the options position, as in `execFile(file, callback)`.
    result.splice(optionsIndex, 0, { windowsHide: true });
  } else if (
    typeof options === 'object' &&
    (options as { windowsHide?: unknown }).windowsHide === undefined
  ) {
    result[optionsIndex] = { ...options, windowsHide: true };
  }
  return result;
}

/**
 * Makes every child process started by this process default to `windowsHide: true`.
 *
 * @remarks
 * The standalone daemon is started as a detached Windows process, which has no console. Windows then
 * gives each console program it starts (Git, tar, the shell running an operation, and so on) a new,
 * visible console window, unless that program is started with `windowsHide`. A hidden child instead
 * owns a windowless console, which its own descendants inherit, so defaulting this process's direct
 * children is sufficient. Library and plugin code starts those children, so the default is applied
 * where they all resolve it: the `node:child_process` module. Explicit `windowsHide` values are kept.
 *
 * Only the dedicated daemon process calls this, and only on Windows. It is idempotent.
 */
export function installWindowsHideDefault(
  target: Record<string, unknown> = childProcessModule as unknown as Record<string, unknown>
): void {
  if (installedTargets.has(target)) {
    return;
  }
  installedTargets.add(target);
  for (const [name, getOptionsIndex] of OPTIONS_INDEX_BY_FUNCTION) {
    const original: ChildProcessFunction = target[name] as ChildProcessFunction;
    if (typeof original !== 'function') {
      continue;
    }
    target[name] = function (this: unknown, ...args: unknown[]): unknown {
      return original.apply(this, withWindowsHideDefault(args, getOptionsIndex(args)));
    };
  }
  if (target === (childProcessModule as unknown as Record<string, unknown>)) {
    // Also update the named exports seen by ECMAScript modules.
    syncBuiltinESMExports();
  }
}
