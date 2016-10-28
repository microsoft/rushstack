import sealed from '../sealed';

const assert: Chai.AssertStatic = chai.assert;

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
