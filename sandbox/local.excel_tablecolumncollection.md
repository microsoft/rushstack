[Home](./index) &gt; [local](local.md) &gt; [Excel\_TableColumnCollection](local.excel_tablecolumncollection.md)

# Excel\_TableColumnCollection class

Represents a collection of all the columns that are part of the table. 

 \[Api set: ExcelApi 1.1\]

## Properties

|  Property | Access Modifier | Type | Description |
|  --- | --- | --- | --- |
|  [`count`](local.excel_tablecolumncollection.count.md) |  | `number` | Returns the number of columns in the table. Read-only. <p/> \[Api set: ExcelApi 1.1\] |
|  [`items`](local.excel_tablecolumncollection.items.md) |  | `Array<Excel.TableColumn>` | Gets the loaded child items in this collection. |

## Methods

|  Method | Access Modifier | Returns | Description |
|  --- | --- | --- | --- |
|  [`add(index, values, name)`](local.excel_tablecolumncollection.add.md) |  | `Excel.TableColumn` | Adds a new column to the table. <p/> \[Api set: ExcelApi 1.1 requires an index smaller than the total column count; 1.4 allows index to be optional (null or -1) and will append a column at the end; 1.4 allows name parameter at creation time.\] |
|  [`getCount()`](local.excel_tablecolumncollection.getcount.md) |  | `OfficeExtension.ClientResult<number>` | Gets the number of columns in the table. <p/> \[Api set: ExcelApi 1.4\] |
|  [`getItem(key)`](local.excel_tablecolumncollection.getitem.md) |  | `Excel.TableColumn` | Gets a column object by Name or ID. <p/> \[Api set: ExcelApi 1.1\] |
|  [`getItemAt(index)`](local.excel_tablecolumncollection.getitemat.md) |  | `Excel.TableColumn` | Gets a column based on its position in the collection. <p/> \[Api set: ExcelApi 1.1\] |
|  [`getItemOrNullObject(key)`](local.excel_tablecolumncollection.getitemornullobject.md) |  | `Excel.TableColumn` | Gets a column object by Name or ID. If the column does not exist, will return a null object. <p/> \[Api set: ExcelApi 1.4\] |
|  [`load(option)`](local.excel_tablecolumncollection.load.md) |  | `Excel.TableColumnCollection` | Queues up a command to load the specified properties of the object. You must call "context.sync()" before reading the properties. |
|  [`toJSON()`](local.excel_tablecolumncollection.tojson.md) |  | `{
            "count": number;
        }` |  |

