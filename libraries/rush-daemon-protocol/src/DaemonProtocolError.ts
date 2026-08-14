// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/**
 * The closed set of machine-readable rushd protocol error codes.
 *
 * @beta
 */
export enum DaemonProtocolErrorCode {
  /** A frame header declared a payload larger than the configured maximum. */
  frameTooLarge = 'frameTooLarge',
  /** A frame header carried a type byte outside the protocol taxonomy. */
  unknownFrameType = 'unknownFrameType',
  /** A frame payload was malformed for its frame type. */
  malformedPayload = 'malformedPayload',
  /** A control frame did not contain a well-formed control message. */
  malformedControlMessage = 'malformedControlMessage',
  /** The peer's protocol major version differs from the local one. */
  protocolVersionMismatch = 'protocolVersionMismatch'
}

/**
 * A typed error raised by the rushd wire protocol.
 *
 * @remarks
 * Every protocol failure carries a machine-readable
 * {@link DaemonProtocolError.code | code} so peers can react programmatically
 * (for example by restarting the daemon on a version mismatch).
 *
 * @beta
 */
export class DaemonProtocolError extends Error {
  /**
   * The machine-readable error code.
   */
  public readonly code: DaemonProtocolErrorCode;

  public constructor(code: DaemonProtocolErrorCode, message: string) {
    super(message);
    this.name = 'DaemonProtocolError';
    this.code = code;
  }
}

/**
 * A protocol error raised (or sent) when the peer's protocol major version
 * differs from the local one.
 *
 * @beta
 */
export class ProtocolVersionMismatchError extends DaemonProtocolError {
  /**
   * The protocol major version required by the rejecting peer.
   */
  public readonly expectedMajor: number;

  /**
   * The protocol major version offered by the rejected peer.
   */
  public readonly actualMajor: number;

  public constructor(expectedMajor: number, actualMajor: number) {
    super(
      DaemonProtocolErrorCode.protocolVersionMismatch,
      `Unsupported rushd protocol major version ${actualMajor}; this peer requires major version ${expectedMajor}.`
    );
    this.name = 'ProtocolVersionMismatchError';
    this.expectedMajor = expectedMajor;
    this.actualMajor = actualMajor;
  }
}
