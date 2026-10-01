// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

const THEN: string = '. Then: ';

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function releaseAfterFailure(stepError: unknown, release: () => void): unknown {
  try {
    release();
  } catch (releaseError) {
    const message: string = `${describeError(stepError)}${THEN}${describeError(releaseError)}`;
    return new AggregateError([stepError, releaseError], message);
  }
  return stepError;
}

/**
 * Runs `release` once `step` settles, even when `step` fails. When only `step` fails, rejects with its error. When
 * `release` fails too, rejects with an AggregateError of both errors, in that order, whose message names both: a
 * daemon reports only the stack of the error that stops it.
 */
export async function releaseAfterAsync(step: Promise<void>, release: () => void): Promise<void> {
  try {
    await step;
  } catch (stepError) {
    throw releaseAfterFailure(stepError, release);
  }
  release();
}
