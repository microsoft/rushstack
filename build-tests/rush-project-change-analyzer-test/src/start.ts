import { RushConfiguration, ProjectChangeAnalyzer, RushConfigurationProject } from '@microsoft/rush-lib';
import { Terminal, ConsoleTerminalProvider } from '@rushstack/node-core-library';

async function runAsync(): Promise<void> {
  const terminal: Terminal = new Terminal(new ConsoleTerminalProvider());
  const rushConfiguration: RushConfiguration = RushConfiguration.loadFromDefaultLocation({
    startingFolder: process.cwd()
  });

  const projectDiretDependentsMap: Map<RushConfigurationProject, Set<RushConfigurationProject>> = new Map<
    RushConfigurationProject,
    Set<RushConfigurationProject>
  >();
  for (const project of rushConfiguration.projects) {
    projectDiretDependentsMap.set(project, new Set<RushConfigurationProject>());
  }

  for (const project of rushConfiguration.projects) {
    for (const dependencyProject of project.dependencyProjects) {
      projectDiretDependentsMap.get(dependencyProject)!.add(project);
    }
  }

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

      for (const projectDiretDependent of projectDiretDependentsMap.get(project)!) {
        addProject(projectDiretDependent);
      }
    }
  }
  for await (const project of changedProjects) {
    addProject(project);
  }

  terminal.writeLine('Projects needing validation due to changes: ');
  const namesOfProjectsNeedingValidation: string[] = Array.from(projectsNeedingValidation)
    .map((project) => project.packageName)
    .sort();
  for (const nameOfProjectsNeedingValidation of namesOfProjectsNeedingValidation) {
    terminal.writeLine(` - ${nameOfProjectsNeedingValidation}`);
  }
}

runAsync().catch((error) => {
  console.error(error);
  process.exit(1);
});
