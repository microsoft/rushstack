// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/**
 * Returns the stream's terminal width, or undefined when it has none. A pseudo-terminal that was never sized
 * (for example `script` started from a non-terminal) reports 0 columns, which the daemon rejects as request
 * metadata; treat it like a stream without a width.
 */
export function getTerminalColumns(stream: { readonly columns?: number }): number | undefined {
  const { columns } = stream;
  return columns !== undefined && Number.isSafeInteger(columns) && columns > 0 ? columns : undefined;
}
