// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/**
 * An object-oriented command-line parser for TypeScript projects.
 *
 * @packagedocumentation
 */

export {
  default as CommandLineAction,
  ICommandLineActionOptions
} from './CommandLineAction';

export {
  IBaseCommandLineDefinition,
  ICommandLineFlagDefinition,
  ICommandLineStringDefinition,
  ICommandLineStringListDefinition,
  ICommandLineIntegerDefinition,
  ICommandLineChoiceDefinition
} from './CommandLineDefinition';

export {
  ICommandLineParserData as _ICommandLineParserData,
  CommandLineParameter,
  CommandLineStringParameter,
  CommandLineStringListParameter,
  CommandLineFlagParameter,
  CommandLineIntegerParameter,
  CommandLineChoiceParameter
} from './CommandLineParameter';

export {
  default as CommandLineParameterProvider
} from './CommandLineParameterProvider';

export {
  ICommandListParserOptions,
  default as CommandLineParser
} from './CommandLineParser';
