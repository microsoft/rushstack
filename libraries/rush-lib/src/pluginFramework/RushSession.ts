// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { InternalError, PackageJsonLookup, type IPackageJson } from '@rushstack/node-core-library';
import {
  LifecycleEmitter,
  LegacyErrorBridge,
  OperationStreamEmitter,
  RushSessionReporting,
  TelemetrySubscriber,
  isReporterEventRequired,
  resolveExitStatus as resolveRushExitStatus,
  type IReporterEmitEventInput,
  type IReporterEventEnvelope,
  type IReporterEventScope,
  type IReporterEventSink,
  type IReporterEventSource,
  type IResolveExitStatusFromEventsOptions,
  type IRushExitStatus,
  type ITelemetryAggregate,
  type IScopedLogger,
  type IScopedReporter
} from '@rushstack/rush-reporter';
import type { ITerminalProvider } from '@rushstack/terminal';

import { type ILogger, type ILoggerOptions, Logger } from './logging/Logger';
import { RushLifecycleHooks } from './RushLifeCycle';
import type { IBuildCacheJson } from '../api/BuildCacheConfiguration';
import type { ICloudBuildCacheProvider } from '../logic/buildCache/ICloudBuildCacheProvider';
import type { ICobuildJson } from '../api/CobuildConfiguration';
import type { ICobuildLockProvider } from '../logic/cobuild/ICobuildLockProvider';

/**
 * The reporter channel supplied by the Rush frontend for a single Rush session.
 *
 * @remarks
 * The frontend owns reporter selection and the concrete reporter instances. Rush
 * only receives this presentation-free sink and binds producer identities before
 * exposing scoped reporters to actions and plugins.
 *
 * @beta
 */
export interface IRushSessionReporterOptions {
  /**
   * The typed event sink owned by the Rush frontend.
   */
  readonly eventSink: IReporterEventSink;

  /**
   * The identifier assigned to this Rush session by the frontend.
   */
  readonly sessionId: string;

  /**
   * Enables raw semantic operation events for the pre-major reporter opt-in path.
   *
   * @remarks
   * When false or omitted, Rush retains the shadow lifecycle-only behavior and
   * does not tap operation output.
   *
   * @internal
   */
  readonly operationStreamEnabled?: boolean;

  /**
   * Flushes and closes the frontend-owned reporters before an explicit process exit.
   *
   * @internal
   */
  readonly flushAsync?: () => Promise<void>;
}

/**
 * @beta
 */
export interface IRushSessionOptions {
  terminalProvider: ITerminalProvider;
  getIsDebugMode: () => boolean;

  /**
   * The optional structured reporter channel for this session.
   *
   * @remarks
   * When omitted, scoped reporter APIs return `undefined` and legacy terminal
   * behavior remains unchanged.
   */
  reporter?: IRushSessionReporterOptions;
}

/**
 * @beta
 */
export type CloudBuildCacheProviderFactory = (
  buildCacheJson: IBuildCacheJson
) => ICloudBuildCacheProvider | Promise<ICloudBuildCacheProvider>;

/**
 * @beta
 */
export type CobuildLockProviderFactory = (
  cobuildJson: ICobuildJson
) => ICobuildLockProvider | Promise<ICobuildLockProvider>;

interface IRushSessionState {
  readonly options: IRushSessionOptions;
  readonly cloudBuildCacheProviderFactories: Map<string, CloudBuildCacheProviderFactory>;
  readonly cobuildLockProviderFactories: Map<string, CobuildLockProviderFactory>;
  readonly hooks: RushLifecycleHooks;
  readonly reporting: IRushSessionReportingState | undefined;
}

interface IRushSessionReportingState {
  readonly eventSink: IReporterEventSink;
  readonly sessionId: string;
  readonly source: IReporterEventSource;
  readonly sessionReporting: RushSessionReporting;
  readonly observer: IRushSessionShadowEventObserver;
}

interface IRushSessionShadowEventObserver {
  ingest<TPayload>(event: IReporterEmitEventInput<TPayload>, eventId: string): void;
  buildTelemetryAggregate(): ITelemetryAggregate;
  resolveExitStatus(options?: IResolveExitStatusFromEventsOptions): IRushExitStatus;
  correlateError(error: unknown, diagnosticId: string): void;
  isErrorRepresented(error: unknown): boolean;
}

let _rushLibSource: IReporterEventSource | undefined;
const _rushSessionStates: WeakMap<RushSession, IRushSessionState> = new WeakMap();

