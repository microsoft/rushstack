[Home](./index) &gt; [@microsoft/node-core-library](./node-core-library.md) &gt; [PackageName](./node-core-library.packagename.md) &gt; [parse](./node-core-library.packagename.parse.md)

## PackageName.parse() method

Same as [PackageName.tryParse()](./node-core-library.packagename.tryparse.md)<!-- -->, except this throws an exception if the input cannot be parsed.

<b>Signature:</b>

```typescript
static parse(packageName: string): IParsedPackageName;
```

## Parameters

|  <p>Parameter</p> | <p>Type</p> | <p>Description</p> |
|  --- | --- | --- |
|  <p>packageName</p> | <p>`string`</p> |  |

<b>Returns:</b>

`IParsedPackageName`

## Remarks

The packageName must not be an empty string.

