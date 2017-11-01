[Home](./index) &gt; [@microsoft/ts-command-line](ts-command-line.md) &gt; [CommandLineParameter](ts-command-line.commandlineparameter.md) &gt; [value](ts-command-line.commandlineparameter.value.md)

# CommandLineParameter.value property

After the command line has been parsed, this returns the value of the parameter.

**Signature:**
```javascript
value: T
```

## Remarks

For example, for a CommandLineFlagParameter it will be a boolean indicating whether the switch was provided. For a CommandLineStringListParameter it will be an array of strings.
