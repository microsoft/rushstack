// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/** The opt-in `rush.json` daemon block. Environment overrides take precedence. @beta */
export interface IDaemonConfigurationJson {
  /** Enables the separate client. Defaults to false; existing rush/rushx are unchanged. */
  readonly enabled?: boolean;
  /** Idle shutdown timeout in seconds. Defaults to 900. */
  readonly idleTimeoutSeconds?: number;
  /** Start an absent daemon. Defaults to true, but only for opted-in invocations. */
  readonly autoStart?: boolean;
  /** Retains host file observation for warm projects between requests; never schedules builds. Defaults to false. */
  readonly watch?: boolean;
  /** Enables explicit operationSettings[].daemonIpc Node runners for daemon builds. Defaults to false. */
  readonly usePersistentIpcRunners?: boolean;
  /** Maximum admission queue wait in seconds. Defaults to 30. */
  readonly queueTimeoutSeconds?: number;
  /** Idle resource expiration in an attached daemon warm set. Defaults to 300 seconds. */
  readonly warmIdleTimeoutSeconds?: number;
  /** Best-effort sampled RSS budget for an attached warm set, not a hard ceiling. Defaults to 512 MiB. */
  readonly warmMemoryBudgetMB?: number;
  /** Best-effort retained project limit; active/protected work is exempt. Defaults to 20 projects. */
  readonly warmSetMaxProjects?: number;
  /** Prefer measured time-saved * frequency / resident-memory retention over LRU. Never starts scripts. Defaults to false. */
  readonly autoWarmByTelemetry?: boolean;
}

const defaults: Required<IDaemonConfigurationJson> = {
  enabled: false,
  idleTimeoutSeconds: 900,
  autoStart: true,
  watch: false,
  usePersistentIpcRunners: false,
  queueTimeoutSeconds: 30,
  warmIdleTimeoutSeconds: 300,
  warmMemoryBudgetMB: 512,
  warmSetMaxProjects: 20,
  autoWarmByTelemetry: false
};

/** The exact recognized environment names. Unknown RUSH_DAEMON* names are rejected. @beta */
export const daemonEnvironmentVariables: Readonly<Record<keyof IDaemonConfigurationJson, string>> =
  Object.freeze({
    enabled: 'RUSH_DAEMON',
    idleTimeoutSeconds: 'RUSH_DAEMON_IDLE_TIMEOUT_SECONDS',
    autoStart: 'RUSH_DAEMON_AUTO_START',
    watch: 'RUSH_DAEMON_WATCH',
    usePersistentIpcRunners: 'RUSH_DAEMON_USE_PERSISTENT_IPC_RUNNERS',
    queueTimeoutSeconds: 'RUSH_DAEMON_QUEUE_TIMEOUT_SECONDS',
    warmIdleTimeoutSeconds: 'RUSH_DAEMON_WARM_IDLE_TIMEOUT_SECONDS',
    warmMemoryBudgetMB: 'RUSH_DAEMON_WARM_MEMORY_BUDGET_MB',
    warmSetMaxProjects: 'RUSH_DAEMON_WARM_SET_MAX_PROJECTS',
    autoWarmByTelemetry: 'RUSH_DAEMON_AUTO_WARM_BY_TELEMETRY'
  });

/**
 * Validates and snapshots daemon configuration, using environment, then config, then defaults.
 * @remarks Warm policies are consumed by generation-owned WorkspaceWarmSet attachments. They do not alter native CLI execution.
 * @beta
 */
