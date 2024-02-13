// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { Colors, FileSystem, Text, type ITerminal } from '@rushstack/node-core-library';
import yaml from 'js-yaml';

import type { RushConfiguration } from '../api/RushConfiguration';
import type { RushConfigurationProject } from '../api/RushConfigurationProject';
import { Stopwatch } from '../utilities/Stopwatch';
import { RushConstants } from './RushConstants';

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
   * Full path of repository root
   */
  private readonly _repositoryRoot: string;

  /**
   * Projects within the Rush configuration
   */
  private readonly _projects: RushConfigurationProject[];

  /**
   * Get repositoryRoot and load projects within the rush.json
   */
  public constructor(terminal: ITerminal, rushConfiguration: RushConfiguration) {
    this._terminal = terminal;
    this._repositoryRoot = rushConfiguration.rushJsonFolder;
    this._projects = rushConfiguration.projects;
  }

  /**
   * Load global excluded globs
   * @param repositoryRoot
   */
  private async _loadGlobalExcludedGlobsAsync(repositoryRoot: string): Promise<string[] | undefined> {
    const filePath: string = `${repositoryRoot}/${RushConstants.mergeQueueIgnoreFileName}`;
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

    const globalExcludedGlobs: string[] =
      (await this._loadGlobalExcludedGlobsAsync(this._repositoryRoot)) || DEFAULT_GLOBAL_EXCLUDED_GLOBS;
    const projects: Record<string, IProjectImpactGraphProjectConfiguration> = {};
    for (const project of this._projects) {
      // ignore the top project
      if (project.projectRelativeFolder !== '.') {
        const dependentList: string[] = [project.packageName];
        for (const consumingProject of project.consumingProjects) {
          dependentList.push(consumingProject.packageName);
        }
        projects[project.packageName] = {
          includedGlobs: [`${project.projectRelativeFolder}/**`],
          dependentProjects: dependentList.sort()
        };
        const projectExcludedGlobs: string[] | undefined = await this._tryLoadProjectExcludedGlobsAsync(
          project.projectRelativeFolder
        );
        if (projectExcludedGlobs) {
          projects[project.packageName].excludedGlobs = projectExcludedGlobs;
        }
      }
    }

    const content: IProjectImpactGraphFile = { globalExcludedGlobs, projects };
    await FileSystem.writeFileAsync(
      `${this._repositoryRoot}/${RushConstants.projectImpactGraphFilename}`,
      yaml.safeDump(content)
    );

    stopwatch.stop();
    this._terminal.writeLine();
    this._terminal.writeLine(
      Colors.green(`Generate project impact graph successfully. (${stopwatch.toString()})`)
    );
  }
}
