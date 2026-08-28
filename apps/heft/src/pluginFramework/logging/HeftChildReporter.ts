// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import { EOL } from 'node:os';

import { FileError, PackageJsonLookup, type IPackageJson } from '@rushstack/node-core-library';
import { type ITerminalProvider, TerminalProviderSeverity } from '@rushstack/terminal';

import { Constants } from '../../utilities/Constants';

const CHILD_FD_ENV_VAR: '_RUSH_REPORTER_CHILD_FD' = '_RUSH_REPORTER_CHILD_FD';
const CHILD_ACK_FD_ENV_VAR: '_RUSH_REPORTER_CHILD_ACK_FD' = '_RUSH_REPORTER_CHILD_ACK_FD';
interface IProtocolVersion {
  readonly major: number;
  readonly minor: number;
}
const PROTOCOL_VERSION: IProtocolVersion = { major: 1, minor: 2 };
const MAX_RECORD_BYTES: number = 1024 * 1024;
const MAX_OUTPUT_CHUNK_BYTES: number = 64 * 1024;
const CAPABILITIES: readonly string[] = ['heft-child-events-v1', 'reporter-context-v1'];
const REPORTER_NAMES: ReadonlySet<string> = new Set(['default', 'ai', 'json', 'plaintext', 'file', 'legacy']);
const LOG_LEVELS: ReadonlySet<string> = new Set(['quiet', 'normal', 'verbose', 'debug']);

interface IReporterChildContext {
  readonly reporter: string;
  readonly logLevel: 'quiet' | 'normal' | 'verbose' | 'debug';
  readonly color: boolean;
  readonly terminalWidth: number;
}

interface IReporterEventScope {
  readonly commandName?: string;
}

function readDescriptorFd(env: Record<string, string | undefined>, name: string): number | undefined {
  const raw: string | undefined = env[name];
  if (raw === undefined || !/^\d+$/.test(raw)) {
    return undefined;
  }
  const parsed: number = Number(raw);
  return Number.isSafeInteger(parsed) && parsed >= 3 ? parsed : undefined;
}

function encodeRecord(value: unknown): string {
  const json: string = JSON.stringify(value);
  if (Buffer.byteLength(json, 'utf8') > MAX_RECORD_BYTES) {
    throw new Error(`The reporter record exceeds the ${MAX_RECORD_BYTES}-byte protocol limit.`);
  }
  return `${json}\n`;
}

function chunkUtf8Text(text: string): string[] {
  const chunks: string[] = [];
  let offset: number = 0;
  while (offset < text.length) {
    let end: number = offset;
    let byteLength: number = 0;
    while (end < text.length) {
      const codePoint: number = text.codePointAt(end)!;
      const codeUnits: number = codePoint > 0xffff ? 2 : 1;
      const codePointBytes: number =
        codePoint <= 0x7f ? 1 : codePoint <= 0x7ff ? 2 : codePoint <= 0xffff ? 3 : 4;
      if (end > offset && byteLength + codePointBytes > MAX_OUTPUT_CHUNK_BYTES) {
        break;
      }
      byteLength += codePointBytes;
      end += codeUnits;
    }
    chunks.push(text.slice(offset, end));
    offset = end;
  }
  return chunks;
}

