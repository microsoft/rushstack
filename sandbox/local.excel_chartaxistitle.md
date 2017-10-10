[Home](./index) &gt; [local](local.md) &gt; [Excel\_ChartAxisTitle](local.excel_chartaxistitle.md)

# Excel\_ChartAxisTitle class

Represents the title of a chart axis. 

 \[Api set: ExcelApi 1.1\]

## Properties

|  Property | Access Modifier | Type | Description |
|  --- | --- | --- | --- |
|  [`format`](local.excel_chartaxistitle.format.md) |  | `Excel.ChartAxisTitleFormat` | Represents the formatting of chart axis title. Read-only. <p/> \[Api set: ExcelApi 1.1\] |
|  [`text`](local.excel_chartaxistitle.text.md) |  | `string` | Represents the axis title. <p/> \[Api set: ExcelApi 1.1\] |
|  [`visible`](local.excel_chartaxistitle.visible.md) |  | `boolean` | A boolean that specifies the visibility of an axis title. <p/> \[Api set: ExcelApi 1.1\] |

## Methods

|  Method | Access Modifier | Returns | Description |
|  --- | --- | --- | --- |
|  [`load(option)`](local.excel_chartaxistitle.load.md) |  | `Excel.ChartAxisTitle` | Queues up a command to load the specified properties of the object. You must call "context.sync()" before reading the properties. |
|  [`set(properties, options)`](local.excel_chartaxistitle.set.md) |  | `void` | Sets multiple properties on the object at the same time, based on JSON input. |
|  [`toJSON()`](local.excel_chartaxistitle.tojson.md) |  | `{
            "format": ChartAxisTitleFormat;
            "text": string;
            "visible": boolean;
        }` |  |

