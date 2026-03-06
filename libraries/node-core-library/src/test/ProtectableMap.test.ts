// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { ProtectableMap } from '../ProtectableMap.ts';

class ExampleApi {
  public clearedCount: number = 0;
  public deletedCount: number = 0;
  public setCount: number = 0;
  private _studentAgesByName: ProtectableMap<string, number>;

  public constructor() {
    this._studentAgesByName = new ProtectableMap({
      onClear: (source: ProtectableMap<string, number>) => {
        ++this.clearedCount;
      },

      onDelete: (source: ProtectableMap<string, number>, key: string) => {
        ++this.deletedCount;
      },

      onSet: (source: ProtectableMap<string, number>, key: string, value: number) => {
        ++this.setCount;
        if (key.toUpperCase() !== key) {
          throw new Error('The key must be all upper case: ' + key);
        }

        // If the provided value is negative, clamp it to zero:
        return Math.max(value, 0);
      }
    });
  }

  public get studentAgesByName(): Map<string, number> {
    return this._studentAgesByName.protectedView;
  }

  public doUnprotectedOperations(): void {
    // These are unprotected because they interact with this._studentAgesByName
    // instead of this._studentAgesByName.protectedView.
    this._studentAgesByName.clear();
    this._studentAgesByName.set('Dave', -123);
  }
}

describe(ProtectableMap.name, () => {
  test('Protected operations', () => {
    const exampleApi: ExampleApi = new ExampleApi();
    exampleApi.studentAgesByName.clear();

    exampleApi.studentAgesByName.set('ALICE', 23);
    exampleApi.studentAgesByName.set('BOB', 21);
    exampleApi.studentAgesByName.set('BOB', -1);
    exampleApi.studentAgesByName.set('CHARLIE', 22);
    exampleApi.studentAgesByName.delete('CHARLIE');

    expect(exampleApi.clearedCount).toEqual(1);
    expect(exampleApi.setCount).toEqual(4);
    expect(exampleApi.deletedCount).toEqual(1);

    expect(exampleApi.studentAgesByName.get('ALICE')).toEqual(23);
    expect(exampleApi.studentAgesByName.get('BOB')).toEqual(0); // clamped by onSet()
    expect(exampleApi.studentAgesByName.has('CHARLIE')).toEqual(false);
  });

  test('Unprotected operations', () => {
    const exampleApi: ExampleApi = new ExampleApi();

    exampleApi.doUnprotectedOperations();

    // Interacting directly with the ProtectableMap bypasses the hooks
    expect(exampleApi.clearedCount).toEqual(0);
    expect(exampleApi.studentAgesByName.get('Dave')).toEqual(-123);
  });

  test('Error case', () => {
    const exampleApi: ExampleApi = new ExampleApi();
    expect(() => {
      exampleApi.studentAgesByName.set('Jane', 23);
    }).toThrowError('The key must be all upper case: Jane');
  });
});
