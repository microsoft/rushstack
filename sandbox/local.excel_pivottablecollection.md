[Home](./index) &gt; [local](local.md) &gt; [Excel\_PivotTableCollection](local.excel_pivottablecollection.md)

# Excel\_PivotTableCollection class

Represents a collection of all the PivotTables that are part of the workbook or worksheet. 

 \[Api set: ExcelApi 1.3\]

## Properties

|  Property | Access Modifier | Type | Description |
|  --- | --- | --- | --- |
|  [`items`](local.excel_pivottablecollection.items.md) |  | `Array<Excel.PivotTable>` | Gets the loaded child items in this collection. |

## Methods

|  Method | Access Modifier | Returns | Description |
|  --- | --- | --- | --- |
|  [`getCount()`](local.excel_pivottablecollection.getcount.md) |  | `OfficeExtension.ClientResult<number>` | Gets the number of pivot tables in the collection. <p/> \[Api set: ExcelApi 1.4\] |
|  [`getItem(name)`](local.excel_pivottablecollection.getitem.md) |  | `Excel.PivotTable` | Gets a PivotTable by name. <p/> \[Api set: ExcelApi 1.3\] |
|  [`getItemOrNullObject(name)`](local.excel_pivottablecollection.getitemornullobject.md) |  | `Excel.PivotTable` | Gets a PivotTable by name. If the PivotTable does not exist, will return a null object. <p/> \[Api set: ExcelApi 1.4\] |
|  [`load(option)`](local.excel_pivottablecollection.load.md) |  | `Excel.PivotTableCollection` | Queues up a command to load the specified properties of the object. You must call "context.sync()" before reading the properties. |
|  [`refreshAll()`](local.excel_pivottablecollection.refreshall.md) |  | `void` | Refreshes all the pivot tables in the collection. <p/> \[Api set: ExcelApi 1.3\] |
|  [`toJSON()`](local.excel_pivottablecollection.tojson.md) |  | `{}` |  |

