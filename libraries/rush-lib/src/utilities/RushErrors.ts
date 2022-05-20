import { getFilledCompositeString, strings } from '../loc';
import { RushConstants } from '../logic/RushConstants';

enum RushErrorCodes {
  commandCollision = 'R000',
  unsupportedCommandKind = 'R001',
  disallowedGlobalCommand = 'R001',
  pluginAddCommandError = 'R002'
}

enum RushExperimentErrorCodes {
  phasedCommandsExperimentMustBeEnabled = 'RX001'
}

function getErrorMessage(errorCode: RushErrorCodes | RushExperimentErrorCodes, message: string): string {
  return `(${errorCode}) ${message}`;
}

export class RushErrors {
  public static getPluginAddCommandLineActionsErrorMessage(
    pluginName: string,
    packageName: string,
    error: Error
  ): string {
    return getErrorMessage(
      RushErrorCodes.pluginAddCommandError,
      getFilledCompositeString(
        strings.pluginAddCommandLineActionsErrorMessage,
        pluginName,
        packageName,
        error.toString()
      )
    );
  }

  public static getCommandCollisionErrorMessage(commandName: string): string {
    return getErrorMessage(
      RushErrorCodes.commandCollision,
      getFilledCompositeString(
        strings.commandCollisionErrorMessage,
        RushConstants.commandLineFilename,
        commandName
      )
    );
  }

  public static getPhasedCommandsExperimentMustBeEnabledErrorMessage(commandName: string): string {
    return getErrorMessage(
      RushExperimentErrorCodes.phasedCommandsExperimentMustBeEnabled,
      getFilledCompositeString(
        strings.phasedCommandExperimentMustBeEnabledErrorMessage,
        RushConstants.commandLineFilename,
        commandName,
        RushConstants.phasedCommandKind
      )
    );
  }

  public static getUnsupportedCommandKindErrorMessage(commandName: string, commandKind: string): string {
    return getErrorMessage(
      RushErrorCodes.unsupportedCommandKind,
      getFilledCompositeString(
        strings.unsupportedCommandKindErrorMessage,
        RushConstants.commandLineFilename,
        commandName,
        commandKind
      )
    );
  }

  public static getDisallowedGlobalCommandErrorMessage(commandName: string): string {
    return getErrorMessage(
      RushErrorCodes.disallowedGlobalCommand,
      getFilledCompositeString(
        strings.disallowedGlobalCommandErrorMessage,
        RushConstants.commandLineFilename,
        commandName,
        RushConstants.globalCommandKind,
        RushConstants.bulkCommandKind,
        RushConstants.phasedCommandKind
      )
    );
  }
}
