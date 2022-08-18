// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as os from 'os';
import { ITerminal } from '@rushstack/node-core-library';
import {
  ICreateOperationsContext,
  IPhasedCommandPlugin,
  PhasedCommandHooks
} from '../../pluginFramework/PhasedCommandHooks';
import { IExecutionResult, IOperationExecutionResult } from './IOperationExecutionResult';

import { RushConfiguration } from '../../api/RushConfiguration';
import { JsonFile } from '@rushstack/node-core-library';
import { IBuildTimeRecord, _setBuildTimes } from './BuildTimePlugin';
import { IMachineInfo, ITelemetryData } from '../Telemetry';
import { Operation } from './Operation';

const PLUGIN_NAME: 'DependencyAnalysisPlugin' = 'DependencyAnalysisPlugin';
const MAX_CORES: number = 128;

interface IBuildTimeSavedRecord {
  project: string;
  secondsSaved: number;
}

export interface IDependencyGraphEntry {
  dependencies: string[];
  consumers: string[];
}

export type IDependencyGraph = Record<string, IDependencyGraphEntry>;

interface IDependencyEntry {
  project: string;
  dependencies: string[];
  dependents: string[];
  buildTime: number;
}

export class DependencyAnalysisPlugin implements IPhasedCommandPlugin {
  private readonly _terminal: ITerminal;
  private readonly _rushConfiguration: RushConfiguration;

  public constructor(terminal: ITerminal, rushConfiguration: RushConfiguration) {
    this._terminal = terminal;
    this._rushConfiguration = rushConfiguration;
  }

  public apply(hooks: PhasedCommandHooks): void {
    hooks.afterExecuteOperations.tap(
      PLUGIN_NAME,
      (result: IExecutionResult, context: ICreateOperationsContext): void => {
        _printDependencyAnalysis(this._terminal, result);
      }
    );
  }
}

export function _printDependencyAnalysis(terminal: ITerminal, result: IExecutionResult): void {
  const dependencyGraph: IDependencyGraph = makeDependencyGraph(result);

  const buildTimingMap: Map<string, number> = new Map();

  const buildTimingData: IBuildTimeRecord[] = _setBuildTimes(result);
  buildTimingData.forEach((project: IBuildTimeRecord) => {
    buildTimingMap.set(project.project, project.buildTime);
  });

  const totalBuildTime: number = calculateBuildTime(dependencyGraph, buildTimingMap);
  terminal.writeLine(
    `\nThe build took ${totalBuildTime} seconds to build with ${os.cpus().length} CPU cores.\n`
  );
  const buildTimeList: IBuildTimeSavedRecord[] = [];

  Object.entries(dependencyGraph).forEach(([project]) => {
    const buildTimePlaceHolder: number = buildTimingMap.get(project) ?? -1;
    buildTimingMap.set(project, 0);
    const secondsSaved: number = totalBuildTime - calculateBuildTime(dependencyGraph, buildTimingMap);
    buildTimeList.push({
      project,
      secondsSaved: Number(secondsSaved.toFixed(2))
    });
    buildTimingMap.set(project, buildTimePlaceHolder);
  });

  buildTimeList.sort((a, b) => b.secondsSaved - a.secondsSaved);

  writeDependencyAnalysisSummary(terminal, buildTimeList);
}

export function makeDependencyGraph(result: IExecutionResult): IDependencyGraph {
  const dependencyGraph: IDependencyGraph = {};

  result.operationResults.forEach((operationResults: IOperationExecutionResult, operation: Operation) => {
    const projectName: string = operation.associatedProject?.packageName ?? '';
    const dependencies: string[] = [];
    const consumers: string[] = [];

    operation.dependencies.forEach((dependency: Operation) => {
      dependencies.push(dependency.associatedProject?.packageName ?? '');
    });

    operation.consumers.forEach((consumer: Operation) => {
      consumers.push(consumer.associatedProject?.packageName ?? '');
    });
    const dependencyGraphEntry: IDependencyGraphEntry = {
      dependencies,
      consumers
    };
    dependencyGraph[projectName] = dependencyGraphEntry;
  });

  return dependencyGraph;
}

