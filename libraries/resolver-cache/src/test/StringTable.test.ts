// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { BinaryReader } from '../BinaryReader';
import { BinaryWriter } from '../BinaryWriter';
import { readStringTable, StringTableBuilder, writeStringTable } from '../StringTable';

function roundTrip(values: readonly string[]): { strings: string[]; byteLength: number } {
  const builder: StringTableBuilder = new StringTableBuilder();
  for (const value of values) {
    builder.add(value);
  }
  const finalized: readonly string[] = builder.finalize();

  const writer: BinaryWriter = new BinaryWriter(64);
  writeStringTable(writer, finalized);
  const encoded: Uint8Array = writer.toUint8Array();

  return { strings: readStringTable(new BinaryReader(encoded)), byteLength: encoded.length };
}

describe('StringTable', () => {
  it('round-trips a sorted table', () => {
    const values: string[] = ['beta', 'alpha', 'alphabet', 'alpine'];
    const { strings } = roundTrip(values);

    for (const value of values) {
      expect(strings).toContain(value);
    }
  });

  it('assigns stable indices for every added string', () => {
    const builder: StringTableBuilder = new StringTableBuilder();
    const values: string[] = ['a/b/c', 'a/b/d', 'a/e'];
    for (const value of values) {
      builder.add(value);
    }
    const finalized: readonly string[] = builder.finalize();

    for (const value of values) {
      expect(finalized[builder.getIndex(value)]).toEqual(value);
    }
  });

  it('shares long directory prefixes between siblings', () => {
    const prefix: string = 'common/temp/default/node_modules/.pnpm/';
    const values: string[] = [];
    for (let i: number = 0; i < 64; ++i) {
      values.push(`${prefix}package-${i}@1.0.0/node_modules/package-${i}`);
    }

    const { byteLength, strings } = roundTrip(values);
    const naiveByteLength: number = values.reduce(
      (total: number, value: string) => total + value.length + 2,
      0
    );

    for (const value of values) {
      expect(strings).toContain(value);
    }
    expect(byteLength).toBeLessThan(naiveByteLength / 2);
  });

  it('never splits a surrogate pair across a prefix boundary', () => {
    // These two strings share the leading high surrogate of their first astral character, so a
    // naive common-prefix computation would emit a lone surrogate that cannot be encoded as UTF-8.
    const values: string[] = ['x\u{1F600}a', 'x\u{1F601}b'];
    const { strings } = roundTrip(values);

    for (const value of values) {
      expect(strings).toContain(value);
    }
  });

  it('rejects reads of strings that were never added', () => {
    const builder: StringTableBuilder = new StringTableBuilder();
    builder.add('present');
    builder.finalize();

    expect(() => builder.getIndex('absent')).toThrowErrorMatchingInlineSnapshot(
      `"The string \\"absent\\" was not added to the string table"`
    );
  });

  it('rejects additions after finalization', () => {
    const builder: StringTableBuilder = new StringTableBuilder();
    builder.finalize();

    expect(() => builder.add('late')).toThrowErrorMatchingInlineSnapshot(
      `"Cannot add strings after the table has been finalized"`
    );
  });
});

describe('BinaryWriter', () => {
  it('round-trips varints across byte-length boundaries', () => {
    const values: number[] = [0, 1, 127, 128, 16383, 16384, 2 ** 31, Number.MAX_SAFE_INTEGER];
    const writer: BinaryWriter = new BinaryWriter(4);
    for (const value of values) {
      writer.writeVarint(value);
    }

    const reader: BinaryReader = new BinaryReader(writer.toUint8Array());
    expect(values.map(() => reader.readVarint())).toEqual(values);
    expect(reader.atEnd).toBe(true);
  });

  it('round-trips signed varints', () => {
    const values: number[] = [0, -1, 1, -64, 64, -100000, 100000];
    const writer: BinaryWriter = new BinaryWriter(4);
    for (const value of values) {
      writer.writeSignedVarint(value);
    }

    const reader: BinaryReader = new BinaryReader(writer.toUint8Array());
    expect(values.map(() => reader.readSignedVarint())).toEqual(values);
  });

  it('encodes small signed values in a single byte', () => {
    const writer: BinaryWriter = new BinaryWriter(4);
    writer.writeSignedVarint(-63);
    writer.writeSignedVarint(63);
    expect(writer.length).toEqual(2);
  });

  it('rejects negative unsigned varints', () => {
    expect(() => new BinaryWriter().writeVarint(-1)).toThrowErrorMatchingInlineSnapshot(
      `"Cannot encode -1 as an unsigned varint"`
    );
  });
});

describe('BinaryReader', () => {
  it('reports truncated buffers', () => {
    expect(() => new BinaryReader(new Uint8Array(1)).readBytes(4)).toThrowErrorMatchingInlineSnapshot(
      `"Unexpected end of buffer: needed 4 byte(s) at offset 0 but only 1 remain"`
    );
  });
});
