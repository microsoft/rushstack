# Upgrade notes for @rushstack/heft-jest-plugin

### Version 0.6.0
BREAKING CHANGE: The `testFiles` option in `config/jest.config.json` should now specify the path to compiled CommonJS files, *not* TypeScript source files. Snapshot resolution depends on the presence of source maps in the output folder.

This release of `heft-jest-plugin` switched from using Jest's transformer infrastructure and pointing at TypeScript source files to instead directly point Jest at the compiled output files, relying on source maps to redirect snapshot files back to the committed source folder. If no source maps are present, the plugin will assume that the project is authored in raw ECMAScript and expect to find snapshots in a `__snapshots__` folder directly alongside the test files.

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
