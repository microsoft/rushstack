// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { HeftTask } from './HeftTask';
import type { InternalHeftSession } from './InternalHeftSession';
import type { IHeftConfigurationJsonPhaseSpecifier } from '../utilities/CoreConfigFiles';

/**
 * @internal
 */
export class HeftPhase {
  private _internalHeftSession: InternalHeftSession;
  private _phaseName: string;
  private _phaseSpecifier: IHeftConfigurationJsonPhaseSpecifier;
  private _consumingPhases: Set<HeftPhase> | undefined;
  private _dependencyPhases: Set<HeftPhase> | undefined;
  private _tasks: Set<HeftTask> | undefined;
  private _tasksByName: Map<string, HeftTask> | undefined;

  public constructor(
    internalHeftSession: InternalHeftSession,
    phaseName: string,
    phaseSpecifier: IHeftConfigurationJsonPhaseSpecifier
  ) {
    this._internalHeftSession = internalHeftSession;
    this._phaseName = phaseName;
    this._phaseSpecifier = phaseSpecifier;

    // TODO: Validate the phase name. Allow A-Za-z0-9-_.
  }

  public get phaseName(): string {
    return this._phaseName;
  }

  public get phaseDescription(): string | undefined {
    return this._phaseSpecifier.phaseDescription;
  }

  public get consumingPhases(): ReadonlySet<HeftPhase> {
    if (!this._consumingPhases) {
      // Force initialize all dependency relationships
      // This needs to operate on every phase in the set because the relationships are only specified
      // in the consuming phase.
      const { phases } = this._internalHeftSession;

      for (const phase of phases) {
        phase._consumingPhases = new Set();
      }

      for (const phase of phases) {
        for (const dependency of phase.dependencyPhases) {
          dependency._consumingPhases!.add(phase);
        }
      }
    }
    return this._consumingPhases!;
  }

  public get dependencyPhases(): ReadonlySet<HeftPhase> {
    let dependencyPhases: Set<HeftPhase> | undefined = this._dependencyPhases;
    if (!dependencyPhases) {
      this._dependencyPhases = dependencyPhases = new Set();
      const dependencyNamesSet: Set<string> = new Set(this._phaseSpecifier.phaseDependencies || []);
      for (const dependencyName of dependencyNamesSet) {
        // Skip if we can't find the dependency
        const dependencyPhase: HeftPhase | undefined =
          this._internalHeftSession.phasesByName.get(dependencyName);
        if (!dependencyPhase) {
          throw new Error(`Could not find dependency phase "${dependencyName}".`);
        }
        dependencyPhases.add(dependencyPhase);
      }
    }
    return dependencyPhases;
  }

  public get tasks(): ReadonlySet<HeftTask> {
    this._ensureTasks();
    return this._tasks!;
  }

  public get tasksByName(): ReadonlyMap<string, HeftTask> {
    this._ensureTasks();
    return this._tasksByName!;
  }

  private _ensureTasks(): void {
    if (!this._tasks || !this._tasksByName) {
      this._tasks = new Set();
      this._tasksByName = new Map();
      for (const [taskName, taskSpecifier] of Object.entries(this._phaseSpecifier.tasksByName || {})) {
        const task: HeftTask = new HeftTask(this, taskName, taskSpecifier);
        this._tasks.add(task);
        this._tasksByName.set(taskName, task);
      }
    }
  }
}
