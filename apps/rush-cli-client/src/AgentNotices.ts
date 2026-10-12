// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

// Keep this module free of heavy imports: start.ts loads the agent renderer before @microsoft/rush-lib.

/** The most warning and error lines printed before the summary line. */
const MAX_NOTICE_LINES: number = 3;
/** A longer line is cut to this many characters. */
const MAX_NOTICE_LENGTH: number = 300;

function clip(line: string): string {
  return line.length > MAX_NOTICE_LENGTH ? `${line.slice(0, MAX_NOTICE_LENGTH - 1)}…` : line;
}

/**
 * Collects the warnings and errors that Rush or a Rush plugin wrote while the daemon engine loaded or ran, for
 * example a plugin that continues without the cloud build cache, or a daemon-compatible plugin name that
 * matches no configured plugin. They arrive as `activityChanged` events with a `severity` and no operation
 * scope. Agent output shows other activity only in its live row, which a pipe never prints.
 */
export class AgentNotices {
  readonly #lines: Set<string> = new Set();

  /** Records the lines of an activity payload that is a warning or an error outside any operation. */
  public add(payload: Readonly<Record<string, unknown>>, operationId: string | undefined): void {
    const { severity, text } = payload;
    if (operationId !== undefined || typeof text !== 'string') {
      return;
    }
    if (severity !== 'warning' && severity !== 'error') {
      return;
    }
    for (const line of text.split('\n')) {
      const trimmed: string = line.trim();
      if (trimmed) {
        this.#lines.add(trimmed);
      }
    }
  }

  /** The first distinct lines, each cut to a maximum length, followed by the number of lines left out. */
  public getLines(): string[] {
    const lines: string[] = [...this.#lines];
    const shown: string[] = lines.slice(0, MAX_NOTICE_LINES).map(clip);
    const omitted: number = lines.length - shown.length;
    if (omitted > 0) {
      shown.push(`+${omitted} more warning and error lines; RUSHD_OUTPUT=legacy prints them all`);
    }
    return shown;
  }
}
