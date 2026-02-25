// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/**
 * An object-oriented command-line parser for TypeScript projects.
 *
 * @packageDocumentation
 */

export { CommandLineAction, type ICommandLineActionOptions } from './providers/CommandLineAction.ts';
export { DynamicCommandLineAction } from './providers/DynamicCommandLineAction.ts';
export { ScopedCommandLineAction } from './providers/ScopedCommandLineAction.ts';
export {
  AliasCommandLineAction,
  type IAliasCommandLineActionOptions
} from './providers/AliasCommandLineAction.ts';

export type {
  IBaseCommandLineDefinition,
  IBaseCommandLineDefinitionWithArgument,
  ICommandLineFlagDefinition,
  ICommandLineStringDefinition,
  ICommandLineStringListDefinition,
  ICommandLineIntegerDefinition,
  ICommandLineIntegerListDefinition,
  ICommandLineChoiceDefinition,
  ICommandLineChoiceListDefinition,
  ICommandLineRemainderDefinition
} from './parameters/CommandLineDefinition.ts';

export {
  type CommandLineParameter,
  CommandLineParameterKind,
  CommandLineParameterBase,
  CommandLineParameterWithArgument
} from './parameters/BaseClasses.ts';

export { CommandLineFlagParameter } from './parameters/CommandLineFlagParameter.ts';
export {
  CommandLineStringParameter,
  type IRequiredCommandLineStringParameter
} from './parameters/CommandLineStringParameter.ts';
export { CommandLineStringListParameter } from './parameters/CommandLineStringListParameter.ts';
export {
  CommandLineIntegerParameter,
  type IRequiredCommandLineIntegerParameter
} from './parameters/CommandLineIntegerParameter.ts';
export { CommandLineIntegerListParameter } from './parameters/CommandLineIntegerListParameter.ts';
export {
  CommandLineChoiceParameter,
  type IRequiredCommandLineChoiceParameter
} from './parameters/CommandLineChoiceParameter.ts';
export { CommandLineChoiceListParameter } from './parameters/CommandLineChoiceListParameter.ts';
export { CommandLineRemainder } from './parameters/CommandLineRemainder.ts';

export {
  CommandLineParameterProvider,
  type IScopedLongNameParseResult,
  type ICommandLineParserData as _ICommandLineParserData,
  type IRegisterDefinedParametersState as _IRegisterDefinedParametersState
} from './providers/CommandLineParameterProvider.ts';

export { CommandLineParser, type ICommandLineParserOptions } from './providers/CommandLineParser.ts';
export { DynamicCommandLineParser } from './providers/DynamicCommandLineParser.ts';

export { CommandLineConstants } from './Constants.ts';

export { CommandLineHelper } from './CommandLineHelper.ts';
