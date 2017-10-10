[Home](./index) &gt; [local](local.md) &gt; [Excel\_ConditionalFormatCollection](local.excel_conditionalformatcollection.md)

# Excel\_ConditionalFormatCollection class

Represents a collection of all the conditional formats that are overlap the range. 

 \[Api set: ExcelApi 1.6 (PREVIEW)\]

## Properties

|  Property | Access Modifier | Type | Description |
|  --- | --- | --- | --- |
|  [`items`](local.excel_conditionalformatcollection.items.md) |  | `Array<Excel.ConditionalFormat>` | Gets the loaded child items in this collection. |

## Methods

|  Method | Access Modifier | Returns | Description |
|  --- | --- | --- | --- |
|  [`add(type)`](local.excel_conditionalformatcollection.add.md) |  | `Excel.ConditionalFormat` | Adds a new conditional format to the collection at the first/top priority. <p/> \[Api set: ExcelApi 1.6 (PREVIEW)\] |
|  [`clearAll()`](local.excel_conditionalformatcollection.clearall.md) |  | `void` | Clears all conditional formats active on the current specified range. <p/> \[Api set: ExcelApi 1.6 (PREVIEW)\] |
|  [`getCount()`](local.excel_conditionalformatcollection.getcount.md) |  | `OfficeExtension.ClientResult<number>` | Returns the number of conditional formats in the workbook. Read-only. <p/> \[Api set: ExcelApi 1.6 (PREVIEW)\] |
|  [`getItem(id)`](local.excel_conditionalformatcollection.getitem.md) |  | `Excel.ConditionalFormat` | Returns a conditional format for the given ID. <p/> \[Api set: ExcelApi 1.6 (PREVIEW)\] |
|  [`getItemAt(index)`](local.excel_conditionalformatcollection.getitemat.md) |  | `Excel.ConditionalFormat` | Returns a conditional format at the given index. <p/> \[Api set: ExcelApi 1.6 (PREVIEW)\] |
|  [`load(option)`](local.excel_conditionalformatcollection.load.md) |  | `Excel.ConditionalFormatCollection` | Queues up a command to load the specified properties of the object. You must call "context.sync()" before reading the properties. |
|  [`toJSON()`](local.excel_conditionalformatcollection.tojson.md) |  | `{}` |  |

