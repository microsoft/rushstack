// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as fs from 'node:fs';
import * as path from 'node:path';

import {
  AiReporter,
  DefaultInteractiveReporter,
  FileReporter,
  JsonReporter,
  PlaintextReporter,
  ReporterHost,
  isCiDetected,
  isLegacyEmergencyFallbackRequested,
  isSupportedLogLevel,
  isSupportedReporterName,
  parseOutputControl,
  separateJsonControls,
  shouldRenderAtLogLevel,
  type IReporter,
  type IReporterContext,
  type IReporterEventEnvelope,
  type IReporterEventSink,
  type IReporterOutputTarget,
  type ReporterLogLevel,
  type ReporterName
} from '@rushstack/rush-reporter';

export interface IRushReporterOutputStream {
  readonly isTTY?: boolean;
  readonly columns?: number;
  write(text: string): unknown;
}

export interface IRushReporterHostOptions {
  readonly argv?: readonly string[];
  readonly env?: Record<string, string | undefined>;
  readonly cwd?: string;
  readonly stdout?: IRushReporterOutputStream;
  readonly includeDefaultFileReporter?: boolean;
  readonly commandName?: 'rush' | 'rush-pnpm' | 'rushx';
  readonly repositoryOptIn?: boolean;
  readonly forceLegacy?: boolean;
  readonly selectedRushVersion?: string;
}

export interface IRushReporterSelection {
  readonly reporter: ReporterName;
  readonly logLevel: ReporterLogLevel;
  readonly outputs: readonly IReporterOutputTarget[];
  readonly commandJson: boolean;
  readonly enabled: boolean;
  readonly reporterControlsOwnedByFrontend: boolean;
  readonly reporterValueFlagsToStrip: readonly string[];
  readonly reason:
    | 'explicit --reporter'
    | 'repository experiment'
    | 'RUSH_REPORTER=legacy'
    | 'pre-major legacy default';
}

export interface IInitializedRushReporterHost {
  readonly host: ReporterHost;
  readonly sink: IReporterEventSink;
  readonly selection: IRushReporterSelection;
  closeAsync(timeoutMs?: number): Promise<void>;
}

const REPORTER_VALUE_FLAGS: ReadonlySet<string> = new Set(['--reporter', '--output', '--log-level']);
const ALL_REPORTER_VALUE_FLAGS: readonly string[] = ['--reporter', '--output', '--log-level'];
const REPORTER_SELECTION_FLAG: readonly string[] = ['--reporter'];

interface IParsedReporterControls {
  readonly reporters: readonly string[];
  readonly logLevels: readonly string[];
  readonly outputs: readonly string[];
  readonly quiet: boolean;
  readonly verbose: boolean;
  readonly debug: boolean;
}

class LogLevelReporter implements IReporter {
  public readonly name: string;

  private readonly _reporter: IReporter;
  private readonly _logLevel: ReporterLogLevel;

  public constructor(reporter: IReporter, logLevel: ReporterLogLevel) {
    this._reporter = reporter;
    this._logLevel = logLevel;
    this.name = reporter.name;
  }

  public initializeAsync(context: IReporterContext): Promise<void> {
    return this._reporter.initializeAsync(context);
  }

  public report(event: IReporterEventEnvelope<unknown>): void {
    if (shouldRenderAtLogLevel(this._logLevel, event)) {
      this._reporter.report(event);
    }
  }

  public flushAsync(): Promise<void> {
    return this._reporter.flushAsync();
  }

  public closeAsync(): Promise<void> {
    return this._reporter.closeAsync();
  }
}

class ExplicitOutputReporter implements IReporter {
  public readonly name: string;

  private readonly _reporter: JsonReporter;
  private readonly _filteredReporter: LogLevelReporter;
  private readonly _outputPath: string;
  private _fileDescriptor: number | undefined;

