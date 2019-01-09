[Home](./index) &gt; [@microsoft/node-core-library](./node-core-library.md) &gt; [IParsedPackageNameOrError](./node-core-library.iparsedpackagenameorerror.md)

## IParsedPackageNameOrError interface

Result object returned by [PackageName.tryParse()](./node-core-library.packagename.tryparse.md)

<b>Signature:</b>

```typescript
export interface IParsedPackageNameOrError extends IParsedPackageName 
```

## Properties

|  Property | Type | Description |
|  --- | --- | --- |
|  [error](./node-core-library.iparsedpackagenameorerror.error.md) | `string` | If the input string could not be parsed, then this string will contain a nonempty error message. Otherwise it will be an empty string. |

