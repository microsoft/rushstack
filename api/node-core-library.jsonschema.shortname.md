<!-- docId=node-core-library.jsonschema.shortname -->

[Home](./index.md) &gt; [node-core-library](./node-core-library.md) &gt; [JsonSchema](./node-core-library.jsonschema.md)

# JsonSchema.shortName property

Returns a short name for this schema, for use in error messages.

**Signature:**
```javascript
shortName: string
```

## Remarks

If the schema was loaded from a file, then the base filename is used. Otherwise, the "id" field is used if available.
