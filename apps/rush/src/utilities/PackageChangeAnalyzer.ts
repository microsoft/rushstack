import * as path from 'path';

import {
  getPackageDeps,
  IPackageDeps
} from '@microsoft/package-deps-hash';

import {
  RushConfiguration,
  RushConstants
} from '@microsoft/rush-lib';

export class PackageChangeAnalyzer {
  public static _instance: PackageChangeAnalyzer;

  // Allow this function to be overwritten during unit tests
  public static getPackageDeps: (path: string, ignoredFiles: string[]) => IPackageDeps;
  public static rushConfig: RushConfiguration;

  private _data: Map<string, IPackageDeps>;

  public static get instance(): PackageChangeAnalyzer {
    if (!PackageChangeAnalyzer._instance) {
      PackageChangeAnalyzer._instance = new PackageChangeAnalyzer();
    }
    return PackageChangeAnalyzer._instance;
  }

  public static reset(): void {
    PackageChangeAnalyzer._instance = undefined;
  }

  public constructor() {
    this._data = this.getData();
  }

  public getPackageDepsHash(projectName: string): IPackageDeps {
    if (!this._data) {
      this._data = this.getData();
    }

    return this._data.get(projectName);
  }

  private getData(): Map<string, IPackageDeps> {
    // If we are not in a unit test, use the correct resources
    if (!PackageChangeAnalyzer.getPackageDeps) {
      PackageChangeAnalyzer.getPackageDeps = getPackageDeps;
    }
    if (!PackageChangeAnalyzer.rushConfig) {
      PackageChangeAnalyzer.rushConfig = RushConfiguration.loadFromDefaultLocation();
    }

    const projectHashDeps: Map<string, IPackageDeps> = new Map<string, IPackageDeps>();

    // pre-populate the map with the projects from the config
    for (const project of PackageChangeAnalyzer.rushConfig.projects) {
      projectHashDeps.set(project.packageName, {
        files: {}
      });
    }

    const noProjectHashes: { [key: string]: string } = {};

    // Load the package deps hash for the whole repository
    const repoDeps: IPackageDeps = PackageChangeAnalyzer.getPackageDeps(
      PackageChangeAnalyzer.rushConfig.rushJsonFolder, [RushConstants.packageDepsFilename]);

    // Sort each project folder into its own package deps hash
    Object.keys(repoDeps.files).forEach((filepath: string) => {
      const fileHash: string = repoDeps.files[filepath];

      const projectName: string = this._getProjectForFile(filepath);

      // If we found a project for the file, go ahead and store this file's hash
      if (projectName) {
        projectHashDeps.get(projectName).files[filepath] = fileHash;
      } else {
        noProjectHashes[filepath] = fileHash;
      }
    });

    // Add the "NO_PROJECT" files to every project's dependencies
    for (const project of PackageChangeAnalyzer.rushConfig.projects) {
      Object.keys(noProjectHashes).forEach((filepath: string) => {
        const fileHash: string = noProjectHashes[filepath];
        projectHashDeps.get(project.packageName).files[filepath] = fileHash;
      });
    }

    return projectHashDeps;
  }

  private _getProjectForFile(filepath: string): string {
    for (const project of PackageChangeAnalyzer.rushConfig.projects) {
      if (this._fileExistsInFolder(filepath, project.projectRelativeFolder)) {
        return project.packageName;
      }
    }
    return undefined;
  }

  private _fileExistsInFolder(filePath: string, folderPath: string): boolean {
    const relativePath: string = path.relative(folderPath, filePath);

    // if the file exists in the folder, relativePath will not start with ".."
    return relativePath.split(path.sep)[0] !== '..';
  }
}