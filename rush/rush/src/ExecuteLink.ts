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
import RushConfig from './RushConfig';
import RushConfigProject from './RushConfigProject';

/**
 * Used to implement the "dependencyLinks" setting in the the rush.json config
 * file.  For the specified consumingProject, this function creates symlinks
 * in the project's "node_modules" folder.  These symlinks point to the project
 * folders for the specified dependencies.
 */
function createDependencyLinks(rushConfig: RushConfig, consumingProject: RushConfigProject): number {
  let numberOfLinks = 0;
  consumingProject.dependencies.forEach((packageName) => {
    const dependencyProject: RushConfigProject = rushConfig.getProjectByName(packageName);
    if (!dependencyProject) {
      throw new Error(`The "${consumingProject.packageName}" project cannot have a local link to`
        + ` "${packageName}" because it is external to this Rush configuration`);
    }

    console.log('  Linking ' + consumingProject.projectFolder + '/node_modules/' + packageName
      + ' -> ' + dependencyProject.packageName);

    // Ex: "C:\MyRepo\my-library"
    const dependencyProjectFolder = dependencyProject.projectFolder;

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
      const localScopedFolder = path.join(consumingProject.projectFolder, 'node_modules', scopePart);
      if (!fs.existsSync(localScopedFolder)) {
        fs.mkdirSync(localScopedFolder);
      }

      // Ex: "C:\MyRepo\my-app\node_modules\@ms\my-library"
      localModuleFolder = path.join(localScopedFolder, packagePart);
    } else {
      // Ex: "C:\MyRepo\my-app\node_modules\my-library"
      localModuleFolder = path.join(consumingProject.projectFolder, 'node_modules', dependencyProject);
    }

    // Create symlink: dependencyProjectFolder <-- consumingModuleFolder
    // @todo VSO #178073 - revert this temporary hack
    if (fs.existsSync(localModuleFolder)) {
      console.log(`WARNING: replacing symlink to common/${dependencyProject} with ${dependencyProjectFolder}`);
      fs.unlinkSync(localModuleFolder);
    }
    fs.symlinkSync(dependencyProjectFolder, localModuleFolder, 'junction');

    numberOfLinks++;
  });
  return numberOfLinks;
}

/**
 * Entry point for the "rush link" and "rush unlink" commands.
 */
export default function executeLink(rushConfig: RushConfig, unlinkOnly: boolean): void {

  rushConfig.projects.forEach((rushProject: RushConfigProject) => {
    console.log('');
    console.log('PROJECT: ' + rushProject.packageName);

    // Ex: "C:\MyRepo\my-app\node_modules"
    const localModulesFolder: string = path.join(rushProject.projectFolder, 'node_modules');
    console.log('Removing node_modules');
    del.sync(localModulesFolder, { force: true });

    if (!unlinkOnly) {
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
      const commonModulesFolder: string = path.join(rushConfig.commonFolder, 'node_modules');
      const commonModulesFolderItems: string[] = fs.readdirSync(commonModulesFolder);

      let linkCount: number = 0;
      commonModulesFolderItems.forEach((filename) => {
        if (filename.substr(0, 1) === '@') {
          // For scoped folders (e.g. "@ms"), we need to create a regular folder

          // Ex: "C:\MyRepo\common\node_modules\@ms"
          const commonScopedFolder: string = path.join(commonModulesFolder, filename);
          // Ex: "C:\MyRepo\my-app\node_modules\@ms"
          const localScopedFolder: string = path.join(localModulesFolder, filename);
          fs.mkdirSync(localScopedFolder);

          // Then create links for each of the packages in the scoped folder
          const commonScopedFolderItems: string[] = fs.readdirSync(commonScopedFolder);
          commonScopedFolderItems.forEach(function (scopedFilename) {
            // Ex: "C:\MyRepo\common\node_modules\@ms\my-library"
            const commonScopedPackagePath: string = path.join(commonScopedFolder, scopedFilename);
            // Ex: "C:\MyRepo\my-app\node_modules\@ms\my-library"
            const localScopedPackagePath: string = path.join(localScopedFolder, scopedFilename);

            // Create symlink: commonScopedPackagePath <-- localScopedPackagePath
            fs.symlinkSync(commonScopedPackagePath, localScopedPackagePath, 'junction');
            ++linkCount;
          });
        } else {
          // Ex: "C:\MyRepo\common\node_modules\my-library2"
          const commonPackagePath: string = path.join(commonModulesFolder, filename);
          // Ex: "C:\MyRepo\my-app\node_modules\my-library2"
          const localPackagePath: string = path.join(localModulesFolder, filename);

          // Create symlink: commonPackagePath <-- localPackagePath
          fs.symlinkSync(commonPackagePath, localPackagePath, 'junction');
          ++linkCount;
        }
      });

      linkCount += createDependencyLinks(rushConfig, rushProject);
      console.log(`Created ${linkCount} links`);
    }
  });

  console.log('');
  console.log('Done!');
};