function _getRushLibSource(): IReporterEventSource {
  if (!_rushLibSource) {
    const packageJsonFilePath: string | undefined =
      PackageJsonLookup.instance.tryGetPackageJsonFilePathFor(__dirname);
    if (!packageJsonFilePath) {
      throw new InternalError('Unable to locate the package.json file for @microsoft/rush-lib');
    }

    const packageJson: IPackageJson = PackageJsonLookup.instance.loadPackageJson(packageJsonFilePath);
    if (!packageJson.version) {
      throw new InternalError('The @microsoft/rush-lib package.json file does not specify a version');
    }

    _rushLibSource = {
      packageName: '@microsoft/rush-lib',
      packageVersion: packageJson.version
    };
  }

  return _rushLibSource;
}

function _createReporting(
  reporterOptions: IRushSessionReporterOptions | undefined,
  source: IReporterEventSource,
  observer?: IRushSessionShadowEventObserver
): IRushSessionReportingState | undefined {
  if (!reporterOptions) {
    return undefined;
  }

  const { eventSink, sessionId } = reporterOptions;
  if (!eventSink || typeof eventSink.emit !== 'function') {
    throw new TypeError('RushSession reporter.eventSink must implement IReporterEventSink');
  }
  if (typeof sessionId !== 'string' || sessionId.trim().length === 0) {
    throw new TypeError('RushSession reporter.sessionId must be a non-empty string');
  }

  const shadowObserver: IRushSessionShadowEventObserver = observer ?? _createRushSessionShadowEventObserver();
  const observedEventSink: IReporterEventSink = {
    emit<TPayload>(event: IReporterEmitEventInput<TPayload>): string {
      const eventId: string = eventSink.emit(event);
      shadowObserver.ingest(event, eventId);
      return eventId;
    }
  };
  const boundSource: IReporterEventSource = { ...source };

  return {
    eventSink: observedEventSink,
    sessionId,
    source: boundSource,
    observer: shadowObserver,
    sessionReporting: new RushSessionReporting({
      sink: observedEventSink,
      sessionId,
      source: boundSource
    })
  };
}

function _createRushSessionShadowEventObserver(): IRushSessionShadowEventObserver {
  const legacyErrorBridge: LegacyErrorBridge = new LegacyErrorBridge();
  const telemetrySubscriber: TelemetrySubscriber = new TelemetrySubscriber();
  const operationStatuses: Map<string, string> = new Map();
  let sequence: number = 0;
  let derivedExitStatus: IRushExitStatus = { exitCode: 0, outcome: 'succeeded' };
  let hasUnscopedFailure: boolean = false;

  const updateDerivedOperationStatus = (): void => {
    const hasOperationFailure: boolean = [...operationStatuses.values()].some(
      (status) => status === 'failure' || status === 'aborted'
    );
    derivedExitStatus = resolveRushExitStatus({
      hasFailures: hasUnscopedFailure || hasOperationFailure
    });
  };

  return {
    ingest<TPayload>(event: IReporterEmitEventInput<TPayload>, eventId: string): void {
      const envelope: IReporterEventEnvelope<TPayload> = {
        ...event,
        eventId,
        sequence: ++sequence,
        timestamp: new Date().toISOString(),
        required: isReporterEventRequired(event.type)
      };
      legacyErrorBridge.ingest(envelope);

      if (envelope.parentSessionId === undefined) {
        switch (envelope.type) {
          case 'commandStarted': {
            operationStatuses.clear();
            hasUnscopedFailure = false;
            derivedExitStatus = { exitCode: 0, outcome: 'succeeded' };
            break;
          }
          case 'operationRegistered': {
            const { operationId } = envelope.payload as { operationId: string };
            operationStatuses.set(operationId, 'ready');
            updateDerivedOperationStatus();
            break;
          }
          case 'operationStatusChanged': {
            const { operationId, status } = envelope.payload as {
              operationId: string;
              status: string;
            };
            operationStatuses.set(operationId, status);
            updateDerivedOperationStatus();
            break;
          }
          case 'diagnosticEmitted': {
            const { severity } = envelope.payload as { severity?: string };
            if (severity === 'error' && envelope.scope?.operationId === undefined) {
              hasUnscopedFailure = true;
              updateDerivedOperationStatus();
            }
            break;
          }
          case 'commandResult': {
            const { succeeded, exitCode } = envelope.payload as {
              succeeded: boolean;
              exitCode: number;
            };
            derivedExitStatus = resolveRushExitStatus({
              hasFailures: !succeeded || exitCode !== 0
            });
            break;
          }
          case 'commandCompleted':
          case 'sessionCompleted': {
            const { exitCode } = envelope.payload as { exitCode: number };
            derivedExitStatus = resolveRushExitStatus({ hasFailures: exitCode !== 0 });
            break;
          }
          default:
            break;
        }
      }

      // Match the privacy behavior from #5990 without duplicating its reporter-package changes:
      // only public envelopes contribute source, protocol, lifecycle, or diagnostic telemetry.
      // Remove this outer gate after #5990 reaches shared main and the hardened subscriber is in this ancestry.
      if (envelope.privacy === 'public') {
        telemetrySubscriber.ingest(envelope);
      }
    },

    buildTelemetryAggregate(): ITelemetryAggregate {
      return telemetrySubscriber.buildAggregate();
    },

    resolveExitStatus(options: IResolveExitStatusFromEventsOptions = {}): IRushExitStatus {
      return resolveRushExitStatus({ hasFailures: derivedExitStatus.exitCode !== 0, ...options });
    },

    correlateError(error: unknown, diagnosticId: string): void {
      legacyErrorBridge.correlate(error, diagnosticId);
    },

    isErrorRepresented(error: unknown): boolean {
      return legacyErrorBridge.shouldSuppressRendering(error);
    }
  };
}

