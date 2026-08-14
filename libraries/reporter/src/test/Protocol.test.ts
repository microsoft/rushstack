// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import {
  REPORTER_PROTOCOL_VERSION,
  REPORTER_PROTOCOL_LIMITS,
  isReporterProtocolCompatible,
  encodeNdjsonRecord,
  NdjsonDecoder,
  NdjsonRecordTooLargeError,
  negotiateReporterHello,
  type IReporterHello,
  type IReporterHandshakeOptions,
  type IReporterHandshakeResult
} from '../index';
import { NdjsonEncodeError, NdjsonInvalidRecordError } from '../protocol/Ndjson';
import {
  isReporterEventEnvelope,
  isReporterHello,
  isReporterHelloAck
} from '../protocol/ReporterWireGuards';

describe('ReporterProtocol', () => {
  it('advertises protocol major 1 and the specified byte limits', () => {
    expect(REPORTER_PROTOCOL_VERSION.major).toBe(1);
    expect(REPORTER_PROTOCOL_LIMITS.bootstrapBufferBytes).toBe(1024 * 1024);
    expect(REPORTER_PROTOCOL_LIMITS.ndjsonRecordBytes).toBe(1024 * 1024);
    expect(REPORTER_PROTOCOL_LIMITS.externalOutputChunkBytes).toBe(64 * 1024);
  });

  it('treats an equal major as compatible regardless of minor', () => {
    expect(isReporterProtocolCompatible({ major: 1, minor: 0 }, { major: 1, minor: 9 })).toBe(true);
    expect(isReporterProtocolCompatible({ major: 1, minor: 0 }, { major: 2, minor: 0 })).toBe(false);
  });
});

