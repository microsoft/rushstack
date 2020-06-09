// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { Text } from '../Text';

describe('Text', () => {
  describe('padEnd', () => {
    test("Throws an exception if the padding character isn't a single character", () => {
      expect(() => Text.padEnd('123', 1, '')).toThrow();
      expect(() => Text.padEnd('123', 1, '  ')).toThrow();
    });

    test("Doesn't change the string if it's already at or greater than the minimum length", () => {
      expect(Text.padEnd('12345', 5)).toEqual('12345');
      expect(Text.padEnd('123456', 5)).toEqual('123456');
      expect(Text.padEnd('12345', 5, '0')).toEqual('12345');
      expect(Text.padEnd('123456', 5, '0')).toEqual('123456');
    });

    test('Appends the default character (spaces) to the end of a string', () => {
      expect(Text.padEnd('', 5)).toEqual('     ');
      expect(Text.padEnd('123', 5)).toEqual('123  ');
    });

    test('Appends the characters to the end of a string', () => {
      expect(Text.padEnd('', 5, '0')).toEqual('00000');
      expect(Text.padEnd('123', 5, '0')).toEqual('12300');
    });
  });

  describe('padStart', () => {
    test("Throws an exception if the padding character isn't a single character", () => {
      expect(() => Text.padStart('123', 1, '')).toThrow();
      expect(() => Text.padStart('123', 1, '  ')).toThrow();
    });

    test("Doesn't change the string if it's already at or greater than the minimum length", () => {
      expect(Text.padStart('12345', 5)).toEqual('12345');
      expect(Text.padStart('123456', 5)).toEqual('123456');
      expect(Text.padStart('12345', 5, '0')).toEqual('12345');
      expect(Text.padStart('123456', 5, '0')).toEqual('123456');
    });

    test('Appends the default character (spaces) to the end of a string', () => {
      expect(Text.padStart('', 5)).toEqual('     ');
      expect(Text.padStart('123', 5)).toEqual('  123');
    });

    test('Appends the characters to the end of a string', () => {
      expect(Text.padStart('', 5, '0')).toEqual('00000');
      expect(Text.padStart('123', 5, '0')).toEqual('00123');
    });
  });

  describe('truncateWithEllipsis', () => {
    test('Throws an exception if the maximum length is less than zero', () => {
      expect(() => Text.truncateWithEllipsis('123', -1)).toThrow();
    });

    test("Doesn't change the string if it's already shorter than the maximum length", () => {
      expect(Text.truncateWithEllipsis('', 2)).toEqual('');
      expect(Text.truncateWithEllipsis('1', 2)).toEqual('1');
      expect(Text.truncateWithEllipsis('12', 2)).toEqual('12');

      expect(Text.truncateWithEllipsis('123', 5)).toEqual('123');
      expect(Text.truncateWithEllipsis('1234', 5)).toEqual('1234');
    });

    test('Truncates strings', () => {
      expect(Text.truncateWithEllipsis('123', 0)).toEqual('');
      expect(Text.truncateWithEllipsis('123', 2)).toEqual('12');
      expect(Text.truncateWithEllipsis('12345', 5)).toEqual('12345');
      expect(Text.truncateWithEllipsis('123456', 5)).toEqual('12...');
    });
  });
});
