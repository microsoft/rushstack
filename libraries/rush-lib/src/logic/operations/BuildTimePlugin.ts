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
  duration: number;
  name: string;
  status: OperationStatus;
}

/**
 * @beta
 */
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

  public apply(hooks: PhasedCommandHooks): void {
    hooks.afterExecuteOperations.tap(
      PLUGIN_NAME,
      (result: IExecutionResult, context: ICreateOperationsContext): void => {
        this._buildTimes = _setBuildTimes(result);
      }
    );
  }
}

/**
 * @beta
 */
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

      data.push({
        startTime,
        duration,
        name: operation.associatedProject?.packageName ?? '',
        status: operationResult.status
      });
    }
  }

  data.sort((a, b) => a.startTime - b.startTime);

  for (const { startTime, duration, name, status } of data) {
    if (startTime) {
      // do nothing
    }
    buildTimes.push({
      project: name,
      buildTime: Number(duration.toFixed(2)),
      status: status
    });
  }
  return buildTimes;
}