function _createLifecycleEmitter(
  state: IRushSessionReportingState | undefined,
  scope?: IReporterEventScope
): LifecycleEmitter | undefined {
  if (!state) {
    return undefined;
  }

  return new LifecycleEmitter({
    sink: state.eventSink,
    sessionId: state.sessionId,
    source: state.source,
    scope: scope ? { ...scope } : undefined
  });
}

function _createOperationStreamEmitter(
  state: IRushSessionReportingState | undefined,
  scope?: IReporterEventScope
): OperationStreamEmitter | undefined {
  if (!state) {
    return undefined;
  }

  return new OperationStreamEmitter({
    sink: state.eventSink,
    sessionId: state.sessionId,
    source: state.source,
    scope: scope ? { ...scope } : undefined
  });
}

function _getSessionState(rushSession: RushSession): IRushSessionState {
  const state: IRushSessionState | undefined = _rushSessionStates.get(rushSession);
  if (!state) {
    throw new InternalError('RushSession state was not initialized');
  }
  return state;
}

/**
 * @beta
 */
export class RushSession {
  public readonly hooks: RushLifecycleHooks;

  public constructor(options: IRushSessionOptions) {
    this.hooks = new RushLifecycleHooks();
    _rushSessionStates.set(this, {
      options,
      cloudBuildCacheProviderFactories: new Map(),
      cobuildLockProviderFactories: new Map(),
      hooks: this.hooks,
      reporting: options.reporter ? _createReporting(options.reporter, _getRushLibSource()) : undefined
    });
  }

  public getLogger(name: string): ILogger {
    if (!name) {
      throw new InternalError('RushSession.getLogger(name) called without a name');
    }

    const { options } = _getSessionState(this);
    const terminalProvider: ITerminalProvider = options.terminalProvider;
    const loggerOptions: ILoggerOptions = {
      loggerName: name,
      getShouldPrintStacks: () => options.getIsDebugMode(),
      terminalProvider
    };
    return new Logger(loggerOptions);
  }

  public get terminalProvider(): ITerminalProvider {
    return _getSessionState(this).options.terminalProvider;
  }

  /**
   * Creates a structured reporter bound to this producer and the specified scope.
   *
   * @remarks
   * Returns `undefined` when the frontend did not provide a reporter event sink.
   * The returned API cannot access concrete reporters or override the session and
   * source identity bound by Rush.
   */
  public getReporter(scope?: IReporterEventScope): IScopedReporter | undefined {
    return _getSessionState(this).reporting?.sessionReporting.createScopedReporter(
      scope ? { ...scope } : undefined
    );
  }

  /**
   * Creates a structured logger bound to this producer and the specified scope.
   *
   * @remarks
   * Returns `undefined` when the frontend did not provide a reporter event sink.
   * This API is additive; {@link RushSession.getLogger} and terminal output remain
   * available during the pre-major compatibility period.
   */
  public getScopedLogger(scope?: IReporterEventScope): IScopedLogger | undefined {
    return _getSessionState(this).reporting?.sessionReporting.createScopedLogger(
      scope ? { ...scope } : undefined
    );
  }

  public registerCloudBuildCacheProviderFactory(
    cacheProviderName: string,
    factory: CloudBuildCacheProviderFactory
  ): void {
    const { cloudBuildCacheProviderFactories } = _getSessionState(this);
    if (cloudBuildCacheProviderFactories.has(cacheProviderName)) {
      throw new Error(`A build cache provider factory for ${cacheProviderName} has already been registered`);
    }

    cloudBuildCacheProviderFactories.set(cacheProviderName, factory);
  }

  public getCloudBuildCacheProviderFactory(
    cacheProviderName: string
  ): CloudBuildCacheProviderFactory | undefined {
    return _getSessionState(this).cloudBuildCacheProviderFactories.get(cacheProviderName);
  }

