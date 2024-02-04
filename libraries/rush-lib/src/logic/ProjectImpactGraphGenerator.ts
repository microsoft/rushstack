// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import fs from 'fs';
import yaml from 'js-yaml';
import path from 'path';
import colors from 'colors/safe';
import type { RushConfiguration } from '../api/RushConfiguration';
import type { RushConfigurationProject } from '../api/RushConfigurationProject';
import { Stopwatch } from '../utilities/Stopwatch';

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

export class ProjectImpactGraphGenerator {
  /**
   * Full path of repository root
   */
  private _repositoryRoot: string;

  /**
   * Projects within the Rush configuration
   */
  private _projects: RushConfigurationProject[];

  /**
   * Default global excluded globs
   * Only used if the `<repository_root>/.mergequeueignore` does not exist
   */
  private _DefaultGlobalExcludedGlobs: string[] = ['common/autoinstallers/**'];

  /**
   * Get repositoryRoot and load projects within the rush.json
   */
  public constructor(rushConfiguration: RushConfiguration) {
    this._repositoryRoot = rushConfiguration.rushJsonFolder;
    this._projects = rushConfiguration.projects;
  }

  /**
   * Load global excluded globs
   * @param repositoryRoot
   */
  private _loadGlobalExcludedGlobs(repositoryRoot: string): string[] | undefined {
    const filePath: string = path.join(repositoryRoot, '.mergequeueignore');
    if (fs.existsSync(filePath)) {
      const globs: string[] = fs.readFileSync(filePath).toString().split('\n');
      return globs;
    }
  }

  /**
   * Load project excluded globs
   * @param projectRootRelativePath - project root relative path
   */
  private _loadProjectExcludedGlobs(projectRootRelativePath: string): string[] | undefined {
    const filePath: string = path.join(this._repositoryRoot, projectRootRelativePath, '.mergequeueignore');
    if (fs.existsSync(filePath)) {
      const globs: string[] = fs.readFileSync(filePath).toString().split('\n');
      return globs.map((glob) => path.join(projectRootRelativePath, glob));
    }
  }

  /**
   * Core Logic: generate project-impact-graph.yaml
   */
  public generate(): void {
    const stopwatch: Stopwatch = Stopwatch.start();
    const content: IFileSchema = {} as IFileSchema;
    content.globalExcludedGlobs =
      this._loadGlobalExcludedGlobs(this._repositoryRoot) || this._DefaultGlobalExcludedGlobs;
    content.projects = {};
    this._projects.forEach((project) => {
      // ignore the top project
      if (project.projectRelativeFolder !== '.') {
        const dependentList: string[] = [project.packageName];
        project.consumingProjects.forEach((item) => {
          dependentList.push(item.packageName);
        });
        content.projects[`${project.packageName}`] = {
          includedGlobs: [`${project.projectRelativeFolder}/**`],
          dependentProjects: dependentList.sort()
        };
        const projectExcludedGlobs: string[] | undefined = this._loadProjectExcludedGlobs(
          project.projectRelativeFolder
        );
        if (projectExcludedGlobs) {
          content.projects[`${project.packageName}`].excludedGlobs = projectExcludedGlobs;
        }
      }
    });

    fs.writeFileSync(path.join(this._repositoryRoot, 'project-impact-graph.yaml'), yaml.safeDump(content));
    stopwatch.stop();
    // eslint-disable-next-line no-console
    console.log('\n' + colors.green(`Generate project impact graph successfully. (${stopwatch.toString()})`));
  }
}
