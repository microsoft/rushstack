// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { RushConfigurationProject } from '@rushstack/rush-sdk';

/**
 * Rush's internal representation of the lockfile.
 */
export interface IPnpmLockYaml {
  importers: Map<string, IImporter>;
  packages: Map<string, IPackage>;
  getProjectShrinkwrap(project: RushConfigurationProject): IProjectShrinkwrap | undefined;
}

/**
 * A per-project lockfile, used for change detection of dependencies.
 */
export interface IProjectShrinkwrap {
  updateProjectShrinkwrapAsync(): Promise<void>;
}

/**
 * A single record for a workspace project in the lockfile. Uses pnpm v5 lockfile format.
 */
export interface IImporter {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
}

/**
 * A single record for an external npm dependency in the PNPM v5 lockfile.
 */
export interface IPackage {
  requiresBuild?: boolean;
  hasBin?: boolean;
  peerDependencies?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
  peerDependenciesMeta?: {
    [name: string]: {
      optional?: boolean;
    };
  };
  resolution: {
    integrity: string;
  };
  optional?: boolean;
  os?: ReadonlyArray<string>;
  cpu?: ReadonlyArray<string>;
  patched?: boolean;
}

/**
 * A subset of the Rush pnpm-config.json file, relevant to installation from a lockfile.
 */
export interface IPnpmConfigJson {
  globalPatchedDependencies?: Record<string, string>;
}

/**
 * The results of decompressing and parsing a tarball (.tgz file).
 */
export interface IParsedTarball {
  buffer: SharedArrayBuffer;
  files: Map<string, IFile>;
}

/**
 * Index record for a single entry in a tarball.
 */
export interface IFile {
  mode: number;
  offset: number;
  size: number;
}

/**
 * Metadata about the underlying tarball for a package in the virtual store. Multiple package records
 * will share the same tarball when installed multiple times with different peers.
 */
export interface ITarballEntry {
  integrity: string;
  initialPath: string;
  storageUrl: string | undefined;
  raw: Buffer | undefined;
  parsed: IParsedTarball | undefined;
}

/**
 * All necessary information about a package or workspace project to perform installation.
 */
export interface IDependencyMetadata {
  key: string;
  hasBin: boolean | Record<string, string>;
  project: RushConfigurationProject | undefined;
  requiresBuild: boolean | string[];
  patchPath: string | undefined;
  originFolder: string;
  targetFolder: string;
  packageName: string;

  tarball: ITarballEntry | undefined;

  version: string;
  deps: Map<string, IDependencyMetadata>;
}

/**
 * A ref-counting pointer to an object, so that it may be cleaned up as soon as no longer needed.
 */
export interface IRefCount<T> {
  count: number;
  ref: T;
}

export interface ITarballParseMessage {
  type: 'parse';
  integrity: string;
  buffer: ArrayBuffer;

  length: number;
}

export interface IParseResult {
  buffer: ArrayBufferLike;
  files: Map<string, IFile>;
}

export interface ITarballExtractMessage {
  type: 'extract';
  integrity: string;
  buffer: ArrayBufferLike;

  folder: string;
  files: Iterable<[string, IFile]>;
}
