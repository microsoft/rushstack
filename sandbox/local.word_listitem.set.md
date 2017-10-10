[Home](./index) &gt; [local](local.md) &gt; [Word\_ListItem](local.word_listitem.md) &gt; [set](local.word_listitem.set.md)

# Word\_ListItem.set method

Sets multiple properties on the object at the same time, based on JSON input.

**Signature:**
```javascript
set(properties: Interfaces.ListItemUpdateData, options?: {
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
|  `properties` | `Interfaces.ListItemUpdateData` |  |
|  `options` | `{
            /**
             * Throw an error if the passed-in property list includes read-only properties (default = true).
             */
            throwOnReadOnly?: boolean;
        }` |  |

