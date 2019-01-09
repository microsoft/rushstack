[Home](./index) &gt; [@microsoft/ts-command-line](./ts-command-line.md) &gt; [CommandLineChoiceParameter](./ts-command-line.commandlinechoiceparameter.md) &gt; [value](./ts-command-line.commandlinechoiceparameter.value.md)

## CommandLineChoiceParameter.value property

Returns the argument value for a choice parameter that was parsed from the command line.

<b>Signature:</b>

```typescript
readonly value: string | undefined;
```

## Remarks

The return value will be `undefined` if the command-line has not been parsed yet, or if the parameter was omitted and has no default value.

