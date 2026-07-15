// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'node:path';

import { escapePath as globEscape } from 'fast-glob';

import { Sort, Path } from '@rushstack/node-core-library';

import { BaseWorkspaceFile } from '../base/BaseWorkspaceFile';
import { PNPM_SHRINKWRAP_YAML_FORMAT } from './PnpmYamlCommon';

/**
 * This interface represents the raw pnpm-workspace.YAML file
 * Example:
 *  {
 *    "packages": [
 *      "../../apps/project1"
 *    ],
 *    "catalogs": {
 *      "default": {
 *        "react": "^18.0.0"
 *      }
 *    },
 *    "allowBuilds": {
 *      "esbuild": true,
 *      "fsevents": false
 *    }
 *  }
 */
interface IPnpmWorkspaceYaml {
  /** The list of local package directories */
  packages: string[];
  /** Catalog definitions for centralized version management */
  catalogs?: Record<string, Record<string, string>>;
  /**
   * Controls which packages are allowed to run build scripts. A value of `true` means the
   * package is allowed to run build scripts; `false` means it is explicitly denied.
   * Packages with build scripts not listed here will cause pnpm to fail with ERR_PNPM_IGNORED_BUILDS.
   * (SUPPORTED ONLY IN PNPM 11.0.0 AND NEWER)
   */
  allowBuilds?: Record<string, boolean>;
  /**
   * The minimum number of minutes that must pass after a version is published before pnpm will install it.
   * (SUPPORTED ONLY IN PNPM 10.16.0 AND NEWER)
   */
  minimumReleaseAge?: number;
  /**
   * List of package names or patterns that are excluded from the minimumReleaseAge check.
   * (SUPPORTED ONLY IN PNPM 10.16.0 AND NEWER)
   */
  minimumReleaseAgeExclude?: string[];
}

export class PnpmWorkspaceFile extends BaseWorkspaceFile {
  /**
   * The filename of the workspace file.
   */
  public readonly workspaceFilename: string;

  private _workspacePackages: Set<string>;
  private _catalogs: Record<string, Record<string, string>> | undefined;
  private _allowBuilds: Record<string, boolean> | undefined;
  private _minimumReleaseAge: number | undefined;
  private _minimumReleaseAgeExclude: string[] | undefined;

  /**
   * The PNPM workspace file is used to specify the location of workspaces relative to the root
   * of your PNPM install.
   */
  public constructor(workspaceYamlFilename: string) {
    super();

    this.workspaceFilename = workspaceYamlFilename;
    // Ignore any existing file since this file is generated and we need to handle deleting packages
    // If we need to support manual customization, that should be an additional parameter for "base file"
    this._workspacePackages = new Set<string>();
    this._catalogs = undefined;
    this._allowBuilds = undefined;
    this._minimumReleaseAge = undefined;
    this._minimumReleaseAgeExclude = undefined;
  }

  /**
   * Sets the catalog definitions for the workspace.
   * @param catalogs - A map of catalog name to package versions
   */
  public setCatalogs(catalogs: Record<string, Record<string, string>> | undefined): void {
    this._catalogs = catalogs;
  }

  /**
   * Sets the allowBuilds definitions for the workspace.
   * This controls which packages are allowed to run build scripts in pnpm 11+.
   * @param allowBuilds - A map of package name to boolean (true = allowed, false = denied)
   */
  public setAllowBuilds(allowBuilds: Record<string, boolean> | undefined): void {
    this._allowBuilds = allowBuilds;
  }

  /**
   * Sets the minimumReleaseAge setting for the workspace.
   * The minimum number of minutes that must pass after a version is published before pnpm will install it.
   * (SUPPORTED ONLY IN PNPM 10.16.0 AND NEWER)
   */
  public setMinimumReleaseAge(minimumReleaseAge: number | undefined): void {
    this._minimumReleaseAge = minimumReleaseAge;
  }

  /**
   * Sets the minimumReleaseAgeExclude setting for the workspace.
   * List of package names or patterns that are excluded from the minimumReleaseAge check.
   * (SUPPORTED ONLY IN PNPM 10.16.0 AND NEWER)
   */
  public setMinimumReleaseAgeExclude(minimumReleaseAgeExclude: string[] | undefined): void {
    this._minimumReleaseAgeExclude = minimumReleaseAgeExclude;
  }

  public override addPackage(packagePath: string): void {
    // Ensure the path is relative to the pnpm-workspace.yaml file
    if (path.isAbsolute(packagePath)) {
      packagePath = path.relative(path.dirname(this.workspaceFilename), packagePath);
    }

    // Glob can't handle Windows paths
    const globPath: string = Path.convertToSlashes(packagePath);
    this._workspacePackages.add(globEscape(globPath));
  }

  protected override async serializeAsync(): Promise<string> {
    // Ensure stable sort order when serializing
    Sort.sortSet(this._workspacePackages);

    const workspaceYaml: IPnpmWorkspaceYaml = {
      packages: Array.from(this._workspacePackages)
    };

    if (this._catalogs && Object.keys(this._catalogs).length > 0) {
      workspaceYaml.catalogs = this._catalogs;
    }

    if (this._allowBuilds && Object.keys(this._allowBuilds).length > 0) {
      workspaceYaml.allowBuilds = this._allowBuilds;
    }

    // js-yaml omits mapping entries whose value is `undefined`, so no guard is needed here.
    workspaceYaml.minimumReleaseAge = this._minimumReleaseAge;
    workspaceYaml.minimumReleaseAgeExclude = this._minimumReleaseAgeExclude;

    const yamlModule: typeof import('js-yaml') = await import('js-yaml');
    return yamlModule.dump(workspaceYaml, PNPM_SHRINKWRAP_YAML_FORMAT);
  }
}
