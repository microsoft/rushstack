[Home](./index) &gt; [local](local.md) &gt; [Excel\_ChartPointsCollection](local.excel_chartpointscollection.md)

# Excel\_ChartPointsCollection class

A collection of all the chart points within a series inside a chart. 

 \[Api set: ExcelApi 1.1\]

## Properties

|  Property | Access Modifier | Type | Description |
|  --- | --- | --- | --- |
|  [`count`](local.excel_chartpointscollection.count.md) |  | `number` | Returns the number of chart points in the series. Read-only. <p/> \[Api set: ExcelApi 1.1\] |
|  [`items`](local.excel_chartpointscollection.items.md) |  | `Array<Excel.ChartPoint>` | Gets the loaded child items in this collection. |

## Methods

|  Method | Access Modifier | Returns | Description |
|  --- | --- | --- | --- |
|  [`getCount()`](local.excel_chartpointscollection.getcount.md) |  | `OfficeExtension.ClientResult<number>` | Returns the number of chart points in the series. <p/> \[Api set: ExcelApi 1.4\] |
|  [`getItemAt(index)`](local.excel_chartpointscollection.getitemat.md) |  | `Excel.ChartPoint` | Retrieve a point based on its position within the series. <p/> \[Api set: ExcelApi 1.1\] |
|  [`load(option)`](local.excel_chartpointscollection.load.md) |  | `Excel.ChartPointsCollection` | Queues up a command to load the specified properties of the object. You must call "context.sync()" before reading the properties. |
|  [`toJSON()`](local.excel_chartpointscollection.tojson.md) |  | `{
            "count": number;
        }` |  |

