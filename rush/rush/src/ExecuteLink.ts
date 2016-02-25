/// <reference path="../typings/tsd.d.ts" />

import * as del from 'del';
import * as fs from 'fs';
import * as path from 'path';
import RushConfigLoader, { IRushConfig, IRushProjects } from './RushConfigLoader';

let config: IRushConfig = RushConfigLoader.load();

/**
 * Returns the folder path for the specified project, e.g. "./lib1"
 * for "lib1".  Reports an error if the folder does not exist.
 */
function getProjectFolder(project: string): string {
  let projectFolder = path.join(path.resolve('.'), project);
  if (!fs.existsSync(projectFolder)) {
    throw new Error(`Project folder not found: ${project}`);
  }
  return projectFolder;
}

/**
 * Returns the "commonFolder" specified in rush.config.  The common folder
 * contains the "node_modules" folder that is shared by all projects.
 * Reports an error if the folder does not exist.
 */
export function getCommonFolder(): string {
  let commonFolder = path.resolve(config.commonFolder);
  if (!fs.existsSync(commonFolder)) {
    throw new Error(`Common folder not found: ${config.commonFolder}`);
  }
  return commonFolder;
}

/**
 * Used to implement the "dependencyLinks" setting in the the rush.json config
 * file.  For the specified consumingProject, this function creates symlinks
 * in the project's "node_modules" folder.  These symlinks point to the project
 * folders for the specified dependencies.
 */
function createDependencyLinks(consumingPackage: string, projects: IRushProjects): void {
  const consumingProject = projects[consumingPackage];
  consumingProject.dependencies.forEach((packageName) => {
    const dependencyProject = projects[packageName].path;
    if (dependencyProject === undefined) {
      throw new Error(`Cannot link to the project "${dependencyProject}" because it is`
        + ' missing from the "projects" section');
    }
    console.log('  Linking ' + consumingProject.path + '/node_modules/' + dependencyProject);

    // Ex: "C:\MyRepo\my-library"
    let dependencyProjectFolder = getProjectFolder(dependencyProject);

    // Ex: "C:\MyRepo\my-app\node_modules\my-library"
    //  or "C:\MyRepo\my-app\node_modules\@ms\my-library"
    let localModuleFolder: string;

    // Ex: "my-library" or "@ms/my-library"
    if (packageName.substr(0, 1) === '@') {
      let index: number = packageName.indexOf('/');
      if (index < 0) {
        throw new Error('Invalid scoped name: ' + packageName);
      }
      // Ex: "@ms"
      let scopePart = packageName.substr(0, index);
      // Ex: "my-library"
      let packagePart = packageName.substr(index + 1);

      // Ex: "C:\MyRepo\my-app\node_modules\@ms"
      let localScopedFolder = path.join(getProjectFolder(consumingProject.path),
        'node_modules', scopePart);
      if (!fs.existsSync(localScopedFolder)) {
        fs.mkdirSync(localScopedFolder);
      }

      // Ex: "C:\MyRepo\my-app\node_modules\@ms\my-library"
      localModuleFolder = path.join(localScopedFolder, packagePart);
    } else {
      // Ex: "C:\MyRepo\my-app\node_modules\my-library"
      localModuleFolder = path.join(getProjectFolder(consumingProject.path),
        'node_modules', dependencyProject);
    }

    // Create symlink: dependencyProjectFolder <-- consumingModuleFolder
    fs.symlinkSync(dependencyProjectFolder, localModuleFolder, 'junction');
  });
}

/*
// @todo -- change this to be a function that ensure the project names match
function fetchPackageName(project: string, packageNamesByProject: Map<string, string>): void {
  if (!packageNamesByProject.has(project)) {
    let projectFolder: string = getProjectFolder(project);
    let packageJsonFilename = path.join(projectFolder, 'package.json');
    try {
      let packageJsonBuffer: Buffer = fs.readFileSync(packageJsonFilename);
      let packageJson = JSON.parse(packageJsonBuffer.toString());
      let packageName = packageJson['name'];
      packageNamesByProject.set(project, packageName);

      if (packageName !== project) {
        console.log(`         (package name is ${packageName})`);
      }
    } catch (error) {
      throw new Error(`Error reading package.json for ${project}:\n${error}`);
    }
  }
}
*/

/**
 * This is the common implementation of the "rush link" and "rush unlink" commands.
 */
function createSymlinks(cleanOnly: boolean): void {
  Object.keys(config.projects).forEach((packageName: string) => {
    const projectConfig = config.projects[packageName];
    console.log('');
    console.log('PROJECT: ' + projectConfig.path);

    // fetchPackageName(project, packageNamesByProject);

    // Ex: "C:\MyRepo\my-app\node_modules"
    let localModulesFolder = path.join(getProjectFolder(projectConfig.path), 'node_modules');
    console.log('Removing node_modules');
    del.sync(localModulesFolder);

    if (!cleanOnly) {
      console.log('Creating node_modules folder');

      // We need to do a simple "fs.mkdirSync(localModulesFolder)" here,
      // however if the folder we deleted above happened to contain any files,
      // then there seems to be some OS process (virus scanner?) that holds
      // a lock on the folder for a split second, which causes mkdirSync to
      // fail.  To workaround that, retry for up to 7 seconds before giving up.
      let startTime = new Date();
      while (true) {
        try {
          fs.mkdirSync(localModulesFolder);
          break;
        } catch (e) {
          let currentTime = new Date();
          if (currentTime.getTime() - startTime.getTime() > 7000) {
            throw e;
          }
        }
      }

      console.log('Creating symlinks');

      // Ex: "C:\MyRepo\common\node_modules"
      let commonModulesFolder = path.join(getCommonFolder(), 'node_modules');
      let commonModulesFolderItems = fs.readdirSync(commonModulesFolder);
      let linkCount: number = 0;
      commonModulesFolderItems.forEach((filename) => {
        if (filename.substr(0, 1) === '@') {
          // For scoped folders (e.g. "@ms"), we need to create a regular folder

          // Ex: "C:\MyRepo\common\node_modules\@ms"
          let commonScopedFolder = path.join(commonModulesFolder, filename);
          // Ex: "C:\MyRepo\my-app\node_modules\@ms"
          let localScopedFolder = path.join(localModulesFolder, filename);
          fs.mkdirSync(localScopedFolder);

          // Then create links for each of the packages in the scoped folder
          let commonScopedFolderItems = fs.readdirSync(commonScopedFolder);
          commonScopedFolderItems.forEach(function (scopedFilename) {
            // Ex: "C:\MyRepo\common\node_modules\@ms\my-library"
            let commonScopedPackagePath = path.join(commonScopedFolder, scopedFilename);
            // Ex: "C:\MyRepo\my-app\node_modules\@ms\my-library"
            let localScopedPackagePath = path.join(localScopedFolder, scopedFilename);

            // Create symlink: commonScopedPackagePath <-- localScopedPackagePath
            fs.symlinkSync(commonScopedPackagePath, localScopedPackagePath, 'junction');
            ++linkCount;
          });
        } else {
          // Ex: "C:\MyRepo\common\node_modules\my-library2"
          let commonPackagePath = path.join(commonModulesFolder, filename);
          // Ex: "C:\MyRepo\my-app\node_modules\my-library2"
          let localPackagePath = path.join(localModulesFolder, filename);

          // Create symlink: commonPackagePath <-- localPackagePath
          fs.symlinkSync(commonPackagePath, localPackagePath, 'junction');
          ++linkCount;
        }
      });
      console.log(`Created ${linkCount} links`);

      createDependencyLinks(packageName, config.projects);
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
