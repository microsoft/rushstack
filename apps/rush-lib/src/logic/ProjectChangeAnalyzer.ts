// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'path';
import * as crypto from 'crypto';
import ignore, { Ignore } from 'ignore';

import {
  getRepoChanges,
  getRepoRoot,
  getRepoState,
  getGitHashForFiles,
  IFileDiffStatus
} from '@rushstack/package-deps-hash';
import { Path, InternalError, FileSystem, ITerminal, Async } from '@rushstack/node-core-library';

import { RushConfiguration } from '../api/RushConfiguration';
import { RushProjectConfiguration } from '../api/RushProjectConfiguration';
import { Git } from './Git';
import { BaseProjectShrinkwrapFile } from './base/BaseProjectShrinkwrapFile';
import { RushConfigurationProject } from '../api/RushConfigurationProject';
import { RushConstants } from './RushConstants';
import { LookupByPath } from './LookupByPath';

/**
 * @beta
 */
export interface IGetChangedProjectsOptions {
  targetBranchName: string;
  terminal: ITerminal;
  shouldFetch?: boolean;
}

interface IGitState {
  gitPath: string;
  hashes: Map<string, string>;
  rootDir: string;
}

interface IRawRepoState {
  projectState: Map<RushConfigurationProject, Map<string, string>> | undefined;
  rootDir: string;
}

/**
 * @beta
 */
