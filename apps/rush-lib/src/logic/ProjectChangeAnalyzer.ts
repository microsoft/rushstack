// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'path';
import * as crypto from 'crypto';
import ignore, { Ignore } from 'ignore';

import { getPackageDeps, getGitHashForFiles } from '@rushstack/package-deps-hash';
import { Path, InternalError, FileSystem, ITerminal } from '@rushstack/node-core-library';

import { RushConfiguration } from '../api/RushConfiguration';
import { RushProjectConfiguration } from '../api/RushProjectConfiguration';
import { Git } from './Git';
import { BaseProjectShrinkwrapFile } from './base/BaseProjectShrinkwrapFile';
import { RushConfigurationProject } from '../api/RushConfigurationProject';
import { RushConstants } from './RushConstants';
import { UNINITIALIZED } from '../utilities/Utilities';

/**
 * @beta
 */
export interface IGetChangedProjectsOptions {
  targetBranchName: string;
  terminal: ITerminal;
  shouldFetch?: boolean;
}

/**
 * @beta
 */
export class ProjectChangeAnalyzer {
  /**
   * UNINITIALIZED === we haven't looked
   * undefined === data isn't available (i.e. - git isn't present)
   */
  private _data: Map<string, Map<string, string>> | undefined | UNINITIALIZED = UNINITIALIZED;
  private _filteredData: Map<string, Map<string, string>> = new Map<string, Map<string, string>>();
  private _projectStateCache: Map<string, string> = new Map<string, string>();
  private _rushConfiguration: RushConfiguration;
  private readonly _git: Git;

  public constructor(rushConfiguration: RushConfiguration) {
    this._rushConfiguration = rushConfiguration;
    this._git = new Git(this._rushConfiguration);
  }

  /**
   * Try to get a list of the specified project's dependencies and their hashes.
   *
   * @remarks
   * If the data can't be generated (i.e. - if Git is not present) this returns undefined.
   *
   * @internal
   */
  public async _tryGetProjectDependenciesAsync(
    projectName: string,
    terminal: ITerminal
  ): Promise<Map<string, string> | undefined> {
    // Check the cache for any existing data
    const existingData: Map<string, string> | undefined = this._filteredData.get(projectName);
    if (existingData) {
      return existingData;
    }

    if (this._data === UNINITIALIZED) {
      this._data = await this._getDataAsync(terminal);
    }

    if (this._data === undefined) {
      return undefined;
    }

    const project: RushConfigurationProject | undefined =
      this._rushConfiguration.getProjectByName(projectName);
    if (!project) {
      throw new Error(`Project "${projectName}" does not exist in the current Rush configuration.`);
    }

    const unfilteredProjectData: Map<string, string> = this._data.get(projectName)!;
    let filteredProjectData: Map<string, string> | undefined;

    const ignoreMatcher: Ignore | undefined = await this._getIgnoreMatcherForProjectAsync(project, terminal);
    if (ignoreMatcher) {
      // At this point, `filePath` is guaranteed to start with `projectRelativeFolder`, so
      // we can safely slice off the first N characters to get the file path relative to the
      // root of the project.
      filteredProjectData = new Map<string, string>();
      for (const [filePath, fileHash] of unfilteredProjectData) {
        const relativePath: string = filePath.slice(project.projectRelativeFolder.length + 1);
        if (!ignoreMatcher.ignores(relativePath)) {
          // Add the file path to the filtered data if it is not ignored
          filteredProjectData.set(filePath, fileHash);
        }
      }
    } else {
      filteredProjectData = unfilteredProjectData;
    }

    this._filteredData.set(projectName, filteredProjectData);
    return filteredProjectData;
  }

  /**
   * The project state hash is calculated in the following way:
   * - Project dependencies are collected (see ProjectChangeAnalyzer.getPackageDeps)
   *   - If project dependencies cannot be collected (i.e. - if Git isn't available),
   *     this function returns `undefined`
   * - The (path separator normalized) repo-root-relative dependencies' file paths are sorted
   * - A SHA1 hash is created and each (sorted) file path is fed into the hash and then its
   *   Git SHA is fed into the hash
   * - A hex digest of the hash is returned
   *
   * @internal
   */
  public async _tryGetProjectStateHashAsync(
    projectName: string,
    terminal: ITerminal
  ): Promise<string | undefined> {
    let projectState: string | undefined = this._projectStateCache.get(projectName);
    if (!projectState) {
      const packageDeps: Map<string, string> | undefined = await this._tryGetProjectDependenciesAsync(
        projectName,
        terminal
      );
      if (!packageDeps) {
        return undefined;
      } else {
        const sortedPackageDepsFiles: string[] = Array.from(packageDeps.keys()).sort();
        const hash: crypto.Hash = crypto.createHash('sha1');
        for (const packageDepsFile of sortedPackageDepsFiles) {
          hash.update(packageDepsFile);
          hash.update(RushConstants.hashDelimiter);
          hash.update(packageDeps.get(packageDepsFile)!);
          hash.update(RushConstants.hashDelimiter);
        }

        projectState = hash.digest('hex');
        this._projectStateCache.set(projectName, projectState);
      }
    }

    return projectState;
  }

