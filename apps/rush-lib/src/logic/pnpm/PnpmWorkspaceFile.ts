// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

// eslint-disable-next-line
const importLazy = require('import-lazy')(require);

import * as globEscape from 'glob-escape';
import * as os from 'os';
import * as path from 'path';
// eslint-disable-next-line
const yaml = importLazy('js-yaml');
import { FileSystem, Sort, Text } from '@rushstack/node-core-library';

import { BaseWorkspaceFile } from '../base/BaseWorkspaceFile';
import { PNPM_SHRINKWRAP_YAML_FORMAT as PNPM_YAML_DUMP_OPTIONS } from './PnpmYamlCommon';

/**
 * This interface represents the raw pnpm-workspace.YAML file
 * Example:
 *  {
 *    "packages": [
 *      "../../apps/project1"
 *    ]
 *  }
 */
interface IPnpmWorkspaceYaml {
  /** The list of local package directories */
  packages: string[];
}

export class PnpmWorkspaceFile extends BaseWorkspaceFile {
  /**
   * The filename of the workspace file.
   */
  public readonly workspaceFilename: string;

  private _workspacePackages: Set<string>;

  /**
   * The PNPM workspace file is used to specify the location of workspaces relative to the root
   * of your PNPM install.
   */
  public constructor(workspaceYamlFilename: string) {
    super();

    this.workspaceFilename = workspaceYamlFilename;
    let workspaceYaml: IPnpmWorkspaceYaml;
    try {
      // Populate with the existing file, or an empty list if the file doesn't exist
      workspaceYaml = FileSystem.exists(workspaceYamlFilename)
        ? yaml.safeLoad(FileSystem.readFile(workspaceYamlFilename).toString())
        : { packages: [] };
    } catch (error) {
      throw new Error(`Error reading "${workspaceYamlFilename}":${os.EOL}  ${error.message}`);
    }

    this._workspacePackages = new Set<string>(workspaceYaml.packages);
  }

  /** @override */
  public addPackage(packagePath: string): void {
    // Ensure the path is relative to the pnpm-workspace.yaml file
    if (path.isAbsolute(packagePath)) {
      packagePath = path.relative(path.dirname(this.workspaceFilename), packagePath);
    }

    // Glob can't handle Windows paths
    const globPath: string = Text.replaceAll(packagePath, '\\', '/');
    this._workspacePackages.add(globEscape(globPath));
  }

  /** @override */
  protected serialize(): string {
    // Ensure stable sort order when serializing
    Sort.sortSet(this._workspacePackages);

    const workspaceYaml: IPnpmWorkspaceYaml = {
      packages: Array.from(this._workspacePackages)
    };
    return yaml.safeDump(workspaceYaml, PNPM_YAML_DUMP_OPTIONS);
  }
}
