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
export interface IProjectConfiguration {
  includedGlobs: string[];
  excludedGlobs?: string[];
  dependentProjects: string[];
}

/**
 * The schema of `project-impact-graph.yaml`
 */
export interface IFileSchema {
  globalExcludedGlobs: string[];
  projects: {
    [key: string]: IProjectConfiguration;
  };
}

/**
 * Default global excluded globs
 * Only used if the `<repository_root>/.mergequeueignore` does not exist
 */
const DEFAULT_GLOBAL_EXCLUDED_GLOBS: string[] = ['common/autoinstallers/**'];

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

  /**
   * Load project excluded globs
   * @param projectRootRelativePath - project root relative path
   */
  private _loadProjectExcludedGlobs(projectRootRelativePath: string): string[] | undefined {
    const filePath: string = `${this._repositoryRoot}/${projectRootRelativePath}/${RushConstants.mergeQueueIgnoreFileName}`;
    if (FileSystem.exists(filePath)) {
      const globs: string[] = FileSystem.readFile(filePath).toString().split('\n');
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
    const projects: {
      [key: string]: IProjectConfiguration;
    } = {};
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
        const projectExcludedGlobs: string[] | undefined = this._loadProjectExcludedGlobs(
          project.projectRelativeFolder
        );
        if (projectExcludedGlobs) {
          projects[project.packageName].excludedGlobs = projectExcludedGlobs;
        }
      }
    }
    const content: IFileSchema = { globalExcludedGlobs, projects };

    await FileSystem.writeFileAsync(
      `${this._repositoryRoot}/project-impact-graph.yaml`,
      yaml.safeDump(content)
    );
    stopwatch.stop();
    this._terminal.writeLine();
    this._terminal.writeLine(
      Colors.green(`Generate project impact graph successfully. (${stopwatch.toString()})`)
    );
  }
}
