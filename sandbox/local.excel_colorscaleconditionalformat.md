[Home](./index) &gt; [local](local.md) &gt; [Excel\_ColorScaleConditionalFormat](local.excel_colorscaleconditionalformat.md)

# Excel\_ColorScaleConditionalFormat class

Represents an IconSet criteria for conditional formatting. 

 \[Api set: ExcelApi 1.6 (PREVIEW)\]

## Properties

|  Property | Access Modifier | Type | Description |
|  --- | --- | --- | --- |
|  [`criteria`](local.excel_colorscaleconditionalformat.criteria.md) |  | `Excel.ConditionalColorScaleCriteria` | The criteria of the color scale. Midpoint is optional when using a two point color scale. <p/> \[Api set: ExcelApi 1.6 (PREVIEW)\] |
|  [`threeColorScale`](local.excel_colorscaleconditionalformat.threecolorscale.md) |  | `boolean` | If true the color scale will have three points (minimum, midpoint, maximum), otherwise it will have two (minimum, maximum). <p/> \[Api set: ExcelApi 1.6 (PREVIEW)\] |

## Methods

|  Method | Access Modifier | Returns | Description |
|  --- | --- | --- | --- |
|  [`load(option)`](local.excel_colorscaleconditionalformat.load.md) |  | `Excel.ColorScaleConditionalFormat` | Queues up a command to load the specified properties of the object. You must call "context.sync()" before reading the properties. |
|  [`set(properties, options)`](local.excel_colorscaleconditionalformat.set.md) |  | `void` | Sets multiple properties on the object at the same time, based on JSON input. |
|  [`toJSON()`](local.excel_colorscaleconditionalformat.tojson.md) |  | `{
            "criteria": ConditionalColorScaleCriteria;
            "threeColorScale": boolean;
        }` |  |

