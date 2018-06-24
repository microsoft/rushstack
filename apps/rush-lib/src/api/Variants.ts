
import {
  ICommandLineStringDefinition
} from '@microsoft/ts-command-line';

/**
 * Namespace for utilities relating to the Variants feature.
 * @beta
 */
export namespace Variants {
  /**
   * The type using for the 'variant' value tracked by commands.
   * @beta
   */
  export type IVariantName = string | undefined;

  /**
   * Provides the parameter configuration for '--variant'.
   * @beta
   */
  export const VARIANT_PARAMETER: ICommandLineStringDefinition = {
    parameterLongName: '--variant',
    argumentName: 'VARIANT',
    description: 'Run command using a variant installation configuration',
    environmentVariable: 'RUSH_VARIANT'
  };
}
