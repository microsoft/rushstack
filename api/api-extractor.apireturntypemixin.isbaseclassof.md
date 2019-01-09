[Home](./index) &gt; [@microsoft/api-extractor](./api-extractor.md) &gt; [ApiReturnTypeMixin](./api-extractor.apireturntypemixin.md) &gt; [isBaseClassOf](./api-extractor.apireturntypemixin.isbaseclassof.md)

## ApiReturnTypeMixin.isBaseClassOf() function

A type guard that tests whether the specified `ApiItem` subclass extends the `ApiReturnTypeMixin` mixin.

<b>Signature:</b>

```typescript
function isBaseClassOf(apiItem: ApiItem): apiItem is ApiReturnTypeMixin;
```

## Remarks

The JavaScript `instanceof` operator cannot be used to test for mixin inheritance, because each invocation of the mixin function produces a different subclass. (This could be mitigated by `Symbol.hasInstance`<!-- -->, however the TypeScript type system cannot invoke a runtime test.)

