[Home](./index) &gt; [local](local.md) &gt; [Excel\_ConditionalDataBarNegativeFormat](local.excel_conditionaldatabarnegativeformat.md)

# Excel\_ConditionalDataBarNegativeFormat class

Represents a conditional format DataBar Format for the negative side of the data bar. 

 \[Api set: ExcelApi 1.6 (PREVIEW)\]

## Properties

|  Property | Access Modifier | Type | Description |
|  --- | --- | --- | --- |
|  [`borderColor`](local.excel_conditionaldatabarnegativeformat.bordercolor.md) |  | `string` | HTML color code representing the color of the border line, of the form \#RRGGBB (e.g. "FFA500") or as a named HTML color (e.g. "orange"). "Empty String" if no border is present or set. <p/> \[Api set: ExcelApi 1.6 (PREVIEW)\] |
|  [`fillColor`](local.excel_conditionaldatabarnegativeformat.fillcolor.md) |  | `string` | HTML color code representing the fill color, of the form \#RRGGBB (e.g. "FFA500") or as a named HTML color (e.g. "orange"). <p/> \[Api set: ExcelApi 1.6 (PREVIEW)\] |
|  [`matchPositiveBorderColor`](local.excel_conditionaldatabarnegativeformat.matchpositivebordercolor.md) |  | `boolean` | Boolean representation of whether or not the negative DataBar has the same border color as the positive DataBar. <p/> \[Api set: ExcelApi 1.6 (PREVIEW)\] |
|  [`matchPositiveFillColor`](local.excel_conditionaldatabarnegativeformat.matchpositivefillcolor.md) |  | `boolean` | Boolean representation of whether or not the negative DataBar has the same fill color as the positive DataBar. <p/> \[Api set: ExcelApi 1.6 (PREVIEW)\] |

## Methods

|  Method | Access Modifier | Returns | Description |
|  --- | --- | --- | --- |
|  [`load(option)`](local.excel_conditionaldatabarnegativeformat.load.md) |  | `Excel.ConditionalDataBarNegativeFormat` | Queues up a command to load the specified properties of the object. You must call "context.sync()" before reading the properties. |
|  [`set(properties, options)`](local.excel_conditionaldatabarnegativeformat.set.md) |  | `void` | Sets multiple properties on the object at the same time, based on JSON input. |
|  [`toJSON()`](local.excel_conditionaldatabarnegativeformat.tojson.md) |  | `{
            "borderColor": string;
            "fillColor": string;
            "matchPositiveBorderColor": boolean;
            "matchPositiveFillColor": boolean;
        }` |  |

