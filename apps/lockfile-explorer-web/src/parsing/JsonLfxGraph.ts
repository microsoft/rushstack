// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { DependencyKind, LockfileEntryFilter } from './LfxGraph';

export interface IJsonPeerDependencyMeta {
  name?: string;
  version?: string;
  optional?: boolean;
}

export interface IJsonLfxDependency {
  name: string;
  version: string;
  entryId: string;
  dependencyType: DependencyKind;

  resolvedEntryJsonId?: number;

  peerDependencyMeta: IJsonPeerDependencyMeta;
}

export interface IJsonLfxEntry {
  /**
   * A unique ID used when serializing graph links.
   *
   * @remarks
   * This is just the `IJsonLfxGraph.entries` array index, but debugging is easier if we include
   * it in the serialized representation.
   */
  jsonId: number;

  kind: LockfileEntryFilter;
  entryId: string;
  rawEntryId: string;
  packageJsonFolderPath: string;
  entryPackageName: string;
  displayText: string;
  entryPackageVersion: string;
  entrySuffix: string;

  // Lists
  dependencies: IJsonLfxDependency[];
  transitivePeerDependencies: string[];
  referrerJsonIds: number[];
}

export interface IJsonLfxGraph {
  entries: IJsonLfxEntry[];
}
