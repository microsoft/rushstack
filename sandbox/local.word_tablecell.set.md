[Home](./index) &gt; [local](local.md) &gt; [Word\_TableCell](local.word_tablecell.md) &gt; [set](local.word_tablecell.set.md)

# Word\_TableCell.set method

Sets multiple properties on the object at the same time, based on JSON input.

**Signature:**
```javascript
set(properties: Interfaces.TableCellUpdateData, options?: {
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
|  `properties` | `Interfaces.TableCellUpdateData` |  |
|  `options` | `{
            /**
             * Throw an error if the passed-in property list includes read-only properties (default = true).
             */
            throwOnReadOnly?: boolean;
        }` |  |

