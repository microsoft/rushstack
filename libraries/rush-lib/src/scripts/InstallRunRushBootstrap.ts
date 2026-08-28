// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

// IMPORTANT: This file is bundled into install-run-rush.js and must use only Node.js built-ins.

import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import type { ILogger } from '../utilities/npmrcUtilities';
import {
  BOOTSTRAP_BUFFER_MAX_BYTES,
  BOOTSTRAP_BUFFER_TRUNCATED_EXTENSION_NAME,
  BOOTSTRAP_EXTERNAL_CHUNK_MAX_BYTES,
  BOOTSTRAP_PROTOCOL_MAJOR,
  RUSH_REPORTER_BOOTSTRAP_HANDOFF_ENV_VAR,
  RUSH_REPORTER_BOOTSTRAP_NONCE_ENV_VAR,
  encodeBootstrapEnvelope
} from './generated/BootstrapProtocol';

const TRUNCATION_NOTICE_RESERVE_BYTES: number = 512;
const BOOTSTRAP_HANDOFF_FILE_PREFIX: string = 'rush-reporter-bootstrap-';
const BOOTSTRAP_HANDOFF_FILE_SUFFIX: string = '.ndjson';
const SUPPORTED_REPORTERS: ReadonlySet<string> = new Set([
  'default',
  'ai',
  'json',
  'plaintext',
  'file',
  'legacy'
]);
const SUPPORTED_LOG_LEVELS: ReadonlySet<string> = new Set(['quiet', 'normal', 'verbose', 'debug']);

type BootstrapStream = 'stdout' | 'stderr';

interface IBootstrapEventInput {
  readonly type: string;
  readonly privacy: 'public' | 'local-sensitive';
  readonly payload: unknown;
}

interface IBufferedBootstrapEntry {
  readonly line: string;
  readonly bytes: number;
  readonly required: boolean;
  readonly fallbackWrite?: IFallbackWrite;
}

interface IFallbackWrite {
  readonly stream: BootstrapStream;
  readonly text: string;
}

export interface IInstallRunRushBootstrapOptions {
  readonly argv: readonly string[];
  readonly env: Record<string, string | undefined>;
  readonly rushJsonFolder: string;
  readonly rushVersion: string;
  readonly bootstrapVersion: string;
  readonly commandName: 'rush' | 'rush-pnpm' | 'rushx';
  readonly quiet: boolean;
  readonly stdout?: (text: string) => void;
  readonly stderr?: (text: string) => void;
  readonly handoffDirectory?: string;
  readonly maxBytes?: number;
  readonly now?: () => string;
  readonly randomUUID?: () => string;
}

export interface IInstallRunRushBootstrap {
  readonly enabled: boolean;
  readonly logger: ILogger;
  readonly externalOutputCaptureMaxBytes: number | undefined;
  readonly externalOutputHandler: ((stream: BootstrapStream, text: string) => void) | undefined;
  readonly externalOutputOverflowHandler: (() => void) | undefined;
  readonly prepareToRun: (() => void) | undefined;
}

function readSingleFlagValue(argv: readonly string[], flag: string): string | undefined {
  let result: string | undefined;
  const prefix: string = `${flag}=`;
  for (let index: number = 0; index < argv.length; index++) {
    const argument: string = argv[index];
    let value: string | undefined;
    if (argument.startsWith(prefix)) {
      value = argument.slice(prefix.length);
    } else if (argument === flag) {
      value = argv[index + 1];
      if (!value || value.startsWith('-')) {
        throw new Error(`${flag} requires a value.`);
      }
      index++;
    }

    if (value !== undefined) {
      if (!value) {
        throw new Error(`${flag} requires a value.`);
      }
      if (result !== undefined) {
        throw new Error(`${flag} may be specified only once.`);
      }
      result = value;
    }
  }
  return result;
}

