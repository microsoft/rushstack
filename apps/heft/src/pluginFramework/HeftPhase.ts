// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { HeftTask, type IHeftTask } from './HeftTask';
import type { InternalHeftSession } from './InternalHeftSession';
import type { IHeftConfigurationJsonPhaseSpecifier } from '../utilities/CoreConfigFiles';
import type { IDeleteOperation } from '../plugins/DeleteFilesPlugin';

const RESERVED_PHASE_NAMES: Set<string> = new Set(['lifecycle']);

/**
 * @public
 */
export interface IHeftPhase {
  readonly phaseName: string;
  readonly phaseDescription: string | undefined;
  cleanFiles: ReadonlySet<IDeleteOperation>;
  consumingPhases: ReadonlySet<IHeftPhase>;
  dependencyPhases: ReadonlySet<IHeftPhase>;
  tasks: ReadonlySet<IHeftTask>;
  tasksByName: ReadonlyMap<string, IHeftTask>;
}

/**
 * @internal
 */
export class HeftPhase implements IHeftPhase {
  #internalHeftSession: InternalHeftSession;
  #phaseName: string;
  #phaseSpecifier: IHeftConfigurationJsonPhaseSpecifier;
  #consumingPhases: Set<HeftPhase> | undefined;
  #dependencyPhases: Set<HeftPhase> | undefined;
  #cleanFiles: Set<IDeleteOperation> | undefined;
  #tasks: Set<HeftTask> | undefined;
  #tasksByName: Map<string, HeftTask> | undefined;

  public constructor(
    internalHeftSession: InternalHeftSession,
    phaseName: string,
    phaseSpecifier: IHeftConfigurationJsonPhaseSpecifier
  ) {
    this.#internalHeftSession = internalHeftSession;
    this.#phaseName = phaseName;
    this.#phaseSpecifier = phaseSpecifier;

    this._validate();
  }

  /**
   * The name of the phase.
   */
  public get phaseName(): string {
    return this.#phaseName;
  }

  /**
   * The description of the phase.
   */
  public get phaseDescription(): string | undefined {
    return this.#phaseSpecifier.phaseDescription;
  }

  /**
   * Returns delete operations that are specified on the phase.
   */
  public get cleanFiles(): ReadonlySet<IDeleteOperation> {
    if (!this.#cleanFiles) {
      this.#cleanFiles = new Set(this.#phaseSpecifier.cleanFiles || []);
    }
    return this.#cleanFiles;
  }

  /**
   * Returns the set of phases that depend on this phase.
   */
  public get consumingPhases(): ReadonlySet<HeftPhase> {
    if (!this.#consumingPhases) {
      // Force initialize all dependency relationships
      // This needs to operate on every phase in the set because the relationships are only specified
      // in the consuming phase.
      const { phases } = this.#internalHeftSession;

      for (const phase of phases) {
        phase.#consumingPhases = new Set();
      }

      for (const phase of phases) {
        for (const dependency of phase.dependencyPhases) {
          dependency.#consumingPhases!.add(phase);
        }
      }
    }
    return this.#consumingPhases!;
  }

  /**
   * Returns the set of phases that this phase depends on.
   */
  public get dependencyPhases(): ReadonlySet<HeftPhase> {
    let dependencyPhases: Set<HeftPhase> | undefined = this.#dependencyPhases;
    if (!dependencyPhases) {
      this.#dependencyPhases = dependencyPhases = new Set();
      const dependencyNamesSet: Set<string> = new Set(this.#phaseSpecifier.phaseDependencies || []);
      for (const dependencyName of dependencyNamesSet) {
        // Skip if we can't find the dependency
        const dependencyPhase: HeftPhase | undefined =
          this.#internalHeftSession.phasesByName.get(dependencyName);
        if (!dependencyPhase) {
          throw new Error(`Could not find dependency phase ${JSON.stringify(dependencyName)}.`);
        }
        dependencyPhases.add(dependencyPhase);
      }
    }
    return dependencyPhases;
  }

  /**
   * Returns the set of tasks contained by this phase.
   */
  public get tasks(): ReadonlySet<HeftTask> {
    this._ensureTasks();
    return this.#tasks!;
  }

  /**
   * Returns a map of tasks by name.
   */
  public get tasksByName(): ReadonlyMap<string, HeftTask> {
    this._ensureTasks();
    return this.#tasksByName!;
  }

  private _ensureTasks(): void {
    if (!this.#tasks || !this.#tasksByName) {
      this.#tasks = new Set();
      this.#tasksByName = new Map();
      for (const [taskName, taskSpecifier] of Object.entries(this.#phaseSpecifier.tasksByName || {})) {
        const task: HeftTask = new HeftTask(this, taskName, taskSpecifier);
        this.#tasks.add(task);
        this.#tasksByName.set(taskName, task);
      }
    }
  }

  private _validate(): void {
    if (RESERVED_PHASE_NAMES.has(this.phaseName)) {
      throw new Error(
        `Phase name ${JSON.stringify(this.phaseName)} is reserved and cannot be used as a phase name.`
      );
    }
  }
}
