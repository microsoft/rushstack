// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/**
 * The reporting defaults that change across a Rush major release boundary.
 *
 * @remarks
 * The daemon-aligned major flips the default behavior described in specification
 * §8.1 phase 6. Because every phase is revertible, both the pre-flip and
 * post-flip default sets are represented as data so the flip can be rolled back
 * to the previous phase's opt-in behavior by swapping the active default set.
 *
 * @beta
 */
export interface IReporterMajorDefaults {
  /**
   * Whether environment-based automatic reporter selection is active without an
   * explicit opt-in.
   */
  readonly automaticSelectionEnabledByDefault: boolean;

  /**
   * The legacy terminal APIs removed in this major, for example
   * `ILogger.terminal`.
   */
  readonly removedTerminalApis: readonly string[];

  /**
   * Whether an incompatible plugin fails before its `apply()` runs.
   */
  readonly gateIncompatiblePluginsBeforeApply: boolean;

  /**
   * Whether the legacy renderer is still available.
   */
  readonly legacyRendererRetained: boolean;

  /**
   * Whether the legacy verbosity aliases (`--quiet`, `--verbose`, `--debug`)
   * remain.
   */
  readonly verbosityAliasesRetained: boolean;

  /**
   * Whether the legacy `AlreadyReportedError` sentinel bridge remains.
   */
  readonly sentinelBridgeRetained: boolean;

  /**
   * The environment variable that forces the emergency legacy fallback.
   */
  readonly emergencyFallbackEnvVar: string;

  /**
   * The reporter name that the emergency fallback selects.
   */
  readonly emergencyFallbackReporterName: string;
}

/**
 * The legacy terminal APIs removed by the daemon-aligned major, per
 * specification §5.3.
 *
 * @beta
 */
export const REMOVED_TERMINAL_APIS: readonly string[] = ['ILogger.terminal', 'RushSession.terminalProvider'];

/**
 * The reporting defaults before the daemon-aligned major flip.
 *
 * @remarks
 * Automatic selection is opt-in only, the legacy terminal APIs still exist, and
 * incompatible plugins are not gated. The legacy renderer, verbosity aliases,
 * and sentinel bridge are retained. Reverting the flip restores these defaults.
 *
 * @beta
 */
export const PRE_FLIP_REPORTER_DEFAULTS: IReporterMajorDefaults = {
  automaticSelectionEnabledByDefault: false,
  removedTerminalApis: [],
  gateIncompatiblePluginsBeforeApply: false,
  legacyRendererRetained: true,
  verbosityAliasesRetained: true,
  sentinelBridgeRetained: true,
  emergencyFallbackEnvVar: 'RUSH_REPORTER',
  emergencyFallbackReporterName: 'legacy'
};

/**
 * The reporting defaults in the daemon-aligned major release.
 *
 * @remarks
 * Automatic selection is enabled by default, the legacy terminal APIs are
 * removed, and incompatible plugins fail before `apply()`. The legacy renderer,
 * verbosity aliases, and sentinel bridge are still retained for this major; they
 * are removed only in the later cleanup major.
 *
 * @beta
 */
export const DAEMON_ALIGNED_MAJOR_REPORTER_DEFAULTS: IReporterMajorDefaults = {
  automaticSelectionEnabledByDefault: true,
  removedTerminalApis: REMOVED_TERMINAL_APIS,
  gateIncompatiblePluginsBeforeApply: true,
  legacyRendererRetained: true,
  verbosityAliasesRetained: true,
  sentinelBridgeRetained: true,
  emergencyFallbackEnvVar: 'RUSH_REPORTER',
  emergencyFallbackReporterName: 'legacy'
};

/**
 * Returns `true` if the named legacy terminal API is removed under the given
 * defaults.
 *
 * @param api - the API identifier, for example `ILogger.terminal`
 * @param defaults - the defaults to check; defaults to
 * {@link DAEMON_ALIGNED_MAJOR_REPORTER_DEFAULTS}
 *
 * @beta
 */
export function isTerminalApiRemoved(
  api: string,
  defaults: IReporterMajorDefaults = DAEMON_ALIGNED_MAJOR_REPORTER_DEFAULTS
): boolean {
  return defaults.removedTerminalApis.indexOf(api) >= 0;
}

/**
 * Returns `true` if the environment requests the emergency legacy fallback,
 * for example `RUSH_REPORTER=legacy`.
 *
 * @param env - the environment variables
 * @param defaults - the defaults that name the fallback control; defaults to
 * {@link DAEMON_ALIGNED_MAJOR_REPORTER_DEFAULTS}
 *
 * @beta
 */
export function isEmergencyLegacyFallback(
  env: Record<string, string | undefined>,
  defaults: IReporterMajorDefaults = DAEMON_ALIGNED_MAJOR_REPORTER_DEFAULTS
): boolean {
  return env[defaults.emergencyFallbackEnvVar] === defaults.emergencyFallbackReporterName;
}

/**
 * The context used to decide whether automatic reporter selection runs.
 *
 * @beta
 */
export interface IAutomaticSelectionContext {
  /**
   * Whether the user explicitly opted in, for example via `--reporter` or
   * `RUSH_REPORTER`.
   */
  readonly explicitOptIn?: boolean;

  /**
   * Whether the experimental repository setting enabled the new reporter path.
   */
  readonly experimentalSettingEnabled?: boolean;

  /**
   * Whether the emergency legacy fallback is active.
   */
  readonly emergencyLegacyFallback?: boolean;
}

/**
 * Determines whether environment-based automatic reporter selection should run.
 *
 * @remarks
 * The emergency legacy fallback always wins. Otherwise, once the daemon-aligned
 * major has flipped the default, automatic selection runs unconditionally; before
 * the flip it runs only when the user opted in explicitly or through the
 * experimental setting.
 *
 * @param defaults - the active major defaults
 * @param context - the opt-in and fallback context
 *
 * @beta
 */
export function isAutomaticSelectionEnabled(
  defaults: IReporterMajorDefaults,
  context: IAutomaticSelectionContext = {}
): boolean {
  if (context.emergencyLegacyFallback) {
    return false;
  }
  if (defaults.automaticSelectionEnabledByDefault) {
    return true;
  }
  return Boolean(context.explicitOptIn || context.experimentalSettingEnabled);
}
