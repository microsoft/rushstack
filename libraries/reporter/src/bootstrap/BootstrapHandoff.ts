// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as crypto from 'node:crypto';
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
 * The envelope written as the first line of a handoff file, carrying the
 * one-time nonce that authenticates the file to the frontend.
 *
 * @beta
 */
export interface IBootstrapHandoffHeader {
  /**
   * Discriminates the header record from event records.
   */
  readonly kind: 'bootstrapHandoff';

  /**
   * The one-time nonce. The frontend compares this against the value in the
   * private nonce environment variable and rejects the file on mismatch.
   */
  readonly nonce: string;
}

/**
 * The result of writing a bootstrap handoff file.
 *
 * @beta
 */
export interface IBootstrapHandoffWriteResult {
  /**
   * The absolute path to the handoff file.
   */
  readonly handoffPath: string;

  /**
   * The nonce the caller publishes through the private nonce environment
   * variable.
   */
  readonly nonce: string;
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
 * The frontend reads this file, replays the events, and deletes it. The path
 * is communicated to the frontend through the private handoff environment
 * variable, and a one-time nonce is written as the file's first line; the
 * caller publishes the nonce through the private nonce environment variable
 * so the frontend can reject a stale or foreign handoff file.
 *
 * The file is created with owner-only permissions (`0o600`) where supported.
 *
 * @returns the handoff path and nonce
 *
 * @beta
 */
export async function writeBootstrapHandoffFileAsync(
  buffer: BootstrapEventBuffer,
  options: IWriteBootstrapHandoffOptions = {}
): Promise<IBootstrapHandoffWriteResult> {
  const directory: string = options.directory ?? os.tmpdir();
  const pid: number = options.pid ?? process.pid;
  const fileName: string = `${BOOTSTRAP_HANDOFF_FILE_PREFIX}${pid}-${Date.now()}${BOOTSTRAP_HANDOFF_FILE_SUFFIX}`;
  const handoffPath: string = path.join(directory, fileName);
  const nonce: string = crypto.randomUUID();
  const header: IBootstrapHandoffHeader = { kind: 'bootstrapHandoff', nonce };
  await fs.promises.writeFile(handoffPath, `${JSON.stringify(header)}\n${buffer.serialize()}`, {
    encoding: 'utf8',
    mode: 0o600
  });
  return { handoffPath, nonce };
}

/**
 * Reads and decodes a bootstrap handoff NDJSON file into its header and events.
 *
 * @beta
 */
export async function readBootstrapHandoffFileAsync(
  filePath: string
): Promise<{ header: IBootstrapHandoffHeader | undefined; events: unknown[] }> {
  const contents: string = await fs.promises.readFile(filePath, { encoding: 'utf8' });
  const events: unknown[] = [];
  let header: IBootstrapHandoffHeader | undefined;
  let first: boolean = true;
  for (const line of contents.split('\n')) {
    const trimmed: string = line.trim();
    if (trimmed.length > 0) {
      const record: unknown = JSON.parse(trimmed);
      if (first && (record as { kind?: string }).kind === 'bootstrapHandoff') {
        header = record as IBootstrapHandoffHeader;
      } else {
        events.push(record);
      }
    }
    first = false;
  }
  return { header, events };
}

/**
 * Deletes a bootstrap handoff file, ignoring a missing file.
 *
 * @beta
 */
export async function deleteBootstrapHandoffFileAsync(filePath: string): Promise<void> {
  await fs.promises.rm(filePath, { force: true });
}
