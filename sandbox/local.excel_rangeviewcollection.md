[Home](./index) &gt; [local](local.md) &gt; [Excel\_RangeViewCollection](local.excel_rangeviewcollection.md)

# Excel\_RangeViewCollection class

Represents a collection of RangeView objects. 

 \[Api set: ExcelApi 1.3\]

## Properties

|  Property | Access Modifier | Type | Description |
|  --- | --- | --- | --- |
|  [`items`](local.excel_rangeviewcollection.items.md) |  | `Array<Excel.RangeView>` | Gets the loaded child items in this collection. |

## Methods

|  Method | Access Modifier | Returns | Description |
|  --- | --- | --- | --- |
|  [`getCount()`](local.excel_rangeviewcollection.getcount.md) |  | `OfficeExtension.ClientResult<number>` | Gets the number of RangeView objects in the collection. <p/> \[Api set: ExcelApi 1.4\] |
|  [`getItemAt(index)`](local.excel_rangeviewcollection.getitemat.md) |  | `Excel.RangeView` | Gets a RangeView Row via it's index. Zero-Indexed. <p/> \[Api set: ExcelApi 1.3\] |
|  [`load(option)`](local.excel_rangeviewcollection.load.md) |  | `Excel.RangeViewCollection` | Queues up a command to load the specified properties of the object. You must call "context.sync()" before reading the properties. |
|  [`toJSON()`](local.excel_rangeviewcollection.tojson.md) |  | `{}` |  |

