// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import path from 'path';
import { JsonFile } from '@rushstack/node-core-library';

import { RushConfiguration } from '../../../api/RushConfiguration';
import { CommandLineConfiguration, IPhasedCommand } from '../../../api/CommandLineConfiguration';
import { IOperationOptions, IOperationFactory, OperationSelector } from '../OperationSelector';
import { Operation } from '../Operation';
import { ICommandLineJson } from '../../../api/CommandLineJson';
import { RushConstants } from '../../RushConstants';
import { OperationStatus } from '../OperationStatus';
import { MockOperationRunner } from './MockOperationRunner';

interface ISerializedOperation {
  name: string;
  isCacheWriteAllowed: boolean;
  dependencies: string[];
}

function serializeOperation(operation: Operation): ISerializedOperation {
  return {
    name: operation.name,
    isCacheWriteAllowed: operation.runner.isCacheWriteAllowed,
    dependencies: Array.from(operation.dependencies, (dep: Operation) => dep.name)
  };
}

describe(OperationSelector.name, () => {
  const rushJsonFile: string = path.resolve(__dirname, `../../test/workspaceRepo/rush.json`);
  const commandLineJsonFile: string = path.resolve(
    __dirname,
    `../../test/workspaceRepo/common/config/rush/command-line.json`
  );

  const operationFactory: IOperationFactory = {
    createTask({ phase, project }: IOperationOptions): Operation {
      const name: string = `${project.packageName} (${phase.name.slice(
        RushConstants.phaseNamePrefix.length
      )})`;

      return new Operation(new MockOperationRunner(name), OperationStatus.Ready);
    }
  };

  let rushConfiguration!: RushConfiguration;
  let commandLineConfiguration!: CommandLineConfiguration;

  beforeAll(() => {
    rushConfiguration = RushConfiguration.loadFromConfigurationFile(rushJsonFile);
    const commandLineJson: ICommandLineJson = JsonFile.load(commandLineJsonFile);

    commandLineConfiguration = new CommandLineConfiguration(commandLineJson);
  });

  describe(OperationSelector.prototype.createOperations.name, () => {
    it('handles a full build', () => {
      const buildCommand: IPhasedCommand = commandLineConfiguration.commands.get('build')! as IPhasedCommand;

      const selector: OperationSelector = new OperationSelector({
        phasesToRun: buildCommand.phases
      });

      // All projects
      expect(
        Array.from(
          selector.createOperations({
            projectSelection: new Set(rushConfiguration.projects),
            operationFactory: operationFactory
          }),
          serializeOperation
        )
      ).toMatchSnapshot();
    });

    it('handles filtered projects', () => {
      const buildCommand: IPhasedCommand = commandLineConfiguration.commands.get('build')! as IPhasedCommand;

      const selector: OperationSelector = new OperationSelector({
        phasesToRun: buildCommand.phases
      });

      // Single project
      expect(
        Array.from(
          selector.createOperations({
            projectSelection: new Set([rushConfiguration.getProjectByName('g')!]),
            operationFactory: operationFactory
          }),
          serializeOperation
        )
      ).toMatchSnapshot();

      // Filtered projects
      expect(
        Array.from(
          selector.createOperations({
            projectSelection: new Set([
              rushConfiguration.getProjectByName('f')!,
              rushConfiguration.getProjectByName('a')!,
              rushConfiguration.getProjectByName('c')!
            ]),
            operationFactory: operationFactory
          }),
          serializeOperation
        )
      ).toMatchSnapshot();
    });

    it('handles filtered phases', () => {
      // Single phase with a missing dependency
      expect(
        Array.from(
          new OperationSelector({
            phasesToRun: new Set([commandLineConfiguration.phases.get('_phase:upstream-self')!])
          }).createOperations({
            projectSelection: new Set(rushConfiguration.projects),
            operationFactory: operationFactory
          }),
          serializeOperation
        )
      ).toMatchSnapshot();

      // Two phases with a missing link
      expect(
        Array.from(
          new OperationSelector({
            phasesToRun: new Set([
              commandLineConfiguration.phases.get('_phase:complex')!,
              commandLineConfiguration.phases.get('_phase:upstream-3')!,
              commandLineConfiguration.phases.get('_phase:upstream-1')!,
              commandLineConfiguration.phases.get('_phase:no-deps')!
            ])
          }).createOperations({
            projectSelection: new Set(rushConfiguration.projects),
            operationFactory: operationFactory
          }),
          serializeOperation
        )
      ).toMatchSnapshot();
    });

    it('handles filtered phases on filtered projects', () => {
      // Single phase with a missing dependency
      expect(
        Array.from(
          new OperationSelector({
            phasesToRun: new Set([commandLineConfiguration.phases.get('_phase:upstream-2')!])
          }).createOperations({
            projectSelection: new Set([
              rushConfiguration.getProjectByName('f')!,
              rushConfiguration.getProjectByName('a')!,
              rushConfiguration.getProjectByName('c')!
            ]),
            operationFactory: operationFactory
          }),
          serializeOperation
        )
      ).toMatchSnapshot();

      // Phases with missing links
      expect(
        Array.from(
          new OperationSelector({
            phasesToRun: new Set([
              commandLineConfiguration.phases.get('_phase:complex')!,
              commandLineConfiguration.phases.get('_phase:upstream-3')!,
              commandLineConfiguration.phases.get('_phase:upstream-1')!,
              commandLineConfiguration.phases.get('_phase:no-deps')!
            ])
          }).createOperations({
            projectSelection: new Set([
              rushConfiguration.getProjectByName('f')!,
              rushConfiguration.getProjectByName('a')!,
              rushConfiguration.getProjectByName('c')!
            ]),
            operationFactory: operationFactory
          }),
          serializeOperation
        )
      ).toMatchSnapshot();
    });
  });
});