function repositoryUsesRushReporter(rushJsonFolder: string): boolean {
  const experimentsPath: string = path.join(rushJsonFolder, 'common', 'config', 'rush', 'experiments.json');
  let contents: string;
  try {
    contents = fs.readFileSync(experimentsPath, 'utf8');
  } catch (error) {
    const code: unknown = (error as NodeJS.ErrnoException).code;
    if (code === 'ENOENT') {
      return false;
    }
    throw error;
  }

  const matches: RegExpMatchArray[] = [
    ...stripJsonComments(contents).matchAll(/"useRushReporter"\s*:\s*(true|false)/g)
  ];
  return matches.length > 0 && matches[matches.length - 1][1] === 'true';
}

function stripJsonComments(text: string): string {
  let result: string = '';
  let inString: boolean = false;
  let escaped: boolean = false;
  let lineComment: boolean = false;
  let blockComment: boolean = false;

  for (let index: number = 0; index < text.length; index++) {
    const character: string = text[index];
    const nextCharacter: string | undefined = text[index + 1];
    if (lineComment) {
      if (character === '\n' || character === '\r') {
        lineComment = false;
        result += character;
      }
      continue;
    }
    if (blockComment) {
      if (character === '*' && nextCharacter === '/') {
        blockComment = false;
        index++;
      } else if (character === '\n' || character === '\r') {
        result += character;
      }
      continue;
    }
    if (inString) {
      result += character;
      if (escaped) {
        escaped = false;
      } else if (character === '\\') {
        escaped = true;
      } else if (character === '"') {
        inString = false;
      }
      continue;
    }
    if (character === '"') {
      inString = true;
      result += character;
    } else if (character === '/' && nextCharacter === '/') {
      lineComment = true;
      index++;
    } else if (character === '/' && nextCharacter === '*') {
      blockComment = true;
      index++;
    } else {
      result += character;
    }
  }
  return result;
}

interface IParsedVersion {
  readonly core: readonly [number, number, number];
  readonly prerelease: readonly string[] | undefined;
}

function parseVersion(version: string): IParsedVersion | undefined {
  const match: RegExpMatchArray | null =
    /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/.exec(version);
  if (!match) {
    return undefined;
  }
  return {
    core: [Number(match[1]), Number(match[2]), Number(match[3])],
    prerelease: match[4]?.split('.')
  };
}

function comparePrerelease(
  left: readonly string[] | undefined,
  right: readonly string[] | undefined
): number {
  if (!left) {
    return right ? 1 : 0;
  }
  if (!right) {
    return -1;
  }
  const length: number = Math.max(left.length, right.length);
  for (let index: number = 0; index < length; index++) {
    const leftPart: string | undefined = left[index];
    const rightPart: string | undefined = right[index];
    if (leftPart === undefined) {
      return -1;
    }
    if (rightPart === undefined) {
      return 1;
    }
    if (leftPart === rightPart) {
      continue;
    }
    const leftNumeric: boolean = /^\d+$/.test(leftPart);
    const rightNumeric: boolean = /^\d+$/.test(rightPart);
    if (leftNumeric && rightNumeric) {
      return Number(leftPart) - Number(rightPart);
    }
    if (leftNumeric !== rightNumeric) {
      return leftNumeric ? -1 : 1;
    }
    return leftPart < rightPart ? -1 : 1;
  }
  return 0;
}

function supportsBootstrapHandoff(rushVersion: string, bootstrapVersion: string): boolean {
  const rush: IParsedVersion | undefined = parseVersion(rushVersion);
  const bootstrap: IParsedVersion | undefined = parseVersion(bootstrapVersion);
  if (!rush || !bootstrap) {
    return false;
  }
  for (let index: number = 0; index < rush.core.length; index++) {
    if (rush.core[index] !== bootstrap.core[index]) {
      return rush.core[index] > bootstrap.core[index];
    }
  }
  return comparePrerelease(rush.prerelease, bootstrap.prerelease) >= 0;
}

