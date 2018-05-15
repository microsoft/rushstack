// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import {
  CommandLineConfiguration,
  ICustomCommand,
  CustomOption
} from '../../data/CommandLineConfiguration';
import { RushCommandLineParser } from './RushCommandLineParser';
import { CustomRushAction } from './CustomRushAction';

/**
 * Using the custom command line configuration, generates a set of
 * rush actions that are then registered to the command line.
 */
export class CustomCommandFactory {
  public static createCommands(
      parser: RushCommandLineParser,
      commandLineConfig: CommandLineConfiguration | undefined
    ): Map<string, CustomRushAction> {
    const customActions: Map<string, CustomRushAction> = new Map<string, CustomRushAction>();

    const documentationForBuild: string = 'The Rush build command assumes that the package.json file for each'
      + ' project contains a "scripts" entry for "npm run build".  It invokes'
      + ' this commands to build each project.  Projects are built in parallel where'
      + ' possible, but always respecting the dependency graph for locally linked projects.'
      + ' The number of simultaneous processes will be based on the number of machine cores'
      + ' unless overridden by the --parallelism flag.';

    // always create a build and a rebuild command
    customActions.set('build', new CustomRushAction(parser, {
      actionName: 'build',
      summary: '(EXPERIMENTAL) Build all projects that haven\'t been built, or have changed since they were last '
        + 'built.',
      documentation: documentationForBuild
    }, true));

    customActions.set('rebuild', new CustomRushAction(parser, {
      actionName: 'rebuild',
      summary: 'Clean and rebuild the entire set of projects',
      documentation: documentationForBuild
    }, true));

    if (commandLineConfig) {
      // Register each custom command
      commandLineConfig.commands.forEach((command: ICustomCommand) => {
        if (customActions.get(command.name)) {
          throw new Error(`Cannot define two custom actions with the same name: "${command.name}"`);
        }
        customActions.set(command.name, new CustomRushAction(parser, {
            actionName: command.name,
            summary: command.summary,
            documentation: command.documentation || command.summary
          },
          command.parallelized,
          command.ignoreMissingScript
        ));
      });

      // Associate each custom option to a command
      commandLineConfig.options.forEach((customOption: CustomOption, longName: string) => {
        customOption.associatedCommands.forEach((associatedCommand: string) => {
          const customAction: CustomRushAction | undefined = customActions.get(associatedCommand);
          if (customAction) {
            customAction.addCustomOption(longName, customOption);
          } else {
            throw new Error(`Cannot find custom command "${associatedCommand}" associated with`
              + ` custom option "${longName}".`);
          }
        });
      });
    }

    return customActions;
  }
}