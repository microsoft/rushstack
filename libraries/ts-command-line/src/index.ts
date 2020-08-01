// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/**
 * An object-oriented command-line parser for TypeScript projects.
 *
 * @packageDocumentation
 */

console.log('ts-command-line.ts  : 1: ' + (new Date().getTime() % 20000) / 1000.0);
export { CommandLineAction, ICommandLineActionOptions } from './providers/CommandLineAction';
console.log('ts-command-line.ts  : 2: ' + (new Date().getTime() % 20000) / 1000.0);

export {
  IBaseCommandLineDefinition,
  IBaseCommandLineDefinitionWithArgument,
  ICommandLineFlagDefinition,
  ICommandLineStringDefinition,
  ICommandLineStringListDefinition,
  ICommandLineIntegerDefinition,
  ICommandLineChoiceDefinition,
  ICommandLineRemainderDefinition
} from './parameters/CommandLineDefinition';

console.log('ts-command-line.ts  : 3: ' + (new Date().getTime() % 20000) / 1000.0);
export {
  CommandLineParameterKind,
  CommandLineParameter,
  CommandLineParameterWithArgument
} from './parameters/BaseClasses';
console.log('ts-command-line.ts  : 4: ' + (new Date().getTime() % 20000) / 1000.0);

export { CommandLineFlagParameter } from './parameters/CommandLineFlagParameter';
console.log('ts-command-line.ts  : 5: ' + (new Date().getTime() % 20000) / 1000.0);
export { CommandLineStringParameter } from './parameters/CommandLineStringParameter';
console.log('ts-command-line.ts  : 6: ' + (new Date().getTime() % 20000) / 1000.0);
export { CommandLineStringListParameter } from './parameters/CommandLineStringListParameter';
console.log('ts-command-line.ts  : 7: ' + (new Date().getTime() % 20000) / 1000.0);
export { CommandLineIntegerParameter } from './parameters/CommandLineIntegerParameter';
console.log('ts-command-line.ts  : 8: ' + (new Date().getTime() % 20000) / 1000.0);
export { CommandLineChoiceParameter } from './parameters/CommandLineChoiceParameter';
console.log('ts-command-line.ts  : 9: ' + (new Date().getTime() % 20000) / 1000.0);
export { CommandLineRemainder } from './parameters/CommandLineRemainder';
console.log('ts-command-line.ts  : 10: ' + (new Date().getTime() % 20000) / 1000.0);

export {
  CommandLineParameterProvider,
  ICommandLineParserData as _ICommandLineParserData
} from './providers/CommandLineParameterProvider';
console.log('ts-command-line.ts  : 11: ' + (new Date().getTime() % 20000) / 1000.0);

export { ICommandLineParserOptions, CommandLineParser } from './providers/CommandLineParser';
console.log('ts-command-line.ts  : 12: ' + (new Date().getTime() % 20000) / 1000.0);

export { DynamicCommandLineAction } from './providers/DynamicCommandLineAction';
console.log('ts-command-line.ts  : 13: ' + (new Date().getTime() % 20000) / 1000.0);

export { DynamicCommandLineParser } from './providers/DynamicCommandLineParser';
console.log('ts-command-line.ts  : 14: ' + (new Date().getTime() % 20000) / 1000.0);
