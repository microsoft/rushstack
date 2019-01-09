[Home](./index) &gt; [@microsoft/api-extractor](./api-extractor.md) &gt; [HeritageType](./api-extractor.heritagetype.md)

## HeritageType class

Represents a type referenced via an "extends" or "implements" heritage clause for a TypeScript class.

<b>Signature:</b>

```typescript
export declare class HeritageType 
```

## Properties

|  <p>Property</p> | <p>Modifiers</p> | <p>Type</p> | <p>Description</p> |
|  --- | --- | --- | --- |
|  <p>[excerpt](./api-extractor.heritagetype.excerpt.md)</p> |  | <p>`Excerpt`</p> | <p>An excerpt corresponding to the referenced type.</p> |

## Remarks

For example, consider this declaration:

```ts
export class Widget extends Controls.WidgetBase implements Controls.IWidget, IDisposable {
  // . . .
}

```
The heritage types are `Controls.WidgetBase`<!-- -->, `Controls.IWidget`<!-- -->, and `IDisposable`<!-- -->.

