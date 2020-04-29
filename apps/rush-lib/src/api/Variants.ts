
import {
  ICommandLineStringDefinition
} from '@rushstack/ts-command-line';

/**
 * Namespace for utilities relating to the Variants feature.
 */
export class Variants {
  /**
   * Provides the parameter configuration for '--variant'.
   */
  public static readonly VARIANT_PARAMETER: ICommandLineStringDefinition = {
    parameterLongName: '--variant',
    argumentName: 'VARIANT',
    description: 'Run command using a variant installation configuration',
    environmentVariable: 'RUSH_VARIANT'
  };
}
