// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/**
 * The per-subscription verbosity levels a client may request.
 *
 * @remarks
 * Verbosity is applied as a pure filter at event serialization time; it never
 * mutates shared engine state, so concurrent clients may each use a different
 * verbosity. Levels are ordered `quiet` \< `normal` \< `verbose` \< `debug`.
 *
 * @beta
 */
export type DaemonVerbosity = 'quiet' | 'normal' | 'verbose' | 'debug';

const VERBOSITY_ORDER: readonly DaemonVerbosity[] = ['quiet', 'normal', 'verbose', 'debug'];

/**
 * Returns `true` when `value` is a valid verbosity level name.
 *
 * @beta
 */
export function isDaemonVerbosity(value: unknown): value is DaemonVerbosity {
  return typeof value === 'string' && (VERBOSITY_ORDER as readonly string[]).includes(value);
}

/**
 * Compares two verbosity levels; returns a negative number when `a` is quieter than `b`.
 *
 * @beta
 */
export function compareDaemonVerbosity(a: DaemonVerbosity, b: DaemonVerbosity): number {
  return VERBOSITY_ORDER.indexOf(a) - VERBOSITY_ORDER.indexOf(b);
}
