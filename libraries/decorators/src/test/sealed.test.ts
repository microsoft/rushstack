/// <reference types="mocha" />

import { assert } from 'chai';
import { sealed } from '../sealed';

describe('@sealed tests', () => {
  it('Inheriting from a @sealed class', () => {

    @sealed
    class BaseClass {
    }

    // INCORRECT: If we did runtime validation, this would report an error
    // because the base class is marked as @sealed
    class BadChildClass extends BaseClass {
    }

    assert(true);
  });
});
