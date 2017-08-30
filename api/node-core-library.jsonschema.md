<!-- docId=node-core-library.jsonschema -->

[Home](./index.md) &gt; [node-core-library](./node-core-library.md)

# JsonSchema class

Represents a JSON schema that can be used to validate JSON data files loaded by the JsonFile class.

## Constructor

Constructs a new instance of the `JsonSchema` class

## Properties

|  Property | Access Modifier | Type | Description |
|  --- | --- | --- | --- |
|  [`shortName`](./node-core-library.jsonschema.shortname.md) |  | `string` | Returns a short name for this schema, for use in error messages. |

## Methods

|  Method | Access Modifier | Returns | Description |
|  --- | --- | --- | --- |
|  [`ensureCompiled()`](./node-core-library.jsonschema.ensurecompiled.md) | `public` | `void` | If not already done, this loads the schema from disk and compiles it. |
|  [`fromFile()`](./node-core-library.jsonschema.fromfile.md) | `public` | `JsonSchema` | Registers a JsonSchema that will be loaded from a file on disk. |
|  [`fromLoadedObject()`](./node-core-library.jsonschema.fromloadedobject.md) | `public` | `JsonSchema` | Registers a JsonSchema that will be loaded from a file on disk. |
|  [`validateObject(jsonObject, filenameForErrors, options)`](./node-core-library.jsonschema.validateobject.md) | `public` | `void` | Validates the specified JSON object against this JSON schema. If the validation fails, an exception will be thrown. |
|  [`validateObjectWithCallback()`](./node-core-library.jsonschema.validateobjectwithcallback.md) | `public` | `void` | Validates the specified JSON object against this JSON schema. If the validation fails, a callback is called for each validation error. |

## Remarks

The schema itself is normally loaded and compiled later, only if it is actually required to validate an input. To avoid schema errors at runtime, it's recommended to create a unit test that calls JsonSchema.ensureCompiled() for each of your schema objects.
