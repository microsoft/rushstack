[Home](./index) &gt; [local](local.md) &gt; [Word\_Body](local.word_body.md) &gt; [set](local.word_body.set.md)

# Word\_Body.set method

Sets multiple properties on the object at the same time, based on JSON input.

**Signature:**
```javascript
set(properties: Interfaces.BodyUpdateData, options?: {
            /**
             * Throw an error if the passed-in property list includes read-only properties (default = true).
             */
            throwOnReadOnly?: boolean;
        }): void;
```
**Returns:** `void`

## Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  `properties` | `Interfaces.BodyUpdateData` |  |
|  `options` | `{
            /**
             * Throw an error if the passed-in property list includes read-only properties (default = true).
             */
            throwOnReadOnly?: boolean;
        }` |  |

