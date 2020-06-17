// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as globEscape from 'glob-escape';
import * as os from 'os';
import * as path from 'path';
import * as yaml from 'js-yaml';
import { FileSystem, Sort, Text } from '@rushstack/node-core-library';

import { BaseWorkspaceFile } from '../base/BaseWorkspaceFile';

// This is based on PNPM's own configuration:
// https://github.com/pnpm/pnpm-shrinkwrap/blob/master/src/write.ts
const WORKSPACE_YAML_FORMAT: yaml.DumpOptions = {
  lineWidth: 1000,
  noCompatMode: true,
  noRefs: true,
  sortKeys: true
};

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
   *
 @halfnibble
halfnibble 5 days ago Member
Empty comment.

@D4N14L	Reply…
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
    return yaml.safeDump(workspaceYaml, WORKSPACE_YAML_FORMAT);
  }
}
