[Home](./index) &gt; [@microsoft/api-extractor](./api-extractor.md) &gt; [ApiItem](./api-extractor.apiitem.md) &gt; [displayName](./api-extractor.apiitem.displayname.md)

## ApiItem.displayName property

Returns a name for this object that can be used in diagnostic messages, for example.

<b>Signature:</b>

```typescript
/** @virtual */
readonly displayName: string;
```

## Remarks

For an object that inherits ApiNameMixin, this will return the declared name (e.g. the name of a TypeScript function). Otherwise, it will return a string such as "(call signature)" or "(model)".

