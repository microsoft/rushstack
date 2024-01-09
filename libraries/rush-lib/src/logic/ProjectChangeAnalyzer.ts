// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'path';
import ignore, { type Ignore } from 'ignore';

import {
  getGitHashForFiles,
  getRepoChanges,
  getRepoRoot,
  getRepoStateAsync,
  type IFileDiffStatus
} from '@rushstack/package-deps-hash';
import { Path, FileSystem, type ITerminal, Async, AlreadyReportedError } from '@rushstack/node-core-library';

import type { RushConfiguration } from '../api/RushConfiguration';
import { RushProjectConfiguration } from '../api/RushProjectConfiguration';
import { Git } from './Git';
import { BaseProjectShrinkwrapFile } from './base/BaseProjectShrinkwrapFile';
import type { RushConfigurationProject } from '../api/RushConfigurationProject';
import type { LookupByPath } from './LookupByPath';
import { PnpmShrinkwrapFile } from './pnpm/PnpmShrinkwrapFile';
import {
  type IRushSnapshotProjectMetadata,
  type IInputSnapshot,
  InputSnapshot,
  type IRushSnapshotProjectMetadataMap
} from './snapshots/InputSnapshot';

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

/**
 * @internal
 */
export interface IRawRepoState {
  projectState: Map<RushConfigurationProject, Map<string, string>> | undefined;
  rootDir: string;
  rawHashes: Map<string, string>;
}

/**
 * @internal
 */
interface ISnapshotPrerequisites {
  additionalGlobs: IAdditionalGlob[];
  additionalRelativePathsToHash: string[];
  gitPath: string;
  globalAdditionalFiles: string[];
  projectMap: IRushSnapshotProjectMetadataMap;
  rootDirectory: string;
}

/**
 * @beta
 */
export class ProjectChangeAnalyzer {
  private readonly _rushConfiguration: RushConfiguration;
  private readonly _git: Git;
  private _snapshotPrerequisitesPromise: Promise<ISnapshotPrerequisites | undefined> | undefined;

