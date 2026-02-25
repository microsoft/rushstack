// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { RushConstants } from '../../logic/RushConstants.ts';
import {
  type IPhasedCommandConfig,
  CommandLineConfiguration,
  type IParameterJson,
  type IPhase,
  type Command
} from '../CommandLineConfiguration.ts';

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
    expect(
      () =>
        new CommandLineConfiguration({
          phases: [
            {
              name: '_phase:0'
            }
          ]
        })
    ).toThrowErrorMatchingSnapshot();
    expect(
      () =>
        new CommandLineConfiguration({
          phases: [
            {
              name: '_phase:A'
            }
          ]
        })
    ).toThrowErrorMatchingSnapshot();
    expect(
      () =>
        new CommandLineConfiguration({
          phases: [
            {
              name: '_phase:A-'
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
              phases: ['_phase:a']
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
              name: '_phase:a',
              dependencies: {
                upstream: ['_phase:b']
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
              name: '_phase:a',
              dependencies: {
                self: ['_phase:b']
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
              name: '_phase:a',
              dependencies: {
                self: ['_phase:b']
              }
            },
            {
              name: '_phase:b',
              dependencies: {
                self: ['_phase:c']
              }
            },
            {
              name: '_phase:c',
              dependencies: {
                self: ['_phase:a']
              }
            }
          ]
        })
    ).toThrowErrorMatchingSnapshot();
  });

  describe('parameters', () => {
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
        const parametersArray: IParameterJson[] = Array.from(command!.associatedParameters);
        expect(parametersArray).toHaveLength(1);
        expect(parametersArray[0].longName).toEqual('--flag');
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
      const parametersArray: IParameterJson[] = Array.from(command!.associatedParameters);
      expect(parametersArray).toHaveLength(1);
      expect(parametersArray[0].longName).toEqual('--flag');
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
            phases: ['_phase:a']
          }
        ],
        phases: [
          {
            name: '_phase:a'
          }
        ],
        parameters: [
          {
            parameterKind: 'flag',
            longName: '--flag',
            associatedPhases: ['_phase:a'],
            associatedCommands: ['custom-phased'],
            description: 'flag'
          }
        ]
      });

      const command: Command | undefined = commandLineConfiguration.commands.get('custom-phased');
      expect(command).toBeDefined();
      const parametersArray: IParameterJson[] = Array.from(command!.associatedParameters);
      expect(parametersArray).toHaveLength(1);
      expect(parametersArray[0].longName).toEqual('--flag');
    });

    it('allows a parameter to only be associated with phased commands but not have any associated phases', () => {
      const commandLineConfiguration: CommandLineConfiguration = new CommandLineConfiguration({
        commands: [
          {
            commandKind: 'phased',
            name: 'custom-phased',
            summary: 'custom-phased',
            enableParallelism: true,
            safeForSimultaneousRushProcesses: false,
            phases: ['_phase:a']
          }
        ],
        phases: [
          {
            name: '_phase:a'
          }
        ],
        parameters: [
          {
            parameterKind: 'flag',
            longName: '--flag',
            associatedCommands: ['custom-phased'],
            description: 'flag'
          }
        ]
      });

      const command: Command | undefined = commandLineConfiguration.commands.get('custom-phased');
      expect(command).toBeDefined();
      const parametersArray: IParameterJson[] = Array.from(command!.associatedParameters);
      expect(parametersArray).toHaveLength(1);
      expect(parametersArray[0].longName).toEqual('--flag');
      const phase: IPhase | undefined = commandLineConfiguration.phases.get('_phase:a');
      expect(phase).toBeDefined();
      const phaseParametersArray: unknown[] = Array.from(phase!.associatedParameters);
      expect(phaseParametersArray).toHaveLength(0);
    });
  });

  describe('shellCommand in bulk command', () => {
    it('get "custom-shell-command-echo" command', () => {
      const commandLineConfiguration: CommandLineConfiguration = new CommandLineConfiguration({
        commands: [
          {
            commandKind: 'bulk',
            name: 'custom-shell-command-echo',
            summary: 'custom define bulk shellCommand echo',
            enableParallelism: true,
            safeForSimultaneousRushProcesses: false,
            shellCommand: 'echo'
          }
        ]
      });

      const command: IPhasedCommandConfig | undefined = commandLineConfiguration.commands.get(
        'custom-shell-command-echo'
      ) as IPhasedCommandConfig;
      expect(command).toBeDefined();
      expect(command?.phases).toBeDefined();
      const phase = [...command?.phases][0];
      expect(phase.name).toEqual('custom-shell-command-echo');
      expect(phase.shellCommand).toEqual('echo');
    });
  });
});
