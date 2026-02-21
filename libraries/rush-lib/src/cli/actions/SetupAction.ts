// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { SetupPackageRegistry } from '../../logic/setup/SetupPackageRegistry.ts';
import type { RushCommandLineParser } from '../RushCommandLineParser.ts';
import { BaseRushAction } from './BaseRushAction.ts';

export class SetupAction extends BaseRushAction {
  public constructor(parser: RushCommandLineParser) {
    super({
      actionName: 'setup',
      summary:
        '(EXPERIMENTAL) Invoke this command before working in a new repo to ensure that any required' +
        ' prerequisites are installed and permissions are configured.',
      documentation:
        '(EXPERIMENTAL) Invoke this command before working in a new repo to ensure that any required' +
        ' prerequisites are installed and permissions are configured.  The initial implementation' +
        ' configures the NPM registry credentials.  More features will be added later.',
      parser
    });
  }

  protected async runAsync(): Promise<void> {
    const setupPackageRegistry: SetupPackageRegistry = new SetupPackageRegistry({
      rushConfiguration: this.rushConfiguration,
      isDebug: this.parser.isDebug,
      syncNpmrcAlreadyCalled: false
    });
    await setupPackageRegistry.checkAndSetupAsync();
  }
}
