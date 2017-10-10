[Home](./index) &gt; [local](local.md) &gt; [Excel\_Functions](local.excel_functions.md) &gt; [npv](local.excel_functions.npv.md)

# Excel\_Functions.npv method

Returns the net present value of an investment based on a discount rate and a series of future payments (negative values) and income (positive values). 

 \[Api set: ExcelApi 1.2\]

**Signature:**
```javascript
npv(rate: number | Excel.Range | Excel.RangeReference | Excel.FunctionResult<any>, ...values: Array<number | Excel.Range | Excel.RangeReference | Excel.FunctionResult<any>>): FunctionResult<number>;
```
**Returns:** `FunctionResult<number>`

## Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  `rate` | `number | Excel.Range | Excel.RangeReference | Excel.FunctionResult<any>` |  |
|  `values` | `Array<number | Excel.Range | Excel.RangeReference | Excel.FunctionResult<any>>` |  |

