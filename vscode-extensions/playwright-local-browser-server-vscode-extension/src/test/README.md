# VS Code Extension Tests

This directory contains the test harness for the Playwright Local Browser Server VS Code extension using the VS Code Extension Host.

## Test Structure

- **runTest.ts**: Entry point for running tests. Uses `@vscode/test-electron` to download VS Code and run the test suite.
- **suite/index.ts**: Mocha test suite configuration that discovers and runs all `*.test.js` files.
- **suite/extension.test.ts**: Main test file containing tests for:
  - Extension installation and activation
  - Command registration validation
  - Command execution tests
  - Package.json command validation

## Running Tests

To run the tests:

```bash
npm test
```

Or using Rush from the repository root:

```bash
rush test --to playwright-local-browser-server
```

The `pretest` script automatically builds the extension before running tests.

## Test Coverage

The test suite validates:

1. **Extension Presence**: Verifies the extension is installed
2. **Extension Activation**: Ensures the extension activates correctly
3. **Command Registration**: Validates all commands from package.json are registered:
   - `playwright-local-browser-server.start`
   - `playwright-local-browser-server.stop`
   - `playwright-local-browser-server.manageAllowlist`
   - `playwright-local-browser-server.showLog`
   - `playwright-local-browser-server.showSettings`
   - `playwright-local-browser-server.showMenu`
4. **Command Execution**: Tests non-interactive commands (`showLog`, `showSettings`)

## Limitations

- Interactive commands (`start`, `stop`, `manageAllowlist`, `showMenu`) are tested for registration but not execution, as they show dialogs that would block automated testing
- Tests require network access to download VS Code on first run
- The downloaded VS Code instance is cached by `@vscode/test-electron`

## Test Framework

- **Test Runner**: [VS Code Extension Test](https://code.visualstudio.com/api/working-with-extensions/testing-extension)
- **Test Framework**: [Mocha](https://mochajs.org/)
- **Assertions**: Node.js `assert` module

## Future Improvements

To test interactive commands without blocking on dialogs, consider:
- Mocking VS Code UI interactions
- Using dependency injection to allow testing without user interaction
- Creating unit tests for command handlers separately from integration tests
