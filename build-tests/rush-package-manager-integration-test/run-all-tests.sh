#!/bin/bash
# Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
# See LICENSE in the project root for license information.

# Master test script that runs all package manager integration tests

set -e

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

echo "=========================================="
echo "Rush Package Manager Integration Tests"
echo "=========================================="
echo ""
echo "These tests verify that the tar 7.x upgrade works correctly"
echo "with different Rush package managers (npm, yarn)."
echo ""
echo "Tests will:"
echo "  1. Create Rush repos using locally-built Rush"
echo "  2. Add projects with dependencies"
echo "  3. Run rush update (creates temp tarballs)"
echo "  4. Run rush install (extracts tarballs)"
echo "  5. Run rush build (end-to-end verification)"
echo ""

# Make scripts executable
chmod +x "$SCRIPT_DIR/test-npm-mode.sh"
chmod +x "$SCRIPT_DIR/test-yarn-mode.sh"

# Track test results
TESTS_PASSED=0
TESTS_FAILED=0
FAILED_TESTS=()

# Run npm mode test
echo "=========================================="
echo "Running NPM mode test..."
echo "=========================================="
if "$SCRIPT_DIR/test-npm-mode.sh"; then
  TESTS_PASSED=$((TESTS_PASSED + 1))
  echo ""
else
  TESTS_FAILED=$((TESTS_FAILED + 1))
  FAILED_TESTS+=("NPM mode")
  echo ""
  echo "⚠️  NPM mode test FAILED"
  echo ""
fi

# Run yarn mode test
echo "=========================================="
echo "Running Yarn mode test..."
echo "=========================================="
if "$SCRIPT_DIR/test-yarn-mode.sh"; then
  TESTS_PASSED=$((TESTS_PASSED + 1))
  echo ""
else
  TESTS_FAILED=$((TESTS_FAILED + 1))
  FAILED_TESTS+=("Yarn mode")
  echo ""
  echo "⚠️  Yarn mode test FAILED"
  echo ""
fi

# Print summary
echo "=========================================="
echo "Test Summary"
echo "=========================================="
echo ""
echo "Tests passed: $TESTS_PASSED"
echo "Tests failed: $TESTS_FAILED"
echo ""

if [ $TESTS_FAILED -gt 0 ]; then
  echo "Failed tests:"
  for test in "${FAILED_TESTS[@]}"; do
    echo "  - $test"
  done
  echo ""
  echo "❌ Some tests failed"
  exit 1
else
  echo "✅ All tests passed!"
  echo ""
  echo "The tar 7.x upgrade is working correctly with:"
  echo "  - NPM package manager"
  echo "  - Yarn package manager"
  echo ""
  exit 0
fi
