[Home](./index) &gt; [local](local.md) &gt; [Excel\_TableRow](local.excel_tablerow.md)

# Excel\_TableRow class

Represents a row in a table. 

 Note that unlike Ranges or Columns, which will adjust if new rows/columns are added before them, a TableRow object represent the physical location of the table row, but not the data. That is, if the data is sorted or if new rows are added, a table row will continue to point at the index for which it was created. 

 \[Api set: ExcelApi 1.1\]

## Properties

|  Property | Access Modifier | Type | Description |
|  --- | --- | --- | --- |
|  [`index`](local.excel_tablerow.index.md) |  | `number` | Returns the index number of the row within the rows collection of the table. Zero-indexed. Read-only. <p/> \[Api set: ExcelApi 1.1\] |
|  [`values`](local.excel_tablerow.values.md) |  | `Array<Array<any>>` | Represents the raw values of the specified range. The data returned could be of type string, number, or a boolean. Cell that contain an error will return the error string. <p/> \[Api set: ExcelApi 1.1\] |

## Methods

|  Method | Access Modifier | Returns | Description |
|  --- | --- | --- | --- |
|  [`delete()`](local.excel_tablerow.delete.md) |  | `void` | Deletes the row from the table. <p/> \[Api set: ExcelApi 1.1\] |
|  [`getRange()`](local.excel_tablerow.getrange.md) |  | `Excel.Range` | Returns the range object associated with the entire row. <p/> \[Api set: ExcelApi 1.1\] |
|  [`load(option)`](local.excel_tablerow.load.md) |  | `Excel.TableRow` | Queues up a command to load the specified properties of the object. You must call "context.sync()" before reading the properties. |
|  [`set(properties, options)`](local.excel_tablerow.set.md) |  | `void` | Sets multiple properties on the object at the same time, based on JSON input. |
|  [`toJSON()`](local.excel_tablerow.tojson.md) |  | `{
            "index": number;
            "values": any[][];
        }` |  |

