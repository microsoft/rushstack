// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { RushConfiguration } from '../../api/RushConfiguration';
import { CommandLineConfiguration, IPhasedCommand } from '../../api/CommandLineConfiguration';
import { IProjectTaskOptions, IProjectTaskFactory, ProjectTaskSelector } from '../ProjectTaskSelector';
import { Task } from '../taskExecution/Task';
import { JsonFile } from '@rushstack/node-core-library';
import { ICommandLineJson } from '../../api/CommandLineJson';
import { RushConstants } from '../RushConstants';
import { TaskStatus } from '../taskExecution/TaskStatus';
import { MockTaskRunner } from '../taskExecution/test/MockTaskRunner';

interface ISerializedTask {
  name: string;
  isCacheWriteAllowed: boolean;
  dependencies: string[];
}

function serializeTask(task: Task): ISerializedTask {
  return {
    name: task.name,
    isCacheWriteAllowed: task.runner.isCacheWriteAllowed,
    dependencies: Array.from(task.dependencies, (dep: Task) => dep.name)
  };
}

describe('ProjectTaskSelector', () => {
  const rushJsonFile: string = `${__dirname}/workspaceRepo/rush.json`;
  const commandLineJsonFile: string = `${__dirname}/workspaceRepo/common/config/rush/command-line.json`;

  const taskFactory: IProjectTaskFactory = {
    createTask({ phase, project }: IProjectTaskOptions): Task {
      const name: string = `${project.packageName} (${phase.name.slice(
        RushConstants.phaseNamePrefix.length
      )})`;

      return new Task(new MockTaskRunner(name), TaskStatus.Ready);
    }
  };

  let rushConfiguration!: RushConfiguration;
  let commandLineConfiguration!: CommandLineConfiguration;

  beforeAll(() => {
    rushConfiguration = RushConfiguration.loadFromConfigurationFile(rushJsonFile);
    const commandLineJson: ICommandLineJson = JsonFile.load(commandLineJsonFile);

    commandLineConfiguration = new CommandLineConfiguration(commandLineJson);
  });

  describe('#createTasks', () => {
    it('handles a full build', () => {
      const buildCommand: IPhasedCommand = commandLineConfiguration.commands.get('build')! as IPhasedCommand;

      const taskSelector: ProjectTaskSelector = new ProjectTaskSelector({
        phases: commandLineConfiguration.phases,
        projects: rushConfiguration.projectsByName,
        phasesToRun: buildCommand.phases
      });

      // All projects
      expect(
        Array.from(
          taskSelector.createTasks({
            projectSelection: new Set(rushConfiguration.projects),
            taskFactory
          }),
          serializeTask
        )
      ).toMatchSnapshot();
    });

    it('handles filtered projects', () => {
      const buildCommand: IPhasedCommand = commandLineConfiguration.commands.get('build')! as IPhasedCommand;

      const taskSelector: ProjectTaskSelector = new ProjectTaskSelector({
        phases: commandLineConfiguration.phases,
        projects: rushConfiguration.projectsByName,
        phasesToRun: buildCommand.phases
      });

      // Single project
      expect(
        Array.from(
          taskSelector.createTasks({
            projectSelection: new Set([rushConfiguration.getProjectByName('g')!]),
            taskFactory
          }),
          serializeTask
        )
      ).toMatchSnapshot();

      // Filtered projects
      expect(
        Array.from(
          taskSelector.createTasks({
            projectSelection: new Set([
              rushConfiguration.getProjectByName('f')!,
              rushConfiguration.getProjectByName('a')!,
              rushConfiguration.getProjectByName('c')!
            ]),
            taskFactory
          }),
          serializeTask
        )
      ).toMatchSnapshot();
    });

    it('handles filtered phases', () => {
      // Single phase with a missing dependency
      expect(
        Array.from(
          new ProjectTaskSelector({
            phases: commandLineConfiguration.phases,
            projects: rushConfiguration.projectsByName,
            phasesToRun: new Set([commandLineConfiguration.phases.get('_phase:upstream-self')!])
          }).createTasks({
            projectSelection: new Set(rushConfiguration.projects),
            taskFactory
          }),
          serializeTask
        )
      ).toMatchSnapshot();

      // Two phases with a missing link
      expect(
        Array.from(
          new ProjectTaskSelector({
            phases: commandLineConfiguration.phases,
            projects: rushConfiguration.projectsByName,
            phasesToRun: new Set([
              commandLineConfiguration.phases.get('_phase:complex')!,
              commandLineConfiguration.phases.get('_phase:upstream-3')!,
              commandLineConfiguration.phases.get('_phase:upstream-1')!,
              commandLineConfiguration.phases.get('_phase:no-deps')!
            ])
          }).createTasks({
            projectSelection: new Set(rushConfiguration.projects),
            taskFactory
          }),
          serializeTask
        )
      ).toMatchSnapshot();
    });

    it('handles filtered phases on filtered projects', () => {
      // Single phase with a missing dependency
      expect(
        Array.from(
          new ProjectTaskSelector({
            phases: commandLineConfiguration.phases,
            projects: rushConfiguration.projectsByName,
            phasesToRun: new Set([commandLineConfiguration.phases.get('_phase:upstream-2')!])
          }).createTasks({
            projectSelection: new Set([
              rushConfiguration.getProjectByName('f')!,
              rushConfiguration.getProjectByName('a')!,
              rushConfiguration.getProjectByName('c')!
            ]),
            taskFactory
          }),
          serializeTask
        )
      ).toMatchSnapshot();

      // Phases with missing links
      expect(
        Array.from(
          new ProjectTaskSelector({
            phases: commandLineConfiguration.phases,
            projects: rushConfiguration.projectsByName,
            phasesToRun: new Set([
              commandLineConfiguration.phases.get('_phase:complex')!,
              commandLineConfiguration.phases.get('_phase:upstream-3')!,
              commandLineConfiguration.phases.get('_phase:upstream-1')!,
              commandLineConfiguration.phases.get('_phase:no-deps')!
            ])
          }).createTasks({
            projectSelection: new Set([
              rushConfiguration.getProjectByName('f')!,
              rushConfiguration.getProjectByName('a')!,
              rushConfiguration.getProjectByName('c')!
            ]),
            taskFactory
          }),
          serializeTask
        )
      ).toMatchSnapshot();
    });
  });
});
