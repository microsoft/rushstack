// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { ITerminal } from '@rushstack/terminal';
import { Colorize, PrintUtilities } from '@rushstack/terminal';

import type { IPhase } from '../../api/CommandLineConfiguration';
import type { IPhasedCommandPlugin, PhasedCommandHooks } from '../../pluginFramework/PhasedCommandHooks';
import type { IExecutionResult, IOperationExecutionResult } from './IOperationExecutionResult';
import { OperationStatus } from './OperationStatus';
import type { CobuildConfiguration } from '../../api/CobuildConfiguration';
import type { OperationExecutionRecord } from './OperationExecutionRecord';
import type { Operation } from './Operation';

const PLUGIN_NAME: 'ConsoleTimelinePlugin' = 'ConsoleTimelinePlugin';

/* Sample output:
==============================================================================================================================
          @rushstack/tree-pattern (build) ###########-------------------------------------------------------------------- 3.3s
          @rushstack/eslint-patch (build) ########----------------------------------------------------------------------- 2.2s
           @rushstack/eslint-patch (test) -------%----------------------------------------------------------------------- 0.0s
@rushstack/eslint-plugin-security (build) ----------########################--------------------------------------------- 6.8s
@rushstack/eslint-plugin-packlets (build) ----------############################----------------------------------------- 8.1s
         @rushstack/eslint-plugin (build) ----------##############################--------------------------------------- 8.7s
           @rushstack/tree-pattern (test) ----------#####---------------------------------------------------------------- 1.2s
 @rushstack/eslint-plugin-security (test) ---------------------------------############---------------------------------- 3.3s
 @rushstack/eslint-plugin-packlets (test) -------------------------------------#####------------------------------------- 1.1s
         @rushstack/eslint-config (build) ---------------------------------------%--------------------------------------- 0.0s
          @rushstack/eslint-plugin (test) ---------------------------------------#############--------------------------- 3.8s
          @rushstack/eslint-config (test) ---------------------------------------%--------------------------------------- 0.0s
     @rushstack/node-core-library (build) ---------------------------------------################################-------- 9.5s
      @rushstack/node-core-library (test) ----------------------------------------------------------------------######### 2.2s
==============================================================================================================================
LEGEND:                                                                                                      Total Work: 50.3s
  [#] Success  [!] Failed/warnings  [%] Skipped/cached/no-op                                                 Wall Clock: 23.7s
                                                                                                       Max Parallelism Used: 5
                                                                                                     Avg Parallelism Used: 2.1
BY PHASE:
      _phase:build 38.6s
       _phase:test 11.7s
*/

/**
 * Phased command plugin that emits a timeline to the console.
 */
export class ConsoleTimelinePlugin implements IPhasedCommandPlugin {
  private readonly _terminal: ITerminal;

  public constructor(terminal: ITerminal) {
    this._terminal = terminal;
  }

  public apply(hooks: PhasedCommandHooks): void {
    hooks.onGraphCreatedAsync.tap(PLUGIN_NAME, (graph, context) => {
      graph.hooks.afterExecuteIterationAsync.tap(
        PLUGIN_NAME,
        (
          status: OperationStatus,
          operationResults: ReadonlyMap<Operation, IOperationExecutionResult>
        ): OperationStatus => {
          _printTimeline({
            terminal: this._terminal,
            result: { status, operationResults },
            cobuildConfiguration: context.cobuildConfiguration
          });
          return status;
        }
      );
    });
  }
}

/**
 * Timeline - a wider column width for printing the timeline summary
 */
const TIMELINE_WIDTH: number = 109;

/**
 * Timeline - symbols representing each operation status
 */
const TIMELINE_CHART_SYMBOLS: Record<OperationStatus, string> = {
  [OperationStatus.Waiting]: '?',
  [OperationStatus.Ready]: '?',
  [OperationStatus.Queued]: '?',
  [OperationStatus.Executing]: '?',
  [OperationStatus.Success]: '#',
  [OperationStatus.SuccessWithWarning]: '!',
  [OperationStatus.Failure]: '!',
  [OperationStatus.Blocked]: '.',
  [OperationStatus.Skipped]: '%',
  [OperationStatus.FromCache]: '%',
  [OperationStatus.NoOp]: '%',
  [OperationStatus.Aborted]: '@'
};

