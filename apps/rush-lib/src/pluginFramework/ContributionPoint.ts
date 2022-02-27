// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { IBuildCacheJson } from '../api/BuildCacheConfiguration';
import type { ICloudBuildCacheProvider } from '../logic/buildCache/ICloudBuildCacheProvider';

/**
 * Contribution Points are specified in the "contributes" field of rush-plugin-manifest.json.
 * The plugin registers Contribution Points to extend various functionalities within Rush.js.
 * Here is the enum of all the Contribution Points.
 */
export enum ContributionPoint {
  buildCacheProvider = 'build-cache-provider'
}

/**
 * @beta
 */
export type ICloudBuildCacheProviderFactory = (buildCacheJson: IBuildCacheJson) => ICloudBuildCacheProvider;

/**
 * @beta
 */
export interface IContributeAPIForBuildCacheProvider {
  registerCloudBuildCacheProviderFactory: (
    cacheProviderName: string,
    factory: ICloudBuildCacheProviderFactory
  ) => void;
}
