// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'path';
import crypto from 'crypto';
import { JsonFile, InternalError, FileSystem } from '@rushstack/node-core-library';

import { PnpmShrinkwrapFile, IPnpmShrinkwrapDependencyYaml } from './PnpmShrinkwrapFile';
import { RushConfigurationProject } from '../../api/RushConfigurationProject';
import { RushConstants } from '../RushConstants';
import { DependencySpecifier } from '../DependencySpecifier';

export interface IPnpmProjectDependencyManifestOptions {
  pnpmShrinkwrapFile: PnpmShrinkwrapFile;
  project: RushConfigurationProject;
}

/**
 * This class handles creating the project/.rush/temp/shrinkwrap-deps.json file
 * which tracks the direct and indirect dependencies that a project consumes. This is used
 * to better determine which projects should be rebuilt when dependencies are updated.
 */
export class PnpmProjectDependencyManifest {
  /**
   * This mapping is used to map all project dependencies and all their dependencies
   * to their respective dependency integrity hash. For example, if the project contains
   * a dependency A which itself has a dependency on B, the mapping would look like:
   * 'A@1.2.3': '{Integrity of A}',
   * 'B@4.5.6': '{Integrity of B}',
   * ...
   */
  private _projectDependencyManifestFile: Map<string, string>;

  private readonly _projectDependencyManifestFilename: string;
  private readonly _pnpmShrinkwrapFile: PnpmShrinkwrapFile;
  private readonly _project: RushConfigurationProject;

  public constructor(options: IPnpmProjectDependencyManifestOptions) {
    this._pnpmShrinkwrapFile = options.pnpmShrinkwrapFile;
    this._project = options.project;
    this._projectDependencyManifestFilename = PnpmProjectDependencyManifest.getFilePathForProject(
      this._project
    );

    this._projectDependencyManifestFile = new Map<string, string>();
  }

  /**
   * Get the fully-qualified path to the project/.rush/temp/shrinkwrap-deps.json
   * for the specified project.
   */
  public static getFilePathForProject(project: RushConfigurationProject): string {
    return path.join(project.projectRushTempFolder, RushConstants.projectDependencyManifestFilename);
  }

  public addDependency(
    name: string,
    version: string,
    parentShrinkwrapEntry: Pick<
      IPnpmShrinkwrapDependencyYaml,
      'dependencies' | 'optionalDependencies' | 'peerDependencies'
    >
  ): void {
    this._addDependencyInternal(name, version, parentShrinkwrapEntry);
  }

  /**
   * Save the current state of the object to project/.rush/temp/shrinkwrap-deps.json
   */
  public async saveAsync(): Promise<void> {
    const file: { [specifier: string]: string } = {};
    const keys: string[] = Array.from(this._projectDependencyManifestFile.keys()).sort();
    for (const key of keys) {
      file[key] = this._projectDependencyManifestFile.get(key)!;
    }
    await JsonFile.saveAsync(file, this._projectDependencyManifestFilename, { ensureFolderExists: true });
  }

  /**
   * If the project/.rush/temp/shrinkwrap-deps.json file exists, delete it. Otherwise, do nothing.
   */
  public deleteIfExistsAsync(): Promise<void> {
    return FileSystem.deleteFileAsync(this._projectDependencyManifestFilename, { throwIfNotExists: false });
  }

