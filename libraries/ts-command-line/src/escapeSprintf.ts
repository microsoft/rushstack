// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

export function escapeSprintf(input: string): string {
  // Escape sprintf-style escape characters
  // The primary special character in sprintf format strings is '%'
  // which introduces format specifiers like %s, %d, %f, etc.
  return input.replace(/%/g, '%%');
}
