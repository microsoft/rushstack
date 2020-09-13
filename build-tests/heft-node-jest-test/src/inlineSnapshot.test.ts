// This example is adapted from the Jest guide here:
// https://jestjs.io/docs/en/es6-class-mocks#automatic-mock

it('Generate an inline snapshot', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const thing: any = {
    abc: 123,
    def: {
      ghi: 'test!'
    }
  };

  expect(thing).toMatchInlineSnapshot(`
    Object {
      "abc": 123,
      "def": Object {
        "ghi": "test!",
      },
    }
  `);
});
