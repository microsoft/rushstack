[Home](./index) &gt; [local](local.md) &gt; [Excel\_Table](local.excel_table.md) &gt; [set](local.excel_table.set.md)

# Excel\_Table.set method

Sets multiple properties on the object at the same time, based on JSON input.

**Signature:**
```javascript
set(properties: Interfaces.TableUpdateData, options?: {
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
|  `properties` | `Interfaces.TableUpdateData` |  |
|  `options` | `{
            /**
             * Throw an error if the passed-in property list includes read-only properties (default = true).
             */
            throwOnReadOnly?: boolean;
        }` |  |

