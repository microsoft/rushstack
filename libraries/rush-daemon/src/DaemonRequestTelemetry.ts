// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { PerformanceEntry } from 'node:perf_hooks';

import { PackageJsonLookup } from '@rushstack/node-core-library';
import type {
  IPhasedCommandEngineLogTelemetryOptions,
  ITelemetryData,
  PhasedCommandEngine
} from '@microsoft/rush-lib';

import type { IDaemonRequestLifecycleInfo } from './DaemonRequestDispatcher';
import type {
  IPhasedRequestTelemetryMeasure,
  IPhasedRequestTelemetryReport,
  IPhasedRequestTelemetrySink
} from './PhasedRequestTelemetry';
import { getWorkspaceGenerationToken } from './WorkspaceGeneration';
import type { IWorkspaceSession } from './WorkspaceSession';

const DAEMON_PACKAGE_VERSION: string = PackageJsonLookup.loadOwnPackageJson(__dirname).version;
const MILLISECONDS_PER_SECOND: number = 1000;
const GENERATION_TOKEN_PREFIX_LENGTH: number = 8;
const NATIVE_ITERATION_MEASURE_PREFIX: string = 'rush:executionManager:';
const DAEMON_MEASURE_PREFIX: string = 'rush:daemon:';
const RUSH_MEASURE_PREFIX: string = 'rush:';

/**
 * Request environment variables that attribute an entry to its caller. They are read from the request, never from
 * the daemon's own environment. Each is in `workspaceFingerprintIgnoredEnvironmentVariables` and
 * `workspaceRequestScopedEnvironmentVariables`, so a request that sets, changes or unsets one keeps the warm
 * daemon, and the daemon's own `process.env` never has them. Native Rush rejects unknown `RUSH_` variables, so the
 * tag variable does not use that prefix.
 */
const ATTRIBUTION_VARIABLES: Readonly<Record<string, string>> = {
  agentSessionId: 'COPILOT_AGENT_SESSION_ID',
  telemetryTag: 'ODSP_TELEMETRY_TAG'
};

/** When the warm engine was created, as `performance.now()` values. */
export interface IDaemonEngineCreationTiming {
  readonly startTimeMs: number;
  readonly endTimeMs: number;
}

/** What the production resolver knows about one resolved request. */
export interface IDaemonRequestTelemetryContext {
  /** The request's own parsed command. */
  readonly command: Pick<PhasedCommandEngine, 'createTelemetryData'>;
  readonly logTelemetry: (data: ITelemetryData, options?: IPhasedCommandEngineLogTelemetryOptions) => void;
  readonly workspaceSession: IWorkspaceSession;
  readonly lifecycleInfo: IDaemonRequestLifecycleInfo | undefined;
  readonly resolveStartTimeMs: number;
  readonly resolveEndTimeMs: number;
  /** Set only for the request whose handling created the warm engine. */
  readonly engineCreation: IDaemonEngineCreationTiming | undefined;
  /** Returns the 1-based position of the entry among those the warm engine logged. */
  readonly getRequestIndex: () => number;
}

/**
 * Creates the sink that logs one native telemetry entry for a request served by the warm engine.
 */
export function createDaemonRequestTelemetrySink(
  context: IDaemonRequestTelemetryContext
): IPhasedRequestTelemetrySink {
  return {
    logRequest: (report: IPhasedRequestTelemetryReport) => {
      try {
        context.logTelemetry(createDaemonRequestTelemetryData(context, report), {
          servedByIteration: report.scheduled
        });
      } catch (error) {
        process.stderr.write(
          `Unable to log telemetry for request ${report.request.requestId}: ${(error as Error).message}\n`
        );
      }
    }
  };
}

/**
 * Builds the native telemetry entry for one request.
 *
 * @remarks
 * Times are relative to the moment the daemon received the request, as a native command's are relative to its
 * process start. `durationInSeconds` has the native meaning: it starts when the graph iteration was scheduled, or,
 * for a request that needed no iteration, when its batch began handling it. `bootDurationSeconds` and
 * `totalDurationSeconds` also start at the daemon's receipt of the request, so they exclude the client's own
 * startup and connection time.
 */
export function createDaemonRequestTelemetryData(
  context: IDaemonRequestTelemetryContext,
  report: IPhasedRequestTelemetryReport
): ITelemetryData {
  const timeOriginMs: number = context.lifecycleInfo?.receivedTimeMs ?? context.resolveStartTimeMs;
  const durationStartTimeMs: number = report.iterationStartTimeMs ?? report.executionStartTimeMs;
  return context.command.createTelemetryData({
    records: report.records,
    succeeded: report.result.exitCode === 0,
    durationInSeconds: toSeconds(report.resultTimeMs - durationStartTimeMs),
    timeOriginMs,
    extraData: {
      ...getDaemonExtraData(context, report),
      durationBasis: report.iterationStartTimeMs === undefined ? 'batch' : 'iteration',
      bootDurationSeconds: toSeconds(durationStartTimeMs - timeOriginMs),
      totalDurationSeconds: toSeconds(report.resultTimeMs - timeOriginMs),
      ...getRequestAttribution(report.request.environment)
    },
    performanceEntries: [
      ...getLifecycleEntries(context),
      ...report.measures.map(createMeasureEntry),
      ...getNativeEntries(context, report, durationStartTimeMs)
    ]
  });
}

