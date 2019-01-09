[Home](./index) &gt; [@microsoft/api-extractor](./api-extractor.md) &gt; [ApiPropertyItem](./api-extractor.apipropertyitem.md) &gt; [isEventProperty](./api-extractor.apipropertyitem.iseventproperty.md)

## ApiPropertyItem.isEventProperty property

Returns true if this property should be documented as an event.

<b>Signature:</b>

```typescript
readonly isEventProperty: boolean;
```

## Remarks

The `@eventProperty` TSDoc modifier can be added to readonly properties to indicate that they return an event object that event handlers can be attached to. The event-handling API is implementation-defined, but typically the return type would be a class with members such as `addHandler()` and `removeHandler()`<!-- -->. The documentation should display such properties under an "Events" heading instead of the usual "Properties" heading.

