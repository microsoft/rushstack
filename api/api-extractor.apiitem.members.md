[Home](./index) &gt; [@microsoft/api-extractor](./api-extractor.md) &gt; [ApiItem](./api-extractor.apiitem.md) &gt; [members](./api-extractor.apiitem.members.md)

## ApiItem.members property

This property supports a visitor pattern for walking the tree. For items with ApiItemContainerMixin, it returns the contained items. Otherwise it returns an empty array.

<b>Signature:</b>

```typescript
/** @virtual */
readonly members: ReadonlyArray<ApiItem>;
```
