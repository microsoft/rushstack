// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'path';
import * as crypto from 'crypto';
import ignore, { Ignore } from 'ignore';

import {
  getRepoChanges,
  getRepoRoot,
  getRepoStateAsync,
  IFileDiffStatus
} from '@rushstack/package-deps-hash';
import { Path, FileSystem, ITerminal, Async } from '@rushstack/node-core-library';

import { RushConfiguration } from '../api/RushConfiguration';
import { RushProjectConfiguration } from '../api/RushProjectConfiguration';
import { Git } from './Git';
import { BaseProjectShrinkwrapFile } from './base/BaseProjectShrinkwrapFile';
import { RushConfigurationProject } from '../api/RushConfigurationProject';
import { RushConstants } from './RushConstants';
import { LookupByPath } from './LookupByPath';
import { PnpmShrinkwrapFile } from './pnpm/PnpmShrinkwrapFile';
import { UNINITIALIZED } from '../utilities/Utilities';

/**
 * @beta
 */
export interface IGetChangedProjectsOptions {
  targetBranchName: string;
  terminal: ITerminal;
  shouldFetch?: boolean;

  /**
   * If set to `true`, consider a project's external dependency installation layout as defined in the
   * package manager lockfile when determining if it has changed.
   */
  includeExternalDependencies: boolean;

  /**
   * If set to `true` apply the `incrementalBuildIgnoredGlobs` property in a project's `rush-project.json`
   * and exclude matched files from change detection.
   */
  enableFiltering: boolean;
}

interface IGitState {
  gitPath: string;
  hashes: Map<string, string>;
  rootDir: string;
}

/**
 * @internal
 */
export interface IRawRepoState {
  projectState: Map<RushConfigurationProject, Map<string, string>> | undefined;
  rootDir: string;
  rawHashes: Map<string, string>;
}

/**
 * @beta
 */
export class ProjectChangeAnalyzer {
  /**
   * UNINITIALIZED === we haven't looked
   * undefined === data isn't available (i.e. - git isn't present)
   */
  private _data: IRawRepoState | UNINITIALIZED | undefined = UNINITIALIZED;
  private readonly _filteredData: Map<RushConfigurationProject, Map<string, string>> = new Map();
  private readonly _projectStateCache: Map<RushConfigurationProject, string> = new Map();
  private readonly _rushConfiguration: RushConfiguration;
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

    const data: IRawRepoState | undefined = await this._ensureInitializedAsync(terminal);

    if (!data) {
      return undefined;
    }

