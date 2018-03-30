// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/// <reference types='mocha' />

import { ManagedMap } from '../ManagedMap';
import { assert } from 'chai';

class ExampleApi {
  public clearedCount: number = 0;
  public deletedCount: number = 0;
  public setCount: number = 0;
  private _studentAgesByName: ManagedMap<string, number>;

  constructor() {
    this._studentAgesByName = new ManagedMap({
      onClear: (source: ManagedMap<string, number>) => {
        ++this.clearedCount;
      },

      onDelete: (source: ManagedMap<string, number>, key: string) => {
        ++this.deletedCount;
      },

      onSet: (source: ManagedMap<string, number>, key: string, value: number) => {
        ++this.setCount;
        if (key.toUpperCase() !== key) {
          throw new Error('The key must be all upper case: ' + key);
        }
      }
    });
  }

  public get studentAgesByName(): Map<string, number> {
    return this._studentAgesByName.view;
  }
}

describe('ManagedMap', () => {
  describe('Test', () => {
    const exampleApi: ExampleApi = new ExampleApi();

    it('exampleApi positive test', () => {
      exampleApi.studentAgesByName.clear();

      exampleApi.studentAgesByName.set('ALICE', 23);
      exampleApi.studentAgesByName.set('BOB', 21);
      exampleApi.studentAgesByName.set('BOB', 22);
      exampleApi.studentAgesByName.set('CHARLIE', 22);
      exampleApi.studentAgesByName.delete('CHARLIE');

      assert.equal(exampleApi.clearedCount, 1);
      assert.equal(exampleApi.setCount, 4);
      assert.equal(exampleApi.deletedCount, 1);
    });

    it('exampleApi error test', () => {
      assert.throw(() => {
        exampleApi.studentAgesByName.set('Jane', 23);
      }, 'The key must be all upper case: Jane');
    });

  });
});
