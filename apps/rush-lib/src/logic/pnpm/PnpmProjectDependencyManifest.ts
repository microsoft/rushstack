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
    this._projectDependencyManifestFilename = PnpmProjectDependencyManifest.getFilePathForProject(this._project);

    this._projectDependencyManifestFile = new Map<string, string>();
  }

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

    const specifier: string = `${name}@${version}`;
    const integrity: string = shrinkwrapEntry.resolution.integrity;
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
          if (dependencySpecifier) {
            if (!semver.valid(dependencySpecifier.versionSpecifier)) {
              throw new InternalError(
                `The version '${dependencySemVer}' of peer dependency '${peerDependencyName}' is invalid`
              );
            }
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
          if (dependencySpecifier) {
            if (!semver.valid(dependencySpecifier.versionSpecifier)) {
              throw new InternalError(
                `The version '${dependencySemVer}' of peer dependency '${peerDependencyName}' is invalid`
              );
            }
            continue;
          }
        }

        // The parent doesn't have a version that satisfies the range. As a last attempt, check
        // if it's been hoisted up as a top-level dependency
        const topLevelDependencySpecifier: DependencySpecifier | undefined =
          this._pnpmShrinkwrapFile.getTopLevelDependencyVersion(peerDependencyName);

        // Sometimes peer dependencies are hoisted but are not represented in the shrinkwrap file
        // (such as when implicitlyPreferredVersions is false) so we need to find the correct key
        // and add it ourselves
        if (!topLevelDependencySpecifier) {
          const peerDependencyKeys: { [peerDependencyName: string]: string } =
            this._parsePeerDependencyKeysFromSpecifier(specifier);
          if (peerDependencyKeys.hasOwnProperty(peerDependencyName)) {
            this._addDependencyInternal(
              peerDependencyName,
              peerDependencyKeys[peerDependencyName],
              shrinkwrapEntry
            );
            continue;
          }
        }

        if (!topLevelDependencySpecifier || !semver.valid(topLevelDependencySpecifier.versionSpecifier)) {
          if (
            !this._project.rushConfiguration.pnpmOptions ||
            !this._project.rushConfiguration.pnpmOptions.strictPeerDependencies ||
            (
              shrinkwrapEntry.peerDependenciesMeta &&
              shrinkwrapEntry.peerDependenciesMeta.hasOwnProperty(peerDependencyName) &&
              shrinkwrapEntry.peerDependenciesMeta[peerDependencyName].optional
            )
          ) {
            // We couldn't find the peer dependency, but we determined it's by design, skip this dependency...
            continue;
          }
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

  private _parsePeerDependencyKeysFromSpecifier(specifier: string): { [peerDependencyName: string]: string } {
    const parsedPeerDependencyKeys: { [peerDependencyName: string]: string } = {};

    const split1: RegExpExecArray | null = /^[^_]+_(.+)$/.exec(specifier);
    if (split1) {
      const combinedPeerDependencies: string = split1[1];
      // Parse "eslint@6.6.0+typescript@3.6.4" --> ["eslint@6.6.0", "typescript@3.6.4"]
      const peerDependencies: string[] = combinedPeerDependencies.split("+");
      for (const peerDependencySpecifier of peerDependencies) {
        // Parse "eslint@6.6.0" --> "eslint", "6.6.0"
        const split2: RegExpExecArray | null = /^([^+@]+)@(.+)$/.exec(peerDependencySpecifier);
        if (split2) {
          const peerDependencyName: string = split2[1];
          const peerDependencyVersion: string = split2[2];
          const peerDependencyKey: string = `/${peerDependencyName}/${peerDependencyVersion}`;
          parsedPeerDependencyKeys[peerDependencyName] = peerDependencyKey;
        }
      }
    }

    return parsedPeerDependencyKeys;
  }
}
