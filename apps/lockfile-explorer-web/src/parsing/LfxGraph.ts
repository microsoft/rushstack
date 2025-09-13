// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

export enum DependencyKind {
  DEPENDENCY,
  DEV_DEPENDENCY,
  PEER_DEPENDENCY
}

/**
 * Represents a dependency listed under a LockfileEntry
 *
 * @remarks
 * Each dependency listed under a package in the lockfile should have a separate entry. These Dependencies
 * will link to the "containingEntry", which is the LockfileEntry that specified this dependency.
 * The "resolvedEntry" field is the corresponding LockfileEntry for this dependency, as all dependencies also have
 * their own entries in the pnpm lockfile.
 */
export class LockfileDependency {
  public name: string;
  public version: string;
  public dependencyType: DependencyKind;
  public containingEntry: LockfileEntry;

  public entryId: string = '';

  public resolvedEntry: LockfileEntry | undefined = undefined;

  public peerDependencyMeta: {
    name?: string;
    version?: string;
    optional?: boolean;
  } = {};

  public constructor(options: {
    name: string;
    version: string;
    dependencyType: DependencyKind;
    containingEntry: LockfileEntry;
  }) {
    this.name = options.name;
    this.version = options.version;
    this.dependencyType = options.dependencyType;
    this.containingEntry = options.containingEntry;
  }
}

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
 */
export class LockfileEntry {
  /**
   * Whether this entry is a project or a package (specified by importers or packages in the lockfile).
   */
  public readonly kind: LockfileEntryFilter;

  /**
   * A unique (human-readable) identifier for this lockfile entry. For projects, this is just
   * `Project:` + the package json path for this project.
   */
  public entryId: string = '';

  /**
   * The unique identifier assigned to this project/package in the lockfile.
   * e.g. `/@emotion/core/10.3.1_qjwx5m6wssz3lnb35xwkc3pz6q:`
   */
  public rawEntryId: string = '';

  /**
   * Where the package.json is for this project or package.
   */
  public packageJsonFolderPath: string = '';

  /**
   * Just the name of the package with no specifiers.
   */
  public entryPackageName: string = '';

  /**
   * A human friendly name for the project or package.
   */
  public displayText: string = '';

  public entryPackageVersion: string = '';
  public entrySuffix: string = '';

  /**
   * A list of all the dependencies for this entry.
   * Note that dependencies, dev dependencies, as well as peer dependencies are all included.
   */
  public dependencies: LockfileDependency[] = [];

  /**
   * A list of dependencies that are listed under the "transitivePeerDependencies" in the pnpm lockfile.
   */
  public transitivePeerDependencies: Set<string> = new Set();

  /**
   * A list of entries that specify this entry as a dependency.
   */
  public referrers: LockfileEntry[] = [];

  public constructor(kind: LockfileEntryFilter) {
    this.kind = kind;
  }
}

export class LfxGraph {
  public entries: LockfileEntry[] = [];
}
