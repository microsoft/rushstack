// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'path';
import { CollatedTerminal } from '@rushstack/stream-collator';

import { RushConfigurationProject } from '../../api/RushConfigurationProject';
import { IProjectBuildDeps } from '../taskRunner/ProjectBuilder';
import { PackageChangeAnalyzer } from '../PackageChangeAnalyzer';
import { ProjectBuildCache } from './ProjectBuildCache';

export interface IBuildCacheProviderBaseOptions {
  projectOutputFolderNames: string[];
}

export interface IGetProjectBuildCacheOptions {
  project: RushConfigurationProject;
  command: string;
  projectBuildDeps: IProjectBuildDeps | undefined;
  packageChangeAnalyzer: PackageChangeAnalyzer;
}

export abstract class BuildCacheProviderBase {
  private static _cacheIdCache: Map<string, string> = new Map<string, string>();

  private readonly _projectOutputFolderNames: string[];

  public constructor(options: IBuildCacheProviderBaseOptions) {
    this._projectOutputFolderNames = options.projectOutputFolderNames;
  }

  public tryGetProjectBuildCache(
    terminal: CollatedTerminal,
    options: IGetProjectBuildCacheOptions
  ): ProjectBuildCache | undefined {
    const { project, projectBuildDeps, command, packageChangeAnalyzer } = options;
    if (!projectBuildDeps) {
      return undefined;
    }

    const normalizedProjectRelativeFolder: string = options.project.projectRelativeFolder.replace(/\\/g, '/');
    if (!this._validateProject(terminal, normalizedProjectRelativeFolder, projectBuildDeps)) {
      return undefined;
    }

    return new ProjectBuildCache({
      project,
      command,
      buildCacheProvider: this,
      packageChangeAnalyzer,
      projectOutputFolderNames: this._projectOutputFolderNames
    });
  }

  public abstract tryGetCacheEntryBufferByIdAsync(
    terminal: CollatedTerminal,
    cacheId: string
  ): Promise<Buffer | undefined>;
  public abstract trySetCacheEntryBufferAsync(
    terminal: CollatedTerminal,
    cacheId: string,
    entryBuffer: Buffer
  ): Promise<boolean>;

  private _validateProject(
    terminal: CollatedTerminal,
    normalizedProjectRelativeFolder: string,
    projectState: IProjectBuildDeps
  ): boolean {
    const outputFolders: string[] = [];
    for (const outputFolderName of this._projectOutputFolderNames) {
      outputFolders.push(`${path.posix.join(normalizedProjectRelativeFolder, outputFolderName)}/`);
    }

    const inputOutputFiles: string[] = [];
    for (const file of Object.keys(projectState.files)) {
      for (const outputFolder of outputFolders) {
        if (file.startsWith(outputFolder)) {
          inputOutputFiles.push(file);
        }
      }
    }

    if (inputOutputFiles.length > 0) {
      terminal.writeStderrLine(
        'Unable to use build cache. The following files are used to calculate project state ' +
          `and are considered project output: ${inputOutputFiles.join(', ')}`
      );
      return false;
    } else {
      return true;
    }
  }
}
