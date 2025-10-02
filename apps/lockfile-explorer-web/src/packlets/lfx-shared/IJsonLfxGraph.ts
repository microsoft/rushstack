// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { IJsonLfxWorkspace } from './IJsonLfxWorkspace';

export enum LfxGraphEntryKind {
  Project = 1,
  Package = 2,
  SideBySide = 3,
  Doppelganger = 4
}

export interface IJsonPeerDependencyMeta {
  name?: string;
  version?: string;
  optional?: boolean;
}

export interface IJsonLfxDependency {
  name: string;
  versionPath: string;
  entryId: string;
  originalSpecifier: string;
  dependencyType: LfxDependencyKind;
  peerDependencyMeta: IJsonPeerDependencyMeta;

  resolvedEntryJsonId?: number;
}

export enum LfxDependencyKind {
  Regular = 'regular',
  Dev = 'dev',
  Peer = 'peer'
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

  kind: LfxGraphEntryKind;
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
  workspace: IJsonLfxWorkspace;
  entries: IJsonLfxEntry[];
}
