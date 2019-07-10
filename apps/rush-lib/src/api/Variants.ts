import { ICommandLineStringDefinition } from '@microsoft/ts-command-line';

/**
 * Namespace for utilities relating to the Variants feature.
 */
export namespace Variants {
  /**
   * Provides the parameter configuration for '--variant'.
   */
  export const VARIANT_PARAMETER: ICommandLineStringDefinition = {
    parameterLongName: '--variant',
    argumentName: 'VARIANT',
    description: 'Run command using a variant installation configuration',
    environmentVariable: 'RUSH_VARIANT'
  };
}
