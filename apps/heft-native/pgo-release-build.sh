#!/usr/bin/env bash
set -euo pipefail

crate_folder="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
heft_package_folder="$(cd "$crate_folder/../heft" && pwd)"
build_tests_folder="$(cd "$crate_folder/../.." && pwd)/build-tests"
host_triple="$(rustc -vV | sed -n 's/^host: //p')"
llvm_profdata="$(rustc --print sysroot)/lib/rustlib/$host_triple/bin/llvm-profdata"
profile_folder="$crate_folder/target/pgo-profiles"
instrumented_target_folder="$crate_folder/target/pgo-instrumented"
flag_separator=$'\x1f'

if [ ! -x "$llvm_profdata" ]; then
  echo "llvm-profdata was not found; install it with: rustup component add llvm-tools" >&2
  exit 1
fi

rm -rf "$profile_folder"
CARGO_ENCODED_RUSTFLAGS="-Ctarget-feature=+crt-static${flag_separator}-Cprofile-generate=$profile_folder" \
  cargo build --release --manifest-path "$crate_folder/Cargo.toml" --target-dir "$instrumented_target_folder"
instrumented_heft="$instrumented_target_folder/release/heft"

workload_folder="$(mktemp -d)"
trap 'rm -rf "$workload_folder"' EXIT
mkdir -p "$workload_folder/config" "$workload_folder/src/assets" "$workload_folder/temp/scratch" "$workload_folder/node_modules/@rushstack"
ln -s "$heft_package_folder" "$workload_folder/node_modules/@rushstack/heft"
cat > "$workload_folder/package.json" <<'PACKAGE_JSON'
{
  "name": "heft-native-pgo-workload",
  "version": "1.0.0",
  "private": true,
  "devDependencies": {
    "@rushstack/heft": "*"
  }
}
PACKAGE_JSON
cat > "$workload_folder/config/heft.json" <<'HEFT_JSON'
{
  "$schema": "https://developer.microsoft.com/json-schemas/heft/v0/heft.schema.json",
  "phasesByName": {
    "build": {
      "cleanFiles": [{ "includeGlobs": ["lib"] }],
      "tasksByName": {
        "set-env": {
          "taskPlugin": {
            "pluginPackage": "@rushstack/heft",
            "pluginName": "set-environment-variables-plugin",
            "options": { "environmentVariablesToSet": { "HEFT_NATIVE_PGO_WORKLOAD": "1" } }
          }
        },
        "copy-assets": {
          "taskDependencies": ["set-env"],
          "taskPlugin": {
            "pluginPackage": "@rushstack/heft",
            "pluginName": "copy-files-plugin",
            "options": {
              "copyOperations": [
                { "sourcePath": "src/assets", "destinationFolders": ["lib/assets"], "fileExtensions": [".txt", ".json"] }
              ]
            }
          }
        },
        "delete-scratch": {
          "taskDependencies": ["copy-assets"],
          "taskPlugin": {
            "pluginPackage": "@rushstack/heft",
            "pluginName": "delete-files-plugin",
            "options": { "deleteOperations": [{ "sourcePath": "temp/scratch", "includeGlobs": ["**/*"] }] }
          }
        }
      }
    }
  }
}
HEFT_JSON
for asset_number in $(seq 1 40); do
  echo "heft native pgo asset $asset_number" > "$workload_folder/src/assets/asset-$asset_number.txt"
done
echo '{"workload":"pgo"}' > "$workload_folder/src/assets/data.json"

run_native_workload() {
  for repetition in 1 2 3 4 5; do
    "$instrumented_heft" --help || true
    "$instrumented_heft" --version || true
    "$instrumented_heft" build --help || true
    "$instrumented_heft" build --clean || true
    "$instrumented_heft" build || true
    "$instrumented_heft" nosuch-action || true
    "$instrumented_heft" clean || true
  done
}
(cd "$workload_folder" && run_native_workload) < /dev/null > /dev/null 2>&1

for project_folder in "$build_tests_folder"/*/; do
  if [ -e "$project_folder/node_modules/@rushstack/heft/package.json" ]; then
    (cd "$project_folder" && { "$instrumented_heft" --help || true; "$instrumented_heft" build --help || true; }) < /dev/null > /dev/null 2>&1
  fi
done

"$llvm_profdata" merge -o "$profile_folder/merged.profdata" "$profile_folder"/*.profraw
CARGO_ENCODED_RUSTFLAGS="-Ctarget-feature=+crt-static${flag_separator}-Cprofile-use=$profile_folder/merged.profdata" \
  cargo build --release --manifest-path "$crate_folder/Cargo.toml"
