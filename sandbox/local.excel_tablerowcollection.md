[Home](./index) &gt; [local](local.md) &gt; [Excel\_TableRowCollection](local.excel_tablerowcollection.md)

# Excel\_TableRowCollection class

Represents a collection of all the rows that are part of the table. 

 Note that unlike Ranges or Columns, which will adjust if new rows/columns are added before them, a TableRow object represent the physical location of the table row, but not the data. That is, if the data is sorted or if new rows are added, a table row will continue to point at the index for which it was created. 

 \[Api set: ExcelApi 1.1\]

## Properties

|  Property | Access Modifier | Type | Description |
|  --- | --- | --- | --- |
|  [`count`](local.excel_tablerowcollection.count.md) |  | `number` | Returns the number of rows in the table. Read-only. <p/> \[Api set: ExcelApi 1.1\] |
|  [`items`](local.excel_tablerowcollection.items.md) |  | `Array<Excel.TableRow>` | Gets the loaded child items in this collection. |

## Methods

|  Method | Access Modifier | Returns | Description |
|  --- | --- | --- | --- |
|  [`add(index, values)`](local.excel_tablerowcollection.add.md) |  | `Excel.TableRow` | Adds one or more rows to the table. The return object will be the top of the newly added row(s). <p/> Note that unlike Ranges or Columns, which will adjust if new rows/columns are added before them, a TableRow object represent the physical location of the table row, but not the data. That is, if the data is sorted or if new rows are added, a table row will continue to point at the index for which it was created. <p/> \[Api set: ExcelApi 1.1 for adding a single row; 1.4 allows adding of multiple rows.\] |
|  [`getCount()`](local.excel_tablerowcollection.getcount.md) |  | `OfficeExtension.ClientResult<number>` | Gets the number of rows in the table. <p/> \[Api set: ExcelApi 1.4\] |
|  [`getItemAt(index)`](local.excel_tablerowcollection.getitemat.md) |  | `Excel.TableRow` | Gets a row based on its position in the collection. <p/> Note that unlike Ranges or Columns, which will adjust if new rows/columns are added before them, a TableRow object represent the physical location of the table row, but not the data. That is, if the data is sorted or if new rows are added, a table row will continue to point at the index for which it was created. <p/> \[Api set: ExcelApi 1.1\] |
|  [`load(option)`](local.excel_tablerowcollection.load.md) |  | `Excel.TableRowCollection` | Queues up a command to load the specified properties of the object. You must call "context.sync()" before reading the properties. |
|  [`toJSON()`](local.excel_tablerowcollection.tojson.md) |  | `{
            "count": number;
        }` |  |

