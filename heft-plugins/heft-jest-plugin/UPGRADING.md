# Upgrade notes for @rushstack/heft-jest-plugin

### Version 0.3.0

This release of `heft-jest-plugin` enabled Jest's `clearMocks` option by default.
If your project didn't already have this option turned on, it is possible that
previously passing unit tests will fail after the upgrade.

If you do have failing unit tests, then most likely the assertions in the test
were incorrect, because the number of calls and call parameters were not being
cleared between tests. The ideal solution is to correct these assertions.

If you can't immediately address the failing unit tests, you can turn `clearMocks`
back off in your `config/jest.config.json` file:

```json
{
  "extends": "@rushstack/heft-jest-plugin/includes/jest-shared.config.json",

  "clearMocks": false
}
```

For more information on the `clearMocks` option, see [Jest's clearMocks documentation](https://jestjs.io/docs/configuration#clearmocks-boolean).
