[Home](./index) &gt; [@microsoft/node-core-library](./node-core-library.md) &gt; [JsonSchema](./node-core-library.jsonschema.md) &gt; [shortName](./node-core-library.jsonschema.shortname.md)

## JsonSchema.shortName property

Returns a short name for this schema, for use in error messages.

<b>Signature:</b>

```typescript
readonly shortName: string;
```

## Remarks

If the schema was loaded from a file, then the base filename is used. Otherwise, the "id" field is used if available.