function parseAck(text: string): IReporterChildContext | undefined {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return undefined;
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return undefined;
  }
  const ack: Record<string, unknown> = value as Record<string, unknown>;
  const version: Record<string, unknown> | undefined =
    typeof ack.protocolVersion === 'object' && ack.protocolVersion !== null
      ? (ack.protocolVersion as Record<string, unknown>)
      : undefined;
  const acceptedCapabilities: unknown = ack.acceptedCapabilities;
  const rejectedRequiredFeatures: unknown = ack.rejectedRequiredFeatures;
  if (
    ack.kind !== 'helloAck' ||
    version?.major !== PROTOCOL_VERSION.major ||
    !Array.isArray(acceptedCapabilities) ||
    !acceptedCapabilities.every((item: unknown) => typeof item === 'string') ||
    !acceptedCapabilities.includes('heft-child-events-v1') ||
    !Array.isArray(rejectedRequiredFeatures) ||
    rejectedRequiredFeatures.length > 0
  ) {
    return undefined;
  }

  if (!acceptedCapabilities.includes('reporter-context-v1')) {
    return {
      reporter: 'plaintext',
      logLevel: 'normal',
      color: false,
      terminalWidth: 80
    };
  }
  const context: unknown = ack.context;
  if (context === undefined) {
    return {
      reporter: 'plaintext',
      logLevel: 'normal',
      color: false,
      terminalWidth: 80
    };
  }
  if (typeof context !== 'object' || context === null || Array.isArray(context)) {
    return undefined;
  }
  const record: Record<string, unknown> = context as Record<string, unknown>;
  if (
    typeof record.reporter !== 'string' ||
    !REPORTER_NAMES.has(record.reporter) ||
    typeof record.logLevel !== 'string' ||
    !LOG_LEVELS.has(record.logLevel) ||
    typeof record.color !== 'boolean' ||
    typeof record.terminalWidth !== 'number' ||
    !Number.isSafeInteger(record.terminalWidth) ||
    record.terminalWidth < 1
  ) {
    return undefined;
  }
  const logLevel: IReporterChildContext['logLevel'] =
    record.logLevel === 'quiet' ||
    record.logLevel === 'normal' ||
    record.logLevel === 'verbose' ||
    record.logLevel === 'debug'
      ? record.logLevel
      : 'normal';
  return {
    reporter: record.reporter,
    logLevel,
    color: record.color,
    terminalWidth: record.terminalWidth
  };
}

/**
 * Bridges Heft terminal and diagnostic output onto an inherited Rush reporter channel.
 *
 * @internal
 */
export class HeftChildReporter implements ITerminalProvider {
  public readonly supportsColor: boolean;
  public readonly eolCharacter: string = EOL;
  public readonly parentReporterName: string;
  public readonly terminalWidth: number;
  public verboseEnabled: boolean;
  public debugEnabled: boolean;

  private readonly _descriptorFd: number;
  private readonly _sourceVersion: string;
  private readonly _sessionId: string;
  private _commandName: string | undefined;
  private _sequence: number = 1;
  private _nextEventId: number = 1;

  private constructor(descriptorFd: number, sourceVersion: string, context: IReporterChildContext) {
    this._descriptorFd = descriptorFd;
    this._sourceVersion = sourceVersion;
    this._sessionId = crypto.randomUUID();
    this.parentReporterName = context.reporter;
    this.terminalWidth = context.terminalWidth;
    this.supportsColor = context.color;
    this.verboseEnabled = context.logLevel === 'verbose' || context.logLevel === 'debug';
    this.debugEnabled = context.logLevel === 'debug';
  }

