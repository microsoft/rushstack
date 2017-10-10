[Home](./index) &gt; [local](local.md) &gt; [Excel\_ChartLegendFormat](local.excel_chartlegendformat.md)

# Excel\_ChartLegendFormat class

Encapsulates the format properties of a chart legend. 

 \[Api set: ExcelApi 1.1\]

## Properties

|  Property | Access Modifier | Type | Description |
|  --- | --- | --- | --- |
|  [`fill`](local.excel_chartlegendformat.fill.md) |  | `Excel.ChartFill` | Represents the fill format of an object, which includes background formating information. Read-only. <p/> \[Api set: ExcelApi 1.1\] |
|  [`font`](local.excel_chartlegendformat.font.md) |  | `Excel.ChartFont` | Represents the font attributes such as font name, font size, color, etc. of a chart legend. Read-only. <p/> \[Api set: ExcelApi 1.1\] |

## Methods

|  Method | Access Modifier | Returns | Description |
|  --- | --- | --- | --- |
|  [`load(option)`](local.excel_chartlegendformat.load.md) |  | `Excel.ChartLegendFormat` | Queues up a command to load the specified properties of the object. You must call "context.sync()" before reading the properties. |
|  [`set(properties, options)`](local.excel_chartlegendformat.set.md) |  | `void` | Sets multiple properties on the object at the same time, based on JSON input. |
|  [`toJSON()`](local.excel_chartlegendformat.tojson.md) |  | `{
            "fill": ChartFill;
            "font": ChartFont;
        }` |  |

