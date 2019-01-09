[Home](./index) &gt; [@microsoft/api-extractor](./api-extractor.md) &gt; [IResolveDeclarationReferenceResult](./api-extractor.iresolvedeclarationreferenceresult.md)

## IResolveDeclarationReferenceResult interface

Result object for [ApiModel.resolveDeclarationReference()](./api-extractor.apimodel.resolvedeclarationreference.md)<!-- -->.

<b>Signature:</b>

```typescript
export interface IResolveDeclarationReferenceResult 
```

## Properties

|  <p>Property</p> | <p>Type</p> | <p>Description</p> |
|  --- | --- | --- |
|  <p>[errorMessage](./api-extractor.iresolvedeclarationreferenceresult.errormessage.md)</p> | <p>`string | undefined`</p> | <p>If resolvedApiItem is undefined, then this will always contain an error message explaining why the resolution failed.</p> |
|  <p>[resolvedApiItem](./api-extractor.iresolvedeclarationreferenceresult.resolvedapiitem.md)</p> | <p>`ApiItem | undefined`</p> | <p>The referenced ApiItem, if the declaration reference could be resolved.</p> |

