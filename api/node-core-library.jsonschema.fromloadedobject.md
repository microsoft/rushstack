<!-- docId=node-core-library.jsonschema.fromloadedobject -->

[Home](./index.md) &gt; [node-core-library](./node-core-library.md) &gt; [JsonSchema](./node-core-library.jsonschema.md)

# JsonSchema.fromLoadedObject method

Registers a JsonSchema that will be loaded from a file on disk.

**Signature:**
```javascript
public static fromLoadedObject(schemaObject: Object): JsonSchema;
```
**Returns:** `JsonSchema`


## Remarks

NOTE: An error occurs if the file does not exist; however, the file itself is not loaded or validated until it the schema is actually used.
