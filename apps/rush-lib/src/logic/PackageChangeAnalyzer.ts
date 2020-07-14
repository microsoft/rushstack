// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'path';
import * as colors from 'colors';

import { getPackageDeps, getGitHashForFiles, IPackageDeps } from '@rushstack/package-deps-hash';
import { Path, InternalError, FileSystem } from '@rushstack/node-core-library';

import { RushConfiguration } from '../api/RushConfiguration';
import { Git } from './Git';
import { PnpmProjectDependencyManifest } from './pnpm/PnpmProjectDependencyManifest';
import { RushConfigurationProject } from '../api/RushConfigurationProject';

export class PackageChangeAnalyzer {
  // Allow this function to be overwritten during unit tests
  public static getPackageDeps: (path: string, ignoredFiles: string[]) => IPackageDeps;

  private _data: Map<string, IPackageDeps>;
  private _rushConfiguration: RushConfiguration;
  private _isGitSupported: boolean;

  public constructor(rushConfiguration: RushConfiguration) {
    this._rushConfiguration = rushConfiguration;
    this._isGitSupported = Git.isPathUnderGitWorkingTree();
    this._data = this._getData();
  }

  public getPackageDepsHash(projectName: string): IPackageDeps | undefined {
    if (!this._data) {
      this._data = this._getData();
    }

    return this._data.get(projectName);
  }

