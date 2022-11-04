// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

// This function will read the current directory and try to figure out if it's a rush project or regular pnpm workspace
// Currently it will throw error if neither can be determined
import fs from 'fs';
import path from 'path';
import { AppState, IRushProjectDetails, ProjectType } from './state';

export const init = (): AppState => {
  const currDir = process.cwd();
  const appState = new AppState({
    currDir
  });

  let currExploredDir = currDir;
  while (path.resolve(currExploredDir) !== '/') {
    // Look for a rush.json [rush project] or pnpm-lock.yaml file [regular pnpm workspace]
    if (fs.existsSync(path.join(currExploredDir, 'rush.json'))) {
      console.log('found rush project: ', path.join(currExploredDir, 'rush.json'));

      appState.projectType = ProjectType.RUSH_PROJECT;
      appState.pnpmLockfileLocation = path.join(currExploredDir, '/common/config/rush/pnpm-lock.yaml');
      appState.pnpmfileLocation = path.join(currExploredDir, '/common/config/rush/.pnpmfile.cjs');
      appState.projectRoot = path.resolve(currExploredDir);
      break;
    } else if (fs.existsSync(path.join(currExploredDir, 'pnpm-lock.yaml'))) {
      appState.projectType = ProjectType.PNPM_WORKSPACE;
      appState.pnpmLockfileLocation = path.join(currExploredDir, '/pnpm-lock.yaml');
      appState.pnpmfileLocation = path.join(currExploredDir, '/.pnpmfile.cjs');
      appState.projectRoot = path.resolve(currExploredDir);
      break;
    }
    currExploredDir += '/..';
  }

  if (!appState.projectRoot) {
    throw new Error('Could not find a rush or pnpm project!');
  }

  if (appState.projectType === ProjectType.RUSH_PROJECT) {
    // Load the rush projects
    const rushJsonString = fs.readFileSync(path.join(appState.projectRoot, 'rush.json')).toString();

    const parsedRushJsonString = rushJsonString.replace(
      /\\"|"(?:\\"|[^"])*"|(\/\/.*|\/\*[\s\S]*?\*\/)/g,
      (m, g) => (g ? '' : m)
    );
    const rushJson = JSON.parse(parsedRushJsonString);

    const projects: { [key in string]: IRushProjectDetails } = {};
    for (const project of rushJson.projects) {
      projects[project.projectFolder] = {
        projectName: project.packageName,
        projectFolder: project.projectFolder
      };
    }

    appState.rush.projects = projects;
  }

  return appState;
};
