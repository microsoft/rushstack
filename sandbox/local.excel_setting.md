[Home](./index) &gt; [local](local.md) &gt; [Excel\_Setting](local.excel_setting.md)

# Excel\_Setting class

Setting represents a key-value pair of a setting persisted to the document. 

 \[Api set: ExcelApi 1.4\]

## Properties

|  Property | Access Modifier | Type | Description |
|  --- | --- | --- | --- |
|  [`key`](local.excel_setting.key.md) |  | `string` | Returns the key that represents the id of the Setting. Read-only. <p/> \[Api set: ExcelApi 1.4\] |
|  [`value`](local.excel_setting.value.md) |  | `any` | Represents the value stored for this setting. <p/> \[Api set: ExcelApi 1.4\] |

## Methods

|  Method | Access Modifier | Returns | Description |
|  --- | --- | --- | --- |
|  [`delete()`](local.excel_setting.delete.md) |  | `void` | Deletes the setting. <p/> \[Api set: ExcelApi 1.4\] |
|  [`load(option)`](local.excel_setting.load.md) |  | `Excel.Setting` | Queues up a command to load the specified properties of the object. You must call "context.sync()" before reading the properties. |
|  [`set(properties, options)`](local.excel_setting.set.md) |  | `void` | Sets multiple properties on the object at the same time, based on JSON input. |
|  [`toJSON()`](local.excel_setting.tojson.md) |  | `{
            "key": string;
            "value": any;
        }` |  |