export function resolveDaemonConfiguration(
  json: IDaemonConfigurationJson = {},
  environment: Readonly<Record<string, string | undefined>> = process.env
): Readonly<Required<IDaemonConfigurationJson>> {
  if (typeof json !== 'object' || json === null || Array.isArray(json)) {
    throw new Error('The rush.json daemon block must be an object.');
  }
  for (const key of Object.keys(json)) {
    if (!Object.prototype.hasOwnProperty.call(defaults, key))
      throw new Error(`Unknown daemon option "${key}".`);
  }
  const knownNames: Set<string> = new Set([
    ...Object.values(daemonEnvironmentVariables),
    'RUSH_DAEMON_EXPERIMENTAL'
  ]);
  for (const [name, value] of Object.entries(environment)) {
    if (name.startsWith('RUSH_DAEMON') && value !== undefined && !knownNames.has(name)) {
      throw new Error(`Unknown daemon environment variable "${name}".`);
    }
  }
  const experimental: string | undefined = environment.RUSH_DAEMON_EXPERIMENTAL;
  if (experimental !== undefined && experimental !== '0' && experimental !== '1') {
    throw new Error('RUSH_DAEMON_EXPERIMENTAL must be 0 or 1.');
  }
  return Object.freeze({
    enabled: booleanOption('enabled', json, environment),
    autoStart: booleanOption('autoStart', json, environment),
    watch: booleanOption('watch', json, environment),
    usePersistentIpcRunners: booleanOption('usePersistentIpcRunners', json, environment),
    autoWarmByTelemetry: booleanOption('autoWarmByTelemetry', json, environment),
    idleTimeoutSeconds: numberOption('idleTimeoutSeconds', json, environment),
    queueTimeoutSeconds: numberOption('queueTimeoutSeconds', json, environment),
    warmIdleTimeoutSeconds: numberOption('warmIdleTimeoutSeconds', json, environment),
    warmMemoryBudgetMB: numberOption('warmMemoryBudgetMB', json, environment),
    warmSetMaxProjects: numberOption('warmSetMaxProjects', json, environment)
  });
}

function booleanOption(
  key: 'enabled' | 'autoStart' | 'watch' | 'autoWarmByTelemetry' | 'usePersistentIpcRunners',
  json: IDaemonConfigurationJson,
  environment: Readonly<Record<string, string | undefined>>
): boolean {
  if (json[key] !== undefined && typeof json[key] !== 'boolean')
    throw new Error(`daemon.${key} must be a boolean.`);
  const name: string = daemonEnvironmentVariables[key];
  const value: string | undefined = environment[name];
  if (value === undefined) return json[key] ?? defaults[key];
  if (value !== '0' && value !== '1') throw new Error(`${name} must be 0 or 1.`);
  return value === '1';
}

function numberOption(
  key:
    | 'idleTimeoutSeconds'
    | 'queueTimeoutSeconds'
    | 'warmIdleTimeoutSeconds'
    | 'warmMemoryBudgetMB'
    | 'warmSetMaxProjects',
  json: IDaemonConfigurationJson,
  environment: Readonly<Record<string, string | undefined>>
): number {
  const maximum: number = key.endsWith('Seconds') ? 2147483.647 : Number.MAX_SAFE_INTEGER;
  const minimum: number = key === 'queueTimeoutSeconds' ? 0 : Number.MIN_VALUE;
  const validate = (value: number, label: string): number => {
    if (
      typeof value !== 'number' ||
      !Number.isFinite(value) ||
      value < minimum ||
      value > maximum ||
      (key === 'warmSetMaxProjects' && !Number.isSafeInteger(value))
    ) {
      throw new Error(
        `${label} must be ${key === 'warmSetMaxProjects' ? 'an integer' : 'a finite number'} ${minimum === 0 ? '>=' : '>'} 0 and <= ${maximum}.`
      );
    }
    return value;
  };
  if (json[key] !== undefined) validate(json[key], `daemon.${key}`);
  const name: string = daemonEnvironmentVariables[key];
  const value: string | undefined = environment[name];
  if (value === undefined) return json[key] ?? defaults[key];
  if (value.trim() === '' || !/^\d+(?:\.\d+)?$/.test(value))
    throw new Error(`${name} must be a decimal number.`);
  return validate(Number(value), name);
}
