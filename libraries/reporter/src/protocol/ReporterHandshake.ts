// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { IReporterProtocolVersion } from '../events/ReporterProtocolVersion';
import type { IRushDiagnostic } from '../diagnostics/IRushDiagnostic';
import { createRushDiagnostic } from '../diagnostics/createRushDiagnostic';
import type { ReporterName, ReporterLogLevel } from '../config/ReporterNames';
import { isSupportedReporterName, isSupportedLogLevel } from '../config/ReporterNames';
import { isReporterProtocolCompatible } from './ReporterProtocol';

/**
 * The opening message a cross-process producer sends to negotiate the wire protocol.
 *
 * @beta
 */
export interface IReporterHello {
  /**
   * Discriminates the message kind.
   */
  readonly kind: 'hello';

  /**
   * The protocol version the producer implements.
   */
  readonly protocolVersion: IReporterProtocolVersion;

  /**
   * The version of the producing package.
   */
  readonly producerVersion: string;

  /**
   * Optional capabilities the producer can use if the consumer supports them.
   */
  readonly capabilities: readonly string[];

  /**
   * Correctness-critical features the producer requires the consumer to support.
   */
  readonly requiredFeatures: readonly string[];
}

/**
 * Thrown when an untrusted wire value is not a valid reporter hello message.
 *
 * @beta
 */
export class InvalidReporterHelloError extends Error {
  public constructor(reason: string) {
    super(`Invalid reporter hello message: ${reason}`);
    this.name = 'InvalidReporterHelloError';
    Object.setPrototypeOf(this, InvalidReporterHelloError.prototype);
  }
}

/**
 * Parent-owned rendering and filtering context shared with a child producer.
 *
 * @remarks
 * This context is advisory and read-only. A child must not use it to select or
 * create the parent's reporters.
 *
 * @beta
 */
export interface IReporterChildContext {
  /**
   * The parent's selected primary reporter.
   */
  readonly reporter: ReporterName;

  /**
   * The parent's selected log level.
   */
  readonly logLevel: ReporterLogLevel;

  /**
   * Whether the parent renders color.
   */
  readonly color: boolean;

  /**
   * The parent's terminal width in columns.
   */
  readonly terminalWidth: number;
}

/**
 * The consumer's reply that accepts capabilities and reports unsupported required features.
 *
 * @beta
 */
export interface IReporterHelloAck {
  /**
   * Discriminates the message kind.
   */
  readonly kind: 'helloAck';

  /**
   * The protocol version the consumer implements.
   */
  readonly protocolVersion: IReporterProtocolVersion;

  /**
   * The subset of the producer's capabilities the consumer accepted.
   */
  readonly acceptedCapabilities: readonly string[];

  /**
   * The producer's required features the consumer does not support.
   */
  readonly rejectedRequiredFeatures: readonly string[];

  /**
   * Parent-owned rendering and filtering context, present only when the
   * `reporter-context-v1` capability was accepted.
   */
  readonly context?: IReporterChildContext;
}

/**
 * Thrown when an untrusted wire value is not a valid reporter hello acknowledgement.
 *
 * @beta
 */
export class InvalidReporterHelloAckError extends Error {
  public constructor(reason: string) {
    super(`Invalid reporter hello acknowledgement: ${reason}`);
    this.name = 'InvalidReporterHelloAckError';
    Object.setPrototypeOf(this, InvalidReporterHelloAckError.prototype);
  }
}

/**
 * The governed registry of capabilities the reporter protocol knows about.
 *
 * @remarks
 * Capabilities and handshake `requiredFeatures` share one wire namespace: a
 * required feature is simply a capability the producer cannot operate
 * without. On the wire both are untrusted strings — unknown capabilities are
 * ignored and unknown required features cause rejection, per protocol rules.
 * This registry makes the Rush-known set explicit; additions go through API
 * review like every other contract change. The registry is intentionally
 * @beta
 */
// eslint-disable-next-line @typescript-eslint/typedef -- literal inference feeds the derived ReporterCapability type
export const REPORTER_KNOWN_CAPABILITIES = ['heft-child-events-v1', 'reporter-context-v1'] as const;

