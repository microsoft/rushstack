[Home](./index) &gt; [@microsoft/api-extractor](./api-extractor.md) &gt; [ApiParameterListMixin](./api-extractor.apiparameterlistmixin.md) &gt; [isBaseClassOf](./api-extractor.apiparameterlistmixin.isbaseclassof.md)

## ApiParameterListMixin.isBaseClassOf() function

A type guard that tests whether the specified `ApiItem` subclass extends the `ApiParameterListMixin` mixin.

<b>Signature:</b>

```typescript
function isBaseClassOf(apiItem: ApiItem): apiItem is ApiParameterListMixin;
```

## Remarks

The JavaScript `instanceof` operator cannot be used to test for mixin inheritance, because each invocation of the mixin function produces a different subclass. (This could be mitigated by `Symbol.hasInstance`<!-- -->, however the TypeScript type system cannot invoke a runtime test.)