// buildTimes <project, individual project build time>
function calculateBuildTime(
  dependencyGraph: IDependencyGraph,
  buildTimes: Map<string, number>,
  numberOfCores?: number
): number {
  // accumulativeBuildTimeMap <project, accumulated project build time>
  const accumulativeBuildTimeMap: Map<string, number> = new Map();

  // to simulate the number of CPUs
  if (!numberOfCores) {
    numberOfCores = os.cpus().length;
  }
  const processes: number[] = [];

  // Create a simple Dependency Graph to give the objects types
  const simpleDependencyGraph: IDependencyEntry[] = [];
  Object.entries(dependencyGraph).forEach(([project, details], index) => {
    const dependencyGraphEntry: IDependencyGraphEntry = details as IDependencyGraphEntry;
    const simpleDependencyEntry: IDependencyEntry = {
      project: project,
      dependencies: dependencyGraphEntry.dependencies,
      dependents: dependencyGraphEntry.consumers,
      buildTime: buildTimes.get(project) ?? -1
    };
    simpleDependencyGraph.push(simpleDependencyEntry);
  });

  while (simpleDependencyGraph.length !== 0) {
    // pop the first thing in the list:
    const project: IDependencyEntry = simpleDependencyGraph.shift() as IDependencyEntry;

    // project in scope has no dependencies:
    if (!project.dependencies.length) {
      accumulativeBuildTimeMap.set(project.project, buildTimes.get(project.project) ?? -1);
    } else {
      let knownDependencyCount: number = 0;
      let projectPushed: boolean = false;
      project.dependencies.forEach((dependency) => {
        // we don't have data for all dependencies yet, so push project to end of queue and process later:
        if (!accumulativeBuildTimeMap.has(dependency) && !projectPushed) {
          simpleDependencyGraph.push(project);
          projectPushed = true;
        } else {
          knownDependencyCount += 1;
        }
      });
      // we have data for all dependencies, find the max build time in dependencies (this is the limiting factor)
      if (knownDependencyCount === project.dependencies.length) {
        let firstEndTime: number = 0;
        if (processes.length === numberOfCores) {
          firstEndTime = Math.min(...processes);
          const firstEndTimeInd: number = processes.indexOf(firstEndTime);
          processes.splice(firstEndTimeInd, 1);
        }
        processes.push(firstEndTime + project.buildTime);
        const dependencyBuildTimings: number[] = project.dependencies.map((dependency) => {
          return accumulativeBuildTimeMap.get(dependency) ?? -1;
        });
        const projectStartTime: number = Math.max(firstEndTime, ...dependencyBuildTimings);
        const accumulativeBuildTime: number = projectStartTime + (buildTimes.get(project.project) ?? -1);
        accumulativeBuildTimeMap.set(project.project, Number(accumulativeBuildTime.toFixed(2)));
      }
    }
  }
  const totalBuildTime: number = Math.max(...Array.from(accumulativeBuildTimeMap.values()));
  return totalBuildTime;
}