  public constructor(reporterName: string, outputPath: string, logLevel: ReporterLogLevel) {
    this.name = `${reporterName}-output`;
    this._outputPath = outputPath;
    this._reporter = new JsonReporter({
      write: (text: string) => {
        if (this._fileDescriptor === undefined) {
          throw new Error(`Reporter output ${JSON.stringify(this._outputPath)} is not initialized.`);
        }
        fs.writeSync(this._fileDescriptor, text);
      }
    });
    this._filteredReporter = new LogLevelReporter(this._reporter, logLevel);
  }

  public async initializeAsync(context: IReporterContext): Promise<void> {
    await fs.promises.mkdir(path.dirname(this._outputPath), { recursive: true });
    this._fileDescriptor = fs.openSync(this._outputPath, 'w', 0o600);
    await this._filteredReporter.initializeAsync(context);
  }

  public report(event: IReporterEventEnvelope<unknown>): void {
    this._filteredReporter.report(event);
  }

  public async flushAsync(): Promise<void> {
    await this._filteredReporter.flushAsync();
    if (this._fileDescriptor !== undefined) {
      fs.fsyncSync(this._fileDescriptor);
    }
  }

  public async closeAsync(): Promise<void> {
    try {
      await this._filteredReporter.closeAsync();
    } finally {
      if (this._fileDescriptor !== undefined) {
        fs.closeSync(this._fileDescriptor);
        this._fileDescriptor = undefined;
      }
    }
  }
}

function readValue(
  argv: readonly string[],
  index: number,
  flag: string
): { readonly value: string; readonly consumedNext: boolean } | undefined {
  const argument: string = argv[index];
  const prefix: string = `${flag}=`;
  if (argument.startsWith(prefix)) {
    const value: string = argument.slice(prefix.length);
    if (!value) {
      throw new Error(`${flag} requires a value.`);
    }
    return { value, consumedNext: false };
  }
  if (argument !== flag) {
    return undefined;
  }

  const value: string | undefined = argv[index + 1];
  if (!value || value.startsWith('-')) {
    throw new Error(`${flag} requires a value.`);
  }
  return { value, consumedNext: true };
}

export function stripReporterValueControls(
  argv: readonly string[],
  valueFlagsToStrip: ReadonlySet<string> = REPORTER_VALUE_FLAGS
): string[] {
  const result: string[] = [];
  for (let index: number = 0; index < argv.length; index++) {
    const argument: string = argv[index];
    if (argument === '--') {
      result.push(...argv.slice(index));
      break;
    }
    const equalsIndex: number = argument.indexOf('=');
    const flagName: string = equalsIndex < 0 ? argument : argument.slice(0, equalsIndex);
    if (!valueFlagsToStrip.has(flagName)) {
      result.push(argument);
      continue;
    }
    if (equalsIndex < 0 && index + 1 < argv.length && argv[index + 1] !== '--') {
      index++;
    }
  }
  return result;
}

function parseReporterControls(
  argv: readonly string[],
  includeOutputAndLogLevelControls: boolean
): IParsedReporterControls {
  const reporters: string[] = [];
  const logLevels: string[] = [];
  const outputs: string[] = [];
  let quiet: boolean = false;
  let verbose: boolean = false;
  let debug: boolean = false;

  for (let index: number = 0; index < argv.length; index++) {
    const argument: string = argv[index];
    if (argument === '--') {
      break;
    }
    const reporter: { readonly value: string; readonly consumedNext: boolean } | undefined = readValue(
      argv,
      index,
      '--reporter'
    );
    if (reporter) {
      reporters.push(reporter.value);
      index += reporter.consumedNext ? 1 : 0;
      continue;
    }
    if (includeOutputAndLogLevelControls) {
      const logLevel: { readonly value: string; readonly consumedNext: boolean } | undefined = readValue(
        argv,
        index,
        '--log-level'
      );
      if (logLevel) {
        logLevels.push(logLevel.value);
        index += logLevel.consumedNext ? 1 : 0;
        continue;
      }
      const output: { readonly value: string; readonly consumedNext: boolean } | undefined = readValue(
        argv,
        index,
        '--output'
      );
      if (output) {
        outputs.push(output.value);
        index += output.consumedNext ? 1 : 0;
        continue;
      }
    }

    quiet ||= argument === '--quiet' || argument === '-q';
    verbose ||= argument === '--verbose';
    debug ||= argument === '--debug' || argument === '-d';
  }

  if (reporters.length > 1) {
    throw new Error('--reporter may be specified only once.');
  }
  if (logLevels.length > 1) {
    throw new Error('--log-level may be specified only once.');
  }

  return { reporters, logLevels, outputs, quiet, verbose, debug };
}