function getDaemonExtraData(
  context: IDaemonRequestTelemetryContext,
  report: IPhasedRequestTelemetryReport
): Record<string, string | number | boolean> {
  const { lifecycleInfo, workspaceSession } = context;
  const queueWait: IPhasedRequestTelemetryMeasure | undefined = report.measures.find(
    (measure: IPhasedRequestTelemetryMeasure) => measure.name === `${DAEMON_MEASURE_PREFIX}queueWait`
  );
  const generation: number | undefined = workspaceSession.metadata.generation;
  return {
    daemon: true,
    daemonVersion: DAEMON_PACKAGE_VERSION,
    daemonPid: process.pid,
    requestId: report.request.requestId,
    ...(generation === undefined ? {} : { generation }),
    generationToken: getWorkspaceGenerationToken(workspaceSession).slice(0, GENERATION_TOKEN_PREFIX_LENGTH),
    ...(lifecycleInfo === undefined ? {} : { reloadTier: lifecycleInfo.reloadTier }),
    requestIndex: context.getRequestIndex(),
    batchSize: report.batchSize,
    queueWaitSeconds: queueWait ? toSeconds(queueWait.endTimeMs - queueWait.startTimeMs) : 0,
    graphWasInitialized: context.engineCreation === undefined,
    persistentIpcRunners: workspaceSession.rushConfiguration.daemon.usePersistentIpcRunners,
    scheduled: report.scheduled,
    earlyResult: report.earlyResult,
    countRetained: report.countRetained,
    exitCode: report.result.exitCode,
    outcome: report.result.outcome
  };
}

function getRequestAttribution(
  environment: Readonly<Record<string, string>>
): Record<string, string | number | boolean> {
  const attribution: Record<string, string> = {};
  for (const [field, variable] of Object.entries(ATTRIBUTION_VARIABLES)) {
    const value: string | undefined = environment[variable];
    if (value) attribution[field] = value;
  }
  return attribution;
}

function getLifecycleEntries(context: IDaemonRequestTelemetryContext): PerformanceEntry[] {
  const { engineCreation, lifecycleInfo } = context;
  const measures: IPhasedRequestTelemetryMeasure[] = [];
  if (lifecycleInfo) {
    measures.push({
      name: `${DAEMON_MEASURE_PREFIX}prepareWorkspace`,
      startTimeMs: lifecycleInfo.receivedTimeMs,
      endTimeMs: lifecycleInfo.preparedTimeMs
    });
  }
  if (engineCreation) {
    measures.push({ name: `${DAEMON_MEASURE_PREFIX}createEngine`, ...engineCreation });
  }
  measures.push({
    name: `${DAEMON_MEASURE_PREFIX}resolve`,
    startTimeMs: context.resolveStartTimeMs,
    endTimeMs: context.resolveEndTimeMs
  });
  return measures.map(createMeasureEntry);
}

/**
 * The native measures recorded while serving this request: engine creation for the request that created the
 * engine, and the graph iteration's own measures under their native names. One daemon serves one workspace and
 * runs one iteration at a time, so the time windows attribute the measures to this request.
 */
function getNativeEntries(
  context: IDaemonRequestTelemetryContext,
  report: IPhasedRequestTelemetryReport,
  durationStartTimeMs: number
): PerformanceEntry[] {
  const { engineCreation } = context;
  return performance.getEntriesByType('measure').filter((entry: PerformanceEntry) => {
    const endTime: number = entry.startTime + entry.duration;
    if (entry.name.startsWith(DAEMON_MEASURE_PREFIX)) {
      return false;
    }
    if (entry.name.startsWith(NATIVE_ITERATION_MEASURE_PREFIX)) {
      return report.scheduled && entry.startTime >= durationStartTimeMs && endTime <= report.resultTimeMs;
    }
    return (
      engineCreation !== undefined &&
      entry.name.startsWith(RUSH_MEASURE_PREFIX) &&
      entry.startTime >= engineCreation.startTimeMs &&
      endTime <= engineCreation.endTimeMs
    );
  });
}

function createMeasureEntry(measure: IPhasedRequestTelemetryMeasure): PerformanceEntry {
  const { name, startTimeMs: startTime } = measure;
  const duration: number = measure.endTimeMs - startTime;
  return {
    name,
    entryType: 'measure',
    startTime,
    duration,
    detail: undefined,
    toJSON: () => ({ name, entryType: 'measure', startTime, duration })
  };
}

function toSeconds(milliseconds: number): number {
  return milliseconds / MILLISECONDS_PER_SECOND;
}
