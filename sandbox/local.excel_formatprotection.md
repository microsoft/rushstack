[Home](./index) &gt; [local](local.md) &gt; [Excel\_FormatProtection](local.excel_formatprotection.md)

# Excel\_FormatProtection class

Represents the format protection of a range object. 

 \[Api set: ExcelApi 1.2\]

## Properties

|  Property | Access Modifier | Type | Description |
|  --- | --- | --- | --- |
|  [`formulaHidden`](local.excel_formatprotection.formulahidden.md) |  | `boolean` | Indicates if Excel hides the formula for the cells in the range. A null value indicates that the entire range doesn't have uniform formula hidden setting. <p/> \[Api set: ExcelApi 1.2\] |
|  [`locked`](local.excel_formatprotection.locked.md) |  | `boolean` | Indicates if Excel locks the cells in the object. A null value indicates that the entire range doesn't have uniform lock setting. <p/> \[Api set: ExcelApi 1.2\] |

## Methods

|  Method | Access Modifier | Returns | Description |
|  --- | --- | --- | --- |
|  [`load(option)`](local.excel_formatprotection.load.md) |  | `Excel.FormatProtection` | Queues up a command to load the specified properties of the object. You must call "context.sync()" before reading the properties. |
|  [`set(properties, options)`](local.excel_formatprotection.set.md) |  | `void` | Sets multiple properties on the object at the same time, based on JSON input. |
|  [`toJSON()`](local.excel_formatprotection.tojson.md) |  | `{
            "formulaHidden": boolean;
            "locked": boolean;
        }` |  |

