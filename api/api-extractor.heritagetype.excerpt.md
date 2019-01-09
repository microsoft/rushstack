[Home](./index) &gt; [@microsoft/api-extractor](./api-extractor.md) &gt; [HeritageType](./api-extractor.heritagetype.md) &gt; [excerpt](./api-extractor.heritagetype.excerpt.md)

## HeritageType.excerpt property

An excerpt corresponding to the referenced type.

<b>Signature:</b>

```typescript
readonly excerpt: Excerpt;
```

## Remarks

For example, consider this declaration:

```ts
export class Widget extends Controls.WidgetBase implements Controls.IWidget, IDisposable {
  // . . .
}

```
The excerpt might be `Controls.WidgetBase`<!-- -->, `Controls.IWidget`<!-- -->, or `IDisposable`<!-- -->.

