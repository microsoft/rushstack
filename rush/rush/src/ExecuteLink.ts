/// <reference path="../typings/tsd.d.ts" />

import * as rimraf from 'rimraf';
import * as fs from 'fs';
import * as path from 'path';
import RushConfigLoader, { IRushConfig } from './RushConfigLoader';

let config: IRushConfig = RushConfigLoader.load();

function getProjectFolder(project: string): string {
  let projectFolder = path.join(path.resolve('.'), project);
  if (!fs.existsSync(projectFolder)) {
    throw new Error(`Project folder not found: ${project}`);
  }
  return projectFolder;
}

function getCommonFolder(): string {
  let commonFolder = path.resolve(config.commonFolder);
  if (!fs.existsSync(commonFolder)) {
    throw new Error(`Common folder not found: ${config.commonFolder}`);
  }
  return commonFolder;
}

function createDependencyLinks(consumingProject: string, dependencyProjects: string[]): void {
  dependencyProjects.forEach((dependencyProject) => {
    console.log('  Linking ' + consumingProject + '/node_modules/' + dependencyProject);
    let dependencyProjectFolder = getProjectFolder(dependencyProject);
    let consumingModuleFolder = path.join(getProjectFolder(consumingProject),
      'node_modules', dependencyProject);
    fs.symlinkSync(dependencyProjectFolder, consumingModuleFolder, 'junction');
  });
}

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

export function executeUnlink(): void {

  createSymlinks(true);

  console.log('');
  console.log('Done!');
};

export default function executeLink(): void {

  createSymlinks(false);

  console.log('');
  console.log('Done!');
};

