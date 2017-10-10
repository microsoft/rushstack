[Home](./index) &gt; [local](local.md) &gt; [Excel\_ConditionalDataBarPositiveFormat](local.excel_conditionaldatabarpositiveformat.md)

# Excel\_ConditionalDataBarPositiveFormat class

Represents a conditional format DataBar Format for the positive side of the data bar. 

 \[Api set: ExcelApi 1.6 (PREVIEW)\]

## Properties

|  Property | Access Modifier | Type | Description |
|  --- | --- | --- | --- |
|  [`borderColor`](local.excel_conditionaldatabarpositiveformat.bordercolor.md) |  | `string` | HTML color code representing the color of the border line, of the form \#RRGGBB (e.g. "FFA500") or as a named HTML color (e.g. "orange"). "" (empty string) if no border is present or set. <p/> \[Api set: ExcelApi 1.6 (PREVIEW)\] |
|  [`fillColor`](local.excel_conditionaldatabarpositiveformat.fillcolor.md) |  | `string` | HTML color code representing the fill color, of the form \#RRGGBB (e.g. "FFA500") or as a named HTML color (e.g. "orange"). <p/> \[Api set: ExcelApi 1.6 (PREVIEW)\] |
|  [`gradientFill`](local.excel_conditionaldatabarpositiveformat.gradientfill.md) |  | `boolean` | Boolean representation of whether or not the DataBar has a gradient. <p/> \[Api set: ExcelApi 1.6 (PREVIEW)\] |

## Methods

|  Method | Access Modifier | Returns | Description |
|  --- | --- | --- | --- |
|  [`load(option)`](local.excel_conditionaldatabarpositiveformat.load.md) |  | `Excel.ConditionalDataBarPositiveFormat` | Queues up a command to load the specified properties of the object. You must call "context.sync()" before reading the properties. |
|  [`set(properties, options)`](local.excel_conditionaldatabarpositiveformat.set.md) |  | `void` | Sets multiple properties on the object at the same time, based on JSON input. |
|  [`toJSON()`](local.excel_conditionaldatabarpositiveformat.tojson.md) |  | `{
            "borderColor": string;
            "fillColor": string;
            "gradientFill": boolean;
        }` |  |

