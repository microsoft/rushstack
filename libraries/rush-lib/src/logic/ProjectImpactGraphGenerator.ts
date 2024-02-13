// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { Colors, FileSystem, type ITerminal } from '@rushstack/node-core-library';
import yaml from 'js-yaml';
import path from 'path';
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
const DefaultGlobalExcludedGlobs: string[] = ['common/autoinstallers/**'];

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
  private _loadGlobalExcludedGlobs(repositoryRoot: string): string[] | undefined {
    const filePath: string = `${repositoryRoot}/${RushConstants.mergeQueueIgnoreFileName}`;
    if (FileSystem.exists(filePath)) {
      const globs: string[] = FileSystem.readFile(filePath).toString().split('\n');
      return globs;
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
      return globs.map((glob) => path.join(projectRootRelativePath, glob));
    }
  }

  /**
   * Core Logic: generate project-impact-graph.yaml
   */
  public generate(): void {
    const stopwatch: Stopwatch = Stopwatch.start();

    const globalExcludedGlobs: string[] =
      this._loadGlobalExcludedGlobs(this._repositoryRoot) || DefaultGlobalExcludedGlobs;
    const projects: {
      [key: string]: IProjectConfiguration;
    } = {};
    for (const project of this._projects) {
      // ignore the top project
      if (project.projectRelativeFolder !== '.') {
        const dependentList: string[] = [project.packageName];
        project.consumingProjects.forEach((item) => {
          dependentList.push(item.packageName);
        });
        projects[`${project.packageName}`] = {
          includedGlobs: [`${project.projectRelativeFolder}/**`],
          dependentProjects: dependentList.sort()
        };
        const projectExcludedGlobs: string[] | undefined = this._loadProjectExcludedGlobs(
          project.projectRelativeFolder
        );
        if (projectExcludedGlobs) {
          projects[`${project.packageName}`].excludedGlobs = projectExcludedGlobs;
        }
      }
    }
    const content: IFileSchema = { globalExcludedGlobs, projects };

    FileSystem.writeFile(
      path.join(this._repositoryRoot, 'project-impact-graph.yaml'),
      yaml.safeDump(content)
    );
    stopwatch.stop();
    this._terminal.writeLine();
    this._terminal.writeLine(
      Colors.green(`Generate project impact graph successfully. (${stopwatch.toString()})`)
    );
  }
}
