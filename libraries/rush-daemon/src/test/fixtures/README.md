# Graph test fixtures

The `graph` directory contains the immutable starting repository used by
`DaemonGraphTestFixture`. Heft copies these assets alongside the compiled tests.
Keep fixture scripts, package manifests, and initial file contents here rather
than assembling them as strings during test setup.

Each fixture copies this repository into a fresh directory under the project's
`temp/test/graph` folder. Separate case directories allow multiple fixtures and
concurrent test runs without sharing mutable files. Setup substitutes the current
Rush version and creates the installation flag; tests may then deliberately
change files to exercise invalidation and other behavior.

Disposal still awaits daemon shutdown and releases its resources. It retains the
workspace for diagnosis instead of recursively deleting it during teardown.
`heft run --only test -- --clean` removes `temp/test` before the next test run.

The initial `input.txt` files intentionally have no trailing newline, matching the
original fixtures and cache-restoration assertions. The fixture-local attributes
file pins text to LF so a Windows checkout preserves the intended input bytes.
