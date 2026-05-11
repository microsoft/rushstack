// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'node:path';

import { escapePath as globEscape } from 'fast-glob';

import { Sort, Import, Path } from '@rushstack/node-core-library';

import { BaseWorkspaceFile } from '../base/BaseWorkspaceFile';
import { PNPM_SHRINKWRAP_YAML_FORMAT } from './PnpmYamlCommon';

const yamlModule: typeof import('js-yaml') = Import.lazy('js-yaml', require);

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
 *    }
 *  }
 */
interface IPnpmWorkspaceYaml {
  /** The list of local package directories */
  packages: string[];
  /** Catalog definitions for centralized version management */
  catalogs?: Record<string, Record<string, string>>;
  /** Per-package build permission map. True permits build scripts, false blocks them. (pnpm 11+) */
  allowBuilds?: Record<string, boolean>;
}

export class PnpmWorkspaceFile extends BaseWorkspaceFile {
  /**
   * The filename of the workspace file.
   */
  public readonly workspaceFilename: string;

  private _workspacePackages: Set<string>;
  private _catalogs: Record<string, Record<string, string>> | undefined;
  private _allowBuilds: Record<string, boolean> | undefined;

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
  }

  /**
   * Sets the catalog definitions for the workspace.
   * @param catalogs - A map of catalog name to package versions
   */
  public setCatalogs(catalogs: Record<string, Record<string, string>> | undefined): void {
    this._catalogs = catalogs;
  }

  /**
   * Sets the `allowBuilds` map for the workspace. Each key is a package name and each value
   * is `true` (permit build scripts) or `false` (block build scripts).
   *
   * @remarks
   * This writes to the `allowBuilds` field in `pnpm-workspace.yaml`, which requires pnpm 11.0.0+.
   *
   * @param allowBuilds - A map of package name to boolean permission flag
   */
  public setAllowBuilds(allowBuilds: Record<string, boolean> | undefined): void {
    this._allowBuilds = allowBuilds;
  }

  /** @override */
  public addPackage(packagePath: string): void {
    // Ensure the path is relative to the pnpm-workspace.yaml file
    if (path.isAbsolute(packagePath)) {
      packagePath = path.relative(path.dirname(this.workspaceFilename), packagePath);
    }

    // Glob can't handle Windows paths
    const globPath: string = Path.convertToSlashes(packagePath);
    this._workspacePackages.add(globEscape(globPath));
  }

  /** @override */
  protected serialize(): string {
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

    return yamlModule.dump(workspaceYaml, PNPM_SHRINKWRAP_YAML_FORMAT);
  }
}