/**
 * A wire capability name. Known members keep autocomplete; unknown members
 * are representable so a newer producer's capabilities degrade gracefully in
 * an older consumer.
 *
 * @beta
 */
export type ReporterCapability = (typeof REPORTER_KNOWN_CAPABILITIES)[number] | (string & {});

/**
 * Options for {@link negotiateReporterHello}.
 *
 * @beta
 */
export interface IReporterHandshakeOptions {
  /**
   * The protocol version the consumer implements.
   */
  readonly supportedProtocolVersion: IReporterProtocolVersion;

  /**
   * The capabilities the consumer supports. Anything not listed is treated as
   * an unknown optional capability and is simply not accepted.
   */
  readonly supportedCapabilities?: readonly ReporterCapability[];

  /**
   * Parent-owned context to include when `reporter-context-v1` is accepted.
   */
  readonly context?: IReporterChildContext;
}

/**
 * The result of negotiating a producer hello.
 *
 * @beta
 */
export interface IReporterHandshakeResult {
  /**
   * Whether the connection was accepted. A connection is accepted only when the
   * majors are compatible and every required feature is supported.
   */
  readonly accepted: boolean;

  /**
   * The acknowledgement to send back to the producer.
   */
  readonly ack: IReporterHelloAck;

  /**
   * An update-global-Rush diagnostic, present when the major is unsupported or a
   * required feature is unknown.
   */
  readonly diagnostic?: IRushDiagnostic;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isProtocolVersion(value: unknown): value is IReporterProtocolVersion {
  if (!isRecord(value)) {
    return false;
  }
  return (
    typeof value.major === 'number' &&
    Number.isSafeInteger(value.major) &&
    value.major >= 0 &&
    typeof value.minor === 'number' &&
    Number.isSafeInteger(value.minor) &&
    value.minor >= 0
  );
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item: unknown) => typeof item === 'string');
}

export function validateReporterChildContext(value: unknown): IReporterChildContext {
  if (!isRecord(value)) {
    throw new InvalidReporterHelloAckError('context must be an object.');
  }
  if (typeof value.reporter !== 'string' || !isSupportedReporterName(value.reporter)) {
    throw new InvalidReporterHelloAckError('context.reporter must be a supported reporter name.');
  }
  if (typeof value.logLevel !== 'string' || !isSupportedLogLevel(value.logLevel)) {
    throw new InvalidReporterHelloAckError('context.logLevel must be a supported reporter log level.');
  }
  if (typeof value.color !== 'boolean') {
    throw new InvalidReporterHelloAckError('context.color must be a boolean.');
  }
  if (
    typeof value.terminalWidth !== 'number' ||
    !Number.isSafeInteger(value.terminalWidth) ||
    value.terminalWidth < 1
  ) {
    throw new InvalidReporterHelloAckError('context.terminalWidth must be a positive integer.');
  }
  return {
    reporter: value.reporter,
    logLevel: value.logLevel,
    color: value.color,
    terminalWidth: value.terminalWidth
  };
}

/**
 * Validates and parses an untrusted wire value as a reporter hello message.
 *
 * @param value - the decoded NDJSON value
 * @throws {@link InvalidReporterHelloError} if the value is malformed
 *
 * @beta
 */
export function parseReporterHello(value: unknown): IReporterHello {
  if (!isRecord(value) || value.kind !== 'hello') {
    throw new InvalidReporterHelloError('expected kind "hello".');
  }
  if (!isProtocolVersion(value.protocolVersion)) {
    throw new InvalidReporterHelloError('protocolVersion must contain nonnegative integer major and minor.');
  }
  if (typeof value.producerVersion !== 'string' || value.producerVersion.length === 0) {
    throw new InvalidReporterHelloError('producerVersion must be a nonempty string.');
  }
  if (!isStringArray(value.capabilities)) {
    throw new InvalidReporterHelloError('capabilities must be an array of strings.');
  }
  if (!isStringArray(value.requiredFeatures)) {
    throw new InvalidReporterHelloError('requiredFeatures must be an array of strings.');
  }

  return {
    kind: 'hello',
    protocolVersion: {
      major: value.protocolVersion.major,
      minor: value.protocolVersion.minor
    },
    producerVersion: value.producerVersion,
    capabilities: [...value.capabilities],
    requiredFeatures: [...value.requiredFeatures]
  };
}

