// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { BigIntStats } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import * as path from 'node:path';

import { RushConstants, type RushConfiguration } from '@microsoft/rush-lib';
import { FileSystem } from '@rushstack/node-core-library';

/**
 * What the files that show whether a native `install` or `update` changed the installation contained at one time.
 */
export interface INativeMutationInstallationState {
  /** The identity of each subspace's `last-install.flag`, by path, or `undefined` for a flag that doesn't exist. */
  readonly flags: ReadonlyMap<string, string | undefined>;
  /** Whether the hotlink state records a link. A state that can't be parsed counts as one. */
  readonly hasHotlinks: boolean;
}

/**
 * Reads the files. Returns `undefined`, which never counts as unchanged, if one exists but can't be read.
 */
export async function captureNativeMutationInstallationStateAsync(
  rushConfiguration: RushConfiguration
): Promise<INativeMutationInstallationState | undefined> {
  try {
    // The same flags as the installation files of the workspace input fingerprint.
    const flagPaths: string[] = rushConfiguration.subspaces.map((subspace) =>
      path.join(subspace.getSubspaceTempFolderPath(), 'last-install.flag')
    );
    const identities: (string | undefined)[] = await Promise.all(flagPaths.map(getFileIdentityAsync));
    return {
      flags: new Map(flagPaths.map((flagPath: string, index: number) => [flagPath, identities[index]])),
      hasHotlinks: await hasHotlinksAsync(
        path.join(rushConfiguration.commonTempFolder, RushConstants.rushHotlinkStateFilename)
      )
    };
  } catch {
    return undefined;
  }
}

/**
 * Whether a native `install` or `update` that ran between the two captures left the installation as it was.
 *
 * @remarks
 * Rush deletes a subspace's `last-install.flag` before it changes that subspace's `node_modules`, and writes it
 * again once the subspace is installed, before the `afterInstall` hooks run. The flag doesn't record when it was
 * written, so a reinstall can write the same content again. Each flag is therefore compared by its file identity
 * (device, inode, size and times), not by its content, and a flag that was missing beforehand proves nothing. Rush
 * also deletes the virtual store folders of hotlinked packages before it deletes the flag, and it rewrites the hotlink
 * state only after them, so a workspace with a hotlink never counts as unchanged.
 */
export function isInstallationUnchangedByMutation(
  before: INativeMutationInstallationState,
  after: INativeMutationInstallationState
): boolean {
  if (before.hasHotlinks || after.hasHotlinks || before.flags.size !== after.flags.size) return false;
  for (const [flagPath, identity] of before.flags) {
    if (identity === undefined || after.flags.get(flagPath) !== identity) return false;
  }
  return true;
}

async function getFileIdentityAsync(filePath: string): Promise<string | undefined> {
  let stats: BigIntStats;
  try {
    stats = await stat(filePath, { bigint: true });
  } catch (error) {
    if (FileSystem.isNotExistError(error as Error)) return undefined;
    throw error;
  }
  return [stats.dev, stats.ino, stats.size, stats.mtimeNs, stats.ctimeNs, stats.birthtimeNs].join(':');
}

async function hasHotlinksAsync(statePath: string): Promise<boolean> {
  let text: string;
  try {
    text = await readFile(statePath, 'utf8');
  } catch (error) {
    if (FileSystem.isNotExistError(error as Error)) return false;
    throw error;
  }
  let state: { fileVersion?: unknown; linksBySubspace?: unknown } | undefined;
  try {
    state = JSON.parse(text);
  } catch {
    return true;
  }
  const links: unknown = state?.linksBySubspace;
  // Rush reads file version 0 only.
  if (state?.fileVersion !== 0 || typeof links !== 'object' || links === null) return true;
  return Object.values(links).some(
    (subspaceLinks: unknown) => !Array.isArray(subspaceLinks) || subspaceLinks.length > 0
  );
}