function* chunkUtf8Text(text: string, maxChunkBytes: number): Iterable<string> {
  let chunkStart: number = 0;
  let chunkBytes: number = 0;
  let offset: number = 0;

  while (offset < text.length) {
    const codePoint: number = text.codePointAt(offset)!;
    const codeUnits: number = codePoint > 0xffff ? 2 : 1;
    const codePointBytes: number =
      codePoint <= 0x7f ? 1 : codePoint <= 0x7ff ? 2 : codePoint <= 0xffff ? 3 : 4;
    if (chunkBytes > 0 && chunkBytes + codePointBytes > maxChunkBytes) {
      yield text.slice(chunkStart, offset);
      chunkStart = offset;
      chunkBytes = 0;
    }
    chunkBytes += codePointBytes;
    offset += codeUnits;
  }

  if (chunkStart < text.length) {
    yield text.slice(chunkStart);
  }
}

class InstallRunRushBootstrap implements IInstallRunRushBootstrap {
  public readonly enabled: boolean = true;
  public readonly logger: ILogger;
  public readonly externalOutputCaptureMaxBytes: number;
  public readonly externalOutputHandler: (stream: BootstrapStream, text: string) => void;
  public readonly externalOutputOverflowHandler: () => void;
  public readonly prepareToRun: () => void;

  private readonly _entries: IBufferedBootstrapEntry[];
  private readonly _env: Record<string, string | undefined>;
  private readonly _stdout: (text: string) => void;
  private readonly _stderr: (text: string) => void;
  private readonly _handoffDirectory: string;
  private readonly _maxBytes: number;
  private readonly _now: () => string;
  private readonly _randomUUID: () => string;
  private readonly _sessionId: string;
  private readonly _sourceVersion: string;
  private readonly _entryLimit: number;
  private _usedBytes: number;
  private _nextSequence: number;
  private _nextEventNumber: number;
  private _droppedReplaceable: number;
  private _droppedRequired: number;
  private _failureFlushed: boolean;

  public constructor(options: IInstallRunRushBootstrapOptions) {
    this._entries = [];
    this._env = options.env;
    this._stdout = options.stdout ?? ((text: string) => process.stdout.write(text));
    this._stderr = options.stderr ?? ((text: string) => process.stderr.write(text));
    this._handoffDirectory = options.handoffDirectory ?? os.tmpdir();
    this._maxBytes = options.maxBytes ?? BOOTSTRAP_BUFFER_MAX_BYTES;
    this._now = options.now ?? (() => new Date().toISOString());
    this._randomUUID = options.randomUUID ?? (() => crypto.randomUUID());
    this._sessionId = `rush_bootstrap_${process.pid}_${this._randomUUID()}`;
    this._sourceVersion = options.bootstrapVersion;
    this._entryLimit = this._maxBytes - TRUNCATION_NOTICE_RESERVE_BYTES;
    if (this._entryLimit <= 0) {
      throw new RangeError(`maxBytes must be greater than ${TRUNCATION_NOTICE_RESERVE_BYTES}.`);
    }
    this._usedBytes = 0;
    this._nextSequence = 1;
    this._nextEventNumber = 1;
    this._droppedReplaceable = 0;
    this._droppedRequired = 0;
    this._failureFlushed = false;
    this.externalOutputCaptureMaxBytes = this._maxBytes;
    this._addEvent({
      type: 'sessionStarted',
      privacy: 'public',
      payload: { rushVersion: options.rushVersion, cwd: process.cwd() }
    });
    this._addEvent({
      type: 'commandStarted',
      privacy: 'public',
      payload: { commandName: options.argv[0] ?? 'unknown', argv: options.argv }
    });

    this.logger = {
      info: (text: string) => {
        this._addEvent(
          {
            type: 'activityChanged',
            privacy: 'public',
            payload: { kind: 'bootstrap', text }
          },
          { stream: 'stdout', text: `${text}\n` }
        );
      },
      error: (text: string) => {
        const droppedRequiredBefore: number = this._droppedRequired;
        this._addExternalOutput('stderr', `${text}\n`);
        this._flushFailureOutput();
        if (this._droppedRequired > droppedRequiredBefore) {
          this._stderr(`${text}\n`);
        }
      }
    };
    this.externalOutputHandler = (stream: BootstrapStream, text: string) => {
      this._addExternalOutput(stream, text);
    };
    this.externalOutputOverflowHandler = () => {
      this._droppedRequired++;
    };
    this.prepareToRun = () => {
      this._writeHandoff();
    };
  }

