// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { releaseAfterAsync } from '../DaemonReleaseAfter';

const ONCE: number = 1;
const STEP_ERROR: Error = new Error('the step failed');
const RELEASE_ERROR: Error = new Error('the release failed');
const STEP_TEXT: string = 'a step that rejects with text';

function throwReleaseError(): void {
  throw RELEASE_ERROR;
}

it('releases after a step that works', async () => {
  const release: jest.Mock = jest.fn();
  await releaseAfterAsync(Promise.resolve(), release);
  expect(release).toHaveBeenCalledTimes(ONCE);
});

it('rejects with the error of the release when only the release fails', async () => {
  await expect(releaseAfterAsync(Promise.resolve(), throwReleaseError)).rejects.toBe(RELEASE_ERROR);
});

it('releases after a step that fails, and rejects with the error of the step', async () => {
  const release: jest.Mock = jest.fn();
  await expect(releaseAfterAsync(Promise.reject(STEP_ERROR), release)).rejects.toBe(STEP_ERROR);
  expect(release).toHaveBeenCalledTimes(ONCE);
});

it('rejects with both errors, in order, when the step and the release fail', async () => {
  const releasing: Promise<void> = releaseAfterAsync(Promise.reject(STEP_ERROR), throwReleaseError);
  await expect(releasing).rejects.toBeInstanceOf(AggregateError);
  await expect(releasing).rejects.toMatchObject({ errors: [STEP_ERROR, RELEASE_ERROR] });
  await expect(releasing).rejects.toThrow(`${STEP_ERROR.message}. Then: ${RELEASE_ERROR.message}`);
});

it('names a failure that is not an Error by its text', async () => {
  const releasing: Promise<void> = releaseAfterAsync(Promise.reject(STEP_TEXT), throwReleaseError);
  await expect(releasing).rejects.toThrow(`${STEP_TEXT}. Then: ${RELEASE_ERROR.message}`);
});
