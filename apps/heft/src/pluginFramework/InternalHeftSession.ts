// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { Async } from '@rushstack/node-core-library';

import { Constants } from '../utilities/Constants';
import { HeftLifecycle } from './HeftLifecycle';
import { HeftPhaseSession } from './HeftPhaseSession';
import { HeftPhase } from './HeftPhase';
import { CoreConfigFiles, type IHeftConfigurationJson } from '../utilities/CoreConfigFiles';
import type { MetricsCollector } from '../metrics/MetricsCollector';
import type { LoggingManager } from './logging/LoggingManager';
import type { HeftConfiguration } from '../configuration/HeftConfiguration';
import type { HeftTask } from './HeftTask';

/**
 * @internal
 */
export interface IInternalHeftSessionOptions {
  heftConfiguration: HeftConfiguration;
  loggingManager: LoggingManager;
  metricsCollector: MetricsCollector;
  getIsDebugMode(): boolean;
}

/**
 * @internal
 */
export class InternalHeftSession {
  private readonly _options: IInternalHeftSessionOptions;
  private readonly _heftConfigurationJson: IHeftConfigurationJson;
  private readonly _phaseSessionsByName: Map<string, HeftPhaseSession> = new Map();
  private _lifecycle: HeftLifecycle | undefined;
  private _phases: Set<HeftPhase> | undefined;
  private _phasesByName: Map<string, HeftPhase> | undefined;

  private constructor(options: IInternalHeftSessionOptions, heftConfigurationJson: IHeftConfigurationJson) {
    this._options = options;
    this._heftConfigurationJson = heftConfigurationJson;
  }

  public static async initializeAsync(options: IInternalHeftSessionOptions): Promise<InternalHeftSession> {
    const heftConfigurationJson: IHeftConfigurationJson =
      await CoreConfigFiles.loadHeftConfigurationFileForProjectAsync(
        options.heftConfiguration.globalTerminal,
        options.heftConfiguration.buildFolder,
        options.heftConfiguration.rigConfig
      );

    const internalHeftSession: InternalHeftSession = new InternalHeftSession(options, heftConfigurationJson);
    await internalHeftSession.lifecycle.ensureInitializedAsync();

    const tasks: HeftTask[] = [...internalHeftSession.phases]
      .map((p) => [...p.tasks])
      .reduce((accumulator: HeftTask[], current: HeftTask[]) => accumulator.concat(current), []);
    await Async.forEachAsync(
      tasks,
      async (task: HeftTask) => {
        await task.ensureInitializedAsync();
      },
      { concurrency: Constants.maxParallelism }
    );
    for (const phase of internalHeftSession.phases) {
      for (const task of phase.tasks) {
        await task.ensureInitializedAsync();
      }
    }

    return internalHeftSession;
  }

  public get debugMode(): boolean {
    return this._options.getIsDebugMode();
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
    let phaseSession: HeftPhaseSession | undefined = this._phaseSessionsByName.get(phase.phaseName);
    if (!phaseSession) {
      phaseSession = new HeftPhaseSession({ ...this._options, phase });
      this._phaseSessionsByName.set(phase.phaseName, phaseSession);
    }
    return phaseSession;
  }

  private _ensurePhases(): void {
    if (!this._phases || !this._phasesByName) {
      this._phases = new Set();
      this._phasesByName = new Map();
      for (const [phaseName, phaseSpecifier] of Object.entries(
        this._heftConfigurationJson.phasesByName || {}
      )) {
        const phase: HeftPhase = new HeftPhase(this, phaseName, phaseSpecifier);
        this._phases.add(phase);
        this._phasesByName.set(phaseName, phase);
      }
    }
  }
}
