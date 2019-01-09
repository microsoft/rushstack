[Home](./index) &gt; [@microsoft/node-core-library](./node-core-library.md) &gt; [JsonSchema](./node-core-library.jsonschema.md) &gt; [fromLoadedObject](./node-core-library.jsonschema.fromloadedobject.md)

## JsonSchema.fromLoadedObject() method

Registers a JsonSchema that will be loaded from a file on disk.

<b>Signature:</b>

```typescript
static fromLoadedObject(schemaObject: Object): JsonSchema;
```

## Parameters

|  <p>Parameter</p> | <p>Type</p> | <p>Description</p> |
|  --- | --- | --- |
|  <p>schemaObject</p> | <p>`Object`</p> |  |

<b>Returns:</b>

`JsonSchema`

## Remarks

NOTE: An error occurs if the file does not exist; however, the file itself is not loaded or validated until it the schema is actually used.

