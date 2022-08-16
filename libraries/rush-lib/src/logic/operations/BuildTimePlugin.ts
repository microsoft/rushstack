import {
  ICreateOperationsContext,
  IPhasedCommandPlugin,
  PhasedCommandHooks
} from '../../pluginFramework/PhasedCommandHooks';
import { IExecutionResult } from './IOperationExecutionResult';
import { OperationStatus } from './OperationStatus';

const PLUGIN_NAME: 'BuildTimePlugin' = 'BuildTimePlugin';

interface ITimelineRecord {
  startTime: number;
  endTime: number;
  durationString: string;
  name: string;
  status: OperationStatus;
}

export interface IBuildTimeRecord {
  project: string;
  buildTime: number;
  status: OperationStatus;
}

export class BuildTimePlugin implements IPhasedCommandPlugin {
  private _buildTimes: IBuildTimeRecord[];

  public constructor() {
    this._buildTimes = [];
  }

  public apply(hooks: PhasedCommandHooks): IBuildTimeRecord[] {
    hooks.afterExecuteOperations.tap(
      PLUGIN_NAME,
      (result: IExecutionResult, context: ICreateOperationsContext): void => {
        this._buildTimes = _setBuildTimes(result);
      }
    );
    return this._buildTimes;
  }
}

export function _setBuildTimes(result: IExecutionResult): IBuildTimeRecord[] {
  const data: ITimelineRecord[] = [];
  const buildTimes: IBuildTimeRecord[] = [];

  for (const [operation, operationResult] of result.operationResults) {
    if (operation.runner?.silent) {
      continue;
    }

    const { stopwatch } = operationResult;

    const { startTime, endTime } = stopwatch;

    if (startTime && endTime) {
      const { duration } = stopwatch;
      const durationString: string = duration.toFixed(2);

      data.push({
        startTime,
        endTime,
        durationString,
        name: operation.name!.split(' ')[0],
        status: operationResult.status
      });
    }
  }

  data.sort((a, b) => a.startTime - b.startTime);

  for (const { startTime, endTime, durationString, name, status } of data) {
    if (startTime && endTime) {
      // do nothing
    }
    buildTimes.push({
      project: name,
      buildTime: Number(durationString),
      status: status
    });
  }
  return buildTimes;
}
