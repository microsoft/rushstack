[Home](./index) &gt; [@microsoft/node-core-library](./node-core-library.md) &gt; [IParsedPackageNameOrError](./node-core-library.iparsedpackagenameorerror.md)

## IParsedPackageNameOrError interface

Result object returned by [PackageName.tryParse()](./node-core-library.packagename.tryparse.md)

<b>Signature:</b>

```typescript
export interface IParsedPackageNameOrError extends IParsedPackageName 
```

## Properties

|  <p>Property</p> | <p>Type</p> | <p>Description</p> |
|  --- | --- | --- |
|  <p>[error](./node-core-library.iparsedpackagenameorerror.error.md)</p> | <p>`string`</p> | <p>If the input string could not be parsed, then this string will contain a nonempty error message. Otherwise it will be an empty string.</p> |

