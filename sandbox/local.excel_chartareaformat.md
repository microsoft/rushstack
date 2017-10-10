[Home](./index) &gt; [local](local.md) &gt; [Excel\_ChartAreaFormat](local.excel_chartareaformat.md)

# Excel\_ChartAreaFormat class

Encapsulates the format properties for the overall chart area. 

 \[Api set: ExcelApi 1.1\]

## Properties

|  Property | Access Modifier | Type | Description |
|  --- | --- | --- | --- |
|  [`fill`](local.excel_chartareaformat.fill.md) |  | `Excel.ChartFill` | Represents the fill format of an object, which includes background formatting information. Read-only. <p/> \[Api set: ExcelApi 1.1\] |
|  [`font`](local.excel_chartareaformat.font.md) |  | `Excel.ChartFont` | Represents the font attributes (font name, font size, color, etc.) for the current object. Read-only. <p/> \[Api set: ExcelApi 1.1\] |

## Methods

|  Method | Access Modifier | Returns | Description |
|  --- | --- | --- | --- |
|  [`load(option)`](local.excel_chartareaformat.load.md) |  | `Excel.ChartAreaFormat` | Queues up a command to load the specified properties of the object. You must call "context.sync()" before reading the properties. |
|  [`set(properties, options)`](local.excel_chartareaformat.set.md) |  | `void` | Sets multiple properties on the object at the same time, based on JSON input. |
|  [`toJSON()`](local.excel_chartareaformat.tojson.md) |  | `{
            "fill": ChartFill;
            "font": ChartFont;
        }` |  |