    const { projectState, rootDir } = data;

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
   * @internal
   */
  public async _ensureInitializedAsync(terminal: ITerminal): Promise<IRawRepoState | undefined> {
    if (this._data === UNINITIALIZED) {
      this._data = await this._getDataAsync(terminal);
    }

    return this._data;
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
   * when compared to the specified branch, optionally taking the shrinkwrap and settings in
   * the rush-project.json file into consideration.
   */
  public async getChangedProjectsAsync(
    options: IGetChangedProjectsOptions
  ): Promise<Set<RushConfigurationProject>> {
    const { _rushConfiguration: rushConfiguration } = this;

    const { targetBranchName, terminal, includeExternalDependencies, enableFiltering, shouldFetch } = options;

    const gitPath: string = this._git.getGitPathOrThrow();
    const repoRoot: string = getRepoRoot(rushConfiguration.rushJsonFolder);

    const mergeCommit: string = this._git.getMergeBase(targetBranchName, terminal, shouldFetch);

    const repoChanges: Map<string, IFileDiffStatus> = getRepoChanges(repoRoot, mergeCommit, gitPath);

    const changedProjects: Set<RushConfigurationProject> = new Set();

    if (includeExternalDependencies) {
      // Even though changing the installed version of a nested dependency merits a change file,
      // ignore lockfile changes for `rush change` for the moment

      // Determine the current variant from the link JSON.
      const variant: string | undefined = rushConfiguration.currentInstalledVariant;

      const fullShrinkwrapPath: string = rushConfiguration.getCommittedShrinkwrapFilename(variant);

      const shrinkwrapFile: string = Path.convertToSlashes(path.relative(repoRoot, fullShrinkwrapPath));
      const shrinkwrapStatus: IFileDiffStatus | undefined = repoChanges.get(shrinkwrapFile);

      if (shrinkwrapStatus) {
        if (shrinkwrapStatus.status !== 'M') {
          terminal.writeLine(`Lockfile was created or deleted. Assuming all projects are affected.`);
          return new Set(rushConfiguration.projects);
        }

        const { packageManager } = rushConfiguration;

        if (packageManager === 'pnpm') {
          const currentShrinkwrap: PnpmShrinkwrapFile | undefined =
            PnpmShrinkwrapFile.loadFromFile(fullShrinkwrapPath);

          if (!currentShrinkwrap) {
            throw new Error(`Unable to obtain current shrinkwrap file.`);
          }

          const oldShrinkwrapText: string = this._git.getBlobContent({
            // <ref>:<path> syntax: https://git-scm.com/docs/gitrevisions
            blobSpec: `${mergeCommit}:${shrinkwrapFile}`,
            repositoryRoot: repoRoot
          });
          const oldShrinkWrap: PnpmShrinkwrapFile = PnpmShrinkwrapFile.loadFromString(oldShrinkwrapText);

          for (const project of rushConfiguration.projects) {
            if (
              currentShrinkwrap
                .getProjectShrinkwrap(project)
                .hasChanges(oldShrinkWrap.getProjectShrinkwrap(project))
            ) {
              changedProjects.add(project);
            }
          }
        } else {
          terminal.writeLine(
            `Lockfile has changed and lockfile content comparison is only supported for pnpm. Assuming all projects are affected.`
          );
          return new Set(rushConfiguration.projects);
        }
      }
    }

    const changesByProject: Map<RushConfigurationProject, Map<string, IFileDiffStatus>> = new Map();
    const lookup: LookupByPath<RushConfigurationProject> =
      rushConfiguration.getProjectLookupForRoot(repoRoot);

    for (const [file, diffStatus] of repoChanges) {
      const project: RushConfigurationProject | undefined = lookup.findChildPath(file);
      if (project) {
        if (changedProjects.has(project)) {
          // Lockfile changes cannot be ignored via rush-project.json
          continue;
        }

        if (enableFiltering) {
          let projectChanges: Map<string, IFileDiffStatus> | undefined = changesByProject.get(project);
          if (!projectChanges) {
            projectChanges = new Map();
            changesByProject.set(project, projectChanges);
          }
          projectChanges.set(file, diffStatus);
        } else {
          changedProjects.add(project);
        }
      }
    }

    if (enableFiltering) {
      // Reading rush-project.json may be problematic if, e.g. rush install has not yet occurred and rigs are in use
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
    }

    return changedProjects;
  }

  private async _getDataAsync(terminal: ITerminal): Promise<IRawRepoState> {
    const repoState: IGitState | undefined = await this._getRepoDepsAsync(terminal);
    if (!repoState) {
      // Mark as resolved, but no data
      return {
        projectState: undefined,
        rootDir: this._rushConfiguration.rushJsonFolder,
        rawHashes: new Map()
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
    if (this._rushConfiguration.packageManager !== 'pnpm') {
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
      rootDir,
      rawHashes: repoState.hashes
    };
  }

  private async _getIgnoreMatcherForProjectAsync(
    project: RushConfigurationProject,
    terminal: ITerminal
  ): Promise<Ignore | undefined> {
    const incrementalBuildIgnoredGlobs: ReadonlyArray<string> | undefined =
      await RushProjectConfiguration.tryLoadIgnoreGlobsForProjectAsync(project, terminal);

    if (incrementalBuildIgnoredGlobs && incrementalBuildIgnoredGlobs.length) {
      const ignoreMatcher: Ignore = ignore();
      ignoreMatcher.add(incrementalBuildIgnoredGlobs as string[]);
      return ignoreMatcher;
    }
  }

  private async _getRepoDepsAsync(terminal: ITerminal): Promise<IGitState | undefined> {
    try {
      const gitPath: string = this._git.getGitPathOrThrow();

      if (this._git.isPathUnderGitWorkingTree()) {
        // Do not use getGitInfo().root; it is the root of the *primary* worktree, not the *current* one.
        const rootDir: string = getRepoRoot(this._rushConfiguration.rushJsonFolder, gitPath);
        // Load the package deps hash for the whole repository
        // Include project shrinkwrap files as part of the computation
        const additionalFilesToHash: string[] = [];

        if (this._rushConfiguration.packageManager === 'pnpm') {
          const absoluteFilePathsToCheck: string[] = [];

          for (const project of this._rushConfiguration.projects) {
            const projectShrinkwrapFilePath: string =
              BaseProjectShrinkwrapFile.getFilePathForProject(project);
            absoluteFilePathsToCheck.push(projectShrinkwrapFilePath);
            const relativeProjectShrinkwrapFilePath: string = Path.convertToSlashes(
              path.relative(rootDir, projectShrinkwrapFilePath)
            );

            additionalFilesToHash.push(relativeProjectShrinkwrapFilePath);
          }

          await Async.forEachAsync(absoluteFilePathsToCheck, async (filePath: string) => {
            if (!(await FileSystem.existsAsync(filePath))) {
              throw new Error(
                `A project dependency file (${filePath}) is missing. You may need to run ` +
                  '"rush install" or "rush update".'
              );
            }
          });
        }

        const hashes: Map<string, string> = await getRepoStateAsync(rootDir, additionalFilesToHash, gitPath);
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
