// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'path';
import * as semver from 'semver';
import {
  JsonFile,
  InternalError,
  FileSystem
} from '@microsoft/node-core-library';

import {
  PnpmShrinkwrapFile,
  IPnpmShrinkwrapDependencyYaml,
  parsePnpmDependencyKey
} from './PnpmShrinkwrapFile';
import { RushConfigurationProject } from '../../api/RushConfigurationProject';
import { RushConstants } from '../RushConstants';
import { BasePackage } from '../base/BasePackage';
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
  private static _cache: Map<string, string> = new Map<string, string>();

  private readonly _projectDependencyManifestFilename: string;
  private readonly _pnpmShrinkwrapFile: PnpmShrinkwrapFile;
  private readonly _project: RushConfigurationProject;

  private _projectDependencyManifestFile: Map<string, string>;

  /**
   * Get the fully-qualified path to the project/.rush/temp/shrinkwrap-deps.json
   * for the specified project.
   */
  public static getFilePathForProject(project: RushConfigurationProject): string {
    return path.join(
      project.projectRushTempFolder,
      RushConstants.projectDependencyManifestFilename
    );
  }

  public constructor(options: IPnpmProjectDependencyManifestOptions) {
    this._pnpmShrinkwrapFile = options.pnpmShrinkwrapFile;
    this._project = options.project;
    this._projectDependencyManifestFilename = PnpmProjectDependencyManifest.getFilePathForProject(this._project);

    this._projectDependencyManifestFile = new Map<string, string>();
  }

  public addDependency(pkg: BasePackage, parentShrinkwrapEntry: IPnpmShrinkwrapDependencyYaml): void {
    if (!pkg.version) {
      throw new InternalError(`Version missing from dependency ${pkg.name}`);
    }

    this._addDependencyInternal(pkg.name, pkg.version, parentShrinkwrapEntry);
  }

  /**
   * Save the current state of the object to project/.rush/temp/shrinkwrap-deps.json
   */
  public save(): void {
    const file: { [specifier: string]: string } = {};
    const keys: string[] = Array.from(this._projectDependencyManifestFile.keys()).sort();
    for (const key of keys) {
      file[key] = this._projectDependencyManifestFile.get(key)!;
    }

    JsonFile.save(
      file,
      this._projectDependencyManifestFilename,
      { ensureFolderExists: true }
    );
  }

  /**
   * If the project/.rush/temp/shrinkwrap-deps.json file exists, delete it. Otherwise, do nothing.
   */
  public deleteIfExists(): void {
    FileSystem.deleteFile(this._projectDependencyManifestFilename, { throwIfNotExists: false });
  }

  private _addDependencyInternal(
    name: string,
    version: string,
    parentShrinkwrapEntry: IPnpmShrinkwrapDependencyYaml,
    throwIfShrinkwrapEntryMissing: boolean = true
  ): void {
    const specifier: string = `${name}@${version}`;
    if (!PnpmProjectDependencyManifest._cache.has(specifier)) {
      const shrinkwrapEntry: IPnpmShrinkwrapDependencyYaml | undefined = this._pnpmShrinkwrapFile.getShrinkwrapEntry(
        name,
        version
      );

      if (!shrinkwrapEntry) {
        if (throwIfShrinkwrapEntryMissing) {
          throw new InternalError(`Unable to find dependency ${name} with version ${version} in shrinkwrap.`);
        }
        return;
      }

      PnpmProjectDependencyManifest._cache.set(specifier, shrinkwrapEntry.resolution.integrity);

      for (const dependencyName in shrinkwrapEntry.dependencies) {
        if (shrinkwrapEntry.dependencies.hasOwnProperty(dependencyName)) {
          const dependencyVersion: string = shrinkwrapEntry.dependencies[dependencyName];
          this._addDependencyInternal(dependencyName, dependencyVersion, shrinkwrapEntry);
        }
      }

      for (const optionalDependencyName in shrinkwrapEntry.optionalDependencies) {
        if (shrinkwrapEntry.optionalDependencies.hasOwnProperty(optionalDependencyName)) {
          // Optional dependencies may not exist. Don't blow up if it can't be found
          const dependencyVersion: string = shrinkwrapEntry.optionalDependencies[optionalDependencyName];
          this._addDependencyInternal(
            optionalDependencyName,
            dependencyVersion,
            shrinkwrapEntry,
            throwIfShrinkwrapEntryMissing = false);
        }
      }

      for (const peerDependencyName in shrinkwrapEntry.peerDependencies) {
        if (shrinkwrapEntry.peerDependencies.hasOwnProperty(peerDependencyName)) {
          // Peer dependencies come in the form of a semantic version range
          const dependencySemVer: string = shrinkwrapEntry.peerDependencies[peerDependencyName];
          // Check the current package to see if the dependency is already satisfied
          if (
            shrinkwrapEntry.dependencies &&
            shrinkwrapEntry.dependencies.hasOwnProperty(peerDependencyName)
          ) {
            const dependencySpecifier: DependencySpecifier | undefined = parsePnpmDependencyKey(
              peerDependencyName,
              shrinkwrapEntry.dependencies[peerDependencyName]
            );
            if (
              dependencySpecifier &&
              semver.valid(dependencySpecifier.versionSpecifier) &&
              semver.satisfies(dependencySpecifier.versionSpecifier, dependencySemVer)
            ) {
              continue;
            }
          }

          // If not, check the parent.
          if (
            parentShrinkwrapEntry.dependencies &&
            parentShrinkwrapEntry.dependencies.hasOwnProperty(peerDependencyName)
          ) {
            const dependencySpecifier: DependencySpecifier | undefined = parsePnpmDependencyKey(
              peerDependencyName,
              parentShrinkwrapEntry.dependencies[peerDependencyName]
            );
            if (
              dependencySpecifier &&
              semver.valid(dependencySpecifier.versionSpecifier) &&
              semver.satisfies(dependencySpecifier.versionSpecifier, dependencySemVer)
            ) {
              continue;
            }
          }

          // The parent doesn't have a version that satisfies the range. As a last attempt, check
          // if it's been hoisted up as a top-level dependency
          const topLevelDependencySpecifier: DependencySpecifier | undefined =
            this._pnpmShrinkwrapFile.getTopLevelDependencyVersion(peerDependencyName);
          if (
            !topLevelDependencySpecifier ||
            !semver.valid(topLevelDependencySpecifier.versionSpecifier) ||
            !semver.satisfies(topLevelDependencySpecifier.versionSpecifier, dependencySemVer)
          ) {
            throw new InternalError(
              `Could not find peer dependency '${peerDependencyName}' that satisfies version '${dependencySemVer}'`
            );
          }

          this._addDependencyInternal(
            peerDependencyName,
            this._pnpmShrinkwrapFile.getTopLevelDependencyKey(peerDependencyName)!,
            shrinkwrapEntry
          );
        }
      }
    }

    const integrity: string = PnpmProjectDependencyManifest._cache.get(specifier)!;

    if (
      this._projectDependencyManifestFile.has(specifier) &&
      this._projectDependencyManifestFile.get(specifier) !== integrity
    ) {
      throw new Error(`Collision: ${specifier} already exists in with a different integrity`);
    }

    this._projectDependencyManifestFile.set(specifier, integrity);
  }
}