describe('NDJSON encode/decode', () => {
  it('encodes a value as a single newline-terminated record', () => {
    const record: string = encodeNdjsonRecord({ text: 'a\nb', n: 1 });
    // The embedded newline is escaped, so the only real newline is the terminator.
    expect(record.endsWith('\n')).toBe(true);
    expect(record.indexOf('\n')).toBe(record.length - 1);
  });

  it('round-trips values through the decoder', () => {
    const decoder: NdjsonDecoder = new NdjsonDecoder();
    const stream: string = encodeNdjsonRecord({ id: 1, text: 'line\nbreak' }) + encodeNdjsonRecord({ id: 2 });
    const records: unknown[] = decoder.decode(stream);
    expect(records).toEqual([{ id: 1, text: 'line\nbreak' }, { id: 2 }]);
    expect(decoder.flush()).toEqual([]);
  });

  it('reassembles records split across chunks and ignores blank lines', () => {
    const decoder: NdjsonDecoder = new NdjsonDecoder();
    expect(decoder.decode('{"a":')).toEqual([]);
    expect(decoder.decode('1}\n\n{"b":2}')).toEqual([{ a: 1 }]);
    expect(decoder.flush()).toEqual([{ b: 2 }]);
  });

  it('throws when an encoded record exceeds the limit', () => {
    expect(() => encodeNdjsonRecord({ text: 'x'.repeat(100) }, { maxRecordBytes: 10 })).toThrow(
      NdjsonRecordTooLargeError
    );
  });

  it('wraps values that cannot be serialized in a typed encode error', () => {
    expect(() => encodeNdjsonRecord(undefined)).toThrow(NdjsonEncodeError);
  });

  it('throws when a decoded record exceeds the limit', () => {
    const decoder: NdjsonDecoder = new NdjsonDecoder({ maxRecordBytes: 10 });
    expect(() => decoder.decode(`${'"'}${'x'.repeat(100)}${'"'}\n`)).toThrow(NdjsonRecordTooLargeError);
  });

  it('throws when a partial line exceeds the limit before a newline arrives', () => {
    const decoder: NdjsonDecoder = new NdjsonDecoder({ maxRecordBytes: 10 });
    expect(() => decoder.decode('x'.repeat(50))).toThrow(NdjsonRecordTooLargeError);
  });

  it('preserves good records around an oversized record in one chunk', () => {
    const decoder: NdjsonDecoder = new NdjsonDecoder({ maxRecordBytes: 10 });
    let caughtError: unknown;

    try {
      decoder.decode('{"a":1}\n"xxxxxxxxxxxx"\n{"b":2}\n');
    } catch (error) {
      caughtError = error;
    }

    expect(caughtError).toBeInstanceOf(NdjsonRecordTooLargeError);
    expect((caughtError as NdjsonRecordTooLargeError).partialRecords).toEqual([{ a: 1 }]);
    expect(decoder.decode('')).toEqual([{ b: 2 }]);
  });

  it('enforces the same raw-byte limit with and without a newline', () => {
    const rawRecord: string = '  {"a":1}  ';
    const rawRecordBytes: number = Buffer.byteLength(rawRecord, 'utf8');
    const unterminatedDecoder: NdjsonDecoder = new NdjsonDecoder({
      maxRecordBytes: rawRecordBytes
    });
    const terminatedDecoder: NdjsonDecoder = new NdjsonDecoder({
      maxRecordBytes: rawRecordBytes
    });

    expect(unterminatedDecoder.decode(rawRecord)).toEqual([]);
    expect(unterminatedDecoder.flush()).toEqual([{ a: 1 }]);
    expect(terminatedDecoder.decode(`${rawRecord}\n`)).toEqual([{ a: 1 }]);

    expect(() =>
      new NdjsonDecoder({ maxRecordBytes: rawRecordBytes - 1 }).decode(rawRecord)
    ).toThrow(NdjsonRecordTooLargeError);
    expect(() =>
      new NdjsonDecoder({ maxRecordBytes: rawRecordBytes - 1 }).decode(`${rawRecord}\n`)
    ).toThrow(NdjsonRecordTooLargeError);
  });

  it('counts whitespace padding toward the decoded record limit', () => {
    const decoder: NdjsonDecoder = new NdjsonDecoder({ maxRecordBytes: 8 });
    expect(() => decoder.decode(`1${' '.repeat(8)}\n`)).toThrow(NdjsonRecordTooLargeError);
  });

  it('preserves a multi-byte UTF-8 code point split across Buffer chunks', () => {
    const encoded: Buffer = Buffer.from('{"text":"\ud83d\ude00"}\n', 'utf8');
    const emojiOffset: number = encoded.indexOf(Buffer.from('\ud83d\ude00', 'utf8'));
    const decoder: NdjsonDecoder = new NdjsonDecoder();

    expect(decoder.decode(encoded.subarray(0, emojiOffset + 1))).toEqual([]);
    expect(decoder.decode(encoded.subarray(emojiOffset + 1))).toEqual([{ text: '\ud83d\ude00' }]);
  });

  it('wraps malformed JSON in a typed invalid-record error', () => {
    const decoder: NdjsonDecoder = new NdjsonDecoder();
    let caughtError: unknown;

    try {
      decoder.decode('{"broken":}\n');
    } catch (error) {
      caughtError = error;
    }

    expect(caughtError).toBeInstanceOf(NdjsonInvalidRecordError);
    expect((caughtError as NdjsonInvalidRecordError).line).toBe('{"broken":}');
  });
});

