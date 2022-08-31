// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { IHeftPlugin } from '@rushstack/heft';

import { WebpackPlugin } from './WebpackPlugin';

export {
  IWebpackConfigurationWithDevServer,
  IWebpackConfiguration,
  IWebpackBuildStageProperties,
  IWebpackBundleSubstageProperties
} from './shared';

/**
 * @public
 */
export default new WebpackPlugin() as IHeftPlugin;
