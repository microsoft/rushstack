[Home](./index) &gt; [local](local.md) &gt; [Excel\_ChartPoint](local.excel_chartpoint.md)

# Excel\_ChartPoint class

Represents a point of a series in a chart. 

 \[Api set: ExcelApi 1.1\]

## Properties

|  Property | Access Modifier | Type | Description |
|  --- | --- | --- | --- |
|  [`format`](local.excel_chartpoint.format.md) |  | `Excel.ChartPointFormat` | Encapsulates the format properties chart point. Read-only. <p/> \[Api set: ExcelApi 1.1\] |
|  [`value`](local.excel_chartpoint.value.md) |  | `any` | Returns the value of a chart point. Read-only. <p/> \[Api set: ExcelApi 1.1\] |

## Methods

|  Method | Access Modifier | Returns | Description |
|  --- | --- | --- | --- |
|  [`load(option)`](local.excel_chartpoint.load.md) |  | `Excel.ChartPoint` | Queues up a command to load the specified properties of the object. You must call "context.sync()" before reading the properties. |
|  [`toJSON()`](local.excel_chartpoint.tojson.md) |  | `{
            "format": ChartPointFormat;
            "value": any;
        }` |  |

