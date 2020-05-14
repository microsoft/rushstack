// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/**
 * An object-oriented command-line parser for TypeScript projects.
 *
 * @packageDocumentation
 */

export {
  CommandLineAction,
  ICommandLineActionOptions
} from './CommandLineAction';

export {
  IBaseCommandLineDefinition,
  IBaseCommandLineDefinitionWithArgument,
  ICommandLineFlagDefinition,
  ICommandLineStringDefinition,
  ICommandLineStringListDefinition,
  ICommandLineIntegerDefinition,
  ICommandLineChoiceDefinition,
  ICommandLineRemainderDefinition
} from './CommandLineDefinition';

export {
  CommandLineParameterKind,
  CommandLineParameter,
  CommandLineParameterWithArgument,
  CommandLineStringParameter,
  CommandLineStringListParameter,
  CommandLineFlagParameter,
  CommandLineIntegerParameter,
  CommandLineChoiceParameter,
  CommandLineRemainder
} from './CommandLineParameter';

export {
  CommandLineParameterProvider,
  ICommandLineParserData as _ICommandLineParserData
} from './CommandLineParameterProvider';

export {
  ICommandLineParserOptions,
  CommandLineParser
} from './CommandLineParser';

export {
  DynamicCommandLineAction
} from './DynamicCommandLineAction';

export {
  DynamicCommandLineParser
} from './DynamicCommandLineParser';
