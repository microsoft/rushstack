// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { RushConstants } from '../../logic/RushConstants';
import { Command, CommandLineConfiguration, Parameter } from '../CommandLineConfiguration';

describe(CommandLineConfiguration.name, () => {
  it('Forbids a misnamed phase', () => {
    expect(
      () =>
        new CommandLineConfiguration({
          phases: [
            {
              name: '_faze:A'
            }
          ]
        })
    ).toThrowErrorMatchingSnapshot();
    expect(
      () =>
        new CommandLineConfiguration({
          phases: [
            {
              name: '_phase:'
            }
          ]
        })
    ).toThrowErrorMatchingSnapshot();
  });

  it('Detects a missing phase', () => {
    expect(
      () =>
        new CommandLineConfiguration({
          commands: [
            {
              commandKind: 'phased',
              name: 'example',
              summary: 'example',
              description: 'example',
              safeForSimultaneousRushProcesses: false,

              enableParallelism: true,
              phases: ['_phase:A']
            }
          ]
        })
    ).toThrowErrorMatchingSnapshot();
  });

  it('Detects a missing phase dependency', () => {
    expect(
      () =>
        new CommandLineConfiguration({
          phases: [
            {
              name: '_phase:A',
              dependencies: {
                upstream: ['_phase:B']
              }
            }
          ]
        })
    ).toThrowErrorMatchingSnapshot();

    expect(
      () =>
        new CommandLineConfiguration({
          phases: [
            {
              name: '_phase:A',
              dependencies: {
                self: ['_phase:B']
              }
            }
          ]
        })
    ).toThrowErrorMatchingSnapshot();
  });

  it('Detects a cycle among phases', () => {
    expect(
      () =>
        new CommandLineConfiguration({
          phases: [
            {
              name: '_phase:A',
              dependencies: {
                self: ['_phase:B']
              }
            },
            {
              name: '_phase:B',
              dependencies: {
                self: ['_phase:C']
              }
            },
            {
              name: '_phase:C',
              dependencies: {
                self: ['_phase:A']
              }
            }
          ]
        })
    ).toThrowErrorMatchingSnapshot();
  });

  describe('associatedParameters', () => {
    it('correctly populates the associatedParameters object for a parameter associated with the "build" command', () => {
      const commandLineConfiguration: CommandLineConfiguration = new CommandLineConfiguration({
        parameters: [
          {
            parameterKind: 'flag',
            longName: '--flag',
            associatedCommands: ['build'],
            description: 'flag'
          }
        ]
      });

      function validateCommandByName(commandName: string): void {
        const command: Command | undefined = commandLineConfiguration.commands.get(commandName);
        expect(command).toBeDefined();
        const associatedParametersArray: Parameter[] = Array.from(command!.associatedParameters);
        expect(associatedParametersArray).toHaveLength(1);
        expect(associatedParametersArray[0].longName).toEqual('--flag');
      }

      validateCommandByName(RushConstants.buildCommandName);
      validateCommandByName(RushConstants.rebuildCommandName);
    });

    it('correctly populates the associatedParameters object for a parameter associated with a custom bulk command', () => {
      const commandLineConfiguration: CommandLineConfiguration = new CommandLineConfiguration({
        commands: [
          {
            commandKind: 'bulk',
            name: 'custom-bulk',
            summary: 'custom-bulk',
            enableParallelism: true,
            safeForSimultaneousRushProcesses: false
          }
        ],
        parameters: [
          {
            parameterKind: 'flag',
            longName: '--flag',
            associatedCommands: ['custom-bulk'],
            description: 'flag'
          }
        ]
      });

      const command: Command | undefined = commandLineConfiguration.commands.get('custom-bulk');
      expect(command).toBeDefined();
      const associatedParametersArray: Parameter[] = Array.from(command!.associatedParameters);
      expect(associatedParametersArray).toHaveLength(1);
      expect(associatedParametersArray[0].longName).toEqual('--flag');
    });

    it("correctly populates the associatedParameters object for a parameter associated with a custom phased command's phase", () => {
      const commandLineConfiguration: CommandLineConfiguration = new CommandLineConfiguration({
        commands: [
          {
            commandKind: 'phased',
            name: 'custom-phased',
            summary: 'custom-phased',
            enableParallelism: true,
            safeForSimultaneousRushProcesses: false,
            phases: ['_phase:A']
          }
        ],
        phases: [
          {
            name: '_phase:A'
          }
        ],
        parameters: [
          {
            parameterKind: 'flag',
            longName: '--flag',
            associatedPhases: ['_phase:A'],
            description: 'flag'
          }
        ]
      });

      const command: Command | undefined = commandLineConfiguration.commands.get('custom-phased');
      expect(command).toBeDefined();
      const associatedParametersArray: Parameter[] = Array.from(command!.associatedParameters);
      expect(associatedParametersArray).toHaveLength(1);
      expect(associatedParametersArray[0].longName).toEqual('--flag');
    });

    it("correctly populates the associatedParameters object for a parameter associated with a custom phased command's transitive phase", () => {
      const commandLineConfiguration: CommandLineConfiguration = new CommandLineConfiguration({
        commands: [
          {
            commandKind: 'phased',
            name: 'custom-phased',
            summary: 'custom-phased',
            enableParallelism: true,
            safeForSimultaneousRushProcesses: false,
            phases: ['_phase:A']
          }
        ],
        phases: [
          {
            name: '_phase:A',
            dependencies: {
              upstream: ['_phase:B']
            }
          },
          {
            name: '_phase:B'
          }
        ],
        parameters: [
          {
            parameterKind: 'flag',
            longName: '--flag',
            associatedPhases: ['_phase:B'],
            description: 'flag'
          }
        ]
      });

      const command: Command | undefined = commandLineConfiguration.commands.get('custom-phased');
      expect(command).toBeDefined();
      const associatedParametersArray: Parameter[] = Array.from(command!.associatedParameters);
      expect(associatedParametersArray).toHaveLength(1);
      expect(associatedParametersArray[0].longName).toEqual('--flag');
    });
  });
});
