[Home](./index) &gt; [@microsoft/api-extractor](./api-extractor.md) &gt; [ApiReleaseTagMixin](./api-extractor.apireleasetagmixin.md) &gt; [isBaseClassOf](./api-extractor.apireleasetagmixin.isbaseclassof.md)

## ApiReleaseTagMixin.isBaseClassOf() function

A type guard that tests whether the specified `ApiItem` subclass extends the `ApiReleaseTagMixin` mixin.

<b>Signature:</b>

```typescript
function isBaseClassOf(apiItem: ApiItem): apiItem is ApiReleaseTagMixin;
```

## Remarks

The JavaScript `instanceof` operator cannot be used to test for mixin inheritance, because each invocation of the mixin function produces a different subclass. (This could be mitigated by `Symbol.hasInstance`<!-- -->, however the TypeScript type system cannot invoke a runtime test.)

