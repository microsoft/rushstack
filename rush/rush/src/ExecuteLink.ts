/**
 * @file ExecuteLink.ts
 * @Copyright (c) Microsoft Corporation.  All rights reserved.
 *
 * For each project, replaces node_modules with links to the modules in the common project.
 * Additionally, adds symlinks for projects with interdependencies.
 */

import * as del from 'del';
import * as fs from 'fs';
import * as path from 'path';
import RushConfigLoader, { IRushProjects } from './RushConfigLoader';

/**
 * Used to implement the "dependencyLinks" setting in the the rush.json config
 * file.  For the specified consumingProject, this function creates symlinks
 * in the project's "node_modules" folder.  These symlinks point to the project
 * folders for the specified dependencies.
 */
function createDependencyLinks(consumingPackage: string, projects: IRushProjects): number {
  const consumingProject = projects[consumingPackage];
  let numberOfLinks = 0;
  consumingProject.dependencies.forEach((packageName) => {
    const dependencyProject = projects[packageName].path;
    if (dependencyProject === undefined) {
      throw new Error(`Cannot link to the project "${dependencyProject}" because it is`
        + ' missing from the "projects" section');
    }
    console.log('  Linking ' + consumingProject.path + '/node_modules/' + dependencyProject);

    // Ex: "C:\MyRepo\my-library"
    const dependencyProjectFolder = RushConfigLoader.getProjectFolder(dependencyProject);

    // Ex: "C:\MyRepo\my-app\node_modules\my-library"
    //  or "C:\MyRepo\my-app\node_modules\@ms\my-library"
    let localModuleFolder: string;

    // Ex: "my-library" or "@ms/my-library"
    if (packageName.substr(0, 1) === '@') {
      const index: number = packageName.indexOf('/');
      if (index < 0) {
        throw new Error('Invalid scoped name: ' + packageName);
      }
      // Ex: "@ms"
      const scopePart = packageName.substr(0, index);
      // Ex: "my-library"
      const packagePart = packageName.substr(index + 1);

      // Ex: "C:\MyRepo\my-app\node_modules\@ms"
      const localScopedFolder = path.join(RushConfigLoader.getProjectFolder(consumingProject.path),
        'node_modules', scopePart);
      if (!fs.existsSync(localScopedFolder)) {
        fs.mkdirSync(localScopedFolder);
      }

      // Ex: "C:\MyRepo\my-app\node_modules\@ms\my-library"
      localModuleFolder = path.join(localScopedFolder, packagePart);
    } else {
      // Ex: "C:\MyRepo\my-app\node_modules\my-library"
      localModuleFolder = path.join(RushConfigLoader.getProjectFolder(consumingProject.path),
        'node_modules', dependencyProject);
    }

    // Create symlink: dependencyProjectFolder <-- consumingModuleFolder
    fs.symlinkSync(dependencyProjectFolder, localModuleFolder, 'junction');
    numberOfLinks++;
  });
  return numberOfLinks;
}

/**
 * Loads the package.json from a specified path and compares the project name to the expected name
 */
function validatePackageNameAndPath(expectedName: string, projectPath: string) {
  const projectFolder: string = RushConfigLoader.getProjectFolder(projectPath);
  const packageJsonFilename = path.join(projectFolder, 'package.json');
  let packageName: string;
  try {
    const packageJsonBuffer: Buffer = fs.readFileSync(packageJsonFilename);
    const packageJson = JSON.parse(packageJsonBuffer.toString());
    packageName = packageJson['name'];
  } catch (error) {
    throw new Error(`Error reading package.json in ${projectPath}:\n${error}.`);
  }

  if (packageName !== expectedName) {
    throw new Error(`Expected: '${expectedName}' Actual: '${packageName}'` +
                    ` in ${path.join(projectPath, 'package.json') }`);
  }
}

/**
 * This is the common implementation of the "rush link" and "rush unlink" commands.
 */
function createSymlinks(cleanOnly: boolean): void {
  const config = RushConfigLoader.load();
  Object.keys(config.projects).forEach((packageName: string) => {
    const projectConfig = config.projects[packageName];
    console.log('');
    console.log('PROJECT: ' + projectConfig.path);

    validatePackageNameAndPath(packageName, projectConfig.path);

    // Ex: "C:\MyRepo\my-app\node_modules"
    const localModulesFolder = path.join(RushConfigLoader.getProjectFolder(projectConfig.path), 'node_modules');
    console.log('Removing node_modules');
    del.sync(localModulesFolder);

    if (!cleanOnly) {
      console.log('Creating node_modules folder');

      // We need to do a simple "fs.mkdirSync(localModulesFolder)" here,
      // however if the folder we deleted above happened to contain any files,
      // then there seems to be some OS process (virus scanner?) that holds
      // a lock on the folder for a split second, which causes mkdirSync to
      // fail.  To workaround that, retry for up to 7 seconds before giving up.
      const startTime = new Date();
      while (true) {
        try {
          fs.mkdirSync(localModulesFolder);
          break;
        } catch (e) {
          const currentTime = new Date();
          if (currentTime.getTime() - startTime.getTime() > 7000) {
            throw e;
          }
        }
      }

      console.log('Creating symlinks');

      // Ex: "C:\MyRepo\common\node_modules"
      const commonModulesFolder = path.join(RushConfigLoader.getCommonFolder(), 'node_modules');
      const commonModulesFolderItems = fs.readdirSync(commonModulesFolder);
      let linkCount: number = 0;
      commonModulesFolderItems.forEach((filename) => {
        if (filename.substr(0, 1) === '@') {
          // For scoped folders (e.g. "@ms"), we need to create a regular folder

          // Ex: "C:\MyRepo\common\node_modules\@ms"
          const commonScopedFolder = path.join(commonModulesFolder, filename);
          // Ex: "C:\MyRepo\my-app\node_modules\@ms"
          const localScopedFolder = path.join(localModulesFolder, filename);
          fs.mkdirSync(localScopedFolder);

          // Then create links for each of the packages in the scoped folder
          const commonScopedFolderItems = fs.readdirSync(commonScopedFolder);
          commonScopedFolderItems.forEach(function (scopedFilename) {
            // Ex: "C:\MyRepo\common\node_modules\@ms\my-library"
            const commonScopedPackagePath = path.join(commonScopedFolder, scopedFilename);
            // Ex: "C:\MyRepo\my-app\node_modules\@ms\my-library"
            const localScopedPackagePath = path.join(localScopedFolder, scopedFilename);

            // Create symlink: commonScopedPackagePath <-- localScopedPackagePath
            fs.symlinkSync(commonScopedPackagePath, localScopedPackagePath, 'junction');
            ++linkCount;
          });
        } else {
          // Ex: "C:\MyRepo\common\node_modules\my-library2"
          const commonPackagePath = path.join(commonModulesFolder, filename);
          // Ex: "C:\MyRepo\my-app\node_modules\my-library2"
          const localPackagePath = path.join(localModulesFolder, filename);

          // Create symlink: commonPackagePath <-- localPackagePath
          fs.symlinkSync(commonPackagePath, localPackagePath, 'junction');
          ++linkCount;
        }
      });

      linkCount += createDependencyLinks(packageName, config.projects);
      console.log(`Created ${linkCount} links`);
    }
  });
}

/**
 * Entry point for the "rush unlink" command.
 */
export function executeUnlink(): void {
  createSymlinks(true);

  console.log('');
  console.log('Done!');
};

/**
 * Entry point for the "rush link" command.
 */
export default function executeLink(): void {
  createSymlinks(false);

  console.log('');
  console.log('Done!');
};
