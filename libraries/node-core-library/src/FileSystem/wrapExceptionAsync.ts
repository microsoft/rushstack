// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { updateErrorMessage } from './updateErrorMessage';

export async function wrapExceptionAsync<TResult>(fn: () => Promise<TResult>): Promise<TResult> {
  try {
    return await fn();
  } catch (error) {
    updateErrorMessage(error as Error);
    throw error;
  }
}
