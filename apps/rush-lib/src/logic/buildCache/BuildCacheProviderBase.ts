// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'path';
import { Path } from '@rushstack/node-core-library';
import { CollatedTerminal } from '@rushstack/stream-collator';

import { IProjectBuildDeps } from '../taskRunner/ProjectBuilder';
import { PackageChangeAnalyzer } from '../PackageChangeAnalyzer';
import { ProjectBuildCache } from './ProjectBuildCache';
import { ProjectBuildCacheConfiguration } from '../../api/ProjectBuildCacheConfiguration';

export interface IBuildCacheProviderBaseOptions {}

export interface IGetProjectBuildCacheOptions {
  projectBuildCacheConfiguration: ProjectBuildCacheConfiguration;
  command: string;
  projectBuildDeps: IProjectBuildDeps | undefined;
  packageChangeAnalyzer: PackageChangeAnalyzer;
}

export abstract class BuildCacheProviderBase {
  public constructor(options: IBuildCacheProviderBaseOptions) {}

  public tryGetProjectBuildCache(
    terminal: CollatedTerminal,
    options: IGetProjectBuildCacheOptions
  ): ProjectBuildCache | undefined {
    const { projectBuildCacheConfiguration, projectBuildDeps, command, packageChangeAnalyzer } = options;
    if (!projectBuildDeps) {
      return undefined;
    }

    if (!this._validateProject(terminal, projectBuildCacheConfiguration, projectBuildDeps)) {
      return undefined;
    }

    return new ProjectBuildCache({
      projectBuildCacheConfiguration,
      command,
      buildCacheProvider: this,
      packageChangeAnalyzer
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
    projectBuildCacheConfiguration: ProjectBuildCacheConfiguration,
    projectState: IProjectBuildDeps
  ): boolean {
    const normalizedProjectRelativeFolder: string = Path.convertToSlashes(
      projectBuildCacheConfiguration.project.projectRelativeFolder
    );
    const outputFolders: string[] = [];
    for (const outputFolderName of projectBuildCacheConfiguration.projectOutputFolders) {
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
