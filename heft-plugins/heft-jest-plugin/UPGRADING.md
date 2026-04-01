# Upgrade notes for @rushstack/heft-jest-plugin

### Version 1.3.0 (jest-environment-jsdom 30.3.0)

This release upgrades `jest-environment-jsdom` from 29.5.0 to 30.3.0, which ships with **jsdom 26** instead of jsdom 21. It also upgrades all other Jest packages (`@jest/core`, `jest-config`, etc.) to `~30.3.0`.

The `punycode` injection workaround introduced in a prior release (which redirected `jest-environment-jsdom` through a patched wrapper to suppress `DEP0040` deprecation warnings on Node ≥ 22) has been removed. jsdom 26 no longer triggers `DEP0040`.

**Breaking changes from Jest 29 → Jest 30 that may affect your tests:**

- **`window.location` is now immutable.** `Object.defineProperty(window, 'location', { value: ... })` throws a `TypeError` in jsdom 26. Use `window.history.pushState()` or `window.history.replaceState()` to change the URL in tests instead.

- **Deprecated matcher aliases have been removed.** Replace usages before upgrading:
  - `expect(fn).toBeCalled()` → `expect(fn).toHaveBeenCalled()`
  - `expect(fn).toBeCalledWith(...)` → `expect(fn).toHaveBeenCalledWith(...)`
  - `expect(fn).toReturn()` → `expect(fn).toHaveReturned()`
  - `expect(fn).toThrowError(msg)` → `expect(fn).toThrow(msg)`

- **Snapshots must be regenerated.** The error `cause` property is now included in snapshot output. Run `jest --updateSnapshot` after upgrading.

- **`toEqual()` no longer matches non-enumerable object properties** by default.

- **Node.js minimum is 18** (drops Node 14, 16, 19, 21). TypeScript minimum is 5.4.

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