function resolveLogLevel(
  controls: IParsedReporterControls,
  env: Record<string, string | undefined>,
  includeEnvironment: boolean
): ReporterLogLevel {
  const requestedLevels: ReporterLogLevel[] = [];
  const explicitLogLevel: string | undefined = controls.logLevels[0];
  if (explicitLogLevel !== undefined) {
    if (!isSupportedLogLevel(explicitLogLevel)) {
      throw new Error(
        `Unsupported log level ${JSON.stringify(explicitLogLevel)}. ` +
          'Supported values are quiet, normal, verbose, and debug.'
      );
    }
    requestedLevels.push(explicitLogLevel);
  }
  if (controls.quiet) {
    requestedLevels.push('quiet');
  }
  if (controls.verbose) {
    requestedLevels.push('verbose');
  }
  if (controls.debug) {
    requestedLevels.push('debug');
  }

  const distinctLevels: Set<ReporterLogLevel> = new Set(requestedLevels);
  if (distinctLevels.size > 1) {
    throw new Error(
      `Contradictory reporter verbosity controls were specified: ${[...distinctLevels].sort().join(', ')}. ` +
        'Specify only one of --log-level, --quiet, --verbose, or --debug.'
    );
  }
  if (requestedLevels.length > 0) {
    return requestedLevels[0];
  }

  const environmentLogLevel: string | undefined = includeEnvironment ? env.RUSH_LOG_LEVEL : undefined;
  if (environmentLogLevel) {
    const normalizedLogLevel: string = environmentLogLevel.trim().toLowerCase();
    if (!isSupportedLogLevel(normalizedLogLevel)) {
      throw new Error(
        `Unsupported RUSH_LOG_LEVEL value ${JSON.stringify(environmentLogLevel)}. ` +
          'Supported values are quiet, normal, verbose, and debug.'
      );
    }
    return normalizedLogLevel;
  }

  return 'normal';
}

function resolveOutputs(outputValues: readonly string[], cwd: string): readonly IReporterOutputTarget[] {
  return outputValues.map((value: string) => {
    const output: IReporterOutputTarget = parseOutputControl(value);
    if (output.reporter !== 'file' && output.reporter !== 'json') {
      throw new Error(
        `Unsupported --output reporter ${JSON.stringify(output.reporter)}. ` +
          'This rollout stage supports file:// and json:// output targets.'
      );
    }
    if (!output.target) {
      throw new Error(`The --output target must not be empty: ${JSON.stringify(value)}.`);
    }
    for (const parameterName of Object.keys(output.params)) {
      if (parameterName !== 'logLevel') {
        throw new Error(
          `Unsupported --output query parameter ${JSON.stringify(parameterName)}. ` +
            'The only supported query parameter is logLevel.'
        );
      }
    }
    const outputLogLevel: string | undefined = output.params.logLevel;
    if (outputLogLevel !== undefined && !isSupportedLogLevel(outputLogLevel)) {
      throw new Error(
        `Unsupported --output logLevel ${JSON.stringify(outputLogLevel)}. ` +
          'Supported values are quiet, normal, verbose, and debug.'
      );
    }
    return {
      ...output,
      target: path.resolve(cwd, output.target)
    };
  });
}