  private _getData(): Map<string, IPackageDeps> {
    // If we are not in a unit test, use the correct resources
    if (!PackageChangeAnalyzer.getPackageDeps) {
      PackageChangeAnalyzer.getPackageDeps = getPackageDeps;
    }

    const projectHashDeps: Map<string, IPackageDeps> = new Map<string, IPackageDeps>();

    // pre-populate the map with the projects from the config
    for (const project of this._rushConfiguration.projects) {
      projectHashDeps.set(project.packageName, {
        files: {}
      });
    }

    const noProjectHashes: { [key: string]: string } = {};

    let repoDeps: IPackageDeps;
    try {
      if (this._isGitSupported) {
        // Load the package deps hash for the whole repository
        repoDeps = PackageChangeAnalyzer.getPackageDeps(this._rushConfiguration.rushJsonFolder, []);
      } else {
        return projectHashDeps;
      }
    } catch (e) {
      // If getPackageDeps fails, don't fail the whole build. Treat this case as if we don't know anything about
      // the state of the files in the repo. This can happen if the environment doesn't have Git.
      console.log(
        colors.yellow(
          `Error calculating the state of the repo. (inner error: ${e}). Continuing without diffing files.`
        )
      );

      return projectHashDeps;
    }

    // Sort each project folder into its own package deps hash
    Object.keys(repoDeps.files).forEach((filePath: string) => {
      const fileHash: string = repoDeps.files[filePath];

      const projectName: string | undefined = this._getProjectForFile(filePath);

      // If we found a project for the file, go ahead and store this file's hash
      if (projectName) {
        projectHashDeps.get(projectName)!.files[filePath] = fileHash;
      } else {
        noProjectHashes[filePath] = fileHash;
      }
    });

    /* Incremental Build notes:
     *
     * Temporarily revert below code in favor of replacing this solution with something more
     * flexible. Idea is essentially that we should have gulp-core-build (or other build tool)
     * create the package-deps_<command>.json. The build tool would default to using the 'simple'
     * algorithm (e.g. only files that are in a project folder are associated with the project), however it would
     * also provide a hook which would allow certain tasks to modify the package-deps-hash before being written.
     * At the end of the build, a we would create a package-deps_<command>.json file like so:
     *
     *  {
     *    commandLine: ["--production"],
     *    files: {
     *      "src/index.ts": "478789a7fs8a78989afd8",
     *      "src/fileOne.ts": "a8sfa8979871fdjiojlk",
     *      "common/api/review": "324598afasfdsd",                      // this entry was added by the API Extractor
     *                                                                  //  task (for example)
     *      ".rush/temp/shrinkwrap-deps.json": "3428789dsafdsfaf"       // this is a file which will be created by rush
     *                                                                  //  link describing the state of the
     *                                                                  //  node_modules folder
     *    }
     *  }
     *
     * Verifying this file should be fairly straightforward, we would simply need to check if:
     *   A) no files were added or deleted from the current folder
     *   B) all file hashes match
     *   C) the node_modules hash/contents match
     *   D) the command line parameters match or are compatible
     *
     *   Notes:
     *   * We need to store the command line arguments, which is currently done by rush instead of GCB
     *   * We need to store the hash/text of the a file which describes the state of the node_modules folder
     *   * The package-deps_<command>.json should be a complete list of dependencies, and it should be extremely cheap
     *       to validate/check the file (even if creating it is more computationally costly).
     */

    // Add the "NO_PROJECT" files to every project's dependencies
    // for (const project of PackageChangeAnalyzer.rushConfig.projects) {
    //  Object.keys(noProjectHashes).forEach((filePath: string) => {
    //    const fileHash: string = noProjectHashes[filePath];
    //    projectHashDeps.get(project.packageName).files[filePath] = fileHash;
    //  });
    // }

    if (
      this._rushConfiguration.packageManager === 'pnpm' &&
      !this._rushConfiguration.experimentsConfiguration.configuration
        .legacyIncrementalBuildDependencyDetection
    ) {
      const projects: RushConfigurationProject[] = [];
      const projectDependencyManifestPaths: string[] = [];

      for (const project of this._rushConfiguration.projects) {
        const dependencyManifestFilePath: string = PnpmProjectDependencyManifest.getFilePathForProject(
          project
        );
        const relativeDependencyManifestFilePath: string = path
          .relative(this._rushConfiguration.rushJsonFolder, dependencyManifestFilePath)
          .replace(/\\/g, '/');

        if (!FileSystem.exists(dependencyManifestFilePath)) {
          const useWorkspaces: boolean =
            this._rushConfiguration.pnpmOptions && this._rushConfiguration.pnpmOptions.useWorkspaces;
          throw new Error(
            `A project dependency file (${relativeDependencyManifestFilePath}) is missing. You may need to run ` +
              (useWorkspaces ? '"rush install"' : '"rush unlink" and "rush link"') +
              '.'
          );
        }

        projects.push(project);
        projectDependencyManifestPaths.push(relativeDependencyManifestFilePath);
      }

      const hashes: Map<string, string> = getGitHashForFiles(
        projectDependencyManifestPaths,
        this._rushConfiguration.rushJsonFolder
      );
      for (let i: number = 0; i < projects.length; i++) {
        const project: RushConfigurationProject = projects[i];
        const projectDependencyManifestPath: string = projectDependencyManifestPaths[i];
        if (!hashes.has(projectDependencyManifestPath)) {
          throw new InternalError(`Expected to get a hash for ${projectDependencyManifestPath}`);
        }
        const hash: string = hashes.get(projectDependencyManifestPath)!;
        projectHashDeps.get(project.packageName)!.files[projectDependencyManifestPath] = hash;
      }
    } else {
      // Determine the current variant from the link JSON.
      const variant: string | undefined = this._rushConfiguration.currentInstalledVariant;

      // Add the shrinkwrap file to every project's dependencies
      const shrinkwrapFile: string = path
        .relative(
          this._rushConfiguration.rushJsonFolder,
          this._rushConfiguration.getCommittedShrinkwrapFilename(variant)
        )
        .replace(/\\/g, '/');

      for (const project of this._rushConfiguration.projects) {
        const shrinkwrapHash: string | undefined = noProjectHashes[shrinkwrapFile];
        if (shrinkwrapHash) {
          projectHashDeps.get(project.packageName)!.files[shrinkwrapFile] = shrinkwrapHash;
        }
      }
    }

    return projectHashDeps;
  }

  private _getProjectForFile(filePath: string): string | undefined {
    for (const project of this._rushConfiguration.projects) {
      if (this._fileExistsInFolder(filePath, project.projectRelativeFolder)) {
        return project.packageName;
      }
    }
    return undefined;
  }

  private _fileExistsInFolder(filePath: string, folderPath: string): boolean {
    return Path.isUnder(filePath, folderPath);
  }
}
