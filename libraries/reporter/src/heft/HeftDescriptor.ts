// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { Readable, Writable } from 'node:stream';

/**
 * The private environment variable that communicates the inherited reporter file
 * descriptor number to a child process.
 *
 * @beta
 */
export const RUSH_REPORTER_CHILD_FD_ENV_VAR: '_RUSH_REPORTER_CHILD_FD' = '_RUSH_REPORTER_CHILD_FD';

/**
 * A plan for launching a child with an inherited reporter descriptor.
 *
 * @beta
 */
export interface IChildDescriptorPlan {
  /**
   * The inherited file descriptor number the child writes NDJSON to.
   */
  readonly fdNumber: number;

  /**
   * The environment additions that communicate the descriptor to the child.
   */
  readonly env: Record<string, string>;

  /**
   * The stdio configuration for spawning the child. stdout and stderr remain
   * normal process streams; the reporter descriptor is an additional pipe.
   */
  readonly stdio: (string | number)[];
}

/**
 * The piped standard streams exposed by a spawned Heft child.
 *
 * @beta
 */
export interface IHeftChildOutputStreams {
  // Node.js uses null when a child stream was not configured as a pipe.
  // eslint-disable-next-line @rushstack/no-new-null
  readonly stdout: Readable | null;
  // eslint-disable-next-line @rushstack/no-new-null
  readonly stderr: Readable | null;
}

/**
 * The parent output streams that receive a Heft child's raw fallback output.
 *
 * @beta
 */
export interface IHeftChildOutputTargets {
  readonly stdout: Writable;
  readonly stderr: Writable;
}

/**
 * Allocates a dynamic inherited descriptor for a child reporter.
 *
 * @remarks
 * stdout and stderr are piped so the parent can preserve and inspect old-Heft
 * fallback output before relaying it to the normal output streams. The reporter
 * descriptor is an additional pipe at `fdNumber`, whose number is communicated
 * through the private environment variable.
 *
 * @param fdNumber - the descriptor number; defaults to 3
 *
 * @beta
 */
export function allocateChildDescriptor(fdNumber: number = 3): IChildDescriptorPlan {
  if (!Number.isSafeInteger(fdNumber) || fdNumber < 3) {
    throw new RangeError(
      'The reporter file descriptor number must be an integer greater than or equal to 3.'
    );
  }

  const stdio: (string | number)[] = ['inherit', 'pipe', 'pipe'];
  while (stdio.length < fdNumber) {
    stdio.push('ignore');
  }
  stdio[fdNumber] = 'pipe';
  return {
    fdNumber,
    env: { [RUSH_REPORTER_CHILD_FD_ENV_VAR]: String(fdNumber) },
    stdio
  };
}

/**
 * Relays a spawned Heft child's piped fallback output to the normal parent
 * output streams without closing those parent streams.
 *
 * @beta
 */
export function relayHeftChildOutput(
  child: IHeftChildOutputStreams,
  targets: IHeftChildOutputTargets = { stdout: process.stdout, stderr: process.stderr }
): void {
  if (child.stdout === null || child.stderr === null) {
    throw new Error('The Heft child must be spawned with piped stdout and stderr.');
  }
  child.stdout.pipe(targets.stdout, { end: false });
  child.stderr.pipe(targets.stderr, { end: false });
}

/**
 * Reads the inherited reporter descriptor number from the environment.
 *
 * @remarks
 * Returns `undefined` when descriptor negotiation is unavailable, in which case
 * the child falls back to normal stdout and stderr.
 *
 * @param env - the environment variables
 *
 * @beta
 */
export function readChildDescriptorFd(env: Record<string, string | undefined>): number | undefined {
  const raw: string | undefined = env[RUSH_REPORTER_CHILD_FD_ENV_VAR];
  if (raw === undefined || !/^\d+$/.test(raw)) {
    return undefined;
  }
  const parsed: number = Number(raw);
  return Number.isSafeInteger(parsed) && parsed >= 3 ? parsed : undefined;
}
