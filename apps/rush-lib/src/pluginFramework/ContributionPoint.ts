// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { RushConstants } from '../logic/RushConstants';
import { RushSession } from './RushSession';

import type { IBuildCacheJson } from '../api/BuildCacheConfiguration';
import type { ICloudBuildCacheProvider } from '../logic/buildCache/ICloudBuildCacheProvider';
import type { IRushPluginManifest } from './PluginLoader/PluginLoaderBase';

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

interface IContributeAPICallInfo {
  expectedAPICalled: Set<string>;
  actualAPICalled: Set<string>;
}

export class ContributionPointManager {
  private _pluginManifest: IRushPluginManifest;
  private _rushSession: RushSession;
  private _contributionPointToCallInfoMap: Map<ContributionPoint, IContributeAPICallInfo> = new Map();

  private constructor(rushSession: RushSession, pluginManifest: IRushPluginManifest) {
    this._pluginManifest = pluginManifest;
    this._rushSession = rushSession;
    if (!Array.isArray(pluginManifest.contributes)) {
      throw new Error(`${pluginManifest.pluginName} does not specify any contribution points.`);
    }

    for (const contribute of pluginManifest.contributes) {
      switch (contribute) {
        case ContributionPoint.buildCacheProvider: {
          const callInfo: IContributeAPICallInfo = {
            expectedAPICalled: new Set<string>(),
            actualAPICalled: new Set<string>()
          };
          this._contributionPointToCallInfoMap.set(ContributionPoint.buildCacheProvider, callInfo);

          callInfo.expectedAPICalled.add('getContributeAPIForBuildCacheProvider');
          this.getContributeAPIForBuildCacheProvider = () => {
            callInfo.actualAPICalled.add('getContributeAPIForBuildCacheProvider');
            return this._rushSession.getContributeAPIForBuildCacheProvider();
          };
          break;
        }
        default: {
          // no-default
          break;
        }
      }
    }
  }

  public static create(
    rushSession: RushSession,
    pluginManifest: IRushPluginManifest
  ): ContributionPointManager | undefined {
    if (!Array.isArray(pluginManifest.contributes)) {
      return;
    }
    return new ContributionPointManager(rushSession, pluginManifest);
  }

  public getContributeAPIForBuildCacheProvider(): IContributeAPIForBuildCacheProvider {
    const { pluginName } = this._pluginManifest;
    throw new Error(
      `getContributeAPIForBuildCacheProvider is not allowed to be called by ${pluginName}. The plugin must specify contributes ${ContributionPoint.buildCacheProvider} in ${RushConstants.rushPluginManifestFilename}.`
    );
  }

  public validateContributesAPIUsage(): void {
    const errorMessages: string[] = [];
    for (const [contributionPoint, callInfo] of this._contributionPointToCallInfoMap.entries()) {
      const { expectedAPICalled, actualAPICalled } = callInfo;
      const uncalledFunctionNameSet: Set<string> = new Set<string>();
      for (const functionName of expectedAPICalled) {
        if (!actualAPICalled.has(functionName)) {
          uncalledFunctionNameSet.add(functionName);
        }
      }
      if (uncalledFunctionNameSet.size > 0) {
        errorMessages.push(
          `Contributes ${contributionPoint}: ${Array.from(uncalledFunctionNameSet).join(', ')} not called`
        );
      }
    }
    if (errorMessages.length) {
      throw new Error(
        `Not all of the contribution points related API has been called:\n` + errorMessages.join('\n')
      );
    }
  }
}
