[Home](./index) &gt; [local](local.md) &gt; [Excel\_ChartDataLabelFormat](local.excel_chartdatalabelformat.md)

# Excel\_ChartDataLabelFormat class

Encapsulates the format properties for the chart data labels. 

 \[Api set: ExcelApi 1.1\]

## Properties

|  Property | Access Modifier | Type | Description |
|  --- | --- | --- | --- |
|  [`fill`](local.excel_chartdatalabelformat.fill.md) |  | `Excel.ChartFill` | Represents the fill format of the current chart data label. Read-only. <p/> \[Api set: ExcelApi 1.1\] |
|  [`font`](local.excel_chartdatalabelformat.font.md) |  | `Excel.ChartFont` | Represents the font attributes (font name, font size, color, etc.) for a chart data label. Read-only. <p/> \[Api set: ExcelApi 1.1\] |

## Methods

|  Method | Access Modifier | Returns | Description |
|  --- | --- | --- | --- |
|  [`load(option)`](local.excel_chartdatalabelformat.load.md) |  | `Excel.ChartDataLabelFormat` | Queues up a command to load the specified properties of the object. You must call "context.sync()" before reading the properties. |
|  [`set(properties, options)`](local.excel_chartdatalabelformat.set.md) |  | `void` | Sets multiple properties on the object at the same time, based on JSON input. |
|  [`toJSON()`](local.excel_chartdatalabelformat.tojson.md) |  | `{
            "fill": ChartFill;
            "font": ChartFont;
        }` |  |