  public registerCobuildLockProviderFactory(
    cobuildLockProviderName: string,
    factory: CobuildLockProviderFactory
  ): void {
    const { cobuildLockProviderFactories } = _getSessionState(this);
    if (cobuildLockProviderFactories.has(cobuildLockProviderName)) {
      throw new Error(
        `A cobuild lock provider factory for ${cobuildLockProviderName} has already been registered`
      );
    }
    cobuildLockProviderFactories.set(cobuildLockProviderName, factory);
  }

  public getCobuildLockProviderFactory(
    cobuildLockProviderName: string
  ): CobuildLockProviderFactory | undefined {
    return _getSessionState(this).cobuildLockProviderFactories.get(cobuildLockProviderName);
  }
}

/**
 * Creates the RushSession facade passed to one plugin.
 *
 * @remarks
 * This function is internal to rush-lib. PluginManager derives the source from
 * trusted loader metadata so the plugin cannot choose another producer identity.
 *
 * @internal
 */
export function _createRushSessionForPlugin(
  rushSession: RushSession,
  getSource: () => IReporterEventSource
): RushSession {
  const state: IRushSessionState = _getSessionState(rushSession);
  const reporting: IRushSessionReportingState | undefined = state.reporting;
  if (!state.options.reporter || !reporting) {
    return rushSession;
  }

  const pluginSession: RushSession = Object.create(RushSession.prototype) as RushSession;
  Object.defineProperty(pluginSession, 'hooks', {
    configurable: false,
    enumerable: true,
    value: state.hooks,
    writable: false
  });
  _rushSessionStates.set(pluginSession, {
    options: state.options,
    cloudBuildCacheProviderFactories: state.cloudBuildCacheProviderFactories,
    cobuildLockProviderFactories: state.cobuildLockProviderFactories,
    hooks: state.hooks,
    reporting: _createReporting(state.options.reporter, getSource(), reporting.observer)
  });
  return pluginSession;
}

/**
 * Creates a Rush-owned lifecycle emitter for internal command and operation paths.
 *
 * @internal
 */
export function _getRushSessionLifecycleEmitter(
  rushSession: RushSession,
  scope?: IReporterEventScope
): LifecycleEmitter | undefined {
  return _createLifecycleEmitter(_getSessionState(rushSession).reporting, scope);
}

/**
 * Creates the raw operation stream emitter only for the pre-major opt-in path.
 *
 * @internal
 */
export function _getRushSessionOperationStreamEmitter(
  rushSession: RushSession,
  scope?: IReporterEventScope
): OperationStreamEmitter | undefined {
  const state: IRushSessionState = _getSessionState(rushSession);
  return state.options.reporter?.operationStreamEnabled
    ? _createOperationStreamEmitter(state.reporting, scope)
    : undefined;
}

/**
 * Returns whether the frontend enabled reporter-owned operation presentation.
 *
 * @internal
 */
export function _isRushSessionOperationStreamEnabled(rushSession: RushSession): boolean {
  return _getSessionState(rushSession).options.reporter?.operationStreamEnabled === true;
}

/**
 * Flushes the frontend-owned reporter host, when available.
 *
 * @internal
 */
export function _flushRushSessionReporterAsync(rushSession: RushSession): Promise<void> {
  return _getSessionState(rushSession).options.reporter?.flushAsync?.() ?? Promise.resolve();
}

/**
 * Returns the current allowlisted reporter telemetry projection.
 *
 * @internal
 */
export function _getRushSessionTelemetryAggregate(rushSession: RushSession): ITelemetryAggregate | undefined {
  return _getSessionState(rushSession).reporting?.observer.buildTelemetryAggregate();
}

/**
 * Derives the shadow exit status without changing the authoritative process exit code.
 *
 * @internal
 */
export function _getRushSessionDerivedExitStatus(
  rushSession: RushSession,
  options?: IResolveExitStatusFromEventsOptions
): IRushExitStatus | undefined {
  return _getSessionState(rushSession).reporting?.observer.resolveExitStatus(options);
}

/**
 * Returns the Rush version bound to structured events for this session.
 *
 * @internal
 */
export function _getRushSessionReporterSourceVersion(rushSession: RushSession): string | undefined {
  return _getSessionState(rushSession).reporting?.source.packageVersion;
}

/**
 * Correlates a legacy failure sentinel with an emitted structured diagnostic.
 *
 * @internal
 */
export function _correlateRushSessionError(
  rushSession: RushSession,
  error: unknown,
  diagnosticId: string
): void {
  _getSessionState(rushSession).reporting?.observer.correlateError(error, diagnosticId);
}

/**
 * Returns whether a failure is already represented by an emitted diagnostic or legacy sentinel.
 *
 * @internal
 */
export function _isRushSessionErrorRepresented(rushSession: RushSession, error: unknown): boolean {
  return _getSessionState(rushSession).reporting?.observer.isErrorRepresented(error) ?? false;
}
