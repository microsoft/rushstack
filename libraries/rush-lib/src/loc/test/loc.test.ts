import { getFilledCompositeString } from '../index';

describe('loc', () => {
  describe(getFilledCompositeString.name, () => {
    it('correctly handles a string with placeholders', () => {
      const filledString: string = getFilledCompositeString('A {0} B {1} C {2} B {1} A {0}', 'a', 'b', 'c');
      expect(filledString).toBe('A a B b C c B b A a');
    });
  });
});
