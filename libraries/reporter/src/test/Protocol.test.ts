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
  type IReporterHandshakeResult
} from '../index';

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

  it('throws when a decoded record exceeds the limit', () => {
    const decoder: NdjsonDecoder = new NdjsonDecoder({ maxRecordBytes: 10 });
    expect(() => decoder.decode(`${'"'}${'x'.repeat(100)}${'"'}\n`)).toThrow(NdjsonRecordTooLargeError);
  });

  it('throws when a partial line exceeds the limit before a newline arrives', () => {
    const decoder: NdjsonDecoder = new NdjsonDecoder({ maxRecordBytes: 10 });
    expect(() => decoder.decode('x'.repeat(50))).toThrow(NdjsonRecordTooLargeError);
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
    expect(result.ack.acceptedCapabilities).toEqual(['color', 'watch']);
    expect(result.ack.rejectedRequiredFeatures).toEqual([]);
    expect(result.diagnostic).toBeUndefined();
  });

  it('accepts across an additive minor difference', () => {
    const result: IReporterHandshakeResult = negotiateReporterHello(
      makeHello({ protocolVersion: { major: 1, minor: 7 } }),
      { supportedProtocolVersion: { major: 1, minor: 0 } }
    );
    expect(result.accepted).toBe(true);
    expect(result.diagnostic).toBeUndefined();
  });

  it('rejects an unknown required feature with an update-global-Rush diagnostic', () => {
    const result: IReporterHandshakeResult = negotiateReporterHello(
      makeHello({ requiredFeatures: ['streaming-artifacts'] }),
      { supportedProtocolVersion: { major: 1, minor: 0 }, supportedCapabilities: ['color'] }
    );
    expect(result.accepted).toBe(false);
    expect(result.ack.rejectedRequiredFeatures).toEqual(['streaming-artifacts']);
    expect(result.diagnostic?.code).toBe('RUSH_PROTOCOL_UPDATE_REQUIRED');
    expect(result.diagnostic?.category).toBe('environment');
  });

  it('rejects an unsupported major with an update-global-Rush diagnostic', () => {
    const result: IReporterHandshakeResult = negotiateReporterHello(
      makeHello({ protocolVersion: { major: 2, minor: 0 } }),
      { supportedProtocolVersion: { major: 1, minor: 0 } }
    );
    expect(result.accepted).toBe(false);
    expect(result.diagnostic?.code).toBe('RUSH_PROTOCOL_UPDATE_REQUIRED');
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
});
