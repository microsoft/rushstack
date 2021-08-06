// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { HeftConfiguration, HeftSession, IHeftPlugin } from '@rushstack/heft';

const PLUGIN_NAME: string = 'StorybookPlugin';

export class StorybookPlugin implements IHeftPlugin {
  public readonly pluginName: string = PLUGIN_NAME;

  /**
   * Generate typings for Sass files before TypeScript compilation.
   */
  public apply(heftSession: HeftSession, heftConfiguration: HeftConfiguration): void {}
}
