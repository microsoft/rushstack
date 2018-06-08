import * as path from 'path';

import { CommandLineConfiguration } from '../../data/CommandLineConfiguration';
import { CommandJson } from '../../data/CommandLineJson';

import { RushCommandLineParser } from './RushCommandLineParser';
import { CustomRushAction } from './CustomRushAction';
import { RushConstants } from '../../RushConstants';

/**
 * Using the custom command line configuration, generates a set of
 * rush actions that are then registered to the command line.
 */
export class CustomCommandFactory {
  public static addActions(parser: RushCommandLineParser): void {
    if (!parser.rushConfiguration) {
      return;
    }

    const commandLineConfigFile: string = path.join(
      parser.rushConfiguration.commonRushConfigFolder, RushConstants.commandLineFilename
    );
    const commandLineConfiguration: CommandLineConfiguration
      = CommandLineConfiguration.loadFromFileOrDefault(commandLineConfigFile);

    const documentationForBuild: string = 'The Rush build command assumes that the package.json file for each'
      + ' project contains a "scripts" entry for "npm run build".  It invokes'
      + ' this commands to build each project.  Projects are built in parallel where'
      + ' possible, but always respecting the dependency graph for locally linked projects.'
      + ' The number of simultaneous processes will be based on the number of machine cores'
      + ' unless overridden by the --parallelism flag.';

    // always create a build and a rebuild command
    parser.addAction(new CustomRushAction({
      actionName: 'build',
      summary: '(EXPERIMENTAL) Build all projects that haven\'t been built, or have changed since they were last '
        + 'built.',
      documentation: documentationForBuild,

      parser: parser,
      commandLineConfiguration: commandLineConfiguration,

      enableParallelism: true,
      ignoreMissingScript: false
    }));

    parser.addAction(new CustomRushAction({
      actionName: 'rebuild',
      summary: 'Clean and rebuild the entire set of projects',
      documentation: documentationForBuild,

      parser: parser,
      commandLineConfiguration: commandLineConfiguration,

      enableParallelism: true,
      ignoreMissingScript: false
    }));

    // Register each custom command
    for (const command of commandLineConfiguration.commands) {
      if (parser.tryGetAction(command.name)) {
        throw new Error(`${RushConstants.commandLineFilename} defines a command "${command.name}"`
          + ` using a name that already exists`);
      }

      switch (command.commandKind) {
        case 'bulk':
          parser.addAction(new CustomRushAction({
            actionName: command.name,
            summary: command.summary,
            documentation: command.description || command.summary,

            parser: parser,
            commandLineConfiguration: commandLineConfiguration,

            enableParallelism: command.enableParallelism,
            ignoreMissingScript: command.ignoreMissingScript || false
          }));
          break;
        case 'global':
          // todo
          break;
        default:
          throw new Error(`${RushConstants.commandLineFilename} defines a command "${command!.name}"`
            + ` using an unsupported command kind "${command!.commandKind}"`);
      }
    }

    // Check for any invalid associations
    for (const parameter of commandLineConfiguration.parameters) {
      for (const associatedCommand of parameter.associatedCommands) {
        if (!parser.tryGetAction(associatedCommand)) {
          throw new Error(`${RushConstants.commandLineFilename} defines a parameter "${parameter.longName}"`
            + ` that is associated with a nonexistent command "${associatedCommand}"`);
        }
      }
    }
  }
}