/**
 * Validates and parses an untrusted wire value as a reporter hello acknowledgement.
 *
 * @param value - the decoded NDJSON value
 * @throws {@link InvalidReporterHelloAckError} if the value is malformed
 *
 * @beta
 */
export function parseReporterHelloAck(value: unknown): IReporterHelloAck {
  if (!isRecord(value) || value.kind !== 'helloAck') {
    throw new InvalidReporterHelloAckError('expected kind "helloAck".');
  }
  if (!isProtocolVersion(value.protocolVersion)) {
    throw new InvalidReporterHelloAckError(
      'protocolVersion must contain nonnegative integer major and minor.'
    );
  }
  if (!isStringArray(value.acceptedCapabilities)) {
    throw new InvalidReporterHelloAckError('acceptedCapabilities must be an array of strings.');
  }
  if (!isStringArray(value.rejectedRequiredFeatures)) {
    throw new InvalidReporterHelloAckError('rejectedRequiredFeatures must be an array of strings.');
  }
  const context: IReporterChildContext | undefined =
    value.context === undefined ? undefined : validateReporterChildContext(value.context);
  if (context !== undefined && !value.acceptedCapabilities.includes('reporter-context-v1')) {
    throw new InvalidReporterHelloAckError(
      'context requires the "reporter-context-v1" capability to be accepted.'
    );
  }

  return {
    kind: 'helloAck',
    protocolVersion: {
      major: value.protocolVersion.major,
      minor: value.protocolVersion.minor
    },
    acceptedCapabilities: [...value.acceptedCapabilities],
    rejectedRequiredFeatures: [...value.rejectedRequiredFeatures],
    ...(context === undefined ? {} : { context })
  };
}

/**
 * Negotiates a producer's hello against the consumer's supported protocol.
 *
 * @remarks
 * Capabilities are optional: the consumer accepts the intersection of the
 * producer's capabilities and its own, and ignores the rest. Only unknown
 * required features or an unsupported major cause rejection, and either emits an
 * update-global-Rush diagnostic. A differing minor is always compatible because
 * minor versions are additive.
 *
 * @param helloValue - the producer's decoded hello wire value
 * @param options - the consumer's supported protocol and capabilities
 *
 * @beta
 */
export function negotiateReporterHello(
  helloValue: unknown,
  options: IReporterHandshakeOptions
): IReporterHandshakeResult {
  const hello: IReporterHello = parseReporterHello(helloValue);
  const consumerVersion: IReporterProtocolVersion = options.supportedProtocolVersion;
  const supportedCapabilities: ReadonlySet<string> = new Set(options.supportedCapabilities ?? []);

  const acceptedCapabilities: string[] = hello.capabilities.filter((capability: string) =>
    supportedCapabilities.has(capability)
  );
  const rejectedRequiredFeatures: string[] = hello.requiredFeatures.filter(
    (feature: string) => !supportedCapabilities.has(feature)
  );

  const majorSupported: boolean = isReporterProtocolCompatible(consumerVersion, hello.protocolVersion);
  const accepted: boolean = majorSupported && rejectedRequiredFeatures.length === 0;
  const context: IReporterChildContext | undefined =
    acceptedCapabilities.includes('reporter-context-v1') && options.context !== undefined
      ? validateReporterChildContext(options.context)
      : undefined;

  const ack: IReporterHelloAck = {
    kind: 'helloAck',
    protocolVersion: consumerVersion,
    acceptedCapabilities,
    rejectedRequiredFeatures,
    ...(context === undefined ? {} : { context })
  };

  if (accepted) {
    return { accepted: true, ack };
  }

  const diagnostic: IRushDiagnostic = createRushDiagnostic('RUSH_PROTOCOL_UPDATE_REQUIRED', {
    parameters: {
      producerVersion: { value: hello.producerVersion, privacy: 'public' },
      producerProtocolMajor: { value: hello.protocolVersion.major, privacy: 'public' }
    }
  });

  return { accepted: false, ack, diagnostic };
}
