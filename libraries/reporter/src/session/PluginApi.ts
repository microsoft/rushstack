// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { IRushDiagnostic } from '../diagnostics/IRushDiagnostic';
import { createRushDiagnostic } from '../diagnostics/createRushDiagnostic';

/**
 * The Rush plugin API version this package implements.
 *
 * @remarks
 * A plugin manifest declares the plugin API version it targets. Compatibility is
 * gated on the major version.
 *
 * @beta
 */
export const RUSH_PLUGIN_API_VERSION: '1.0.0' = '1.0.0';

/**
 * The reporting-relevant fields of a Rush plugin manifest.
 *
 * @beta
 */
export interface IRushPluginManifest {
  /**
   * The plugin's name.
   */
  readonly pluginName: string;

  /**
   * The Rush plugin API version the plugin targets, for example `1.0.0`.
   */
  readonly pluginApiVersion: string;
}

function majorOf(version: string): number {
  return Number.parseInt(version.split('.')[0], 10);
}

/**
 * Returns `true` if a plugin's declared API version is supported.
 *
 * @remarks
 * Compatibility requires an equal major version.
 *
 * @param declaredApiVersion - the version declared by the plugin manifest
 * @param supportedApiVersion - the version supported by Rush; defaults to
 * {@link RUSH_PLUGIN_API_VERSION}
 *
 * @beta
 */
export function isPluginApiVersionSupported(
  declaredApiVersion: string,
  supportedApiVersion: string = RUSH_PLUGIN_API_VERSION
): boolean {
  const declaredMajor: number = majorOf(declaredApiVersion);
  const supportedMajor: number = majorOf(supportedApiVersion);
  return Number.isFinite(declaredMajor) && declaredMajor === supportedMajor;
}

/**
 * Creates the structured migration diagnostic for an incompatible plugin.
 *
 * @remarks
 * An incompatible plugin fails before its `apply()` runs. This diagnostic is
 * emitted at that boundary.
 *
 * @param manifest - the incompatible plugin's manifest
 *
 * @beta
 */
export function createPluginApiIncompatibleDiagnostic(manifest: IRushPluginManifest): IRushDiagnostic {
  return createRushDiagnostic('RUSH_PLUGIN_API_INCOMPATIBLE', {
    parameters: {
      pluginName: { value: manifest.pluginName, privacy: 'public' },
      declaredApiVersion: { value: manifest.pluginApiVersion, privacy: 'public' },
      supportedApiVersion: { value: RUSH_PLUGIN_API_VERSION, privacy: 'public' }
    }
  });
}
