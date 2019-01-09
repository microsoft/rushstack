[Home](./index) &gt; [@microsoft/ts-command-line](./ts-command-line.md) &gt; [CommandLineStringListParameter](./ts-command-line.commandlinestringlistparameter.md) &gt; [values](./ts-command-line.commandlinestringlistparameter.values.md)

## CommandLineStringListParameter.values property

Returns the string arguments for a string list parameter that was parsed from the command line.

<b>Signature:</b>

```typescript
readonly values: ReadonlyArray<string>;
```

## Remarks

The array will be empty if the command-line has not been parsed yet, or if the parameter was omitted and has no default value.

