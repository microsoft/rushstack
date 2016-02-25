/// <reference path="../typings/tsd.d.ts" />

import * as child_process from 'child_process';
import colors = require('colors');
import * as fs from 'fs';
import * as path from 'path';
import RushConfigLoader, { IRushConfig, IRushProjects, IRushProjectConfig } from './RushConfigLoader';
import { getCommonFolder } from './ExecuteLink';
import ITask from './taskRunner/ITask';
import TaskRunner from './taskRunner/TaskRunner';
import ProjectBuildTask from './ProjectBuildTask';
import ErrorDetector, { ErrorDetectionMode } from './ErrorDetector';


// Top level packages with no
interface IProjectBuildInfo extends IRushProjectConfig {
  dependents: Array<string>;
};

/**
 * Finds the list of projects which are dependent on the currentProject
 */
function findDependents(currentProject: string, projects: IRushProjects): Array<string> {
  const dependents: Array<string> = [];
  Object.keys(projects).forEach((project: string) => {
    if (projects[project].dependencies && currentProject in projects[project].dependencies) {
      dependents.push(currentProject);
    }
  });
  return dependents;
}

function buildDependencyGraph(projects: IRushProjects): Map<string, IProjectBuildInfo> {
  const projectBuildInfo: Map<string, IProjectBuildInfo> = new Map<string, IProjectBuildInfo>();
  Object.keys(projects).forEach((project: string) => {
    const projectInfo = projects[project];
    projectBuildInfo.set(project, {
      dependencies: projectInfo.dependencies ? projectInfo.dependencies : [],
      dependents: findDependents(project, projects),
      path: projectInfo.path
    });
  });
  return projectBuildInfo;
}

function getProjectsWithNoDependencies(projects: Map<string, IProjectBuildInfo>): Array<string> {
  const unblockedProjects: Array<string> = [];

  projects.forEach((projectInfo: IProjectBuildInfo, projectName: string) => {
    if (!projectInfo.dependencies.length) {
      unblockedProjects.push(projectName);
    }
  });

  return unblockedProjects;
}

/**
 *  This function modifies "projects", removing the completed project, as well as
 * removing the completed project from its dependencies' dependents list.
 * @param projectName
 * @param projects
 */
function markProjectAsCompleted(projectName: string, projects: Map<string, IProjectBuildInfo>) {
  projects.get(projectName).dependents.forEach((dependent: string) => {
    const dependentProjectDependenciesList = projects.get(dependent).dependencies;
    const i = dependentProjectDependenciesList.indexOf(dependent);
    dependentProjectDependenciesList.splice(i, 1);
  });

  projects.delete(projectName);
}



function queueBuilds(projects: Map<string, IProjectBuildInfo>): Promise<any> {
  const ready = getProjectsWithNoDependencies(projects);

  const buildPromises = ready.map((project: string) => {
    return buildProject(projects.get(project).path, ErrorDetectionMode.VisualStudioOnline).then(() => {
      markProjectAsCompleted(project, projects);
    });
  });

  return Promise.all(buildPromises).then(() => {
    return queueBuilds(projects);
  });
}

/**
 * Entry point for the "rush rebuild" command.
 */
export default function executeBuild(params: any): void {
  let config: IRushConfig = RushConfigLoader.load();

  const taskRunner = new TaskRunner(buildTaskList(config.projects));

  taskRunner.execute().then(() => {
    console.log('');
    console.log('Done!');
  });
};

function buildTaskList(projects: IRushProjects): Map<string, ITask> {
  const projectTasks = new Map<string, ITask>();

  Object.keys(projects).forEach((projectName: string) => {
    const projectConfig = projects[projectName];

    const projectTask = new ProjectBuildTask(projectName,
      projectConfig, ErrorDetectionMode.VisualStudioOnline);

    projectTasks.set(projectName, projectTask);
  });

  setProjectDependencies(projects, projectTasks);
  return projectTasks;
}

function setProjectDependencies(projects: IRushProjects, projectTasks: Map<string, ITask>) {
  Object.keys(projects).forEach((projectName: string) => {
    const projectConfig = projects[projectName];
    const projectTask = projectTasks.get(projectName);
    projectConfig.dependencies.forEach((dependencyName: string) => {
      projectTask.dependencies.push(projectTasks.get(dependencyName));
    });
  });

  setProjectDependents(projectTasks);
}

function setProjectDependents(projectTasks: Map<string, ITask>) {
  this.projectTasks.forEach((task: ITask) => {
    task.dependencies.forEach((dependency: ITask) => {
      dependency.dependents.push(task);
    });
  });
}
