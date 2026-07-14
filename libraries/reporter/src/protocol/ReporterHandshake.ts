// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { IReporterProtocolVersion } from '../events/ReporterProtocolVersion';
import type { IRushDiagnostic } from '../diagnostics/IRushDiagnostic';
import { createRushDiagnostic } from '../diagnostics/createRushDiagnostic';
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
  readonly capabilities: string[];

  /**
   * Correctness-critical features the producer requires the consumer to support.
   */
  readonly requiredFeatures: string[];
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
  readonly acceptedCapabilities: string[];

  /**
   * The producer's required features the consumer does not support.
   */
  readonly rejectedRequiredFeatures: string[];
}

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
  readonly supportedCapabilities?: readonly string[];
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
 * @param hello - the producer's hello message
 * @param options - the consumer's supported protocol and capabilities
 *
 * @beta
 */
export function negotiateReporterHello(
  hello: IReporterHello,
  options: IReporterHandshakeOptions
): IReporterHandshakeResult {
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

  const ack: IReporterHelloAck = {
    kind: 'helloAck',
    protocolVersion: consumerVersion,
    acceptedCapabilities,
    rejectedRequiredFeatures
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
