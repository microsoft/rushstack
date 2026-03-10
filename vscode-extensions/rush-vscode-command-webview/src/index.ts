// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

export type { IFromExtensionMessage } from './Message/fromExtension.ts';
export type { IRootState } from './store/index.ts';
export type { IToExtensionMessage } from './Message/toExtension.ts';
export type { ICommandLineParameter } from './store/slices/parameter.ts';

export type { CommandLineParameter } from '@rushstack/ts-command-line/lib/parameters/BaseClasses';
export type { CommandLineAction } from '@rushstack/ts-command-line/lib/providers/CommandLineAction';
export { CommandLineParameterKind } from '@rushstack/ts-command-line/lib/parameters/BaseClasses';