  public static tryInitialize(
    env: Record<string, string | undefined> = process.env
  ): HeftChildReporter | undefined {
    const descriptorFd: number | undefined = readDescriptorFd(env, CHILD_FD_ENV_VAR);
    const ackDescriptorFd: number | undefined = readDescriptorFd(env, CHILD_ACK_FD_ENV_VAR);
    delete env[CHILD_FD_ENV_VAR];
    delete env[CHILD_ACK_FD_ENV_VAR];
    if (descriptorFd === undefined || ackDescriptorFd === undefined || descriptorFd === ackDescriptorFd) {
      return undefined;
    }

    const packageJson: IPackageJson | undefined = PackageJsonLookup.instance.tryLoadPackageJsonFor(__dirname);
    const version: string = packageJson?.version ?? 'unknown';
    let reporter: HeftChildReporter | undefined;
    try {
      fs.writeSync(
        descriptorFd,
        encodeRecord({
          kind: 'hello',
          protocolVersion: PROTOCOL_VERSION,
          producerVersion: `${Constants.heftPackageName} ${version}`,
          capabilities: CAPABILITIES,
          requiredFeatures: []
        })
      );

      const chunks: Buffer[] = [];
      let totalBytes: number = 0;
      const buffer: Buffer = Buffer.allocUnsafe(4096);
      for (;;) {
        const byteCount: number = fs.readSync(ackDescriptorFd, buffer, 0, buffer.length, null);
        if (byteCount === 0) {
          break;
        }
        totalBytes += byteCount;
        if (totalBytes > MAX_RECORD_BYTES + 1) {
          break;
        }
        chunks.push(Buffer.from(buffer.subarray(0, byteCount)));
        const text: string = Buffer.concat(chunks).toString('utf8');
        const newlineIndex: number = text.indexOf('\n');
        if (newlineIndex >= 0) {
          const context: IReporterChildContext | undefined = parseAck(text.slice(0, newlineIndex));
          reporter = context ? new HeftChildReporter(descriptorFd, version, context) : undefined;
          break;
        }
      }
    } catch (error) {
      if (typeof (error as NodeJS.ErrnoException).code !== 'string') {
        throw error;
      }
    }
    try {
      fs.closeSync(ackDescriptorFd);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EBADF') {
        throw error;
      }
    }
    return reporter;
  }

  public setCommandName(commandName: string): void {
    this._commandName = commandName;
  }

  public write(data: string, severity: TerminalProviderSeverity): void {
    if (severity === TerminalProviderSeverity.verbose && !this.verboseEnabled) {
      return;
    }
    if (severity === TerminalProviderSeverity.debug && !this.debugEnabled) {
      return;
    }
    const stream: 'stdout' | 'stderr' =
      severity === TerminalProviderSeverity.warning || severity === TerminalProviderSeverity.error
        ? 'stderr'
        : 'stdout';
    for (const chunk of chunkUtf8Text(data)) {
      this._emit('externalOutput', 'local-sensitive', { stream, text: chunk });
    }
  }

  public emitDiagnostic(loggerName: string, error: Error, severity: 'warning' | 'error'): void {
    const source:
      | {
          readonly kind: 'file';
          readonly file: string;
          readonly line: number | undefined;
          readonly column: number | undefined;
          readonly toolName: string;
        }
      | { readonly kind: 'tool'; readonly toolName: string } =
      error instanceof FileError
        ? {
            kind: 'file',
            file: error.absolutePath,
            line: error.line,
            column: error.column,
            toolName: loggerName
          }
        : { kind: 'tool', toolName: loggerName };
    const diagnostic: Record<string, unknown> = {
      diagnosticId: crypto.randomUUID(),
      code: 'RUSH_EXTERNAL_TOOL_PROBLEM',
      category: 'operation',
      severity,
      summaryKey: 'diagnostic.RUSH_EXTERNAL_TOOL_PROBLEM.summary',
      parameters: {
        tool: { value: loggerName, privacy: 'public' },
        code: { value: error.name, privacy: 'public' },
        message: { value: error.message, privacy: 'local-sensitive' }
      },
      source
    };

    try {
      this._emit('diagnosticEmitted', 'local-sensitive', diagnostic);
    } catch (emitError) {
      if (!(emitError instanceof Error) || !emitError.message.includes('protocol limit')) {
        throw emitError;
      }
      this.write(`[${loggerName}] ${severity}: ${error.message}${EOL}`, TerminalProviderSeverity.error);
    }
  }

  private _emit(
    type: 'diagnosticEmitted' | 'externalOutput',
    privacy: 'local-sensitive',
    payload: unknown
  ): void {
    const scope: IReporterEventScope | undefined =
      this._commandName === undefined ? undefined : { commandName: this._commandName };
    fs.writeSync(
      this._descriptorFd,
      encodeRecord({
        protocolVersion: PROTOCOL_VERSION,
        eventId: `child_${this._nextEventId++}`,
        sessionId: this._sessionId,
        sequence: this._sequence++,
        timestamp: new Date().toISOString(),
        source: {
          packageName: Constants.heftPackageName,
          packageVersion: this._sourceVersion
        },
        scope,
        privacy,
        required: type === 'diagnosticEmitted',
        type,
        payload
      })
    );
  }
}
