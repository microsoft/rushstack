// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'path';
import {
  JsonFile,
  InternalError
} from '@microsoft/node-core-library';

import {
  PnpmShrinkwrapFile,
  IPnpmShrinkwrapDependencyYaml
} from './PnpmShrinkwrapFile';
import { RushConfigurationProject } from '../../api/RushConfigurationProject';
import { RushConstants } from '../RushConstants';
import { BasePackage } from '../base/BasePackage';

export interface IPnpmProjectDependencyManifestOptions {
  pnpmShrinkwrapFile: PnpmShrinkwrapFile;
  project: RushConfigurationProject;
}

export class PnpmProjectDependencyManifest {
  private static _cache: Map<string, string> = new Map<string, string>();

  private readonly _projectDependencyManifestFilename: string;
  private readonly _pnpmShrinkwrapFile: PnpmShrinkwrapFile;
  private readonly _project: RushConfigurationProject;

  private _projectDependencyManifestFile: Map<string, string>;

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

  public addDependency(pkg: BasePackage): void {
    if (!pkg.version) {
      throw new InternalError(`Version missing from dependency ${pkg.name}`);
    }

    this._addDependencyInternal(pkg.name, pkg.version);
  }

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

  private _addDependencyInternal(
    name: string,
    version: string
  ): void {
    const specifier: string = `${name}@${version}`;
    if (!PnpmProjectDependencyManifest._cache.has(specifier)) {
      const shrinkwrapEntry: IPnpmShrinkwrapDependencyYaml | undefined = this._pnpmShrinkwrapFile.getShrinkwrapEntry(
        name,
        version
      );

      if (!shrinkwrapEntry) {
        throw new InternalError(`Unable to find dependency ${name} with version ${version} in shrinkwrap.`);
      }

      PnpmProjectDependencyManifest._cache.set(specifier, shrinkwrapEntry.resolution.integrity);

      for (const dependencyName in shrinkwrapEntry.dependencies) {
        if (shrinkwrapEntry.dependencies.hasOwnProperty(dependencyName)) {
          const dependencyVersion: string = shrinkwrapEntry.dependencies[dependencyName];
          this._addDependencyInternal(dependencyName, dependencyVersion);
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
