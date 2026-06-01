// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { replaceNewlines } from './_newlineHelpers';

/**
 * Converts all newlines in the provided string to use Windows-style CRLF end of line characters.
 * @public
 */
export function convertToCrLf(input: string): string {
  return replaceNewlines(input, '\r\n');
}
