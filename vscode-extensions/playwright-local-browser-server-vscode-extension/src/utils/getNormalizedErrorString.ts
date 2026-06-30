// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

export function getNormalizedErrorString(error: unknown): string {
  if (error instanceof Error) {
    if (error.stack) {
      return error.stack;
    }
    return error.message;
  }
  return String(error);
}