export function resolveRushReporterSelection(options: IRushReporterHostOptions = {}): IRushReporterSelection {
  const argv: readonly string[] = options.argv ?? process.argv.slice(2);
  const env: Record<string, string | undefined> = options.env ?? process.env;
  const commandName: 'rush' | 'rush-pnpm' | 'rushx' = options.commandName ?? getCommandName();
  if (commandName !== 'rush') {
    return {
      reporter: 'legacy',
      logLevel: 'normal',
      outputs: [],
      commandJson: separateJsonControls(argv).commandJson,
      enabled: false,
      reporterControlsOwnedByFrontend: false,
      reporterValueFlagsToStrip: [],
      reason: 'pre-major legacy default'
    };
  }

  const cwd: string = options.cwd ?? process.cwd();
  const commandJson: boolean = separateJsonControls(argv).commandJson;

  const selectionControls: IParsedReporterControls = parseReporterControls(argv, false);
  const requestedReporter: string | undefined = selectionControls.reporters[0];
  if (requestedReporter !== undefined && !isSupportedReporterName(requestedReporter)) {
    throw new Error(
      `Unsupported reporter ${JSON.stringify(requestedReporter)}. ` +
        'Supported values are default, ai, json, plaintext, file, and legacy.'
    );
  }

  if (isLegacyEmergencyFallbackRequested(env)) {
    return {
      reporter: 'legacy',
      logLevel: 'normal',
      outputs: [],
      commandJson,
      enabled: false,
      reporterControlsOwnedByFrontend: requestedReporter !== undefined,
      reporterValueFlagsToStrip: requestedReporter === undefined ? [] : ALL_REPORTER_VALUE_FLAGS,
      reason: 'RUSH_REPORTER=legacy'
    };
  }

  if (options.forceLegacy) {
    if (requestedReporter !== undefined && requestedReporter !== 'legacy') {
      throw new Error(
        `The selected Rush engine${options.selectedRushVersion ? ` ${options.selectedRushVersion}` : ''} ` +
          `does not support --reporter=${requestedReporter}. Remove the explicit reporter request or use ` +
          'the Rush version bundled with this frontend.'
      );
    }
    return {
      reporter: 'legacy',
      logLevel: 'normal',
      outputs: [],
      commandJson,
      enabled: false,
      reporterControlsOwnedByFrontend: requestedReporter !== undefined,
      reporterValueFlagsToStrip: requestedReporter === undefined ? [] : REPORTER_SELECTION_FLAG,
      reason: requestedReporter === undefined ? 'pre-major legacy default' : 'explicit --reporter'
    };
  }

  function getCommandName(): 'rush' | 'rush-pnpm' | 'rushx' {
    const executableName: string = path.basename(process.argv[1] ?? '').toLowerCase();
    if (executableName === 'rush-pnpm') {
      return 'rush-pnpm';
    }
    if (executableName === 'rushx') {
      return 'rushx';
    }
    return 'rush';
  }

  if (requestedReporter === undefined) {
    const environmentReporter: string | undefined = env.RUSH_REPORTER;
    if (environmentReporter?.trim()) {
      throw new Error(
        `RUSH_REPORTER=${JSON.stringify(environmentReporter)} cannot enable the pre-major reporter path. ` +
          'Use an explicit --reporter option, or set RUSH_REPORTER=legacy for the emergency fallback.'
      );
    }
    if (options.repositoryOptIn) {
      const stdout: IRushReporterOutputStream = options.stdout ?? process.stdout;
      return {
        reporter: isCiDetected(env) || !stdout.isTTY ? 'plaintext' : 'default',
        logLevel: resolveLogLevel(selectionControls, env, true),
        outputs: [],
        commandJson,
        enabled: true,
        reporterControlsOwnedByFrontend: false,
        reporterValueFlagsToStrip: [],
        reason: 'repository experiment'
      };
    }
    return {
      reporter: 'legacy',
      logLevel: 'normal',
      outputs: [],
      commandJson,
      enabled: false,
      reporterControlsOwnedByFrontend: false,
      reporterValueFlagsToStrip: [],
      reason: 'pre-major legacy default'
    };
  }

  if (requestedReporter === 'legacy') {
    return {
      reporter: 'legacy',
      logLevel: 'normal',
      outputs: [],
      commandJson,
      enabled: false,
      reporterControlsOwnedByFrontend: true,
      reporterValueFlagsToStrip: REPORTER_SELECTION_FLAG,
      reason: 'explicit --reporter'
    };
  }

  const controls: IParsedReporterControls = parseReporterControls(argv, true);
  const stdout: IRushReporterOutputStream = options.stdout ?? process.stdout;
  if (requestedReporter === 'default' && !stdout.isTTY) {
    throw new Error(
      '--reporter=default requires an interactive TTY. Use --reporter=plaintext for CI or redirected output.'
    );
  }

  return {
    reporter: requestedReporter,
    logLevel: resolveLogLevel(controls, env, true),
    outputs: resolveOutputs(controls.outputs, cwd),
    commandJson,
    enabled: true,
    reporterControlsOwnedByFrontend: true,
    reporterValueFlagsToStrip: ALL_REPORTER_VALUE_FLAGS,
    reason: 'explicit --reporter'
  };
}

