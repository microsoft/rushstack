/// <reference path="../typings/tsd.d.ts" />

import * as rimraf from 'rimraf';
import * as fs from 'fs';
import * as path from 'path';
import RushConfigLoader, { IRushConfig } from './RushConfigLoader';

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
function getCommonFolder(): string {
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
function createDependencyLinks(consumingProject: string, dependencyProjects: string[]): void {
  dependencyProjects.forEach((dependencyProject) => {
    console.log('  Linking ' + consumingProject + '/node_modules/' + dependencyProject);
    let dependencyProjectFolder = getProjectFolder(dependencyProject);
    let consumingModuleFolder = path.join(getProjectFolder(consumingProject),
      'node_modules', dependencyProject);
    fs.symlinkSync(dependencyProjectFolder, consumingModuleFolder, 'junction');
  });
}

/**
 * This is the common implementation of the "rush link" and "rush unlink" commands.
 */
function createSymlinks(cleanOnly: boolean): void {
  config.projects.forEach((project) => {
    console.log('');
    console.log('PROJECT: ' + project);

    let projectModulesFolder = path.join(getProjectFolder(project), 'node_modules');
    console.log('Removing node_modules');
    rimraf.sync(projectModulesFolder);

    if (!cleanOnly) {
      console.log('Creating node_modules folder');
      fs.mkdirSync(projectModulesFolder);

      console.log('Creating symlinks');

      let commonModulesFolder = path.join(getCommonFolder(), 'node_modules');

      let rushFolderItems = fs.readdirSync(commonModulesFolder);
      let linkCount: number = 0;
      rushFolderItems.forEach(function (packageFilename) {
        let rushPackagePath = path.join(commonModulesFolder, packageFilename);
        let targetPackagePath = path.join(projectModulesFolder, packageFilename);

        fs.symlinkSync(rushPackagePath, targetPackagePath, 'junction');
        ++linkCount;
      });
      console.log(`Created ${linkCount} links`);
    }
  });

  if (!cleanOnly) {
    console.log('\nCreating dependency links');

    let dependencyLinks = config.dependencyLinks;
    let keys = Object.getOwnPropertyNames(dependencyLinks);
    keys.forEach(function (consumingProject, idx, array) {
      let dependencyProjects: Array<string> = dependencyLinks[consumingProject];
      createDependencyLinks(consumingProject, dependencyProjects);
    });

  }
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

