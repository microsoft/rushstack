// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { IRushDiagnostic } from '../diagnostics/IRushDiagnostic';
import {
  RUSH_PLUGIN_API_VERSION,
  createPluginApiIncompatibleDiagnostic,
  isPluginApiVersionSupported,
  type IRushPluginManifest
} from '../session/PluginApi';

/**
 * Options for evaluating the plugin apply gate.
 *
 * @beta
 */
export interface IPluginApplyGateOptions {
  /**
   * Whether incompatible plugins are blocked. Defaults to `true`, matching the
   * daemon-aligned major. Set to `false` to model the pre-flip behavior, where
   * incompatible plugins are permitted.
   */
  readonly gateEnabled?: boolean;

  /**
   * The Rush plugin API version Rush supports; defaults to
   * {@link RUSH_PLUGIN_API_VERSION}.
   */
  readonly supportedApiVersion?: string;
}

/**
 * The gate decision for a single plugin.
 *
 * @beta
 */
export interface IPluginApplyDecision {
  /**
   * The plugin manifest that was evaluated.
   */
  readonly manifest: IRushPluginManifest;

  /**
   * Whether the plugin's `apply()` is allowed to run.
   */
  readonly allowed: boolean;

  /**
   * The structured migration diagnostic explaining why the plugin was blocked,
   * present only when `allowed` is `false`.
   */
  readonly diagnostic?: IRushDiagnostic;
}

/**
 * Evaluates the plugin apply gate for a set of plugin manifests before any
 * `apply()` runs.
 *
 * @remarks
 * In the daemon-aligned major an incompatible plugin fails before `apply()` with
 * a structured migration diagnostic. When the gate is disabled (the pre-flip
 * behavior), every plugin is permitted so the phase remains revertible.
 *
 * @param manifests - the plugin manifests to evaluate
 * @param options - the gate options
 *
 * @beta
 */
export function evaluatePluginApplyGate(
  manifests: readonly IRushPluginManifest[],
  options: IPluginApplyGateOptions = {}
): IPluginApplyDecision[] {
  const gateEnabled: boolean = options.gateEnabled ?? true;
  const supportedApiVersion: string = options.supportedApiVersion ?? RUSH_PLUGIN_API_VERSION;

  return manifests.map((manifest: IRushPluginManifest): IPluginApplyDecision => {
    const compatible: boolean = isPluginApiVersionSupported(manifest.pluginApiVersion, supportedApiVersion);
    if (compatible || !gateEnabled) {
      return { manifest, allowed: true };
    }
    return {
      manifest,
      allowed: false,
      diagnostic: createPluginApiIncompatibleDiagnostic(manifest)
    };
  });
}

/**
 * Filters a set of gate decisions down to the plugins that were blocked before
 * `apply()`.
 *
 * @param decisions - the decisions returned by {@link evaluatePluginApplyGate}
 *
 * @beta
 */
export function getBlockedPlugins(decisions: readonly IPluginApplyDecision[]): IPluginApplyDecision[] {
  return decisions.filter((decision: IPluginApplyDecision) => !decision.allowed);
}
