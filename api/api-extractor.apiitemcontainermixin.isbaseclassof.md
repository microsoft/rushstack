[Home](./index) &gt; [@microsoft/api-extractor](./api-extractor.md) &gt; [ApiItemContainerMixin](./api-extractor.apiitemcontainermixin.md) &gt; [isBaseClassOf](./api-extractor.apiitemcontainermixin.isbaseclassof.md)

## ApiItemContainerMixin.isBaseClassOf() function

A type guard that tests whether the specified `ApiItem` subclass extends the `ApiItemContainerMixin` mixin.

<b>Signature:</b>

```typescript
function isBaseClassOf(apiItem: ApiItem): apiItem is ApiItemContainerMixin;
```

## Remarks

The JavaScript `instanceof` operator cannot be used to test for mixin inheritance, because each invocation of the mixin function produces a different subclass. (This could be mitigated by `Symbol.hasInstance`<!-- -->, however the TypeScript type system cannot invoke a runtime test.)

