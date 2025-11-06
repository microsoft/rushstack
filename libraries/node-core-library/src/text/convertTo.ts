// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { type NewlineKind, getNewline } from './getNewline';

const NEWLINE_REGEX: RegExp = /\r\n|\n\r|\r|\n/g;

/**
 * Converts all newlines in the provided string to use the specified newline type.
 * @public
 */
export function convertTo(input: string, newlineKind: NewlineKind): string {
  return input.replace(NEWLINE_REGEX, getNewline(newlineKind));
}
