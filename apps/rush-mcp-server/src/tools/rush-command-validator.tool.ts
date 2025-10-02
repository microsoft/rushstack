// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import path from 'node:path';

import { z } from 'zod';

import { JsonFile } from '@rushstack/node-core-library';
import type { ICommandLineJson } from '@rushstack/rush-sdk/lib/api/CommandLineJson';
import type { RushConfiguration } from '@rushstack/rush-sdk';

import { getRushConfiguration } from '../utilities/common';
import { BaseTool, type CallToolResult } from './base.tool';

export const selectionParamsSet: ReadonlySet<string> = new Set([
  '-t',
  '--to',
  '--to-except',
  '-T',
  '--from',
  '-f',
  '--only',
  '-o',
  '--impacted-by',
  '-i',
  '--impacted-by-except',
  '-I'
]);

export class RushCommandValidatorTool extends BaseTool {
  public constructor() {
    super({
      name: 'rush_command_validator',
      description:
        'Validates Rush commands before execution by checking command format and ensuring compliance with Rush command standards. This tool helps prevent invalid command usage and provides guidance on proper parameter selection.',
      schema: {
        commandName: z.enum(['rush', 'rushx']).describe('The main command to execute (rush or rushx)'),
        subCommandName: z
          .string()
          .describe(
            'The Rush subcommand to validate (install, update, add, remove, purge, list, build, etc.)'
          ),
        args: z.array(z.string()).describe('The arguments to validate for the subcommand')
      }
    });
  }

  public async executeAsync({
    commandName,
    subCommandName,
    args
  }: {
    commandName: string;
    subCommandName: string;
    args: string[];
  }): Promise<CallToolResult> {
    const rushConfiguration: RushConfiguration = await getRushConfiguration();
    const commandLineJson: ICommandLineJson = await JsonFile.loadAsync(
      path.resolve(rushConfiguration.commonFolder, 'config', 'rush', 'command-line.json')
    );
    const conditionSubCommandNames: Set<string> = new Set(
      commandLineJson.commands
        ?.filter((command) => command.commandKind !== 'global')
        .map((command) => command.name)
    );

    if (conditionSubCommandNames.has(subCommandName) && !args.some((arg) => selectionParamsSet.has(arg))) {
      return {
        isError: true,
        content: [
          {
            type: 'text',
            text: `Please add selection parameters like ${Array.from(selectionParamsSet).join(
              ', '
            )} to the command and re-validate. The package name should be retrieved from the package.json file in your project folder.`
          }
        ]
      };
    }

    for (const [index, arg] of args.entries()) {
      if (selectionParamsSet.has(arg)) {
        const packageName: string = args[index + 1];
        const isValidPackage: boolean =
          packageName === '.' || rushConfiguration.projects.some((p) => p.packageName === packageName);

        if (!isValidPackage) {
          return {
            isError: true,
            content: [
              {
                type: 'text',
                text: `The package "${packageName}" does not exist in the Rush workspace. You can retrieve the package name from the 'package.json' file in the project folder.`
              }
            ]
          };
        }
      }
    }

    const commandStr: string = `${commandName} ${subCommandName} ${args.join(' ')}`;
    const text: string = `Command "${commandStr}" validated successfully, you can ${
      commandName === 'rushx' || subCommandName === 'add' ? 'enter the project folder and ' : ''
    }execute it now.`;

    return {
      content: [
        {
          type: 'text',
          text
        }
      ]
    };
  }
}
