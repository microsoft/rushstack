// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { Path } from '@lifaon/path';
import { LockfileEntry } from './LockfileEntry';

export interface ILockfileNode {
  dependencies?: {
    [key in string]: string;
  };
  devDependencies?: {
    [key in string]: string;
  };
  peerDependencies?: {
    [key in string]: string;
  };
  peerDependenciesMeta?: {
    [key in string]: {
      optional: boolean;
    };
  };
  transitivePeerDependencies?: string[];
}

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
 *
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
  };

  public constructor(
    name: string,
    version: string,
    dependencyType: IDependencyType,
    containingEntry: LockfileEntry,
    node?: ILockfileNode
  ) {
    this.name = name;
    this.version = version;
    this.dependencyType = dependencyType;
    this.containingEntry = containingEntry;
    this.peerDependencyMeta = {};

    if (this.version.startsWith('link:')) {
      const relativePath = this.version.substring('link:'.length);
      const rootRelativePath = new Path('.').relative(
        new Path(containingEntry.packageJsonFolderPath).concat(relativePath)
      );
      if (!rootRelativePath) {
        console.error('No root relative path for dependency!', name);
        return;
      }
      this.entryId = 'project:' + rootRelativePath.toString();
    } else if (this.version.startsWith('/')) {
      this.entryId = this.version;
    } else if (this.dependencyType === IDependencyType.PEER_DEPENDENCY) {
      if (node?.peerDependencies) {
        this.peerDependencyMeta = {
          name: this.name,
          version: node.peerDependencies[this.name],
          optional:
            node.peerDependenciesMeta && node.peerDependenciesMeta[this.name]
              ? node.peerDependenciesMeta[this.name].optional
              : false
        };
        this.entryId = 'Peer: ' + this.name;
      } else {
        console.error('Peer dependencies info missing!', node);
      }
    } else {
      this.entryId = '/' + this.name + '/' + this.version;
    }
  }

  // node is the yaml entry that we are trying to parse
  public static parseDependencies(
    dependencies: LockfileDependency[],
    lockfileEntry: LockfileEntry,
    node: ILockfileNode
  ): void {
    if (node.dependencies) {
      for (const [pkgName, pkgVersion] of Object.entries(node.dependencies)) {
        dependencies.push(
          new LockfileDependency(pkgName, pkgVersion, IDependencyType.DEPENDENCY, lockfileEntry)
        );
      }
    }
    if (node.devDependencies) {
      for (const [pkgName, pkgVersion] of Object.entries(node.devDependencies)) {
        dependencies.push(
          new LockfileDependency(pkgName, pkgVersion, IDependencyType.DEV_DEPENDENCY, lockfileEntry)
        );
      }
    }
    if (node.peerDependencies) {
      for (const [pkgName, pkgVersion] of Object.entries(node.peerDependencies)) {
        dependencies.push(
          new LockfileDependency(pkgName, pkgVersion, IDependencyType.PEER_DEPENDENCY, lockfileEntry, node)
        );
      }
    }
    if (node.transitivePeerDependencies) {
      for (const dep of node.transitivePeerDependencies) {
        lockfileEntry.transitivePeerDependencies.add(dep);
      }
    }
  }
}
