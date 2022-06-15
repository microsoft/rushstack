// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { updateErrorMessage } from './updateErrorMessage';

export function wrapException<TResult>(fn: () => TResult): TResult {
  try {
    return fn();
  } catch (error) {
    updateErrorMessage(error as Error);
    throw error;
  }
}
