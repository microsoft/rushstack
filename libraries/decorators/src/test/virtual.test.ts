// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/// <reference types="mocha" />

import { assert } from 'chai';
import { virtual } from '../virtual';
import { override } from '../override';

describe('@virtual tests', () => {
  describe('Main scenario', () => {
    it('valid usage', () => {

      class BaseClass {
        @virtual
        public test(): void {
          // do something
        }

        public test2(): void {
          // do something
        }

        @virtual
        public test3(): void {
          // do something
        }
      }

      class ChildClass extends BaseClass { // tslint:disable-line:no-unused-variable
        @override
        public test(): void {
          super.test();
        }

        // INCORRECT: If we did runtime validation, this would report an error
        // because test2() was not marked as @virtual
        @override
        public test2(): void {
          super.test2();
        }

        // INCORRECT: If we did runtime validation, this would report an error
        // because test4() does not exist in the base class
        @override
        public test4(): void {
          // do something
        }
      }

      assert(true);
    });
  });
});
