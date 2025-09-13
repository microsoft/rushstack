// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { LockfileEntry } from './LockfileEntry';

export enum IDependencyType {
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
  public entryId: string = '';
  public dependencyType: IDependencyType;
  public containingEntry: LockfileEntry;

  public resolvedEntry: LockfileEntry | undefined;

  public peerDependencyMeta: {
    name?: string;
    version?: string;
    optional?: boolean;
  } = {};

  public constructor(options: {
    name: string;
    version: string;
    dependencyType: IDependencyType;
    containingEntry: LockfileEntry;
  }) {
    this.name = options.name;
    this.version = options.version;
    this.dependencyType = options.dependencyType;
    this.containingEntry = options.containingEntry;
  }
}
