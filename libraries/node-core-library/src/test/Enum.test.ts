// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { Enum } from '../Enum.ts';

// Bidirectional map
enum NumericEnum {
  Apple = 1,
  Banana
}

// Unidirectional map
enum StringEnum {
  Apple = 'apple',
  Banana = 'banana'
}

enum MixedEnum {
  // Bidirectional map
  Apple = 1,
  // Unidirectional map
  Banana = 'banana'
}

describe(Enum.name, () => {
  test('tryGetValueByKey', () => {
    // NumericEnum
    const numeric1: NumericEnum | undefined = Enum.tryGetValueByKey(NumericEnum, 'Apple');
    expect(numeric1).toBe(NumericEnum.Apple);

    const numeric2: NumericEnum | undefined = Enum.tryGetValueByKey(NumericEnum, 'Coconut');
    expect(numeric2).toBeUndefined();

    // StringEnum
    const string1: StringEnum | undefined = Enum.tryGetValueByKey(StringEnum, 'Apple');
    expect(string1).toBe(StringEnum.Apple);

    const string2: StringEnum | undefined = Enum.tryGetValueByKey(StringEnum, 'Coconut');
    expect(string2).toBeUndefined();

    // MixedEnum
    const mixed1: MixedEnum | undefined = Enum.tryGetValueByKey(MixedEnum, 'Apple');
    expect(mixed1).toBe(MixedEnum.Apple);

    const mixed2: MixedEnum | undefined = Enum.tryGetValueByKey(MixedEnum, 'Banana');
    expect(mixed2).toBe(MixedEnum.Banana);

    const mixed3: MixedEnum | undefined = Enum.tryGetValueByKey(MixedEnum, 'Coconut');
    expect(mixed3).toBeUndefined();
  });

  test('tryGetKeyByNumber', () => {
    // NumericEnum
    const numeric1: string | undefined = Enum.tryGetKeyByNumber(NumericEnum, NumericEnum.Apple as number);
    expect(numeric1).toBe('Apple');

    const numeric2: string | undefined = Enum.tryGetKeyByNumber(NumericEnum, -1);
    expect(numeric2).toBeUndefined();

    // StringEnum

    // Not allowed because values must be numeric:
    // const string1: string | undefined = Enum.tryGetKeyByNumber(StringEnum, StringEnum.Apple);

    const string2: string | undefined = Enum.tryGetKeyByNumber(StringEnum, -1);
    expect(string2).toBeUndefined();

    // MixedEnum
    const mixed1: string | undefined = Enum.tryGetKeyByNumber(MixedEnum, MixedEnum.Apple);
    expect(mixed1).toBe('Apple');

    // Not allowed because values must be numeric:
    // const mixed2: string | undefined = Enum.tryGetKeyByNumber(MixedEnum, MixedEnum.Banana);

    const mixed3: string | undefined = Enum.tryGetKeyByNumber(MixedEnum, -1);
    expect(mixed3).toBeUndefined();
  });
});
