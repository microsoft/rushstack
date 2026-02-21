// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { CommandLineAction } from './CommandLineAction.ts';

/**
 * @public
 */
export class DynamicCommandLineAction extends CommandLineAction {
  protected override async onExecuteAsync(): Promise<void> {
    // abstract
    // (handled by the external code)
  }
}