export class ProjectChangeAnalyzer {
  /**
   * UNINITIALIZED === we haven't looked
   * undefined === data isn't available (i.e. - git isn't present)
   */
  private _data: IRawRepoState | undefined = undefined;
  private _filteredData: Map<RushConfigurationProject, Map<string, string>> = new Map();
  private _projectStateCache: Map<RushConfigurationProject, string> = new Map();
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
    project: RushConfigurationProject,
    terminal: ITerminal
  ): Promise<Map<string, string> | undefined> {
    // Check the cache for any existing data
    let filteredProjectData: Map<string, string> | undefined = this._filteredData.get(project);
    if (filteredProjectData) {
      return filteredProjectData;
    }

    if (this._data === undefined) {
      this._data = this._getData(terminal);
    }

    const { projectState, rootDir } = this._data;

    if (projectState === undefined) {
      return undefined;
    }

    const unfilteredProjectData: Map<string, string> | undefined = projectState.get(project);
    if (!unfilteredProjectData) {
      throw new Error(`Project "${project.packageName}" does not exist in the current Rush configuration.`);
    }

    filteredProjectData = await this._filterProjectDataAsync(
      project,
      unfilteredProjectData,
      rootDir,
      terminal
    );

    this._filteredData.set(project, filteredProjectData);
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
    project: RushConfigurationProject,
    terminal: ITerminal
  ): Promise<string | undefined> {
    let projectState: string | undefined = this._projectStateCache.get(project);
    if (!projectState) {
      const packageDeps: Map<string, string> | undefined = await this._tryGetProjectDependenciesAsync(
        project,
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
        this._projectStateCache.set(project, projectState);
      }
    }

    return projectState;
  }

  public async _filterProjectDataAsync<T>(
    project: RushConfigurationProject,
    unfilteredProjectData: Map<string, T>,
    rootDir: string,
    terminal: ITerminal
  ): Promise<Map<string, T>> {
    const ignoreMatcher: Ignore | undefined = await this._getIgnoreMatcherForProjectAsync(project, terminal);
    if (!ignoreMatcher) {
      return unfilteredProjectData;
    }

    const projectKey: string = path.relative(rootDir, project.projectFolder);
    const projectKeyLength: number = projectKey.length + 1;

    // At this point, `filePath` is guaranteed to start with `projectKey`, so
    // we can safely slice off the first N characters to get the file path relative to the
    // root of the project.
    const filteredProjectData: Map<string, T> = new Map<string, T>();
    for (const [filePath, value] of unfilteredProjectData) {
      const relativePath: string = filePath.slice(projectKeyLength);
      if (!ignoreMatcher.ignores(relativePath)) {
        // Add the file path to the filtered data if it is not ignored
        filteredProjectData.set(filePath, value);
      }
    }
    return filteredProjectData;
  }

  /**
   * Gets a list of projects that have changed in the current state of the repo
   * when compared to the specified branch.
   */
  public async getProjectsWithChangesAsync(
    options: IGetChangedProjectsOptions
  ): Promise<Set<RushConfigurationProject>> {
    return await this._getChangedProjectsInternalAsync(options, false);
  }

  /**
   * Gets a list of projects that have changed in the current state of the repo
   * when compared to the specified branch, taking the shrinkwrap and settings in
   * the rush-project.json file into consideration.
   */
  public async getProjectsImpactedByDiffAsync(
    options: IGetChangedProjectsOptions
  ): Promise<Set<RushConfigurationProject>> {
    return await this._getChangedProjectsInternalAsync(options, true);
  }

  private async _getChangedProjectsInternalAsync(
    options: IGetChangedProjectsOptions,
    forIncrementalBuild: boolean
  ): Promise<Set<RushConfigurationProject>> {
    const gitPath: string = this._git.getGitPathOrThrow();
    const repoRoot: string = getRepoRoot(this._rushConfiguration.rushJsonFolder);
    const repoChanges: Map<string, IFileDiffStatus> = getRepoChanges(
      repoRoot,
      options.targetBranchName,
      gitPath
    );
    const { terminal } = options;

    if (forIncrementalBuild) {
      // Determine the current variant from the link JSON.
      const variant: string | undefined = this._rushConfiguration.currentInstalledVariant;

      // Add the shrinkwrap file to every project's dependencies
      const shrinkwrapFile: string = Path.convertToSlashes(
        path.relative(repoRoot, this._rushConfiguration.getCommittedShrinkwrapFilename(variant))
      );

      if (repoChanges.has(shrinkwrapFile)) {
        // TODO: Implement shrinkwrap diffing here.
        return new Set(this._rushConfiguration.projects);
      }
    }

    const changesByProject: Map<RushConfigurationProject, Map<string, IFileDiffStatus>> = new Map();
    const lookup: LookupByPath<RushConfigurationProject> =
      this._rushConfiguration.getProjectLookupForRoot(repoRoot);
    for (const [file, diffStatus] of repoChanges) {
      const project: RushConfigurationProject | undefined = lookup.findChildPath(file);
      if (project) {
        let projectChanges: Map<string, IFileDiffStatus> | undefined = changesByProject.get(project);
        if (!projectChanges) {
          changesByProject.set(project, (projectChanges = new Map()));
        }
        projectChanges.set(file, diffStatus);
      }
    }

    if (forIncrementalBuild) {
      const changedProjects: Set<RushConfigurationProject> = new Set();
      await Async.forEachAsync(
        changesByProject,
        async ([project, projectChanges]) => {
          const filteredChanges: Map<string, IFileDiffStatus> = await this._filterProjectDataAsync(
            project,
            projectChanges,
            repoRoot,
            terminal
          );
          if (filteredChanges.size > 0) {
            changedProjects.add(project);
          }
        },
        { concurrency: 10 }
      );
      return changedProjects;
    } else {
      return new Set(changesByProject.keys());
    }
  }

  private _getData(terminal: ITerminal): IRawRepoState {
    const repoState: IGitState | undefined = this._getRepoDeps(terminal);
    if (!repoState) {
      // Mark as resolved, but no data
      return {
        projectState: undefined,
        rootDir: this._rushConfiguration.rushJsonFolder
      };
    }

    const lookup: LookupByPath<RushConfigurationProject> = this._rushConfiguration.getProjectLookupForRoot(
      repoState.rootDir
    );
    const projectHashDeps: Map<RushConfigurationProject, Map<string, string>> = new Map();

    for (const project of this._rushConfiguration.projects) {
      projectHashDeps.set(project, new Map());
    }

    const { hashes: repoDeps, rootDir } = repoState;

    // Currently, only pnpm handles project shrinkwraps
    if (this._rushConfiguration.packageManager === 'pnpm') {
      const projectDependencyManifestPaths: string[] = [];

      for (const project of projectHashDeps.keys()) {
        const projectShrinkwrapFilePath: string = BaseProjectShrinkwrapFile.getFilePathForProject(project);
        const relativeProjectShrinkwrapFilePath: string = Path.convertToSlashes(
          path.relative(rootDir, projectShrinkwrapFilePath)
        );

        if (!FileSystem.exists(projectShrinkwrapFilePath)) {
          throw new Error(
            `A project dependency file (${relativeProjectShrinkwrapFilePath}) is missing. You may need to run ` +
              '"rush install" or "rush update".'
          );
        }

        projectDependencyManifestPaths.push(relativeProjectShrinkwrapFilePath);
      }

      const gitPath: string = this._git.getGitPathOrThrow();
      const hashes: Map<string, string> = getGitHashForFiles(
        projectDependencyManifestPaths,
        rootDir,
        gitPath
      );

      let i: number = 0;
      for (const projectDeps of projectHashDeps.values()) {
        const projectDependencyManifestPath: string = projectDependencyManifestPaths[i];
        if (!hashes.has(projectDependencyManifestPath)) {
          throw new InternalError(`Expected to get a hash for ${projectDependencyManifestPath}`);
        }

        const hash: string = hashes.get(projectDependencyManifestPath)!;
        projectDeps.set(projectDependencyManifestPath, hash);
        i++;
      }
    } else {
      // Determine the current variant from the link JSON.
      const variant: string | undefined = this._rushConfiguration.currentInstalledVariant;

      // Add the shrinkwrap file to every project's dependencies
      const shrinkwrapFile: string = Path.convertToSlashes(
        path.relative(rootDir, this._rushConfiguration.getCommittedShrinkwrapFilename(variant))
      );

      const shrinkwrapHash: string | undefined = repoDeps.get(shrinkwrapFile);

      for (const projectDeps of projectHashDeps.values()) {
        if (shrinkwrapHash) {
          projectDeps.set(shrinkwrapFile, shrinkwrapHash);
        }
      }
    }

    // Sort each project folder into its own package deps hash
    for (const [filePath, fileHash] of repoDeps) {
      // lookups in findChildPath are O(K)
      // K being the maximum folder depth of any project in rush.json (usually on the order of 3)
      const owningProject: RushConfigurationProject | undefined = lookup.findChildPath(filePath);

      if (owningProject) {
        const owningProjectHashDeps: Map<string, string> = projectHashDeps.get(owningProject)!;
        owningProjectHashDeps.set(filePath, fileHash);
      }
    }

    return {
      projectState: projectHashDeps,
      rootDir
    };
  }

  private async _getIgnoreMatcherForProjectAsync(
    project: RushConfigurationProject,
    terminal: ITerminal
  ): Promise<Ignore | undefined> {
    const projectConfiguration: RushProjectConfiguration | undefined =
      await RushProjectConfiguration.tryLoadForProjectAsync(project, undefined, terminal);

    if (projectConfiguration?.incrementalBuildIgnoredGlobs) {
      const ignoreMatcher: Ignore = ignore();
      ignoreMatcher.add(projectConfiguration.incrementalBuildIgnoredGlobs as string[]);
      return ignoreMatcher;
    }
  }

  private _getRepoDeps(terminal: ITerminal): IGitState | undefined {
    try {
      if (this._git.isPathUnderGitWorkingTree()) {
        // Load the package deps hash for the whole repository
        const gitPath: string = this._git.getGitPathOrThrow();
        const rootDir: string = getRepoRoot(this._rushConfiguration.rushJsonFolder, gitPath);
        const hashes: Map<string, string> = getRepoState(rootDir, gitPath);
        return {
          gitPath,
          hashes,
          rootDir
        };
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
