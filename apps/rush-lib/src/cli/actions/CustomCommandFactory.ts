import {
  CommandLineConfiguration,
  ICustomCommand,
  ICustomOption
} from '../../index';

import RushCommandLineParser from './RushCommandLineParser';
import { CustomRushAction } from './CustomRushAction';

export class CustomCommandFactory {
  public static createCommands(
      parser: RushCommandLineParser,
      commandLineConfig: CommandLineConfiguration
    ): Map<string, CustomRushAction> {
    const customActions: Map<string, CustomRushAction> = new Map<string, CustomRushAction>();

    const documentationForBuild: string = 'The Rush build command assumes that the package.json file for each'
      + ' project contains scripts for "npm run clean" and "npm run test".  It invokes'
      + ' these commands to build each project.  Projects are built in parallel where'
      + ' possible, but always respecting the dependency graph for locally linked projects.'
      + ' The number of simultaneous processes will be equal to the number of machine cores.'
      + ' unless overridden by the --parallelism flag.';

    // always create a build and a rebuild command
    customActions.set('build', new CustomRushAction(parser, {
      actionVerb: 'build',
      summary: '(EXPERIMENTAL) Build all projects that haven\'t been built, or have changed since they were last '
        + 'built.',
      documentation: documentationForBuild
    }));

    customActions.set('rebuild', new CustomRushAction(parser, {
      actionVerb: 'rebuild',
      summary: 'Clean and rebuild the entire set of projects',
      documentation: documentationForBuild
    }));

    commandLineConfig.commands.forEach((command: ICustomCommand) => {
      customActions.set(command.name, new CustomRushAction(parser, {
        actionVerb: command.name,
        summary: command.description,
        documentation: command.description
      }));
    });

    commandLineConfig.options.forEach((customOption: ICustomOption, longName: string) => {
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

    return customActions;
  }
}