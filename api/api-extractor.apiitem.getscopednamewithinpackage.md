[Home](./index) &gt; [@microsoft/api-extractor](./api-extractor.md) &gt; [ApiItem](./api-extractor.apiitem.md) &gt; [getScopedNameWithinPackage](./api-extractor.apiitem.getscopednamewithinpackage.md)

## ApiItem.getScopedNameWithinPackage() method

This returns a scoped name such as `"Namespace1.Namespace2.MyClass.myMember()"`<!-- -->. It does not include the package name or entry point.

<b>Signature:</b>

```typescript
getScopedNameWithinPackage(): string;
```
<b>Returns:</b>

`string`

## Remarks

If called on an ApiEntrypoint, ApiPackage, or ApiModel item, the result is an empty string.

