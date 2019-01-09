[Home](./index) &gt; [@microsoft/api-extractor](./api-extractor.md) &gt; [ApiItem](./api-extractor.apiitem.md) &gt; [parent](./api-extractor.apiitem.parent.md)

## ApiItem.parent property

If this item was added to a ApiItemContainerMixin item, then this returns the container item. If this is an Parameter that was added to a method or function, then this returns the function item. Otherwise, it returns undefined.

<b>Signature:</b>

```typescript
/** @virtual */
readonly parent: ApiItem | undefined;
```
