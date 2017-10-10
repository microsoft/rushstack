[Home](./index) &gt; [local](local.md) &gt; [Excel\_TableColumn](local.excel_tablecolumn.md)

# Excel\_TableColumn class

Represents a column in a table. 

 \[Api set: ExcelApi 1.1\]

## Properties

|  Property | Access Modifier | Type | Description |
|  --- | --- | --- | --- |
|  [`filter`](local.excel_tablecolumn.filter.md) |  | `Excel.Filter` | Retrieve the filter applied to the column. <p/> \[Api set: ExcelApi 1.2\] |
|  [`id`](local.excel_tablecolumn.id.md) |  | `number` | Returns a unique key that identifies the column within the table. Read-only. <p/> \[Api set: ExcelApi 1.1\] |
|  [`index`](local.excel_tablecolumn.index.md) |  | `number` | Returns the index number of the column within the columns collection of the table. Zero-indexed. Read-only. <p/> \[Api set: ExcelApi 1.1\] |
|  [`name`](local.excel_tablecolumn.name.md) |  | `string` | Represents the name of the table column. <p/> \[Api set: ExcelApi 1.1 for getting the name; 1.4 for setting it.\] |
|  [`values`](local.excel_tablecolumn.values.md) |  | `Array<Array<any>>` | Represents the raw values of the specified range. The data returned could be of type string, number, or a boolean. Cell that contain an error will return the error string. <p/> \[Api set: ExcelApi 1.1\] |

## Methods

|  Method | Access Modifier | Returns | Description |
|  --- | --- | --- | --- |
|  [`delete()`](local.excel_tablecolumn.delete.md) |  | `void` | Deletes the column from the table. <p/> \[Api set: ExcelApi 1.1\] |
|  [`getDataBodyRange()`](local.excel_tablecolumn.getdatabodyrange.md) |  | `Excel.Range` | Gets the range object associated with the data body of the column. <p/> \[Api set: ExcelApi 1.1\] |
|  [`getHeaderRowRange()`](local.excel_tablecolumn.getheaderrowrange.md) |  | `Excel.Range` | Gets the range object associated with the header row of the column. <p/> \[Api set: ExcelApi 1.1\] |
|  [`getRange()`](local.excel_tablecolumn.getrange.md) |  | `Excel.Range` | Gets the range object associated with the entire column. <p/> \[Api set: ExcelApi 1.1\] |
|  [`getTotalRowRange()`](local.excel_tablecolumn.gettotalrowrange.md) |  | `Excel.Range` | Gets the range object associated with the totals row of the column. <p/> \[Api set: ExcelApi 1.1\] |
|  [`load(option)`](local.excel_tablecolumn.load.md) |  | `Excel.TableColumn` | Queues up a command to load the specified properties of the object. You must call "context.sync()" before reading the properties. |
|  [`set(properties, options)`](local.excel_tablecolumn.set.md) |  | `void` | Sets multiple properties on the object at the same time, based on JSON input. |
|  [`toJSON()`](local.excel_tablecolumn.tojson.md) |  | `{
            "id": number;
            "index": number;
            "name": string;
            "values": any[][];
        }` |  |

