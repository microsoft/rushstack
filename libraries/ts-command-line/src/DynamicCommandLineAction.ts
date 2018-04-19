// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { CommandLineAction } from './CommandLineAction';

/**
 * @public
 */
export class DynamicCommandLineAction extends CommandLineAction {
  protected onDefineParameters(): void { // abstract
    // (handled by the external code)
  }

  protected onExecute(): Promise<void> { // abstract
    // (handled by the external code)
    return Promise.resolve();
  }
}