describe('negotiateReporterHello', () => {
  function makeHello(overrides?: Partial<IReporterHello>): IReporterHello {
    return {
      kind: 'hello',
      protocolVersion: { major: 1, minor: 0 },
      producerVersion: '@rushstack/heft 1.2.19',
      capabilities: [],
      requiredFeatures: [],
      ...overrides
    };
  }

  it('accepts a compatible hello and returns the capability intersection', () => {
    const result: IReporterHandshakeResult = negotiateReporterHello(
      makeHello({ capabilities: ['color', 'watch', 'unknown-cap'] }),
      { supportedProtocolVersion: { major: 1, minor: 0 }, supportedCapabilities: ['color', 'watch'] }
    );
    expect(result.accepted).toBe(true);
    expect(result.ack.kind).toBe('helloAck');
    expect(result.ack.accepted).toBe(true);
    expect(result.ack.acceptedCapabilities).toEqual(['color', 'watch']);
    expect(result.ack.rejectedRequiredFeatures).toEqual([]);
    expect(result.diagnostic).toBeUndefined();
  });

  it('accepts across an additive minor difference', () => {
    const result: IReporterHandshakeResult = negotiateReporterHello(
      makeHello({ protocolVersion: { major: 1, minor: 7 } }),
      { supportedProtocolVersion: { major: 1, minor: 0 }, supportedCapabilities: [] }
    );
    expect(result.accepted).toBe(true);
    expect(result.diagnostic).toBeUndefined();
  });

  it('rejects an unknown required feature with an update-global-Rush diagnostic', () => {
    const result: IReporterHandshakeResult = negotiateReporterHello(
      makeHello({ requiredFeatures: ['streaming-artifacts', 'ordered-writes'] }),
      { supportedProtocolVersion: { major: 1, minor: 0 }, supportedCapabilities: ['color'] }
    );
    expect(result.accepted).toBe(false);
    expect(result.ack.accepted).toBe(false);
    expect(result.ack.rejectedRequiredFeatures).toEqual(['streaming-artifacts', 'ordered-writes']);
    expect(result.diagnostic?.code).toBe('RDC_PROTOCOL_UPDATE_REQUIRED');
    expect(result.diagnostic?.category).toBe('environment');
    expect(result.diagnostic?.parameters?.consumerProtocolMajor).toEqual({
      value: 1,
      privacy: 'public'
    });
    expect(result.diagnostic?.parameters?.rejectedFeatures).toEqual({
      value: 'streaming-artifacts, ordered-writes',
      privacy: 'public'
    });
  });

  it('rejects an unsupported major with an update-global-Rush diagnostic', () => {
    const result: IReporterHandshakeResult = negotiateReporterHello(
      makeHello({ protocolVersion: { major: 2, minor: 0 } }),
      { supportedProtocolVersion: { major: 1, minor: 0 }, supportedCapabilities: [] }
    );
    expect(result.accepted).toBe(false);
    expect(result.ack.accepted).toBe(false);
    expect(result.diagnostic?.code).toBe('RDC_PROTOCOL_UPDATE_REQUIRED');
    expect(result.diagnostic?.parameters?.producerProtocolMajor.value).toBe(2);
  });

  it('accepts a required feature that the consumer supports', () => {
    const result: IReporterHandshakeResult = negotiateReporterHello(
      makeHello({ requiredFeatures: ['ordered-sequence'] }),
      {
        supportedProtocolVersion: { major: 1, minor: 0 },
        supportedCapabilities: ['ordered-sequence']
      }
    );
    expect(result.accepted).toBe(true);
    expect(result.ack.rejectedRequiredFeatures).toEqual([]);
  });

  it('requires consumers to declare their supported capabilities', () => {
    // @ts-expect-error -- Consumers must explicitly provide supportedCapabilities, even when empty.
    const options: IReporterHandshakeOptions = {
      supportedProtocolVersion: { major: 1, minor: 0 }
    };
    expect(options.supportedProtocolVersion.major).toBe(1);
  });
});

describe('reporter wire guards', () => {
  it('recognizes hello and helloAck records by their wire shapes', () => {
    const hello: unknown = {
      kind: 'hello',
      protocolVersion: { major: 1, minor: 0 },
      producerVersion: 'producer 1.0.0',
      capabilities: ['color'],
      requiredFeatures: []
    };
    const ack: unknown = {
      kind: 'helloAck',
      accepted: false,
      protocolVersion: { major: 1, minor: 0 },
      acceptedCapabilities: [],
      rejectedRequiredFeatures: ['future-feature']
    };

    expect(isReporterHello(hello)).toBe(true);
    expect(isReporterHelloAck(hello)).toBe(false);
    expect(isReporterHelloAck(ack)).toBe(true);
    expect(isReporterHelloAck({ ...(ack as object), accepted: 'no' })).toBe(false);
  });

  it('recognizes event envelopes and rejects malformed required fields', () => {
    const envelope: Record<string, unknown> = {
      protocolVersion: { major: 1, minor: 0 },
      eventId: 'event-1',
      sessionId: 'session-1',
      sequence: 1,
      timestamp: '2026-07-12T00:00:00.000Z',
      source: { packageName: '@rushstack/reporter', packageVersion: '0.1.0' },
      privacy: 'public',
      required: false,
      type: 'commandStarted',
      payload: { commandName: 'build' }
    };

    expect(isReporterEventEnvelope(envelope)).toBe(true);
    expect(isReporterEventEnvelope({ ...envelope, sequence: '1' })).toBe(false);
    expect(isReporterEventEnvelope({ ...envelope, type: 'unknown-event' })).toBe(false);
    expect(isReporterEventEnvelope({ ...envelope, payload: undefined })).toBe(true);
    const { payload: omittedPayload, ...withoutPayload } = envelope;
    expect(omittedPayload).toBeDefined();
    expect(isReporterEventEnvelope(withoutPayload)).toBe(false);
  });
});
