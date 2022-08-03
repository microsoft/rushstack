// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { Async, InternalError } from '@rushstack/node-core-library';

import { Constants } from '../utilities/Constants';
import { HeftLifecycle } from './HeftLifecycle';
import { HeftPhaseSession } from './HeftPhaseSession';
import { HeftPhase } from './HeftPhase';
import { CoreConfigFiles, type IHeftConfigurationJson } from '../utilities/CoreConfigFiles';
import type { MetricsCollector } from '../metrics/MetricsCollector';
import type { LoggingManager } from './logging/LoggingManager';
import type { HeftConfiguration } from '../configuration/HeftConfiguration';
import type { HeftTask } from './HeftTask';
import type { HeftParameterManager } from './HeftParameterManager';

export interface IInternalHeftSessionOptions {
  heftConfiguration: HeftConfiguration;
  loggingManager: LoggingManager;
  metricsCollector: MetricsCollector;
  debug: boolean;
}

function* getAllTasks(phases: Iterable<HeftPhase>): Iterable<HeftTask> {
  for (const phase of phases) {
    yield* phase.tasks;
  }
}

export class InternalHeftSession {
  private readonly _options: IInternalHeftSessionOptions;
  private readonly _heftConfigurationJson: IHeftConfigurationJson;
  private readonly _phaseSessionsByPhase: Map<HeftPhase, HeftPhaseSession> = new Map();
  private _lifecycle: HeftLifecycle | undefined;
  private _phases: Set<HeftPhase> | undefined;
  private _phasesByName: Map<string, HeftPhase> | undefined;
  private _parameterManager: HeftParameterManager | undefined;

  private constructor(options: IInternalHeftSessionOptions, heftConfigurationJson: IHeftConfigurationJson) {
    this._options = options;
    this._heftConfigurationJson = heftConfigurationJson;
  }

  public static async initializeAsync(options: IInternalHeftSessionOptions): Promise<InternalHeftSession> {
    // Initialize the rig. Must be done before the HeftConfiguration.rigConfig is used.
    await options.heftConfiguration._checkForRigAsync();

    const heftConfigurationJson: IHeftConfigurationJson =
      await CoreConfigFiles.loadHeftConfigurationFileForProjectAsync(
        options.heftConfiguration.globalTerminal,
        options.heftConfiguration.buildFolder,
        options.heftConfiguration.rigConfig
      );

    const internalHeftSession: InternalHeftSession = new InternalHeftSession(options, heftConfigurationJson);
    await internalHeftSession.lifecycle.ensureInitializedAsync();

    const tasks: Iterable<HeftTask> = getAllTasks(internalHeftSession.phases);
    await Async.forEachAsync(
      tasks,
      async (task: HeftTask) => {
        await task.ensureInitializedAsync();
      },
      { concurrency: Constants.maxParallelism }
    );

    return internalHeftSession;
  }

  public get parameterManager(): HeftParameterManager {
    if (!this._parameterManager) {
      throw new InternalError('A parameter manager for the session has not been provided.');
    }
    return this._parameterManager;
  }

  public set parameterManager(value: HeftParameterManager) {
    this._parameterManager = value;
  }

  public get debug(): boolean {
    return this._options.debug;
  }

  public get heftConfiguration(): HeftConfiguration {
    return this._options.heftConfiguration;
  }

  public get loggingManager(): LoggingManager {
    return this._options.loggingManager;
  }

  public get lifecycle(): HeftLifecycle {
    if (!this._lifecycle) {
      this._lifecycle = new HeftLifecycle(this, this._heftConfigurationJson.heftPlugins || []);
    }
    return this._lifecycle;
  }

  public get metricsCollector(): MetricsCollector {
    return this._options.metricsCollector;
  }

  public get phases(): ReadonlySet<HeftPhase> {
    this._ensurePhases();
    return this._phases!;
  }

  public get phasesByName(): ReadonlyMap<string, HeftPhase> {
    this._ensurePhases();
    return this._phasesByName!;
  }

  public getSessionForPhase(phase: HeftPhase): HeftPhaseSession {
    let phaseSession: HeftPhaseSession | undefined = this._phaseSessionsByPhase.get(phase);
    if (!phaseSession) {
      phaseSession = new HeftPhaseSession({
        ...this._options,
        phase,
        parameterManager: this.parameterManager
      });
      this._phaseSessionsByPhase.set(phase, phaseSession);
    }
    return phaseSession;
  }

  private _ensurePhases(): void {
    if (!this._phases || !this._phasesByName) {
      this._phasesByName = new Map();
      for (const [phaseName, phaseSpecifier] of Object.entries(
        this._heftConfigurationJson.phasesByName || {}
      )) {
        const phase: HeftPhase = new HeftPhase(this, phaseName, phaseSpecifier);
        this._phasesByName.set(phaseName, phase);
      }
      this._phases = new Set(this._phasesByName.values());
    }
  }
}