const COBUILD_REPORTABLE_STATUSES: Set<OperationStatus> = new Set([
  OperationStatus.Success,
  OperationStatus.SuccessWithWarning,
  OperationStatus.Failure,
  OperationStatus.Blocked
]);

/**
 * Timeline - colorizer for each operation status
 */
const TIMELINE_CHART_COLORIZER: Record<OperationStatus, (string: string) => string> = {
  [OperationStatus.Waiting]: Colorize.yellow,
  [OperationStatus.Ready]: Colorize.yellow,
  [OperationStatus.Queued]: Colorize.yellow,
  [OperationStatus.Executing]: Colorize.yellow,
  [OperationStatus.Success]: Colorize.green,
  [OperationStatus.SuccessWithWarning]: Colorize.yellow,
  [OperationStatus.Failure]: Colorize.red,
  [OperationStatus.Blocked]: Colorize.red,
  [OperationStatus.Skipped]: Colorize.green,
  [OperationStatus.FromCache]: Colorize.green,
  [OperationStatus.NoOp]: Colorize.gray,
  [OperationStatus.Aborted]: Colorize.red
};

interface ITimelineRecord {
  startTime: number;
  endTime: number;
  durationString: string;
  name: string;
  status: OperationStatus;
  isExecuteByOtherCobuildRunner: boolean;
}

/**
 * @internal
 */
export interface IPrintTimelineParameters {
  terminal: ITerminal;
  result: IExecutionResult;
  cobuildConfiguration?: CobuildConfiguration;
}

interface ICachedDuration {
  cached?: number;
  uncached: number;
}

/**
 * Print a more detailed timeline and analysis of CPU usage for the build.
 * @internal
 */
