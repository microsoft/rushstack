[Home](./index) &gt; [@microsoft/node-core-library](./node-core-library.md) &gt; [JsonSchema](./node-core-library.jsonschema.md)

## JsonSchema class

Represents a JSON schema that can be used to validate JSON data files loaded by the JsonFile class.

<b>Signature:</b>

```typescript
export declare class JsonSchema 
```

## Properties

|  <p>Property</p> | <p>Modifiers</p> | <p>Type</p> | <p>Description</p> |
|  --- | --- | --- | --- |
|  <p>[shortName](./node-core-library.jsonschema.shortname.md)</p> |  | <p>`string`</p> | <p>Returns a short name for this schema, for use in error messages.</p> |

## Methods

|  <p>Method</p> | <p>Modifiers</p> | <p>Description</p> |
|  --- | --- | --- |
|  <p>[ensureCompiled()](./node-core-library.jsonschema.ensurecompiled.md)</p> |  | <p>If not already done, this loads the schema from disk and compiles it.</p> |
|  <p>[fromFile(filename, options)](./node-core-library.jsonschema.fromfile.md)</p> | <p>`static`</p> | <p>Registers a JsonSchema that will be loaded from a file on disk.</p> |
|  <p>[fromLoadedObject(schemaObject)](./node-core-library.jsonschema.fromloadedobject.md)</p> | <p>`static`</p> | <p>Registers a JsonSchema that will be loaded from a file on disk.</p> |
|  <p>[validateObject(jsonObject, filenameForErrors, options)](./node-core-library.jsonschema.validateobject.md)</p> |  | <p>Validates the specified JSON object against this JSON schema. If the validation fails, an exception will be thrown.</p> |
|  <p>[validateObjectWithCallback(jsonObject, errorCallback)](./node-core-library.jsonschema.validateobjectwithcallback.md)</p> |  | <p>Validates the specified JSON object against this JSON schema. If the validation fails, a callback is called for each validation error.</p> |

## Remarks

The schema itself is normally loaded and compiled later, only if it is actually required to validate an input. To avoid schema errors at runtime, it's recommended to create a unit test that calls JsonSchema.ensureCompiled() for each of your schema objects.