  private _addEvent(event: IBootstrapEventInput, fallbackWrite?: IFallbackWrite): void {
    const required: boolean = event.type !== 'activityChanged';
    const line: string = encodeBootstrapEnvelope({
      eventId: `boot_${this._nextEventNumber++}`,
      sessionId: this._sessionId,
      sequence: this._nextSequence++,
      timestamp: this._now(),
      source: { packageName: 'install-run-rush', packageVersion: this._sourceVersion },
      privacy: event.privacy,
      required,
      type: event.type,
      payload: event.payload
    });
    const bytes: number = Buffer.byteLength(line, 'utf8') + 1;
    if (this._usedBytes + bytes <= this._entryLimit) {
      this._entries.push({ line, bytes, required, fallbackWrite });
      this._usedBytes += bytes;
      return;
    }

    if (!required) {
      this._droppedReplaceable++;
      return;
    }

    for (
      let index: number = 0;
      this._usedBytes + bytes > this._entryLimit && index < this._entries.length;

    ) {
      const entry: IBufferedBootstrapEntry = this._entries[index];
      if (entry.required) {
        index++;
      } else {
        this._entries.splice(index, 1);
        this._usedBytes -= entry.bytes;
        this._droppedReplaceable++;
      }
    }
    if (this._usedBytes + bytes <= this._entryLimit) {
      this._entries.push({ line, bytes, required, fallbackWrite });
      this._usedBytes += bytes;
    } else {
      this._droppedRequired++;
    }
  }

  private _addExternalOutput(stream: BootstrapStream, text: string): void {
    if (!text) {
      return;
    }
    for (const chunk of chunkUtf8Text(text, BOOTSTRAP_EXTERNAL_CHUNK_MAX_BYTES)) {
      this._addEvent(
        {
          type: 'externalOutput',
          privacy: 'local-sensitive',
          payload: { stream, text: chunk }
        },
        { stream, text: chunk }
      );
    }
  }

  private _flushFailureOutput(): void {
    if (this._failureFlushed) {
      return;
    }
    this._failureFlushed = true;
    for (const entry of this._entries) {
      const write: IFallbackWrite | undefined = entry.fallbackWrite;
      if (write) {
        (write.stream === 'stdout' ? this._stdout : this._stderr)(write.text);
      }
    }
  }

  private _writeHandoff(): void {
    const serialized: string = this._serializeEvents();
    const nonce: string = this._randomUUID();
    const fileName: string = `${BOOTSTRAP_HANDOFF_FILE_PREFIX}${process.pid}-${nonce}${BOOTSTRAP_HANDOFF_FILE_SUFFIX}`;
    const handoffPath: string = path.join(this._handoffDirectory, fileName);
    fs.mkdirSync(this._handoffDirectory, { recursive: true });
    fs.writeFileSync(handoffPath, `${JSON.stringify({ kind: 'bootstrapHandoff', nonce })}\n${serialized}`, {
      encoding: 'utf8',
      mode: 0o600,
      flag: 'wx'
    });
    if (process.platform !== 'win32') {
      fs.chmodSync(handoffPath, 0o600);
    }
    this._env[RUSH_REPORTER_BOOTSTRAP_HANDOFF_ENV_VAR] = handoffPath;
    this._env[RUSH_REPORTER_BOOTSTRAP_NONCE_ENV_VAR] = nonce;
  }

