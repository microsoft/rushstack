[Home](./index) &gt; [local](local.md) &gt; [Excel\_DataBarConditionalFormat](local.excel_databarconditionalformat.md)

# Excel\_DataBarConditionalFormat class

Represents an Excel Conditional Data Bar Type. 

 \[Api set: ExcelApi 1.6 (PREVIEW)\]

## Properties

|  Property | Access Modifier | Type | Description |
|  --- | --- | --- | --- |
|  [`axisColor`](local.excel_databarconditionalformat.axiscolor.md) |  | `string` | HTML color code representing the color of the Axis line, of the form \#RRGGBB (e.g. "FFA500") or as a named HTML color (e.g. "orange"). "" (empty string) if no axis is present or set. <p/> \[Api set: ExcelApi 1.6 (PREVIEW)\] |
|  [`axisFormat`](local.excel_databarconditionalformat.axisformat.md) |  | `string` | Representation of how the axis is determined for an Excel data bar. <p/> \[Api set: ExcelApi 1.6 (PREVIEW)\] |
|  [`barDirection`](local.excel_databarconditionalformat.bardirection.md) |  | `string` | Represents the direction that the data bar graphic should be based on. <p/> \[Api set: ExcelApi 1.6 (PREVIEW)\] |
|  [`lowerBoundRule`](local.excel_databarconditionalformat.lowerboundrule.md) |  | `Excel.ConditionalDataBarRule` | The rule for what consistutes the lower bound (and how to calculate it, if applicable) for a data bar. <p/> \[Api set: ExcelApi 1.6 (PREVIEW)\] |
|  [`negativeFormat`](local.excel_databarconditionalformat.negativeformat.md) |  | `Excel.ConditionalDataBarNegativeFormat` | Representation of all values to the left of the axis in an Excel data bar. <p/> \[Api set: ExcelApi 1.6 (PREVIEW)\] |
|  [`positiveFormat`](local.excel_databarconditionalformat.positiveformat.md) |  | `Excel.ConditionalDataBarPositiveFormat` | Representation of all values to the right of the axis in an Excel data bar. <p/> \[Api set: ExcelApi 1.6 (PREVIEW)\] |
|  [`showDataBarOnly`](local.excel_databarconditionalformat.showdatabaronly.md) |  | `boolean` | If true, hides the values from the cells where the data bar is applied. <p/> \[Api set: ExcelApi 1.6 (PREVIEW)\] |
|  [`upperBoundRule`](local.excel_databarconditionalformat.upperboundrule.md) |  | `Excel.ConditionalDataBarRule` | The rule for what constitutes the upper bound (and how to calculate it, if applicable) for a data bar. <p/> \[Api set: ExcelApi 1.6 (PREVIEW)\] |

## Methods

|  Method | Access Modifier | Returns | Description |
|  --- | --- | --- | --- |
|  [`load(option)`](local.excel_databarconditionalformat.load.md) |  | `Excel.DataBarConditionalFormat` | Queues up a command to load the specified properties of the object. You must call "context.sync()" before reading the properties. |
|  [`set(properties, options)`](local.excel_databarconditionalformat.set.md) |  | `void` | Sets multiple properties on the object at the same time, based on JSON input. |
|  [`toJSON()`](local.excel_databarconditionalformat.tojson.md) |  | `{
            "axisColor": string;
            "axisFormat": string;
            "barDirection": string;
            "lowerBoundRule": ConditionalDataBarRule;
            "negativeFormat": ConditionalDataBarNegativeFormat;
            "positiveFormat": ConditionalDataBarPositiveFormat;
            "showDataBarOnly": boolean;
            "upperBoundRule": ConditionalDataBarRule;
        }` |  |

