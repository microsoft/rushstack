// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { LfxDependencyKind, IJsonPeerDependencyMeta, LfxGraphEntryKind } from './IJsonLfxGraph';
import type { IJsonLfxWorkspace } from './IJsonLfxWorkspace';

export interface ILfxGraphDependencyOptions {
  name: string;
  version: string;
  dependencyType: LfxDependencyKind;
  containingEntry: LfxGraphEntry;
  peerDependencyMeta: IJsonPeerDependencyMeta;
  entryId: string;
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
export class LfxGraphDependency {
  public readonly name: string;
  public readonly version: string;
  public readonly dependencyType: LfxDependencyKind;
  public readonly containingEntry: LfxGraphEntry;
  public readonly entryId: string;
  public readonly peerDependencyMeta: IJsonPeerDependencyMeta;

  public resolvedEntry: LfxGraphEntry | undefined = undefined;

  public constructor(options: ILfxGraphDependencyOptions) {
    this.name = options.name;
    this.version = options.version;
    this.dependencyType = options.dependencyType;
    this.containingEntry = options.containingEntry;
    this.entryId = options.entryId;
    this.peerDependencyMeta = options.peerDependencyMeta;
  }
}

export interface ILfxGraphEntryOptions {
  kind: LfxGraphEntryKind;
  entryId: string;
  rawEntryId: string;
  packageJsonFolderPath: string;
  entryPackageName: string;
  displayText: string;
  entryPackageVersion: string;
  entrySuffix: string;
}

/**
 * Represents a project or package listed in the pnpm lockfile.
 *
 * @remarks
 * Each project or package will have its own LockfileEntry, which is created when the lockfile is first parsed.
 * The fields for the LockfileEntry are outlined below:
 */
export class LfxGraphEntry {
  /**
   * Whether this entry is a project or a package (specified by importers or packages in the lockfile).
   */
  public readonly kind: LfxGraphEntryKind;

  /**
   * A unique (human-readable) identifier for this lockfile entry. For projects, this is just
   * `Project:` + the package json path for this project.
   */
  public readonly entryId: string;

  /**
   * The unique identifier assigned to this project/package in the lockfile.
   * e.g. `/@emotion/core/10.3.1_qjwx5m6wssz3lnb35xwkc3pz6q:`
   */
  public readonly rawEntryId: string;

  /**
   * Where the package.json is for this project or package.
   */
  public readonly packageJsonFolderPath: string;

  /**
   * Just the name of the package with no specifiers.
   */
  public readonly entryPackageName: string;

  /**
   * A human friendly name for the project or package.
   */
  public readonly displayText: string;

  public readonly entryPackageVersion: string;
  public readonly entrySuffix: string;

  /**
   * A list of all the dependencies for this entry.
   * Note that dependencies, dev dependencies, as well as peer dependencies are all included.
   */
  public readonly dependencies: LfxGraphDependency[] = [];

  /**
   * A list of dependencies that are listed under the "transitivePeerDependencies" in the pnpm lockfile.
   */
  public readonly transitivePeerDependencies: Set<string> = new Set();

  /**
   * A list of entries that specify this entry as a dependency.
   */
  public readonly referrers: LfxGraphEntry[] = [];

  public constructor(options: ILfxGraphEntryOptions) {
    this.kind = options.kind;
    this.entryId = options.entryId;
    this.rawEntryId = options.rawEntryId;
    this.packageJsonFolderPath = options.packageJsonFolderPath;
    this.entryPackageName = options.entryPackageName;
    this.displayText = options.displayText;
    this.entryPackageVersion = options.entryPackageVersion;
    this.entrySuffix = options.entrySuffix;
  }
}

export class LfxGraph {
  public readonly workspace: IJsonLfxWorkspace;
  public readonly entries: LfxGraphEntry[] = [];

  public constructor(workspace: IJsonLfxWorkspace) {
    this.workspace = { ...workspace };
  }
}
