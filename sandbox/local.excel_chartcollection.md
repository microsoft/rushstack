[Home](./index) &gt; [local](local.md) &gt; [Excel\_ChartCollection](local.excel_chartcollection.md)

# Excel\_ChartCollection class

A collection of all the chart objects on a worksheet. 

 \[Api set: ExcelApi 1.1\]

## Properties

|  Property | Access Modifier | Type | Description |
|  --- | --- | --- | --- |
|  [`count`](local.excel_chartcollection.count.md) |  | `number` | Returns the number of charts in the worksheet. Read-only. <p/> \[Api set: ExcelApi 1.1\] |
|  [`items`](local.excel_chartcollection.items.md) |  | `Array<Excel.Chart>` | Gets the loaded child items in this collection. |

## Methods

|  Method | Access Modifier | Returns | Description |
|  --- | --- | --- | --- |
|  [`add(type, sourceData, seriesBy)`](local.excel_chartcollection.add.md) |  | `Excel.Chart` | Creates a new chart. <p/> \[Api set: ExcelApi 1.1\] |
|  [`getCount()`](local.excel_chartcollection.getcount.md) |  | `OfficeExtension.ClientResult<number>` | Returns the number of charts in the worksheet. <p/> \[Api set: ExcelApi 1.4\] |
|  [`getItem(name)`](local.excel_chartcollection.getitem.md) |  | `Excel.Chart` | Gets a chart using its name. If there are multiple charts with the same name, the first one will be returned. <p/> \[Api set: ExcelApi 1.1\] |
|  [`getItemAt(index)`](local.excel_chartcollection.getitemat.md) |  | `Excel.Chart` | Gets a chart based on its position in the collection. <p/> \[Api set: ExcelApi 1.1\] |
|  [`getItemOrNullObject(name)`](local.excel_chartcollection.getitemornullobject.md) |  | `Excel.Chart` | Gets a chart using its name. If there are multiple charts with the same name, the first one will be returned. If the chart does not exist, will return a null object. <p/> \[Api set: ExcelApi 1.4\] |
|  [`load(option)`](local.excel_chartcollection.load.md) |  | `Excel.ChartCollection` | Queues up a command to load the specified properties of the object. You must call "context.sync()" before reading the properties. |
|  [`toJSON()`](local.excel_chartcollection.tojson.md) |  | `{
            "count": number;
        }` |  |

