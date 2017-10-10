[Home](./index) &gt; [local](local.md) &gt; [Excel\_ChartSeriesCollection](local.excel_chartseriescollection.md)

# Excel\_ChartSeriesCollection class

Represents a collection of chart series. 

 \[Api set: ExcelApi 1.1\]

## Properties

|  Property | Access Modifier | Type | Description |
|  --- | --- | --- | --- |
|  [`count`](local.excel_chartseriescollection.count.md) |  | `number` | Returns the number of series in the collection. Read-only. <p/> \[Api set: ExcelApi 1.1\] |
|  [`items`](local.excel_chartseriescollection.items.md) |  | `Array<Excel.ChartSeries>` | Gets the loaded child items in this collection. |

## Methods

|  Method | Access Modifier | Returns | Description |
|  --- | --- | --- | --- |
|  [`getCount()`](local.excel_chartseriescollection.getcount.md) |  | `OfficeExtension.ClientResult<number>` | Returns the number of series in the collection. <p/> \[Api set: ExcelApi 1.4\] |
|  [`getItemAt(index)`](local.excel_chartseriescollection.getitemat.md) |  | `Excel.ChartSeries` | Retrieves a series based on its position in the collection. <p/> \[Api set: ExcelApi 1.1\] |
|  [`load(option)`](local.excel_chartseriescollection.load.md) |  | `Excel.ChartSeriesCollection` | Queues up a command to load the specified properties of the object. You must call "context.sync()" before reading the properties. |
|  [`toJSON()`](local.excel_chartseriescollection.tojson.md) |  | `{
            "count": number;
        }` |  |

