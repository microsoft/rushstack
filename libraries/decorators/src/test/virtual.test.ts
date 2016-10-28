import { virtual } from '../virtual';
import { override } from '../override';

const assert: Chai.AssertStatic = chai.assert;

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

      class ChildClass extends BaseClass {
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
