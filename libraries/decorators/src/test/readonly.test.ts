import readonly from '../readonly';

const assert: Chai.AssertStatic = chai.assert;

class ExampleClass {
  @readonly
  public get property(): number {
    return 123;
  }
}

describe('@readonly tests', () => {
  describe('Main scenario', () => {
    it('cannot assign a property marked as @readonly', () => {
      const x: ExampleClass = new ExampleClass();
      // tslint:disable-next-line:no-any
      // (x as any).property = 321;
      assert.equal(x.property, 123);
    });
  });
});
