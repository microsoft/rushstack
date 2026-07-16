// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import type { BootstrapEventBuffer } from './BootstrapEventBuffer';

/**
 * The file-name prefix of a bootstrap handoff file.
 *
 * @beta
 */
export const BOOTSTRAP_HANDOFF_FILE_PREFIX: 'rush-reporter-bootstrap-' = 'rush-reporter-bootstrap-';

/**
 * The file-name suffix of a bootstrap handoff file.
 *
 * @beta
 */
export const BOOTSTRAP_HANDOFF_FILE_SUFFIX: '.ndjson' = '.ndjson';

/**
 * Returns `true` if `fileName` is a bootstrap handoff file name.
 *
 * @beta
 */
export function isBootstrapHandoffFileName(fileName: string): boolean {
  return (
    fileName.startsWith(BOOTSTRAP_HANDOFF_FILE_PREFIX) && fileName.endsWith(BOOTSTRAP_HANDOFF_FILE_SUFFIX)
  );
}

/**
 * Options for {@link writeBootstrapHandoffFileAsync}.
 *
 * @beta
 */
export interface IWriteBootstrapHandoffOptions {
  /**
   * The directory to write the handoff file into. Defaults to the OS temp folder.
   */
  readonly directory?: string;

  /**
   * The process id used in the file name. Defaults to `process.pid`.
   */
  readonly pid?: number;
}

/**
 * Writes a bootstrap buffer to a temporary NDJSON handoff file.
 *
 * @remarks
 * The frontend reads this file, replays the events, and deletes it. The path is
 * communicated to the frontend through the private handoff environment variable.
 *
 * @returns the absolute path to the handoff file
 *
 * @beta
 */
export async function writeBootstrapHandoffFileAsync(
  buffer: BootstrapEventBuffer,
  options: IWriteBootstrapHandoffOptions = {}
): Promise<string> {
  const directory: string = options.directory ?? os.tmpdir();
  const pid: number = options.pid ?? process.pid;
  const fileName: string = `${BOOTSTRAP_HANDOFF_FILE_PREFIX}${pid}-${Date.now()}${BOOTSTRAP_HANDOFF_FILE_SUFFIX}`;
  const filePath: string = path.join(directory, fileName);
  await fs.promises.writeFile(filePath, buffer.serialize(), { encoding: 'utf8' });
  return filePath;
}

/**
 * Reads and decodes a bootstrap handoff NDJSON file into an array of events.
 *
 * @beta
 */
export async function readBootstrapHandoffFileAsync(filePath: string): Promise<unknown[]> {
  const contents: string = await fs.promises.readFile(filePath, { encoding: 'utf8' });
  const events: unknown[] = [];
  for (const line of contents.split('\n')) {
    const trimmed: string = line.trim();
    if (trimmed.length > 0) {
      events.push(JSON.parse(trimmed));
    }
  }
  return events;
}

/**
 * Deletes a bootstrap handoff file, ignoring a missing file.
 *
 * @beta
 */
export async function deleteBootstrapHandoffFileAsync(filePath: string): Promise<void> {
  await fs.promises.rm(filePath, { force: true });
}
