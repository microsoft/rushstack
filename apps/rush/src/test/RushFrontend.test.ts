// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as rushLib from '@microsoft/rush-lib';
import { ReporterHost, type IReporterEventSink } from '@rushstack/rush-reporter';

import { launchRushFrontendAsync } from '../RushFrontend';
import type { IInitializedRushReporterHost } from '../RushReporterHost';
import { RushVersionSelector } from '../RushVersionSelector';

async function createInitializedHostAsync(
  order: string[],
  reason: IInitializedRushReporterHost['selection']['reason'] = 'pre-major legacy default'
): Promise<IInitializedRushReporterHost> {
  order.push('host');
  const host: ReporterHost = new ReporterHost({ env: {} });
  await host.manager.initializeAsync();
  return {
    host,
    sink: host.getSink(),
    selection: {
      reporter: 'legacy',
      logLevel: 'normal',
      outputs: [],
      commandJson: false,
      enabled: false,
      reporterControlsOwnedByFrontend: true,
      reason
    }
  };
}

describe(launchRushFrontendAsync.name, () => {
  it('creates the authoritative host before invoking the bundled rush-lib and passes only its sink', async () => {
    const order: string[] = [];
    let receivedOptions: Record<string, unknown> | undefined;
    const originalArgv: string[] = process.argv;
    process.argv = ['node', 'rush', 'build', '--reporter=legacy', '--json'];

    try {
      await launchRushFrontendAsync({
        currentPackageVersion: '5.178.1',
        rushVersionToLoad: undefined,
        configuration: undefined,
        launchOptions: { isManaged: false },
        currentRushLib: rushLib,
        initializeReporterHostAsync: () => createInitializedHostAsync(order, 'explicit --reporter'),
        executeCurrentRush: (version, selectedRushLib, launchOptions) => {
          void version;
          void selectedRushLib;
          order.push('engine');
          receivedOptions = launchOptions as unknown as Record<string, unknown>;
        }
      });

      expect(order).toEqual(['host', 'engine']);
      expect(process.argv).toEqual(['node', 'rush', 'build', '--json']);
      expect(receivedOptions?.reporterEventSink).toEqual(
        expect.objectContaining({ emit: expect.any(Function) }) as IReporterEventSink
      );
      expect(receivedOptions).not.toHaveProperty('selection');
      expect(receivedOptions).not.toHaveProperty('host');
      expect(receivedOptions).not.toHaveProperty('manager');
    } finally {
      process.argv = originalArgv;
    }
  });

  it('creates the host before selecting and installing a repository Rush version', async () => {
    const order: string[] = [];
    let receivedSink: IReporterEventSink | undefined;
    const versionSelector: RushVersionSelector = Object.create(RushVersionSelector.prototype);
    versionSelector.ensureRushVersionInstalledAsync = async (version, configuration, launchOptions) => {
      void version;
      void configuration;
      order.push('version-selection');
      receivedSink = (launchOptions as unknown as { reporterEventSink?: IReporterEventSink })
        .reporterEventSink;
    };

    const originalArgv: string[] = process.argv;
    process.argv = ['node', 'rush', 'build', '--reporter=json', '--log-level=debug'];

    try {
      await launchRushFrontendAsync({
        currentPackageVersion: '5.178.1',
        rushVersionToLoad: '5.177.0',
        configuration: undefined,
        launchOptions: { isManaged: true },
        currentRushLib: rushLib,
        initializeReporterHostAsync: async () => {
          const initialized: IInitializedRushReporterHost = await createInitializedHostAsync(order);
          return {
            ...initialized,
            selection: {
              ...initialized.selection,
              reporter: 'json',
              logLevel: 'debug',
              enabled: true,
              reason: 'explicit --reporter'
            }
          };
        },
        createVersionSelector: () => versionSelector
      });

      expect(order).toEqual(['host', 'version-selection']);
      expect(process.argv).toEqual(['node', 'rush', 'build']);
      expect(receivedSink).toEqual(expect.objectContaining({ emit: expect.any(Function) }));
    } finally {
      process.argv = originalArgv;
    }
  });
});
