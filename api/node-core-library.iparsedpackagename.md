[Home](./index) &gt; [@microsoft/node-core-library](./node-core-library.md) &gt; [IParsedPackageName](./node-core-library.iparsedpackagename.md)

## IParsedPackageName interface

A package name that has been separated into its scope and unscoped name.

<b>Signature:</b>

```typescript
export interface IParsedPackageName 
```

## Properties

|  Property | Type | Description |
|  --- | --- | --- |
|  [scope](./node-core-library.iparsedpackagename.scope.md) | `string` | The parsed NPM scope, or an empty string if there was no scope. The scope value will always include the at-sign. |
|  [unscopedName](./node-core-library.iparsedpackagename.unscopedname.md) | `string` | The parsed NPM package name without the scope. |