export function _printTimeline({ terminal, result }: IPrintTimelineParameters): void {
  //
  // Gather the operation records we'll be displaying. Do some inline max()
  // finding to reduce the number of times we need to loop through operations.
  //

  const durationByPhase: Map<IPhase, ICachedDuration> = new Map();

  const data: ITimelineRecord[] = [];
  let longestNameLength: number = 0;
  let longestDurationLength: number = 0;
  let allStart: number = Infinity;
  let allEnd: number = -Infinity;
  let workDuration: number = 0;

  for (const [operation, operationResult] of result.operationResults) {
    if (operationResult.silent) {
      continue;
    }

    const { stopwatch } = operationResult;
    const { _operationMetadataManager: operationMetadataManager } =
      operationResult as OperationExecutionRecord;

    let { startTime } = stopwatch;
    const { endTime } = stopwatch;

    const duration: ICachedDuration = { cached: undefined, uncached: stopwatch.duration };

    if (startTime && endTime) {
      const nameLength: number = operation.name?.length || 0;
      if (nameLength > longestNameLength) {
        longestNameLength = nameLength;
      }
      const wasCobuilt: boolean = !!operationMetadataManager?.wasCobuilt;
      if (
        wasCobuilt &&
        operationResult.status !== OperationStatus.FromCache &&
        operationResult.nonCachedDurationMs
      ) {
        duration.cached = stopwatch.duration;
        startTime = Math.max(0, endTime - operationResult.nonCachedDurationMs);
        duration.uncached = (endTime - startTime) / 1000;
      }

      workDuration += stopwatch.duration;

      const durationString: string = duration.uncached.toFixed(1);
      const durationLength: number = durationString.length;
      if (durationLength > longestDurationLength) {
        longestDurationLength = durationLength;
      }

      if (endTime > allEnd) {
        allEnd = endTime;
      }
      if (startTime < allStart) {
        allStart = startTime;
      }

      const { associatedPhase } = operation;

      if (associatedPhase) {
        let durationRecord: ICachedDuration | undefined = durationByPhase.get(associatedPhase);
        if (!durationRecord) {
          durationRecord = {
            cached: undefined,
            uncached: 0
          };
          durationByPhase.set(associatedPhase, durationRecord);
        }
        if (duration.cached !== undefined) {
          durationRecord.cached = (durationRecord.cached ?? 0) + duration.cached;
        }
        durationRecord.uncached += duration.uncached;
      }

      data.push({
        startTime,
        endTime,
        durationString,
        name: operation.name,
        status: operationResult.status,
        isExecuteByOtherCobuildRunner: wasCobuilt
      });
    }
  }

  data.sort((a, b) => a.startTime - b.startTime);

  //
  // Determine timing for all tasks (wall clock and execution times)
  //

  const allDuration: number = allEnd - allStart;
  const allDurationSeconds: number = allDuration / 1000;

  //
  // Do some calculations to determine what size timeline chart we need.
  //

  const maxWidth: number = PrintUtilities.getConsoleWidth() || TIMELINE_WIDTH;
  const chartWidth: number = maxWidth - longestNameLength - longestDurationLength - 4;
  //
  // Loop through all operations, assembling some statistics about operations and
  // phases, if applicable.
  //

  const busyCpus: number[] = [];
  function getOpenCPU(time: number): number {
    const len: number = busyCpus.length;
    for (let i: number = 0; i < len; i++) {
      if (busyCpus[i] <= time) {
        return i;
      }
    }
    return len;
  }

  // Start with a newline
  terminal.writeLine('');
  terminal.writeLine('='.repeat(maxWidth));

  let hasCobuildSymbol: boolean = false;

  function getChartSymbol(record: ITimelineRecord): string {
    const { isExecuteByOtherCobuildRunner, status } = record;
    if (isExecuteByOtherCobuildRunner && COBUILD_REPORTABLE_STATUSES.has(status)) {
      hasCobuildSymbol = true;
      return 'C';
    }
    return TIMELINE_CHART_SYMBOLS[status];
  }

  for (const record of data) {
    const { startTime, endTime, durationString, name, status } = record;
    // Track busy CPUs
    const openCpu: number = getOpenCPU(startTime);
    busyCpus[openCpu] = endTime;

    // Build timeline chart
    const startIdx: number = Math.floor(((startTime - allStart) * chartWidth) / allDuration);
    const endIdx: number = Math.floor(((endTime - allStart) * chartWidth) / allDuration);
    const length: number = endIdx - startIdx + 1;

    const chart: string =
      Colorize.gray('-'.repeat(startIdx)) +
      TIMELINE_CHART_COLORIZER[status](getChartSymbol(record).repeat(length)) +
      Colorize.gray('-'.repeat(chartWidth - endIdx));
    terminal.writeLine(
      `${Colorize.cyan(name.padStart(longestNameLength))} ${chart} ${Colorize.white(
        durationString.padStart(longestDurationLength) + 's'
      )}`
    );
  }

  terminal.writeLine('='.repeat(maxWidth));

  //
  // Format legend and summary areas
  //

  const usedCpus: number = busyCpus.length;

  const legend: string[] = [
    'LEGEND:',
    '  [#] Success  [!] Failed/warnings  [%] Skipped/cached/no-op',
    '',
    ''
  ];
  if (hasCobuildSymbol) {
    legend[2] = '  [C] Cobuild';
  }

  const summary: string[] = [
    `Total Work: ${workDuration.toFixed(1)}s`,
    `Wall Clock: ${allDurationSeconds.toFixed(1)}s`,
    `Max Parallelism Used: ${usedCpus}`,
    `Avg Parallelism Used: ${(workDuration / allDurationSeconds).toFixed(1)}`
  ];

  terminal.writeLine(legend[0] + summary[0].padStart(maxWidth - legend[0].length));
  terminal.writeLine(legend[1] + summary[1].padStart(maxWidth - legend[1].length));
  terminal.writeLine(legend[2] + summary[2].padStart(maxWidth - legend[2].length));
  terminal.writeLine(legend[3] + summary[3].padStart(maxWidth - legend[3].length));

  //
  // Include time-by-phase, if phases are enabled
  //

  if (durationByPhase.size > 0) {
    terminal.writeLine('BY PHASE:');

    let maxPhaseName: number = 16;
    for (const phase of durationByPhase.keys()) {
      const len: number = phase.name.length;
      if (len > maxPhaseName) {
        maxPhaseName = len;
      }
    }

    for (const [phase, duration] of durationByPhase.entries()) {
      const cachedDurationString: string = duration.cached
        ? `, from cache: ${duration.cached.toFixed(1)}s`
        : '';
      const durationString: string = `${duration.uncached.toFixed(1)}s${cachedDurationString}`;
      terminal.writeLine(`  ${Colorize.cyan(phase.name.padStart(maxPhaseName))} ${durationString}`);
    }
  }

  terminal.writeLine('');
}
