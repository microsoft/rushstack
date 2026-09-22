// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as semver from 'semver';

import type { IRushDiagnostic } from '../diagnostics/IRushDiagnostic';
import { createRushDiagnostic } from '../diagnostics/createRushDiagnostic';

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
   * The semver range of Rush versions supported by the plugin.
   */
  readonly rushVersionRange: string;
}

/**
 * Returns `true` if the running Rush version satisfies a plugin's declared range.
 *
 * @param rushVersionRange - the semver range declared by the plugin manifest
 * @param rushVersion - the running Rush version
 *
 * @beta
 */
export function isRushVersionSupported(rushVersionRange: string, rushVersion: string): boolean {
  if (rushVersionRange.trim().length === 0) {
    return false;
  }
  const validRushVersion: string | null = semver.valid(rushVersion);
  const validRushVersionRange: string | null = semver.validRange(rushVersionRange);
  return (
    validRushVersion !== null &&
    validRushVersionRange !== null &&
    semver.satisfies(validRushVersion, validRushVersionRange, { includePrerelease: true })
  );
}

/**
 * Creates the structured migration diagnostic for an incompatible plugin.
 *
 * @remarks
 * An incompatible plugin fails before its `apply()` runs. This diagnostic is
 * emitted at that boundary.
 *
 * @param manifest - the incompatible plugin's manifest
 * @param rushVersion - the running Rush version
 *
 * @beta
 */
export function createPluginApiIncompatibleDiagnostic(
  manifest: IRushPluginManifest,
  rushVersion: string
): IRushDiagnostic {
  return createRushDiagnostic('RUSH_PLUGIN_API_INCOMPATIBLE', {
    parameters: {
      pluginName: { value: manifest.pluginName, privacy: 'public' },
      rushVersionRange: { value: manifest.rushVersionRange, privacy: 'public' },
      rushVersion: { value: rushVersion, privacy: 'public' }
    }
  });
}
