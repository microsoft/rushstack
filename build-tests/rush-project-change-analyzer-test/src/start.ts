import { RushConfiguration, ProjectChangeAnalyzer, RushConfigurationProject } from '@microsoft/rush-lib';
import { Terminal, ConsoleTerminalProvider } from '@rushstack/node-core-library';

async function runAsync(): Promise<void> {
  const terminal: Terminal = new Terminal(new ConsoleTerminalProvider());
  const rushConfiguration: RushConfiguration = RushConfiguration.loadFromDefaultLocation({
    startingFolder: process.cwd()
  });

  //#region Step 1: Determine each project's downstream dependencies
  const projectDirectDependentsMap: Map<RushConfigurationProject, Set<RushConfigurationProject>> = new Map<
    RushConfigurationProject,
    Set<RushConfigurationProject>
  >();
  for (const project of rushConfiguration.projects) {
    projectDirectDependentsMap.set(project, new Set<RushConfigurationProject>());
  }

  for (const project of rushConfiguration.projects) {
    for (const dependencyProject of project.dependencyProjects) {
      projectDirectDependentsMap.get(dependencyProject)!.add(project);
    }
  }
  //#endregion

  //#region Step 2: Get the list of changed projects and recursively collect their downstream dependencies
  const projectChangeAnalyzer: ProjectChangeAnalyzer = new ProjectChangeAnalyzer(rushConfiguration);

  const changedProjects: AsyncIterable<RushConfigurationProject> =
    projectChangeAnalyzer.getChangedProjectsAsync({
      targetBranchName: rushConfiguration.repositoryDefaultBranch,
      terminal
    });
  const projectsNeedingValidation: Set<RushConfigurationProject> = new Set<RushConfigurationProject>();
  function addProject(project: RushConfigurationProject): void {
    if (!projectsNeedingValidation.has(project)) {
      projectsNeedingValidation.add(project);

      for (const projectDirectDependent of projectDirectDependentsMap.get(project)!) {
        addProject(projectDirectDependent);
      }
    }
  }
  for await (const project of changedProjects) {
    addProject(project);
  }
  //#endregion

  //#region Step 3: Print the list of projects that were changed and their downstream dependencies
  terminal.writeLine('Projects needing validation due to changes: ');
  const namesOfProjectsNeedingValidation: string[] = Array.from(projectsNeedingValidation)
    .map((project) => project.packageName)
    .sort();
  for (const nameOfProjectsNeedingValidation of namesOfProjectsNeedingValidation) {
    terminal.writeLine(` - ${nameOfProjectsNeedingValidation}`);
  }
  //#endregion
}

runAsync().catch((error) => {
  console.error(error);
  process.exit(1);
});
