// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { ITerminal } from '@rushstack/node-core-library';

import type { PromptModule as ChangeExperiencePromptModule } from 'inquirer';
export type { PromptModule as ChangeExperiencePromptModule } from 'inquirer';

/**
 * @beta
 */
export interface IChangeExperienceProvider {
  /**
   * If provided, the prompt for comment will be completely replaced with your plugin's implementation.
   * If multiple plugins are registered, the first plugin to provide this implementation will
   * be used and the rest will be ignored.
   */
  promptForComment?(promptModule: ChangeExperiencePromptModule, packageName: string): Promise<string>;

  /**
   * If provided, the prompt for bump type will be completely replaced with your plugin's implementation.
   * If multiple plugins are registered, the first plugin to provide this implementation will
   * be used and the rest will be ignored.
   */
  promptForBumpType?(
    promptModule: ChangeExperiencePromptModule,
    packageName: string,
    bumpOptions: Record<string, string>
  ): Promise<string>;

  /**
   * If provided, your plugin can prompt for additional questions and answers and return them. These
   * keys and values will be added to the `customFields` dictionary in the change file.
   * Prompts will be displayed in the order you define, and if multiple plugins are registered, they
   * will be called in order of registration.
   */
  promptForCustomFields?(
    promptModule: ChangeExperiencePromptModule,
    packageName: string
  ): Promise<Record<string, string | undefined>>;
}
