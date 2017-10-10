[Home](./index) &gt; [local](local.md) &gt; [Excel\_ConditionalFormatRule](local.excel_conditionalformatrule.md)

# Excel\_ConditionalFormatRule class

Represents a rule, for all traditional rule/format pairings. 

 \[Api set: ExcelApi 1.6 (PREVIEW)\]

## Properties

|  Property | Access Modifier | Type | Description |
|  --- | --- | --- | --- |
|  [`formula`](local.excel_conditionalformatrule.formula.md) |  | `string` | The formula, if required, to evaluate the conditional format rule on. <p/> \[Api set: ExcelApi 1.6 (PREVIEW)\] |
|  [`formulaLocal`](local.excel_conditionalformatrule.formulalocal.md) |  | `string` | The formula, if required, to evaluate the conditional format rule on in the user's language. <p/> \[Api set: ExcelApi 1.6 (PREVIEW)\] |
|  [`formulaR1C1`](local.excel_conditionalformatrule.formular1c1.md) |  | `string` | The formula, if required, to evaluate the conditional format rule on in R1C1-style notation. <p/> \[Api set: ExcelApi 1.6 (PREVIEW)\] |

## Methods

|  Method | Access Modifier | Returns | Description |
|  --- | --- | --- | --- |
|  [`load(option)`](local.excel_conditionalformatrule.load.md) |  | `Excel.ConditionalFormatRule` | Queues up a command to load the specified properties of the object. You must call "context.sync()" before reading the properties. |
|  [`set(properties, options)`](local.excel_conditionalformatrule.set.md) |  | `void` | Sets multiple properties on the object at the same time, based on JSON input. |
|  [`toJSON()`](local.excel_conditionalformatrule.tojson.md) |  | `{
            "formula": string;
            "formulaLocal": string;
            "formulaR1C1": string;
        }` |  |