export function simulateBuildTime(filename: string, terminal: ITerminal): void {
  const telemetryFile: ITelemetryData = JsonFile.load(filename)[0];
  const buildTimes: IBuildTimeRecord[] = telemetryFile.buildTimings ?? [];
  const dependencyGraph: IDependencyGraph = telemetryFile.dependencyGraph ?? {};
  const machineInfo: IMachineInfo = telemetryFile.machineInfo ?? ({} as IMachineInfo);

  const simulatedBuildTimes: number[] = [];
  const buildTimingMap: Map<string, number> = new Map();

  buildTimes.forEach((project: IBuildTimeRecord) => {
    buildTimingMap.set(project.project, project.buildTime);
  });

  const totalBuildTime: number = calculateBuildTime(dependencyGraph, buildTimingMap);
  terminal.writeLine(
    `\nThe original build took ${totalBuildTime} seconds to build with ${machineInfo.machineCores} CPU Cores.\n`
  );

  for (let numCores: number = 1; numCores < MAX_CORES; numCores++) {
    const simulatedBuildTime: number = calculateBuildTime(dependencyGraph, buildTimingMap, numCores);
    if (simulatedBuildTimes.length === 0) {
      simulatedBuildTimes.push(simulatedBuildTime);
    } else {
      if (simulatedBuildTimes[simulatedBuildTimes.length - 1] * 0.999 > simulatedBuildTime) {
        simulatedBuildTimes.push(simulatedBuildTime);
      } else {
        simulatedBuildTimes.push(simulatedBuildTime);
        writeSimulationSummary(terminal, simulatedBuildTimes);
        return;
      }
    }
  }
}

export function dependencyAnalysis(filename: string, terminal: ITerminal): void {
  const telemetryFile: ITelemetryData = JsonFile.load(filename)[0];
  const buildTimes: IBuildTimeRecord[] = telemetryFile.buildTimings ?? [];
  const dependencyGraph: IDependencyGraph = telemetryFile.dependencyGraph ?? {};
  const machineInfo: IMachineInfo = telemetryFile.machineInfo ?? ({} as IMachineInfo);

  const buildTimingMap: Map<string, number> = new Map();

  buildTimes.forEach((project: IBuildTimeRecord) => {
    buildTimingMap.set(project.project, project.buildTime);
  });

  const totalBuildTime: number = calculateBuildTime(dependencyGraph, buildTimingMap);
  terminal.writeLine(
    `\nThe original build took ${totalBuildTime} seconds to build with ${machineInfo.machineCores} CPU Cores.\n`
  );
  const buildTimeList: IBuildTimeSavedRecord[] = [];

  Object.entries(dependencyGraph).forEach(([project]) => {
    const buildTimePlaceHolder: number = buildTimingMap.get(project) ?? -1;
    buildTimingMap.set(project, 0);
    const secondsSaved: number = totalBuildTime - calculateBuildTime(dependencyGraph, buildTimingMap);
    buildTimeList.push({
      project,
      secondsSaved: Number(secondsSaved.toFixed(2))
    });
    buildTimingMap.set(project, buildTimePlaceHolder);
  });

  buildTimeList.sort((a, b) => b.secondsSaved - a.secondsSaved);

  writeDependencyAnalysisSummary(terminal, buildTimeList);
}

function writeSimulationSummary(terminal: ITerminal, simulatedBuildTimes: number[]): void {
  terminal.writeLine(`Simulating build time given number of cores:`);

  simulatedBuildTimes.forEach((value, index) => {
    const padding: string = ' '.repeat(20 - (index + 1).toString().length);
    terminal.writeLine(`  Number of cores: ${index + 1}${padding} ${value} seconds`);
  });

  terminal.writeLine(
    `The optimal number of cores to build your project is ${simulatedBuildTimes.length - 1}`
  );
}

function writeDependencyAnalysisSummary(terminal: ITerminal, buildTimeList: IBuildTimeSavedRecord[]): void {
  let longestTaskName: number = 0;
  for (const project of buildTimeList) {
    const nameLength: number = (project.project || '').length;
    if (nameLength > longestTaskName) {
      longestTaskName = nameLength;
    }
  }

  terminal.writeLine(
    `If the following project had a 0 second build time, then the total build time will change by:`
  );

  for (const project of buildTimeList) {
    const padding: string = ' '.repeat(longestTaskName - (project.project || '').length);
    terminal.writeLine(`  ${project.project}${padding}    ${project.secondsSaved} seconds saved`);
  }
}
