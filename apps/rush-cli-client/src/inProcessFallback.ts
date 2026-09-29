// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/**
 * Formats the stderr lines that say why the client runs a command in-process instead of on the daemon. The first
 * line of the reason is the fallback line, which starts with `rush-client:` and ends with `using in-process Rush.`
 * The other lines of a multi-line reason, such as a warning that the daemon wrote before its error, follow it as
 * detail lines.
 */
export function formatInProcessFallbackMessage(reason: string): string {
  const [firstLine = '', ...details] = reason.split(/\r?\n/).filter((line) => line.trim());
  // A reason is usually a sentence, or a line that introduces the lines after it; "; using" follows it without the
  // period or the colon.
  const fallbackLine: string = `rush-client: ${firstLine.replace(/[.:]$/, '')}; using in-process Rush.`;
  return [fallbackLine, ...details.map((line) => `  ${line}`)].map((line) => `${line}\n`).join('');
}
