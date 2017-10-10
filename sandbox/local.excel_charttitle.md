[Home](./index) &gt; [local](local.md) &gt; [Excel\_ChartTitle](local.excel_charttitle.md)

# Excel\_ChartTitle class

Represents a chart title object of a chart. 

 \[Api set: ExcelApi 1.1\]

## Properties

|  Property | Access Modifier | Type | Description |
|  --- | --- | --- | --- |
|  [`format`](local.excel_charttitle.format.md) |  | `Excel.ChartTitleFormat` | Represents the formatting of a chart title, which includes fill and font formatting. Read-only. <p/> \[Api set: ExcelApi 1.1\] |
|  [`overlay`](local.excel_charttitle.overlay.md) |  | `boolean` | Boolean value representing if the chart title will overlay the chart or not. <p/> \[Api set: ExcelApi 1.1\] |
|  [`text`](local.excel_charttitle.text.md) |  | `string` | Represents the title text of a chart. <p/> \[Api set: ExcelApi 1.1\] |
|  [`visible`](local.excel_charttitle.visible.md) |  | `boolean` | A boolean value the represents the visibility of a chart title object. <p/> \[Api set: ExcelApi 1.1\] |

## Methods

|  Method | Access Modifier | Returns | Description |
|  --- | --- | --- | --- |
|  [`load(option)`](local.excel_charttitle.load.md) |  | `Excel.ChartTitle` | Queues up a command to load the specified properties of the object. You must call "context.sync()" before reading the properties. |
|  [`set(properties, options)`](local.excel_charttitle.set.md) |  | `void` | Sets multiple properties on the object at the same time, based on JSON input. |
|  [`toJSON()`](local.excel_charttitle.tojson.md) |  | `{
            "format": ChartTitleFormat;
            "overlay": boolean;
            "text": string;
            "visible": boolean;
        }` |  |

