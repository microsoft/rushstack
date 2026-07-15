// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

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
 * Allocates a dynamic inherited descriptor for a child reporter.
 *
 * @remarks
 * stdout and stderr stay as inherited streams; the reporter descriptor is an
 * additional pipe at `fdNumber`, whose number is communicated through the
 * private environment variable.
 *
 * @param fdNumber - the descriptor number; defaults to 3
 *
 * @beta
 */
export function allocateChildDescriptor(fdNumber: number = 3): IChildDescriptorPlan {
  const stdio: (string | number)[] = ['inherit', 'inherit', 'inherit'];
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
  if (raw === undefined) {
    return undefined;
  }
  const parsed: number = Number.parseInt(raw, 10);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : undefined;
}
