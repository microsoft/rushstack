// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'node:path';

import { Sort, Import, Path } from '@rushstack/node-core-library';

import { BaseWorkspaceFile } from '../base/BaseWorkspaceFile';
import { PNPM_SHRINKWRAP_YAML_FORMAT } from './PnpmYamlCommon';

const yamlModule: typeof import('js-yaml') = Import.lazy('js-yaml', require);

const globEscape: (unescaped: string) => string = require('glob-escape'); // No @types/glob-escape package exists

/**
 * This interface represents the raw pnpm-workspace.YAML file
 * Example:
 *  {
 *    "packages": [
 *      "../../apps/project1"
 *    ],
 *    "catalogs": {
 *      "default": {
 *        "lodash": "^4.17.21"
 *      },
 *      "react18": {
 *        "react": "^18.2.0",
 *        "react-dom": "^18.2.0"
 *      }
 *    }
 *  }
 */
interface IPnpmWorkspaceYaml {
  /** The list of local package directories */
  packages: string[];
  /** Named catalogs - maps catalog names to package version mappings */
  catalogs?: Record<string, Record<string, string>>;
}

export class PnpmWorkspaceFile extends BaseWorkspaceFile {
  /**
   * The filename of the workspace file.
   */
  public readonly workspaceFilename: string;

  private _workspacePackages: Set<string>;
  private _catalogs: Record<string, Record<string, string>> | undefined;

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

  /**
   * Set the named catalogs for the workspace.
   * Catalogs allow defining reusable dependency version ranges that can be referenced
   * in package.json files using the "catalog:" or "catalog:\<name\>" protocol.
   * Use the "default" catalog name for packages that should be referenced with "catalog:"
   * (no name), or use custom catalog names for "catalog:\<name\>" references.
   *
   * @param catalogs - A record mapping catalog names to package version mappings, or undefined to clear
   */
  public setCatalogs(catalogs: Record<string, Record<string, string>> | undefined): void {
    this._catalogs = catalogs;
  }

  /** @override */
  protected serialize(): string {
    // Ensure stable sort order when serializing
    Sort.sortSet(this._workspacePackages);

    const workspaceYaml: IPnpmWorkspaceYaml = {
      packages: Array.from(this._workspacePackages)
    };

    // Add named catalogs if defined and non-empty
    if (this._catalogs && Object.keys(this._catalogs).length > 0) {
      // Sort the catalog names and entries for stable output
      const sortedCatalogs: Record<string, Record<string, string>> = {};
      for (const catalogName of Object.keys(this._catalogs).sort()) {
        const catalog: Record<string, string> = this._catalogs[catalogName];
        const sortedCatalog: Record<string, string> = {};
        for (const key of Object.keys(catalog).sort()) {
          sortedCatalog[key] = catalog[key];
        }
        sortedCatalogs[catalogName] = sortedCatalog;
      }
      workspaceYaml.catalogs = sortedCatalogs;
    }

    return yamlModule.dump(workspaceYaml, PNPM_SHRINKWRAP_YAML_FORMAT);
  }
}
