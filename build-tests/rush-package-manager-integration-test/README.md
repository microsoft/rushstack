# Rush Package Manager Integration Tests

This directory contains integration tests for verifying Rush works correctly with different package managers after the tar 7.x upgrade.

## Background

Rush's npm and yarn modes use temp project tarballs (stored in `common/temp/projects/`) to simulate package installations. The tar library is used to:
1. **Create** tarballs from temp project folders (`TempProjectHelper.createTempProjectTarball`)
2. **Extract** tarballs during the linking process (`NpmLinkManager._linkProjectAsync`)

These tests ensure the tar 7.x upgrade works correctly with these workflows.

## Tests

The test suite is written in TypeScript using `@rushstack/node-core-library` for cross-platform compatibility.

### testNpmMode.ts
Tests Rush npm mode by:
- Initializing a Rush repo with `npmVersion` configured
- Creating two projects with dependencies
- Running `rush update` (creates tarballs)
- Running `rush install` (extracts tarballs)
- Running `rush build` (verifies everything works end-to-end)

### testYarnMode.ts
Tests Rush yarn mode by:
- Initializing a Rush repo with `yarnVersion` configured
- Creating two projects with dependencies
- Running `rush update` (creates tarballs)
- Running `rush install` (extracts tarballs)
- Running `rush build` (verifies everything works end-to-end)

## Prerequisites

Before running these tests:
1. Build Rush locally: `rush build --to rush`
2. Build this test project: `rush build --to rush-package-manager-integration-test`
3. Ensure you have Node.js 18+ installed

## Running the Tests

```bash
# Build the test project first
cd build-tests/rush-package-manager-integration-test
rush build

# Run all tests
npm run test
```

Or from the root of the repo:
```bash
rush build --to rush-package-manager-integration-test
cd build-tests/rush-package-manager-integration-test
npm run test
```

## What Gets Tested

These integration tests verify:
- ✓ Temp project tarballs are created correctly using tar 7.x
- ✓ Tarballs are extracted correctly during `rush install`
- ✓ File permissions are preserved (tar filter function works)
- ✓ Dependencies are linked properly between projects
- ✓ The complete workflow (update → install → build) succeeds
- ✓ Built code executes correctly

## Test Output

Each test creates a temporary Rush repository in the `temp/` directory:
- `temp/npm-test-repo/` - npm mode test repository
- `temp/yarn-test-repo/` - yarn mode test repository

These directories are cleaned up at the start of each test run.

## Implementation

The tests use:
- **TypeScript** for type safety and better IDE support
- **@rushstack/node-core-library** for cross-platform file operations and process execution
- **TestHelper class** to encapsulate common test operations
- Modular test functions that can be run independently or together

## Related Code

The tar library is used in:
- `libraries/rush-lib/src/logic/TempProjectHelper.ts` - Creates tarballs
- `libraries/rush-lib/src/logic/npm/NpmLinkManager.ts` - Extracts tarballs

## Troubleshooting

If tests fail:
1. Check that Rush built successfully: `rush build --to rush`
2. Check that the test project built: `rush build --to rush-package-manager-integration-test`
3. Verify Node.js version: `node --version` (should be 18+)
4. Look for error messages in the test output
5. Inspect the temp test repo: `ls -la temp/npm-test-repo/common/temp/projects/`
