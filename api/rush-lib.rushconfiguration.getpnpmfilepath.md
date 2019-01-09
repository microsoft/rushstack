[Home](./index) &gt; [@microsoft/rush-lib](./rush-lib.md) &gt; [RushConfiguration](./rush-lib.rushconfiguration.md) &gt; [getPnpmfilePath](./rush-lib.rushconfiguration.getpnpmfilepath.md)

## RushConfiguration.getPnpmfilePath() method

Gets the absolute path for "pnpmfile.js" for a specific variant.

<b>Signature:</b>

```typescript
getPnpmfilePath(variant?: string | undefined): string;
```

## Parameters

|  <p>Parameter</p> | <p>Type</p> | <p>Description</p> |
|  --- | --- | --- |
|  <p>variant</p> | <p>`string | undefined`</p> | <p>The name of the current variant in use by the active command.</p> |

<b>Returns:</b>

`string`

## Remarks

The file path is returned even if PNPM is not configured as the package manager.

