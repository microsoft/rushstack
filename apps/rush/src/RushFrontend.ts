// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { ILaunchOptions } from '@microsoft/rush-lib';

import {
  initializeRushReporterHostAsync,
  stripReporterValueControls,
  type IInitializedRushReporterHost
} from './RushReporterHost';
import { RushCommandSelector } from './RushCommandSelector';
import { RushVersionSelector } from './RushVersionSelector';
import type { MinimalRushConfiguration } from './MinimalRushConfiguration';
import type { IRushFrontendLaunchOptions } from './IRushFrontendLaunchOptions';

export interface IRushFrontendOptions {
  readonly currentPackageVersion: string;
  readonly rushVersionToLoad: string | undefined;
  readonly configuration: MinimalRushConfiguration | undefined;
  readonly launchOptions: ILaunchOptions;
  readonly currentRushLib: typeof import('@microsoft/rush-lib');
  readonly initializeReporterHostAsync?: () => Promise<IInitializedRushReporterHost>;
  readonly createVersionSelector?: (currentPackageVersion: string) => RushVersionSelector;
  readonly executeCurrentRush?: (
    currentPackageVersion: string,
    currentRushLib: typeof import('@microsoft/rush-lib'),
    launchOptions: IRushFrontendLaunchOptions
  ) => void;
}

export async function launchRushFrontendAsync(options: IRushFrontendOptions): Promise<void> {
  const {
    currentPackageVersion,
    rushVersionToLoad,
    configuration,
    launchOptions,
    currentRushLib,
    initializeReporterHostAsync = initializeRushReporterHostAsync,
    createVersionSelector = (version: string) => new RushVersionSelector(version),
    executeCurrentRush = RushCommandSelector.execute
  } = options;

  const reporterHost: IInitializedRushReporterHost = await initializeReporterHostAsync();
  if (!reporterHost.selection.enabled && reporterHost.selection.reason !== 'pre-major legacy default') {
    process.argv = stripReporterValueControls(process.argv);
  }
  const reporterLaunchOptions: IRushFrontendLaunchOptions = {
    ...launchOptions,
    reporterEventSink: reporterHost.sink
  };

  if (rushVersionToLoad && rushVersionToLoad !== currentPackageVersion) {
    const versionSelector: RushVersionSelector = createVersionSelector(currentPackageVersion);
    await versionSelector.ensureRushVersionInstalledAsync(
      rushVersionToLoad,
      configuration,
      reporterLaunchOptions
    );
  } else {
    executeCurrentRush(currentPackageVersion, currentRushLib, reporterLaunchOptions);
  }
}
