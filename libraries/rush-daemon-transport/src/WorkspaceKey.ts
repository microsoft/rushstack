// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { createHash } from 'node:crypto';

/** The number of hex characters of the sha256 digest used as the workspace key. @beta */
export const WORKSPACE_KEY_LENGTH: number = 32;

const HASH_ALGORITHM: string = 'sha256';
const HASH_ENCODING: 'hex' = 'hex';
const FIELD_SEPARATOR: string = '\u0000';
const KEY_PREFIX: string = 'rushd-';
const DIGEST_START: number = 0;

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/**
 * The inputs that identity-hash a daemon-ownable workspace.
 *
 * @beta
 */
export interface IWorkspaceKeyInput {
  /** The canonical (realpath-resolved, normalized) absolute repository root. */
  readonly canonicalRepoRoot: string;
  /** The Rush version string, for example `5.178.0`. */
  readonly rushVersion: string;
  /** Daemon startup options; serialized deterministically (keys sorted). */
  readonly startupOptions?: Readonly<Record<string, unknown>>;
}

function stableSerializePrimitive(value: unknown): string {
  const serialized: string | undefined = JSON.stringify(value);
  return serialized ?? '';
}

function stableSerialize(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableSerialize).join(',')}]`;
  }
  if (isPlainRecord(value)) {
    const entries: string = Object.keys(value)
      .sort()
      .map((key: string) => `${JSON.stringify(key)}:${stableSerialize(value[key])}`)
      .join(',');
    return `{${entries}}`;
  }
  return stableSerializePrimitive(value);
}

/**
 * Computes the workspace key: a truncated `sha256` of the canonical repository
 * root, the Rush version, and the startup options.
 *
 * @remarks
 * Distinct workspaces, Rush versions, or startup options produce distinct keys
 * (and therefore distinct socket/pipe paths); the same workspace resolves to the
 * same key across runs.
 *
 * @beta
 */
export function computeDaemonWorkspaceKey(input: IWorkspaceKeyInput): string {
  const material: string = [
    input.canonicalRepoRoot,
    input.rushVersion,
    stableSerialize(input.startupOptions ?? {})
  ].join(FIELD_SEPARATOR);
  const digest: string = createHash(HASH_ALGORITHM).update(material, 'utf8').digest(HASH_ENCODING);
  return `${KEY_PREFIX}${digest.slice(DIGEST_START, WORKSPACE_KEY_LENGTH)}`;
}
