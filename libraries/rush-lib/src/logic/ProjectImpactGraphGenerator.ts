// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import yaml from 'js-yaml';

import { FileSystem, Text, Async } from '@rushstack/node-core-library';
import { Colorize, type ITerminal } from '@rushstack/terminal';

import type { RushConfiguration } from '../api/RushConfiguration.ts';
import type { RushConfigurationProject } from '../api/RushConfigurationProject.ts';
import { Stopwatch } from '../utilities/Stopwatch.ts';
import { RushConstants } from './RushConstants.ts';

/**
 * Project property configuration
 */
export interface IProjectImpactGraphProjectConfiguration {
  includedGlobs: string[];
  excludedGlobs?: string[];
  dependentProjects: string[];
}

/**
 * The schema of `project-impact-graph.yaml`
 */
export interface IProjectImpactGraphFile {
  globalExcludedGlobs: string[];
  projects: Record<string, IProjectImpactGraphProjectConfiguration>;
}

/**
 * Default global excluded globs
 * Only used if the `<repository_root>/.mergequeueignore` does not exist
 */
const DEFAULT_GLOBAL_EXCLUDED_GLOBS: string[] = ['common/autoinstallers/**'];

async function tryReadFileLinesAsync(filePath: string): Promise<string[] | undefined> {
  let fileContents: string | undefined;
  try {
    fileContents = await FileSystem.readFileAsync(filePath);
  } catch (error) {
    if (!FileSystem.isNotExistError(error)) {
      throw error;
    }
  }

  if (fileContents) {
    return Text.convertToLf(fileContents).split('\n');
  }
}

export class ProjectImpactGraphGenerator {
  private readonly _terminal: ITerminal;

  /**
   * The Rush configuration
   */
  private readonly _rushConfiguration: RushConfiguration;

  /**
   * Full path of repository root
   */
  private readonly _repositoryRoot: string;

  /**
   * Full path to `project-impact-graph.yaml`
   */
  private readonly _projectImpactGraphFilePath: string;

  /**
   * Get repositoryRoot and load projects within the rush.json
   */
  public constructor(terminal: ITerminal, rushConfiguration: RushConfiguration) {
    this._terminal = terminal;
    this._rushConfiguration = rushConfiguration;
    const { rushJsonFolder } = rushConfiguration;
    this._repositoryRoot = rushJsonFolder;
    this._projectImpactGraphFilePath = `${rushJsonFolder}/${RushConstants.projectImpactGraphFilename}`;
  }

  /**
   * Load global excluded globs
   */
  private async _loadGlobalExcludedGlobsAsync(): Promise<string[] | undefined> {
    const filePath: string = `${this._repositoryRoot}/${RushConstants.mergeQueueIgnoreFileName}`;
    return await tryReadFileLinesAsync(filePath);
  }

  /**
   * Load project excluded globs
   * @param projectRootRelativePath - project root relative path
   */
  private async _tryLoadProjectExcludedGlobsAsync(
    projectRootRelativePath: string
  ): Promise<string[] | undefined> {
    const filePath: string = `${this._repositoryRoot}/${projectRootRelativePath}/${RushConstants.mergeQueueIgnoreFileName}`;

    const globs: string[] | undefined = await tryReadFileLinesAsync(filePath);
    if (globs) {
      for (let i: number = 0; i < globs.length; i++) {
        globs[i] = `${projectRootRelativePath}/${globs[i]}`;
      }

      return globs;
    }
  }

  /**
   * Core Logic: generate project-impact-graph.yaml
   */
  public async generateAsync(): Promise<void> {
    const stopwatch: Stopwatch = Stopwatch.start();

    const [globalExcludedGlobs = DEFAULT_GLOBAL_EXCLUDED_GLOBS, projectEntries] = await Promise.all([
      this._loadGlobalExcludedGlobsAsync(),
      Async.mapAsync<RushConfigurationProject, [string, IProjectImpactGraphProjectConfiguration]>(
        this._rushConfiguration.projects,
        async ({ packageName, consumingProjects, projectRelativeFolder }) => {
          const dependentList: string[] = [packageName];
          for (const consumingProject of consumingProjects) {
            dependentList.push(consumingProject.packageName);
          }

          const projectImpactGraphProjectConfiguration: IProjectImpactGraphProjectConfiguration = {
            includedGlobs: [`${projectRelativeFolder}/**`],
            dependentProjects: dependentList.sort()
          };

          const projectExcludedGlobs: string[] | undefined =
            await this._tryLoadProjectExcludedGlobsAsync(projectRelativeFolder);
          if (projectExcludedGlobs) {
            projectImpactGraphProjectConfiguration.excludedGlobs = projectExcludedGlobs;
          }

          return [packageName, projectImpactGraphProjectConfiguration];
        },
        { concurrency: 50 }
      )
    ]);

    projectEntries.sort(([aName], [bName]) => aName.localeCompare(bName));
    const projects: Record<string, IProjectImpactGraphProjectConfiguration> =
      Object.fromEntries(projectEntries);
    const content: IProjectImpactGraphFile = { globalExcludedGlobs, projects };
    await FileSystem.writeFileAsync(this._projectImpactGraphFilePath, yaml.dump(content));

    stopwatch.stop();
    this._terminal.writeLine();
    this._terminal.writeLine(
      Colorize.green(`Generate project impact graph successfully. (${stopwatch.toString()})`)
    );
  }

  public async validateAsync(): Promise<boolean> {
    // TODO: More validation other than just existence
    return await FileSystem.existsAsync(this._projectImpactGraphFilePath);
  }
}
