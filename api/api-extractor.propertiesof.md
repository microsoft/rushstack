[Home](./index) &gt; [@microsoft/api-extractor](./api-extractor.md) &gt; [PropertiesOf](./api-extractor.propertiesof.md)

## PropertiesOf type

<b>Signature:</b>

```typescript
export declare type PropertiesOf<T> = {
    [K in keyof T]: T[K];
};
```