  private _addDependencyInternal(
    name: string,
    version: string,
    parentShrinkwrapEntry: Pick<
      IPnpmShrinkwrapDependencyYaml,
      'dependencies' | 'optionalDependencies' | 'peerDependencies'
    >,
    throwIfShrinkwrapEntryMissing: boolean = true
  ): void {
    const shrinkwrapEntry:
      | IPnpmShrinkwrapDependencyYaml
      | undefined = this._pnpmShrinkwrapFile.getShrinkwrapEntry(name, version);

    if (!shrinkwrapEntry) {
      if (throwIfShrinkwrapEntryMissing) {
        throw new InternalError(`Unable to find dependency ${name} with version ${version} in shrinkwrap.`);
      }
      return;
    }

    const specifier: string = `${name}@${version}`;
    let integrity: string = shrinkwrapEntry.resolution.integrity;

    if (!integrity) {
      // git dependency specifiers do not have an integrity entry

      // Example ('integrity' doesn't exist in 'resolution'):
      //
      // github.com/chfritz/node-xmlrpc/948db2fbd0260e5d56ed5ba58df0f5b6599bbe38:
      //   dependencies:
      //     sax: 1.2.4
      //     xmlbuilder: 8.2.2
      //   dev: false
      //   engines:
      //     node: '>=0.8'
      //     npm: '>=1.0.0'
      //   name: xmlrpc
      //   resolution:
      //     tarball: 'https://codeload.github.com/chfritz/node-xmlrpc/tar.gz/948db2fbd0260e5d56ed5ba58df0f5b6599bbe38'
      //   version: 1.3.2

      const sha256Digest: string = crypto
        .createHash('sha256')
        .update(JSON.stringify(shrinkwrapEntry))
        .digest('hex');
      integrity = `${name}@${version}:${sha256Digest}:`;
    }

    if (this._projectDependencyManifestFile.has(specifier)) {
      if (this._projectDependencyManifestFile.get(specifier) !== integrity) {
        throw new Error(`Collision: ${specifier} already exists in with a different integrity`);
      }
      return;
    }

    // Add the current dependency
    this._projectDependencyManifestFile.set(specifier, integrity);

    // Add the dependencies of the dependency
    for (const dependencyName in shrinkwrapEntry.dependencies) {
      if (shrinkwrapEntry.dependencies.hasOwnProperty(dependencyName)) {
        const dependencyVersion: string = shrinkwrapEntry.dependencies[dependencyName];
        this._addDependencyInternal(dependencyName, dependencyVersion, shrinkwrapEntry);
      }
    }

    // Add the optional dependencies of the dependency
    for (const optionalDependencyName in shrinkwrapEntry.optionalDependencies) {
      if (shrinkwrapEntry.optionalDependencies.hasOwnProperty(optionalDependencyName)) {
        // Optional dependencies may not exist. Don't blow up if it can't be found
        const dependencyVersion: string = shrinkwrapEntry.optionalDependencies[optionalDependencyName];
        this._addDependencyInternal(
          optionalDependencyName,
          dependencyVersion,
          shrinkwrapEntry,
          (throwIfShrinkwrapEntryMissing = false)
        );
      }
    }

    // When using workspaces, hoisting of peer dependencies to a singular top-level project is not possible.
    // Therefore, all packages that are consumed should be specified in the dependency tree. Given this, there
    // is no need to look for peer dependencies, since it is simply a constraint to be validated by the
    // package manager. Also return if we have no peer dependencies to scavenge through.
    if (
      (this._project.rushConfiguration.pnpmOptions &&
        this._project.rushConfiguration.pnpmOptions.useWorkspaces) ||
      !shrinkwrapEntry.peerDependencies
    ) {
      return;
    }

    for (const peerDependencyName of Object.keys(shrinkwrapEntry.peerDependencies)) {
      // Check to see if the peer dependency is satisfied with the current shrinkwrap
      // entry. If not, check the parent shrinkwrap entry. Finally, if neither have
      // the specified dependency, check that the parent mentions the dependency in
      // it's own peer dependencies. If it is, we can rely on the package manager and
      // make the assumption that we've already found it further up the stack.
      if (
        (shrinkwrapEntry.dependencies && shrinkwrapEntry.dependencies.hasOwnProperty(peerDependencyName)) ||
        (parentShrinkwrapEntry.dependencies &&
          parentShrinkwrapEntry.dependencies.hasOwnProperty(peerDependencyName)) ||
        (parentShrinkwrapEntry.peerDependencies &&
          parentShrinkwrapEntry.peerDependencies.hasOwnProperty(peerDependencyName))
      ) {
        continue;
      }

      // As a last attempt, check if it's been hoisted up as a top-level dependency. If
      // we can't find it, we can assume that it's already been provided somewhere up the
      // dependency tree.
      const topLevelDependencySpecifier:
        | DependencySpecifier
        | undefined = this._pnpmShrinkwrapFile.getTopLevelDependencyVersion(peerDependencyName);

      if (topLevelDependencySpecifier) {
        this._addDependencyInternal(
          peerDependencyName,
          this._pnpmShrinkwrapFile.getTopLevelDependencyKey(peerDependencyName)!,
          shrinkwrapEntry
        );
      }
    }
  }
}
