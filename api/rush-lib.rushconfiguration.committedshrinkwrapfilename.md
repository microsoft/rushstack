[Home](./index) &gt; [@microsoft/rush-lib](./rush-lib.md) &gt; [RushConfiguration](./rush-lib.rushconfiguration.md) &gt; [committedShrinkwrapFilename](./rush-lib.rushconfiguration.committedshrinkwrapfilename.md)

# RushConfiguration.committedShrinkwrapFilename property

The filename of the NPM shrinkwrap file that is tracked e.g. by Git. (The "rush install" command uses a temporary copy, whose path is tempShrinkwrapFilename.) This property merely reports the filename; the file itself may not actually exist. Example: "C:\\MyRepo\\common\\npm-shrinkwrap.json" or "C:\\MyRepo\\common\\shrinkwrap.yaml"

**Signature:**
```javascript
committedShrinkwrapFilename: string
```
