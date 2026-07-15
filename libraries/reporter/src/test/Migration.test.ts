// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import {
  REPORTER_MIGRATION_PHASES,
  getReporterMigrationPhase,
  REMOVED_TERMINAL_APIS,
  PRE_FLIP_REPORTER_DEFAULTS,
  DAEMON_ALIGNED_MAJOR_REPORTER_DEFAULTS,
  isTerminalApiRemoved,
  isEmergencyLegacyFallback,
  isAutomaticSelectionEnabled,
  evaluatePluginApplyGate,
  getBlockedPlugins,
  type ReporterMigrationPhaseId,
  type IReporterMigrationPhase,
  type IPluginApplyDecision,
  type IRushPluginManifest
} from '../index';

describe('reporter migration phases', () => {
  it('lists the seven specification §8.1 phases in order', () => {
    expect(REPORTER_MIGRATION_PHASES.map((phase: IReporterMigrationPhase) => phase.id)).toEqual([
      'contractsAndBaselines',
      'bootstrapAndCompatAdapters',
      'shadowStructuredEmission',
      'optInReporters',
      'heftProtocolTrack',
      'daemonAlignedMajorFlip',
      'laterCleanupMajor'
    ]);
    REPORTER_MIGRATION_PHASES.forEach((phase: IReporterMigrationPhase, index: number) => {
      expect(phase.ordinal).toBe(index + 1);
    });
  });

  it('keeps every phase independently releasable and revertible', () => {
    for (const phase of REPORTER_MIGRATION_PHASES) {
      expect(phase.independentlyReleasable).toBe(true);
      expect(phase.revertible).toBe(true);
    }
  });

  it('resolves a phase by id and throws for an unknown id', () => {
    expect(getReporterMigrationPhase('daemonAlignedMajorFlip').ordinal).toBe(6);
    expect(() => getReporterMigrationPhase('nope' as unknown as ReporterMigrationPhaseId)).toThrow(
      /Unknown reporter migration phase/
    );
  });
});

describe('daemon-aligned major default flip', () => {
  it('enables environment-based automatic selection by default after the flip', () => {
    expect(DAEMON_ALIGNED_MAJOR_REPORTER_DEFAULTS.automaticSelectionEnabledByDefault).toBe(true);
    expect(PRE_FLIP_REPORTER_DEFAULTS.automaticSelectionEnabledByDefault).toBe(false);

    // After the flip, automatic selection runs with no explicit opt-in.
    expect(isAutomaticSelectionEnabled(DAEMON_ALIGNED_MAJOR_REPORTER_DEFAULTS)).toBe(true);

    // Before the flip, it runs only on explicit opt-in or the experimental setting.
    expect(isAutomaticSelectionEnabled(PRE_FLIP_REPORTER_DEFAULTS)).toBe(false);
    expect(isAutomaticSelectionEnabled(PRE_FLIP_REPORTER_DEFAULTS, { explicitOptIn: true })).toBe(true);
    expect(
      isAutomaticSelectionEnabled(PRE_FLIP_REPORTER_DEFAULTS, { experimentalSettingEnabled: true })
    ).toBe(true);
  });

  it('keeps the emergency legacy fallback overriding the flipped default', () => {
    expect(isEmergencyLegacyFallback({ RUSH_REPORTER: 'legacy' })).toBe(true);
    expect(isEmergencyLegacyFallback({ RUSH_REPORTER: 'default' })).toBe(false);
    expect(isEmergencyLegacyFallback({})).toBe(false);

    // The fallback wins even when the flipped default would enable automatic selection.
    expect(
      isAutomaticSelectionEnabled(DAEMON_ALIGNED_MAJOR_REPORTER_DEFAULTS, { emergencyLegacyFallback: true })
    ).toBe(false);
  });

  it('removes the legacy terminal APIs in the daemon-aligned major but not before', () => {
    expect(REMOVED_TERMINAL_APIS).toEqual(['ILogger.terminal', 'RushSession.terminalProvider']);
    expect(DAEMON_ALIGNED_MAJOR_REPORTER_DEFAULTS.removedTerminalApis).toEqual(REMOVED_TERMINAL_APIS);
    expect(PRE_FLIP_REPORTER_DEFAULTS.removedTerminalApis).toEqual([]);

    expect(isTerminalApiRemoved('ILogger.terminal')).toBe(true);
    expect(isTerminalApiRemoved('RushSession.terminalProvider')).toBe(true);
    expect(isTerminalApiRemoved('ILogger.terminal', PRE_FLIP_REPORTER_DEFAULTS)).toBe(false);
    expect(isTerminalApiRemoved('ISomethingElse')).toBe(false);
  });

  it('retains the legacy renderer, verbosity aliases, and sentinel bridge across the flip', () => {
    for (const defaults of [PRE_FLIP_REPORTER_DEFAULTS, DAEMON_ALIGNED_MAJOR_REPORTER_DEFAULTS]) {
      expect(defaults.legacyRendererRetained).toBe(true);
      expect(defaults.verbosityAliasesRetained).toBe(true);
      expect(defaults.sentinelBridgeRetained).toBe(true);
      expect(defaults.emergencyFallbackEnvVar).toBe('RUSH_REPORTER');
      expect(defaults.emergencyFallbackReporterName).toBe('legacy');
    }
  });
});

describe('plugin apply gate', () => {
  const compatible: IRushPluginManifest = { pluginName: 'good', pluginApiVersion: '1.2.0' };
  const incompatible: IRushPluginManifest = { pluginName: 'bad', pluginApiVersion: '2.0.0' };

  it('fails incompatible plugins with a structured migration diagnostic before apply()', () => {
    const decisions: IPluginApplyDecision[] = evaluatePluginApplyGate([compatible, incompatible]);

    const good: IPluginApplyDecision = decisions[0];
    expect(good.allowed).toBe(true);
    expect(good.diagnostic).toBeUndefined();

    const bad: IPluginApplyDecision = decisions[1];
    expect(bad.allowed).toBe(false);
    expect(bad.diagnostic?.code).toBe('RUSH_PLUGIN_API_INCOMPATIBLE');

    const blocked: IPluginApplyDecision[] = getBlockedPlugins(decisions);
    expect(blocked).toHaveLength(1);
    expect(blocked[0].manifest.pluginName).toBe('bad');
  });

  it('permits incompatible plugins when the gate is disabled, keeping the phase revertible', () => {
    const decisions: IPluginApplyDecision[] = evaluatePluginApplyGate([compatible, incompatible], {
      gateEnabled: false
    });

    expect(decisions.every((decision: IPluginApplyDecision) => decision.allowed)).toBe(true);
    expect(getBlockedPlugins(decisions)).toHaveLength(0);
  });

  it('honors an explicit supported API version', () => {
    const decisions: IPluginApplyDecision[] = evaluatePluginApplyGate([incompatible], {
      supportedApiVersion: '2.4.0'
    });
    expect(decisions[0].allowed).toBe(true);
  });
});
