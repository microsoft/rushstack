[Home](./index) &gt; [@microsoft/node-core-library](./node-core-library.md) &gt; [IParsedPackageName](./node-core-library.iparsedpackagename.md)

## IParsedPackageName interface

A package name that has been separated into its scope and unscoped name.

<b>Signature:</b>

```typescript
export interface IParsedPackageName 
```

## Properties

|  <p>Property</p> | <p>Type</p> | <p>Description</p> |
|  --- | --- | --- |
|  <p>[scope](./node-core-library.iparsedpackagename.scope.md)</p> | <p>`string`</p> | <p>The parsed NPM scope, or an empty string if there was no scope. The scope value will always include the at-sign.</p> |
|  <p>[unscopedName](./node-core-library.iparsedpackagename.unscopedname.md)</p> | <p>`string`</p> | <p>The parsed NPM package name without the scope.</p> |