  private _serializeEvents(): string {
    const truncated: boolean = this._droppedReplaceable + this._droppedRequired > 0;
    if (truncated) {
      const notice: string = encodeBootstrapEnvelope({
        eventId: 'boot_bufferTruncated',
        sessionId: this._sessionId,
        sequence: this._nextSequence++,
        timestamp: this._now(),
        source: { packageName: 'install-run-rush', packageVersion: this._sourceVersion },
        privacy: 'public',
        required: true,
        type: 'extension',
        payload: {
          name: BOOTSTRAP_BUFFER_TRUNCATED_EXTENSION_NAME,
          droppedReplaceable: this._droppedReplaceable,
          droppedOther: 0,
          droppedRequired: this._droppedRequired,
          failed: this._droppedRequired > 0
        }
      });
      if (Buffer.byteLength(notice, 'utf8') + 1 > TRUNCATION_NOTICE_RESERVE_BYTES) {
        throw new Error('The bootstrap truncation notice exceeded its reserved capacity.');
      }
      this._entries.push({
        line: notice,
        bytes: Buffer.byteLength(notice, 'utf8') + 1,
        required: true
      });
    }

    if (this._droppedRequired > 0) {
      throw new Error(
        `The Rush reporter bootstrap buffer exceeded ${this._maxBytes} bytes and could not preserve ` +
          `${this._droppedRequired} required event(s).`
      );
    }

    return this._entries.length > 0
      ? `${this._entries.map((entry: IBufferedBootstrapEntry) => entry.line).join('\n')}\n`
      : '';
  }
}

function createLegacyBootstrap(options: IInstallRunRushBootstrapOptions): IInstallRunRushBootstrap {
  const stdout: (text: string) => void = options.stdout ?? ((text: string) => process.stdout.write(text));
  const stderr: (text: string) => void = options.stderr ?? ((text: string) => process.stderr.write(text));
  return {
    enabled: false,
    logger: options.quiet
      ? { info: () => {}, error: (text: string) => stderr(`${text}\n`) }
      : {
          info: (text: string) => stdout(`${text}\n`),
          error: (text: string) => stderr(`${text}\n`)
        },
    externalOutputHandler: undefined,
    externalOutputCaptureMaxBytes: undefined,
    externalOutputOverflowHandler: undefined,
    prepareToRun: undefined
  };
}

export function createInstallRunRushBootstrap(
  options: IInstallRunRushBootstrapOptions
): IInstallRunRushBootstrap {
  if (BOOTSTRAP_PROTOCOL_MAJOR < 1) {
    throw new Error('The generated Rush reporter bootstrap protocol is invalid.');
  }
  delete options.env[RUSH_REPORTER_BOOTSTRAP_HANDOFF_ENV_VAR];
  delete options.env[RUSH_REPORTER_BOOTSTRAP_NONCE_ENV_VAR];

  if (options.commandName !== 'rush') {
    return createLegacyBootstrap(options);
  }

  const environmentReporter: string | undefined = options.env.RUSH_REPORTER?.trim().toLowerCase();
  if (environmentReporter === 'legacy') {
    return createLegacyBootstrap(options);
  }

  const explicitReporter: string | undefined = readSingleFlagValue(options.argv, '--reporter');
  const explicitLogLevel: string | undefined = readSingleFlagValue(options.argv, '--log-level');
  if (explicitReporter !== undefined && !SUPPORTED_REPORTERS.has(explicitReporter)) {
    throw new Error(
      `Unsupported reporter ${JSON.stringify(explicitReporter)}. ` +
        'Supported values are default, ai, json, plaintext, file, and legacy.'
    );
  }
  if (explicitLogLevel !== undefined && !SUPPORTED_LOG_LEVELS.has(explicitLogLevel)) {
    throw new Error(
      `Unsupported log level ${JSON.stringify(explicitLogLevel)}. ` +
        'Supported values are quiet, normal, verbose, and debug.'
    );
  }

  if (explicitReporter === 'legacy') {
    return createLegacyBootstrap(options);
  }

  const repositoryOptIn: boolean = repositoryUsesRushReporter(options.rushJsonFolder);
  const explicitOptIn: boolean = explicitReporter !== undefined;
  if (!explicitOptIn && !repositoryOptIn) {
    return createLegacyBootstrap(options);
  }

  if (!supportsBootstrapHandoff(options.rushVersion, options.bootstrapVersion)) {
    if (explicitOptIn) {
      throw new Error(
        `Rush version ${options.rushVersion} does not support the reporter bootstrap requested by ` +
          `${JSON.stringify(`--reporter=${explicitReporter}`)}. Update the repository Rush version or ` +
          'use --reporter=legacy.'
      );
    }
    return createLegacyBootstrap(options);
  }

  return new InstallRunRushBootstrap(options);
}
