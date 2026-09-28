// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { JsonSchema } from '@rushstack/node-core-library';
import { resolveDaemonConfiguration } from '../DaemonConfiguration';
import schemaJson from '../../schemas/rush.schema.json';

describe('daemon configuration', () => {
  it('is opt-in and uses environment > configuration > defaults', () => {
    expect(resolveDaemonConfiguration({}, {})).toMatchObject({
      enabled: false,
      autoStart: true,
      usePersistentIpcRunners: false,
      idleTimeoutSeconds: 900
    });
    expect(
      resolveDaemonConfiguration(
        { enabled: true, idleTimeoutSeconds: 60 },
        {
          RUSH_DAEMON: '0',
          RUSH_DAEMON_IDLE_TIMEOUT_SECONDS: '42'
        }
      )
    ).toMatchObject({ enabled: false, idleTimeoutSeconds: 42 });
  });

  it.each([
    { RUSH_DAEMON: 'true' },
    { RUSH_DAEMON_ENABLED: '1' },
    { RUSH_DAEMON_IDLE_TIMEOUT_SECONDS: '0' },
    { RUSH_DAEMON_IDLE_TIMEOUT_SECONDS: '2147483.648' },
    { RUSH_DAEMON_QUEUE_TIMEOUT_SECONDS: '-1' },
    { RUSH_DAEMON_WARM_IDLE_TIMEOUT_SECONDS: 'NaN' },
    { RUSH_DAEMON_WARM_MEMORY_BUDGET_MB: 'Infinity' },
    { RUSH_DAEMON_WARM_SET_MAX_PROJECTS: '1.5' },
    { RUSH_DAEMON_AUTO_WARM_BY_TELEMETRY: '' },
    { RUSH_DAEMON_EXPERIMENTAL: 'yes' },
    { RUSH_DAEMON_USE_PERSISTENT_IPC_RUNNERS: 'yes' }
  ])('rejects invalid overrides %j', (environment) => {
    expect(() => resolveDaemonConfiguration({}, environment)).toThrow();
  });

  it.each([
    { unexpected: true },
    { enabled: 'yes' },
    { autoStart: 1 },
    { watch: 'false' },
    { idleTimeoutSeconds: 0 },
    { idleTimeoutSeconds: 2147483.648 },
    { queueTimeoutSeconds: -1 },
    { warmIdleTimeoutSeconds: -1 },
    { warmMemoryBudgetMB: 0 },
    { warmSetMaxProjects: 0.5 },
    { autoWarmByTelemetry: 1 },
    { usePersistentIpcRunners: 'true' },
    { compatiblePlugins: 'rush-example-plugin' },
    { compatiblePlugins: [''] },
    { compatiblePlugins: [' rush-example-plugin'] },
    { compatiblePlugins: ['rush-a-plugin,rush-b-plugin'] },
    { compatiblePlugins: [1] }
  ])('publishes schema rejection for %j', (daemon) => {
    const schema = JsonSchema.fromLoadedObject(schemaJson);
    expect(() =>
      schema.validateObject(
        { rushVersion: '5.179.0', pnpmVersion: '10.27.0', projects: [], daemon },
        'rush.json'
      )
    ).toThrow();
  });

  it('resolves compatible plugin names from the environment, then configuration, then no plugins', () => {
    expect(resolveDaemonConfiguration({}, {}).compatiblePlugins).toEqual([]);
    const configured: string[] = ['rush-a-plugin', 'rush-b-plugin'];
    expect(resolveDaemonConfiguration({ compatiblePlugins: configured }, {}).compatiblePlugins).toEqual(
      configured
    );
    expect(
      resolveDaemonConfiguration(
        { compatiblePlugins: configured },
        { RUSH_DAEMON_COMPATIBLE_PLUGINS: ' rush-c-plugin , rush-d-plugin' }
      ).compatiblePlugins
    ).toEqual(['rush-c-plugin', 'rush-d-plugin']);
    // An empty value is an explicit override that declares no plugins.
    for (const value of ['', ' ']) {
      expect(
        resolveDaemonConfiguration({ compatiblePlugins: configured }, { RUSH_DAEMON_COMPATIBLE_PLUGINS: value })
          .compatiblePlugins
      ).toEqual([]);
    }
    const resolved: readonly string[] = resolveDaemonConfiguration(
      { compatiblePlugins: configured },
      {}
    ).compatiblePlugins;
    expect(Object.isFrozen(resolved)).toBe(true);
    expect(resolved).not.toBe(configured);
  });

  it.each([',', 'rush-a-plugin,', 'rush-a-plugin,,rush-b-plugin', ' , rush-a-plugin'])(
    'rejects compatible plugin override %j with an empty entry',
    (value) => {
      expect(() => resolveDaemonConfiguration({}, { RUSH_DAEMON_COMPATIBLE_PLUGINS: value })).toThrow(
        'RUSH_DAEMON_COMPATIBLE_PLUGINS must be a comma-separated list of plugin names.'
      );
    }
  );

  it.each([
    'rush-example-plugin',
    [''],
    [' rush-example-plugin'],
    ['rush-a-plugin,rush-b-plugin'],
    [1],
    [null]
  ])('rejects configured compatible plugins %j', (compatiblePlugins) => {
    expect(() =>
      resolveDaemonConfiguration({ compatiblePlugins: compatiblePlugins as unknown as string[] }, {})
    ).toThrow('daemon.compatiblePlugins must be an array of plugin names.');
  });

  it('accepts all valid knobs in the published schema', () => {
    JsonSchema.fromLoadedObject(schemaJson).validateObject(
      {
        rushVersion: '5.179.0',
        pnpmVersion: '10.27.0',
        projects: [],
        daemon: resolveDaemonConfiguration({ queueTimeoutSeconds: 0 }, {})
      },
      'rush.json'
    );
    JsonSchema.fromLoadedObject(schemaJson).validateObject(
      {
        rushVersion: '5.179.0',
        pnpmVersion: '10.27.0',
        projects: [],
        daemon: resolveDaemonConfiguration({ compatiblePlugins: ['rush-example-plugin'] }, {})
      },
      'rush.json'
    );
  });
});