  public constructor(rushConfiguration: RushConfiguration) {
    this._rushConfiguration = rushConfiguration;
    this._git = new Git(this._rushConfiguration);
    this._snapshotPrerequisitesPromise = undefined;
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

  /**
   * Gets a snapshot of the input state of the Rush workspace that can be queried for incremental
   * build operations and use by the build cache.
   * @internal
   */
  public async _tryGetSnapshotAsync(terminal: ITerminal): Promise<IInputSnapshot | undefined> {
    try {
      const prerequisites: ISnapshotPrerequisites | undefined = await this._computeSnapshotPrerequisites(
        terminal
      );

      if (!prerequisites) {
        return;
      }

      const {
        additionalGlobs,
        additionalRelativePathsToHash,
        gitPath,
        globalAdditionalFiles,
        projectMap,
        rootDirectory
      } = prerequisites;

      const lookupByPath: LookupByPath<RushConfigurationProject> =
        this._rushConfiguration.getProjectLookupForRoot(rootDirectory);

      const [hashes, additionalFiles] = await Promise.all([
        getRepoStateAsync(rootDirectory, additionalRelativePathsToHash, gitPath),
        getAdditionalFilesFromRushProjectConfigurationAsync(additionalGlobs, lookupByPath, terminal)
      ]);

      for (const file of additionalFiles) {
        if (hashes.has(file)) {
          additionalFiles.delete(file);
        }
      }

      const additionalHashes: Map<string, string> = getGitHashForFiles(
        Array.from(additionalFiles),
        rootDirectory,
        gitPath
      );

      return new InputSnapshot({
        additionalHashes,
        globalAdditionalFiles,
        hashes,
        lookupByPath,
        projectMap: projectMap,
        rootDir: rootDirectory
      });
    } catch (e) {
      // If getPackageDeps fails, don't fail the whole build. Treat this case as if we don't know anything about
      // the state of the files in the repo. This can happen if the environment doesn't have Git.
      terminal.writeWarningLine(
        `Error calculating the state of the repo. (inner error: ${
          e.stack ?? e.message ?? e
        }). Continuing without diffing files.`
      );

      return;
    }
  }

  /**
   * @internal
   */
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

  private async _computeSnapshotPrerequisites(
    terminal: ITerminal
  ): Promise<ISnapshotPrerequisites | undefined> {
    if (this._snapshotPrerequisitesPromise) {
      return this._snapshotPrerequisitesPromise;
    }

    return (this._snapshotPrerequisitesPromise = this._computeSnapshotPrerequisitesInner(terminal));
  }

  private async _computeSnapshotPrerequisitesInner(
    terminal: ITerminal
  ): Promise<ISnapshotPrerequisites | undefined> {
    const gitPath: string = this._git.getGitPathOrThrow();

    if (!this._git.isPathUnderGitWorkingTree()) {
      return;
    }

    // Do not use getGitInfo().root; it is the root of the *primary* worktree, not the *current* one.
    const rootDirectory: string = getRepoRoot(this._rushConfiguration.rushJsonFolder, gitPath);

    // Load the rush-project.json files for the whole repository
    const additionalGlobs: IAdditionalGlob[] = [];

    const projectMap: Map<RushConfigurationProject, IRushSnapshotProjectMetadata> = new Map();

    await Async.forEachAsync(
      this._rushConfiguration.projects,
      async (project: RushConfigurationProject) => {
        const projectConfig: RushProjectConfiguration | undefined =
          await RushProjectConfiguration.tryLoadForProjectAsync(project, terminal);

        const additionalFilesByOperationName: Map<string, Set<string>> = new Map();
        const projectMetadata: IRushSnapshotProjectMetadata = {
          projectConfig,
          additionalFilesByOperationName
        };
        projectMap.set(project, projectMetadata);

        if (projectConfig) {
          const { operationSettingsByOperationName } = projectConfig;
          for (const [operationName, { dependsOnAdditionalFiles }] of operationSettingsByOperationName) {
            if (dependsOnAdditionalFiles) {
              const additionalFilesForOperation: Set<string> = new Set();
              additionalFilesByOperationName.set(operationName, additionalFilesForOperation);
              for (const pattern of dependsOnAdditionalFiles) {
                additionalGlobs.push({
                  project,
                  operationName,
                  additionalFilesForOperation,
                  pattern
                });
              }
            }
          }
        }
      },
      {
        concurrency: 10
      }
    );

    // Include project shrinkwrap files as part of the computation
    const additionalRelativePathsToHash: string[] = [];
    const globalAdditionalFiles: string[] = [];
    if (this._rushConfiguration.packageManager === 'pnpm') {
      const absoluteFilePathsToCheck: string[] = [];

      for (const project of this._rushConfiguration.projects) {
        const projectShrinkwrapFilePath: string = BaseProjectShrinkwrapFile.getFilePathForProject(project);
        absoluteFilePathsToCheck.push(projectShrinkwrapFilePath);
        const relativeProjectShrinkwrapFilePath: string = Path.convertToSlashes(
          path.relative(rootDirectory, projectShrinkwrapFilePath)
        );

        additionalRelativePathsToHash.push(relativeProjectShrinkwrapFilePath);
      }

      await Async.forEachAsync(absoluteFilePathsToCheck, async (filePath: string) => {
        if (!(await FileSystem.existsAsync(filePath))) {
          throw new Error(
            `A project dependency file (${filePath}) is missing. You may need to run ` +
              '"rush install" or "rush update".'
          );
        }
      });
    } else {
      // Determine the current variant from the link JSON.
      const variant: string | undefined = this._rushConfiguration.currentInstalledVariant;

      // Add the shrinkwrap file to every project's dependencies
      const shrinkwrapFile: string = Path.convertToSlashes(
        path.relative(rootDirectory, this._rushConfiguration.getCommittedShrinkwrapFilename(variant))
      );

      globalAdditionalFiles.push(shrinkwrapFile);
    }

    return {
      additionalGlobs,
      additionalRelativePathsToHash,
      gitPath,
      globalAdditionalFiles,
      projectMap,
      rootDirectory
    };
  }
}

interface IAdditionalGlob {
  project: RushConfigurationProject;
  operationName: string;
  additionalFilesForOperation: Set<string>;
  pattern: string;
}

async function getAdditionalFilesFromRushProjectConfigurationAsync(
  additionalGlobs: IAdditionalGlob[],
  lookupByPath: LookupByPath<RushConfigurationProject>,
  terminal: ITerminal
): Promise<Set<string>> {
  const additionalFilesFromRushProjectConfiguration: Set<string> = new Set();

  if (!additionalGlobs.length) {
    return additionalFilesFromRushProjectConfiguration;
  }

  const { default: glob } = await import('fast-glob');
  await Async.forEachAsync(additionalGlobs, async (item: IAdditionalGlob) => {
    const { project, operationName, additionalFilesForOperation, pattern } = item;
    const matches: string[] = await glob(pattern, {
      cwd: project.projectFolder,
      onlyFiles: true,
      // We want to keep path's type unchanged,
      // i.e. if the pattern was a  relative path, then matched paths should also be relative paths
      //      if the pattern was an absolute path, then matched paths should also be absolute paths
      //
      // We are doing this because these paths are going to be used to calculate operation state hashes and some users
      // might choose to depend on global files (e.g. `/etc/os-release`) and some might choose to depend on local non-project files
      // (e.g. `../path/to/workspace/file`)
      //
      // In both cases we want that path to the resource to be the same on all machines,
      // regardless of what is the current working directory.
      //
      // That being said, we want to keep `absolute` options here as false:
      absolute: false
    });

    for (const match of matches) {
      if (path.isAbsolute(match)) {
        additionalFilesFromRushProjectConfiguration.add(match);
        additionalFilesForOperation.add(match);
      } else {
        const filePathForGit: string = path.posix.join(project.projectRelativeFolder, match);

        const projectMatch: RushConfigurationProject | undefined = lookupByPath.findChildPath(filePathForGit);
        if (projectMatch && projectMatch !== project) {
          terminal.writeErrorLine(
            `In project "${project.packageName}" ("${project.projectRelativeFolder}"), ` +
              `config for operation "${operationName}" specifies a glob "${pattern}" that selects a file in a different workspace project ` +
              `"${projectMatch.packageName}" ("${projectMatch.projectRelativeFolder}"). ` +
              `This is forbidden. The "dependsOnAdditionalFiles" property may only be used to refer non-workspace files, non-project files, or untracked files in the current project. ` +
              `To depend on files in another workspace project, use "devDependencies" in "package.json".`
          );
          throw new AlreadyReportedError();
        }
        additionalFilesForOperation.add(filePathForGit);
        additionalFilesFromRushProjectConfiguration.add(filePathForGit);
      }
    }
  });

  return additionalFilesFromRushProjectConfiguration;
}
