// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { WebpackPlugin } from './WebpackPlugin';

export {
  IWebpackConfigurationWithDevServer,
  IWebpackConfiguration,
  IWebpackBuildStageProperties,
  IWebpackBundleSubstageProperties
} from './shared';

/**
 * @internal
 */
export default new WebpackPlugin();
