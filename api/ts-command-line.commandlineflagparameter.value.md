[Home](./index) &gt; [@microsoft/ts-command-line](./ts-command-line.md) &gt; [CommandLineFlagParameter](./ts-command-line.commandlineflagparameter.md) &gt; [value](./ts-command-line.commandlineflagparameter.value.md)

## CommandLineFlagParameter.value property

Returns a boolean indicating whether the parameter was included in the command line.

<b>Signature:</b>

```typescript
readonly value: boolean;
```

## Remarks

The return value will be false if the command-line has not been parsed yet, or if the flag was not used.

