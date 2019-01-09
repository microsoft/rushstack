[Home](./index) &gt; [@microsoft/rush-lib](./rush-lib.md) &gt; [RushConfiguration](./rush-lib.rushconfiguration.md) &gt; [tempShrinkwrapPreinstallFilename](./rush-lib.rushconfiguration.tempshrinkwrappreinstallfilename.md)

## RushConfiguration.tempShrinkwrapPreinstallFilename property

The full path of a backup copy of tempShrinkwrapFilename. This backup copy is made before installation begins, and can be compared to determine how the package manager modified tempShrinkwrapFilename.

<b>Signature:</b>

```typescript
readonly tempShrinkwrapPreinstallFilename: string;
```

## Remarks

This property merely reports the filename; the file itself may not actually exist. Example: `C:\MyRepo\common\temp\npm-shrinkwrap-preinstall.json` or `C:\MyRepo\common\temp\shrinkwrap-preinstall.yaml`

