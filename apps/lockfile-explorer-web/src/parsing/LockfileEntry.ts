// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { LockfileDependency } from './LockfileDependency';

export enum LockfileEntryFilter {
  Project,
  Package,
  SideBySide,
  Doppelganger
}

/**
 * Represents a project or package listed in the pnpm lockfile.
 *
 * @remarks
 * Each project or package will have its own LockfileEntry, which is created when the lockfile is first parsed.
 * The fields for the LockfileEntry are outlined below:
 *
 * @class LockfileEntry
 * @property entryId {string} a unique (human-readable) identifier for this lockfile entry. For projects, this is just
 *    "Project:" + the package json path for this project.
 * @property rawEntryId {string} the unique identifier assigned to this project/package in the lockfile.
 *    e.g. /@emotion/core/10.3.1_qjwx5m6wssz3lnb35xwkc3pz6q:
 * @property kind {LockfileEntryFilter} Whether this entry is a project or a package (specified by importers or packages in the lockfile).
 * @property packageJsonFolderPath {string} Where the package.json is for this project or package.
 * @property entryPackageName {string} Just the name of the package with no specifiers.
 * @property displayText {string} A human friendly name for the project or package.
 * @property dependencies {LockfileDependency[]} A list of all the dependencies for this entry.
 *    Note that dependencies, dev dependencies, as well as peer dependencies are all included.
 * @property transitivePeerDependencies {Set<string>} A list of dependencies that are listed under the
 *    "transitivePeerDependencies" in the pnpm lockfile.
 * @property referrers {LockfileEntry[]} a list of entries that specify this entry as a dependency.
 *
 */
export class LockfileEntry {
  public readonly kind: LockfileEntryFilter;
  public entryId: string = '';
  public rawEntryId: string = '';
  public packageJsonFolderPath: string = '';

  public entryPackageName: string = '';
  public displayText: string = '';

  public dependencies: LockfileDependency[] = [];
  public transitivePeerDependencies: Set<string> = new Set();
  public referrers: LockfileEntry[] = [];

  public entryPackageVersion: string = '';
  public entrySuffix: string = '';

  public constructor(kind: LockfileEntryFilter) {
    this.kind = kind;
  }
}