function createPrimaryReporter(
  selection: IRushReporterSelection,
  stdout: IRushReporterOutputStream,
  env: Record<string, string | undefined>
): IReporter | undefined {
  switch (selection.reporter) {
    case 'default':
      return new DefaultInteractiveReporter({
        terminal: {
          columns: stdout.columns ?? 80,
          isTTY: stdout.isTTY === true,
          write: (text: string) => {
            stdout.write(text);
          }
        },
        env
      });
    case 'ai':
      return new AiReporter({ write: (text: string) => stdout.write(text) });
    case 'json':
      return new JsonReporter({ write: (text: string) => stdout.write(text) });
    case 'plaintext':
      return new PlaintextReporter({
        write: (text: string) => stdout.write(text),
        variant: isCiDetected(env) ? 'detailed' : 'concise',
        color: false
      });
    case 'file':
      return new FileReporter();
    case 'legacy':
      return undefined;
  }
}

export async function initializeRushReporterHostAsync(
  options: IRushReporterHostOptions = {}
): Promise<IInitializedRushReporterHost> {
  const env: Record<string, string | undefined> = options.env ?? process.env;
  const stdout: IRushReporterOutputStream = options.stdout ?? process.stdout;
  const selection: IRushReporterSelection = resolveRushReporterSelection({ ...options, env, stdout });
  const host: ReporterHost = new ReporterHost({ env });

  if (selection.enabled) {
    const primaryReporter: IReporter | undefined = createPrimaryReporter(selection, stdout, env);
    if (primaryReporter) {
      host.manager.addReporter(new LogLevelReporter(primaryReporter, selection.logLevel), {
        destination: selection.reporter === 'file' ? 'file:auto' : 'stdout'
      });
    }

    const hasExplicitFileOutput: boolean = selection.outputs.some(
      (output: IReporterOutputTarget) => output.reporter === 'file'
    );
    if (
      options.includeDefaultFileReporter !== false &&
      selection.reporter !== 'file' &&
      !hasExplicitFileOutput
    ) {
      host.manager.addReporter(new FileReporter(), { destination: 'file:auto' });
    }

    for (const output of selection.outputs) {
      const outputLogLevel: ReporterLogLevel =
        output.params.logLevel && isSupportedLogLevel(output.params.logLevel)
          ? output.params.logLevel
          : output.reporter === 'file'
            ? 'debug'
            : selection.logLevel;
      host.manager.addReporter(new ExplicitOutputReporter(output.reporter, output.target, outputLogLevel), {
        destination: output.target
      });
    }
  }

  await host.manager.initializeAsync();
  let closePromise: Promise<void> | undefined;
  return {
    host,
    sink: host.getSink(),
    selection,
    closeAsync: (timeoutMs?: number) => {
      closePromise ??= host.manager.closeAsync(timeoutMs);
      return closePromise;
    }
  };
}
