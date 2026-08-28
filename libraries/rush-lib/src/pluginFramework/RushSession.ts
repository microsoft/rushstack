// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { InternalError, PackageJsonLookup, type IPackageJson } from '@rushstack/node-core-library';
import {
  RushSessionReporting,
  type IReporterEventScope,
  type IReporterEventSink,
  type IReporterEventSource,
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
  readonly reporting: RushSessionReporting | undefined;
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
  source: IReporterEventSource
): RushSessionReporting | undefined {
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

  return new RushSessionReporting({
    sink: eventSink,
    sessionId,
    source: { ...source }
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
    return _getSessionState(this).reporting?.createScopedReporter(scope ? { ...scope } : undefined);
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
    return _getSessionState(this).reporting?.createScopedLogger(scope ? { ...scope } : undefined);
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
  if (!state.options.reporter) {
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
    reporting: _createReporting(state.options.reporter, getSource())
  });
  return pluginSession;
}
