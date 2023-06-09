# Change Log - @rushstack/heft-typescript-plugin

This log was last generated on Fri, 09 Jun 2023 00:19:49 GMT and should not be manually modified.

## 0.1.5
Fri, 09 Jun 2023 00:19:49 GMT

### Patches

- Emit error if warnings are encountered when building in solution mode. This avoids confusion because the TypeScript compiler implicitly sets `noEmitOnError: true` when building in solution mode.

## 0.1.4
Thu, 08 Jun 2023 15:21:17 GMT

_Version update only_

## 0.1.3
Thu, 08 Jun 2023 00:20:02 GMT

### Patches

- Use the temp folder instead of the cache folder.

## 0.1.2
Wed, 07 Jun 2023 22:45:16 GMT

_Version update only_

## 0.1.1
Mon, 05 Jun 2023 21:45:21 GMT

### Patches

- Fix resolution of relative tsconfig paths that start with './' or '../'.

## 0.1.0
Fri, 02 Jun 2023 02:01:12 GMT

### Minor changes

- Prepare for official release.

