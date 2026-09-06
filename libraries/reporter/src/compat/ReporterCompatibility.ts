// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/**
 * Describes the Rush frontend for compatibility resolution.
 *
 * @beta
 */
export interface IReporterFrontendDescriptor {
  /**
   * The reporter protocol major the frontend implements.
   */
  readonly protocolMajor: number;

  /**
   * Whether the frontend hosts a reporter manager. An old frontend does not.
   */
  readonly hasManager: boolean;
}

/**
 * Describes the selected `rush-lib` engine for compatibility resolution.
 *
 * @beta
 */
export interface IReporterEngineDescriptor {
  /**
   * Whether the engine can emit structured events into a sink. An old engine cannot.
   */
  readonly supportsStructuredSink: boolean;

  /**
   * The reporter protocol major the engine implements, when it is a structured engine.
   */
  readonly protocolMajor?: number;
}

/**
 * The resolved compatibility mode between a frontend and an engine.
 *
 * @beta
 */
export type ReporterCompatibilityMode =
  | 'structured'
  | 'new-frontend-old-engine'
  | 'old-frontend-new-engine'
  | 'legacy';

/**
 * The decision produced by {@link resolveReporterCompatibility}.
 *
 * @beta
 */
export interface IReporterCompatibilityDecision {
  /**
   * The resolved compatibility mode.
   */
  readonly mode: ReporterCompatibilityMode;

  /**
   * Whether the frontend should hand a structured sink to the engine.
   */
  readonly provideSinkToEngine: boolean;

  /**
   * Whether the engine renders legacy output itself, either because it is old or
   * because it is a new engine falling back for an old frontend.
   */
  readonly engineRendersLegacy: boolean;

  /**
   * Whether legacy rendering is the sole visible output. This is always true in
   * the compatibility-adapter phase.
   */
  readonly legacyRenderingVisible: boolean;

  /**
   * A short human-readable explanation, recorded in the detailed log.
   */
  readonly reason: string;
}

/**
 * Resolves how a frontend and engine of possibly different versions cooperate.
 *
 * @remarks
 * A new frontend paired with an old engine uses an output adapter; an old
 * frontend paired with a new engine relies on the engine's legacy fallback. In
 * every case legacy rendering remains the sole visible output during this phase.
 *
 * @param frontend - the frontend descriptor
 * @param engine - the engine descriptor
 *
 * @beta
 */
export function resolveReporterCompatibility(
  frontend: IReporterFrontendDescriptor,
  engine: IReporterEngineDescriptor
): IReporterCompatibilityDecision {
  const frontendIsNew: boolean = frontend.hasManager;
  const engineIsNew: boolean = engine.supportsStructuredSink;
  const majorMatches: boolean =
    frontendIsNew && engineIsNew && engine.protocolMajor === frontend.protocolMajor;

  let mode: ReporterCompatibilityMode;
  let reason: string;

  if (majorMatches) {
    mode = 'structured';
    reason = 'Frontend and engine share the reporter protocol major.';
  } else if (frontendIsNew && !engineIsNew) {
    mode = 'new-frontend-old-engine';
    reason = 'The selected engine does not emit structured events; bridging its legacy output.';
  } else if (!frontendIsNew && engineIsNew) {
    mode = 'old-frontend-new-engine';
    reason = 'The frontend does not host a reporter manager; the engine falls back to legacy rendering.';
  } else if (frontendIsNew && engineIsNew) {
    // Both are structured but the protocol majors differ.
    if ((engine.protocolMajor ?? 0) > frontend.protocolMajor) {
      mode = 'old-frontend-new-engine';
      reason = `The engine protocol major ${engine.protocolMajor} is newer than the frontend; falling back to legacy.`;
    } else {
      mode = 'new-frontend-old-engine';
      reason = `The engine protocol major ${engine.protocolMajor} is older than the frontend; bridging legacy output.`;
    }
  } else {
    mode = 'legacy';
    reason = 'Neither the frontend nor the engine supports structured reporting.';
  }

  return {
    mode,
    provideSinkToEngine: mode === 'structured',
    engineRendersLegacy: mode !== 'structured',
    legacyRenderingVisible: true,
    reason
  };
}
