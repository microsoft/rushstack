// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { RushConfiguration, ProjectChangeAnalyzer, type RushConfigurationProject } from '@microsoft/rush-lib';
import { Terminal, ConsoleTerminalProvider } from '@rushstack/terminal';

async function runAsync(): Promise<void> {
  const terminal: Terminal = new Terminal(new ConsoleTerminalProvider());
  const rushConfiguration: RushConfiguration = RushConfiguration.loadFromDefaultLocation({
    startingFolder: process.cwd()
  });

  //#region Step 1: Get the list of changed projects
  const projectChangeAnalyzer: ProjectChangeAnalyzer = new ProjectChangeAnalyzer(rushConfiguration);

  const changedProjects: Set<RushConfigurationProject> = await projectChangeAnalyzer.getChangedProjectsAsync({
    targetBranchName: rushConfiguration.repositoryDefaultBranch,
    terminal,

    includeExternalDependencies: true,
    enableFiltering: false
  });
  //#endregion

  //#region Step 2: Expand all consumers
  for (const project of changedProjects) {
    for (const consumer of project.consumingProjects) {
      changedProjects.add(consumer);
    }
  }
  //#endregion

  //#region Step 3: Print the list of projects that were changed and their consumers
  terminal.writeLine('Projects needing validation due to changes: ');
  const namesOfProjectsNeedingValidation: string[] = Array.from(
    changedProjects,
    (project) => project.packageName
  ).sort();
  for (const nameOfProjectsNeedingValidation of namesOfProjectsNeedingValidation) {
    terminal.writeLine(` - ${nameOfProjectsNeedingValidation}`);
  }
  //#endregion
}

process.exitCode = 1;
runAsync()
  .then(() => {
    process.exitCode = 0;
  })
  // eslint-disable-next-line no-console
  .catch(console.error);
