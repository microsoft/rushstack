[Home](./index) &gt; [local](local.md) &gt; [Excel\_TableCollection](local.excel_tablecollection.md)

# Excel\_TableCollection class

Represents a collection of all the tables that are part of the workbook or worksheet, depending on how it was reached. 

 \[Api set: ExcelApi 1.1\]

## Properties

|  Property | Access Modifier | Type | Description |
|  --- | --- | --- | --- |
|  [`count`](local.excel_tablecollection.count.md) |  | `number` | Returns the number of tables in the workbook. Read-only. <p/> \[Api set: ExcelApi 1.1\] |
|  [`items`](local.excel_tablecollection.items.md) |  | `Array<Excel.Table>` | Gets the loaded child items in this collection. |

## Methods

|  Method | Access Modifier | Returns | Description |
|  --- | --- | --- | --- |
|  [`add(address, hasHeaders)`](local.excel_tablecollection.add.md) |  | `Excel.Table` | Create a new table. The range object or source address determines the worksheet under which the table will be added. If the table cannot be added (e.g., because the address is invalid, or the table would overlap with another table), an error will be thrown. <p/> \[Api set: ExcelApi 1.1\] |
|  [`getCount()`](local.excel_tablecollection.getcount.md) |  | `OfficeExtension.ClientResult<number>` | Gets the number of tables in the collection. <p/> \[Api set: ExcelApi 1.4\] |
|  [`getItem(key)`](local.excel_tablecollection.getitem.md) |  | `Excel.Table` | Gets a table by Name or ID. <p/> \[Api set: ExcelApi 1.1\] |
|  [`getItemAt(index)`](local.excel_tablecollection.getitemat.md) |  | `Excel.Table` | Gets a table based on its position in the collection. <p/> \[Api set: ExcelApi 1.1\] |
|  [`getItemOrNullObject(key)`](local.excel_tablecollection.getitemornullobject.md) |  | `Excel.Table` | Gets a table by Name or ID. If the table does not exist, will return a null object. <p/> \[Api set: ExcelApi 1.4\] |
|  [`load(option)`](local.excel_tablecollection.load.md) |  | `Excel.TableCollection` | Queues up a command to load the specified properties of the object. You must call "context.sync()" before reading the properties. |
|  [`toJSON()`](local.excel_tablecollection.tojson.md) |  | `{
            "count": number;
        }` |  |