  /**
   * Gets a list of projects that have changed in the current state of the repo
   * when compared to the specified branch.
   */
  public async *getChangedProjectsAsync(
    options: IGetChangedProjectsOptions
  ): AsyncIterable<RushConfigurationProject> {
    const changedFolders: string[] | undefined = this._git.getChangedFolders(
      options.targetBranchName,
      options.terminal,
      options.shouldFetch
    );

    if (changedFolders) {
      const repoRootFolder: string | undefined = this._git.getRepositoryRootPath();
      for (const project of this._rushConfiguration.projects) {
        const projectFolder: string = repoRootFolder
          ? path.relative(repoRootFolder, project.projectFolder)
          : project.projectRelativeFolder;
        if (this._hasProjectChanged(changedFolders, projectFolder)) {
          yield project;
        }
      }
    }
  }

  private _hasProjectChanged(changedFolders: string[], projectFolder: string): boolean {
    for (const folder of changedFolders) {
      if (Path.isUnderOrEqual(folder, projectFolder)) {
        return true;
      }
    }

    return false;
  }

  private async _getDataAsync(terminal: ITerminal): Promise<Map<string, Map<string, string>> | undefined> {
    const repoDeps: Map<string, string> | undefined = this._getRepoDeps(terminal);
    if (!repoDeps) {
      return undefined;
    }

    const projectHashDeps: Map<string, Map<string, string>> = new Map();

    for (const project of this._rushConfiguration.projects) {
      projectHashDeps.set(project.packageName, new Map());
    }

    // Sort each project folder into its own package deps hash
    for (const [filePath, fileHash] of repoDeps) {
      // findProjectForPosixRelativePath uses LookupByPath, for which lookups are O(K)
      // K being the maximum folder depth of any project in rush.json (usually on the order of 3)
      const owningProject: RushConfigurationProject | undefined =
        this._rushConfiguration.findProjectForPosixRelativePath(filePath);

      if (owningProject) {
        const owningProjectHashDeps: Map<string, string> = projectHashDeps.get(owningProject.packageName)!;
        owningProjectHashDeps.set(filePath, fileHash);
      }
    }

    // Currently, only pnpm handles project shrinkwraps
    if (this._rushConfiguration.packageManager === 'pnpm') {
      const projects: RushConfigurationProject[] = [];
      const projectDependencyManifestPaths: string[] = [];

      for (const project of this._rushConfiguration.projects) {
        const projectShrinkwrapFilePath: string = BaseProjectShrinkwrapFile.getFilePathForProject(project);
        const relativeProjectShrinkwrapFilePath: string = Path.convertToSlashes(
          path.relative(this._rushConfiguration.rushJsonFolder, projectShrinkwrapFilePath)
        );

        if (!FileSystem.exists(projectShrinkwrapFilePath)) {
          throw new Error(
            `A project dependency file (${relativeProjectShrinkwrapFilePath}) is missing. You may need to run ` +
              '"rush install" or "rush update".'
          );
        }

        projects.push(project);
        projectDependencyManifestPaths.push(relativeProjectShrinkwrapFilePath);
      }

      const gitPath: string = this._git.getGitPathOrThrow();
      const hashes: Map<string, string> = getGitHashForFiles(
        projectDependencyManifestPaths,
        this._rushConfiguration.rushJsonFolder,
        gitPath
      );
      for (let i: number = 0; i < projects.length; i++) {
        const project: RushConfigurationProject = projects[i];
        const projectDependencyManifestPath: string = projectDependencyManifestPaths[i];
        if (!hashes.has(projectDependencyManifestPath)) {
          throw new InternalError(`Expected to get a hash for ${projectDependencyManifestPath}`);
        }

        const hash: string = hashes.get(projectDependencyManifestPath)!;
        projectHashDeps.get(project.packageName)!.set(projectDependencyManifestPath, hash);
      }
    } else {
      // Determine the current variant from the link JSON.
      const variant: string | undefined = this._rushConfiguration.currentInstalledVariant;

      // Add the shrinkwrap file to every project's dependencies
      const shrinkwrapFile: string = Path.convertToSlashes(
        path.relative(
          this._rushConfiguration.rushJsonFolder,
          this._rushConfiguration.getCommittedShrinkwrapFilename(variant)
        )
      );

      for (const project of this._rushConfiguration.projects) {
        const shrinkwrapHash: string | undefined = repoDeps!.get(shrinkwrapFile);
        if (shrinkwrapHash) {
          projectHashDeps.get(project.packageName)!.set(shrinkwrapFile, shrinkwrapHash);
        }
      }
    }

    return projectHashDeps;
  }

  private async _getIgnoreMatcherForProjectAsync(
    project: RushConfigurationProject,
    terminal: ITerminal
  ): Promise<Ignore | undefined> {
    const projectConfiguration: RushProjectConfiguration | undefined =
      await RushProjectConfiguration.tryLoadForProjectAsync(project, undefined, terminal);

    if (projectConfiguration && projectConfiguration.incrementalBuildIgnoredGlobs) {
      const ignoreMatcher: Ignore = ignore();
      ignoreMatcher.add(projectConfiguration.incrementalBuildIgnoredGlobs);
      return ignoreMatcher;
    }
  }

  private _getRepoDeps(terminal: ITerminal): Map<string, string> | undefined {
    try {
      if (this._git.isPathUnderGitWorkingTree()) {
        // Load the package deps hash for the whole repository
        const gitPath: string = this._git.getGitPathOrThrow();
        return getPackageDeps(this._rushConfiguration.rushJsonFolder, [], gitPath);
      } else {
        return undefined;
      }
    } catch (e) {
      // If getPackageDeps fails, don't fail the whole build. Treat this case as if we don't know anything about
      // the state of the files in the repo. This can happen if the environment doesn't have Git.
      terminal.writeWarningLine(
        `Error calculating the state of the repo. (inner error: ${e}). Continuing without diffing files.`
      );

      return undefined;
    }
  }
}
