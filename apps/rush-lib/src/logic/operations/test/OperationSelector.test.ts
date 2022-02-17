// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import path from 'path';
import { JsonFile } from '@rushstack/node-core-library';

import { RushConfiguration } from '../../../api/RushConfiguration';
import { CommandLineConfiguration, IPhasedCommandConfig } from '../../../api/CommandLineConfiguration';
import { createOperations, IOperationOptions, IOperationRunnerFactory } from '../OperationSelector';
import { Operation } from '../Operation';
import { ICommandLineJson } from '../../../api/CommandLineJson';
import { RushConstants } from '../../RushConstants';
import { MockOperationRunner } from './MockOperationRunner';
import { IOperationRunner } from '../IOperationRunner';

interface ISerializedOperation {
  name: string;
  silent: boolean;
  dependencies: string[];
}

function serializeOperation(operation: Operation): ISerializedOperation {
  return {
    name: operation.name,
    silent: operation.runner!.silent,
    dependencies: Array.from(operation.dependencies, (dep: Operation) => dep.name)
  };
}

describe(createOperations.name, () => {
  const rushJsonFile: string = path.resolve(__dirname, `../../test/workspaceRepo/rush.json`);
  const commandLineJsonFile: string = path.resolve(
    __dirname,
    `../../test/workspaceRepo/common/config/rush/command-line.json`
  );

  const operationFactory: IOperationRunnerFactory = {
    createOperationRunner({ phase, project }: IOperationOptions): IOperationRunner {
      const name: string = `${project.packageName} (${phase.name.slice(
        RushConstants.phaseNamePrefix.length
      )})`;

      return new MockOperationRunner(name);
    }
  };

  let rushConfiguration!: RushConfiguration;
  let commandLineConfiguration!: CommandLineConfiguration;

  beforeAll(() => {
    rushConfiguration = RushConfiguration.loadFromConfigurationFile(rushJsonFile);
    const commandLineJson: ICommandLineJson = JsonFile.load(commandLineJsonFile);

    commandLineConfiguration = new CommandLineConfiguration(commandLineJson);
  });

  it('handles a full build', () => {
    const buildCommand: IPhasedCommandConfig = commandLineConfiguration.commands.get('build')! as IPhasedCommandConfig;

    const operations: Set<Operation> = new Set();
    createOperations(operations, {
      phaseSelection: buildCommand.phases,
      projectSelection: new Set(rushConfiguration.projects),
      operationFactory: operationFactory
    });

    // All projects
    expect(Array.from(operations, serializeOperation)).toMatchSnapshot();
  });

  it('handles filtered projects', () => {
    const buildCommand: IPhasedCommandConfig = commandLineConfiguration.commands.get('build')! as IPhasedCommandConfig;

    const operations: Set<Operation> = new Set();
    createOperations(operations, {
      phaseSelection: buildCommand.phases,
      projectSelection: new Set([rushConfiguration.getProjectByName('g')!]),
      operationFactory: operationFactory
    });

    // Single project
    expect(Array.from(operations, serializeOperation)).toMatchSnapshot();

    operations.clear();
    createOperations(operations, {
      phaseSelection: buildCommand.phases,
      projectSelection: new Set([
        rushConfiguration.getProjectByName('f')!,
        rushConfiguration.getProjectByName('a')!,
        rushConfiguration.getProjectByName('c')!
      ]),
      operationFactory: operationFactory
    });

    // Filtered projects
    expect(Array.from(operations, serializeOperation)).toMatchSnapshot();
  });

  it('handles filtered phases', () => {
    // Single phase with a missing dependency
    const operations: Set<Operation> = new Set();
    createOperations(operations, {
      phaseSelection: new Set([commandLineConfiguration.phases.get('_phase:upstream-self')!]),
      projectSelection: new Set(rushConfiguration.projects),
      operationFactory: operationFactory
    });
    expect(Array.from(operations, serializeOperation)).toMatchSnapshot();

    // Two phases with a missing link
    operations.clear();
    createOperations(operations, {
      phaseSelection: new Set([
        commandLineConfiguration.phases.get('_phase:complex')!,
        commandLineConfiguration.phases.get('_phase:upstream-3')!,
        commandLineConfiguration.phases.get('_phase:upstream-1')!,
        commandLineConfiguration.phases.get('_phase:no-deps')!
      ]),
      projectSelection: new Set(rushConfiguration.projects),
      operationFactory: operationFactory
    });
    expect(Array.from(operations, serializeOperation)).toMatchSnapshot();
  });

  it('handles filtered phases on filtered projects', () => {
    // Single phase with a missing dependency
    const operations: Set<Operation> = new Set();
    createOperations(operations, {
      phaseSelection: new Set([commandLineConfiguration.phases.get('_phase:upstream-2')!]),
      projectSelection: new Set([
        rushConfiguration.getProjectByName('f')!,
        rushConfiguration.getProjectByName('a')!,
        rushConfiguration.getProjectByName('c')!
      ]),
      operationFactory: operationFactory
    });
    expect(Array.from(operations, serializeOperation)).toMatchSnapshot();

    // Phases with missing links
    operations.clear();
    createOperations(operations, {
      phaseSelection: new Set([
        commandLineConfiguration.phases.get('_phase:complex')!,
        commandLineConfiguration.phases.get('_phase:upstream-3')!,
        commandLineConfiguration.phases.get('_phase:upstream-1')!,
        commandLineConfiguration.phases.get('_phase:no-deps')!
      ]),
      projectSelection: new Set([
        rushConfiguration.getProjectByName('f')!,
        rushConfiguration.getProjectByName('a')!,
        rushConfiguration.getProjectByName('c')!
      ]),
      operationFactory: operationFactory
    });
    expect(Array.from(operations, serializeOperation)).toMatchSnapshot();
  });
});
