[Home](./index) &gt; [@microsoft/api-extractor](./api-extractor.md) &gt; [IResolveDeclarationReferenceResult](./api-extractor.iresolvedeclarationreferenceresult.md)

## IResolveDeclarationReferenceResult interface

Result object for [ApiModel.resolveDeclarationReference()](./api-extractor.apimodel.resolvedeclarationreference.md)<!-- -->.

<b>Signature:</b>

```typescript
export interface IResolveDeclarationReferenceResult 
```

## Properties

|  Property | Type | Description |
|  --- | --- | --- |
|  [errorMessage](./api-extractor.iresolvedeclarationreferenceresult.errormessage.md) | `string | undefined` | If resolvedApiItem is undefined, then this will always contain an error message explaining why the resolution failed. |
|  [resolvedApiItem](./api-extractor.iresolvedeclarationreferenceresult.resolvedapiitem.md) | `ApiItem | undefined` | The referenced ApiItem, if the declaration reference could be resolved. |

