## TODO

- remove existsSync
- use throw if no entry false in stat sync
- compress things

- libraries/rush-lib/src/logic/buildCache/OperationBuildCache.ts

- use allocUnsafeSlow
- dont ...
- extra/empty dirs are not deleted

collect files
build object entries first and then come back in a 2nd pass for file contents, hashes, etc.
use a dir queue instead of recursiton for directory traversal

writeSync can not write all the bytes reuested. check the return value and loop until done.
also look into writev to write the header and data in one go / multiple files in one go. writev also has the same quirk.

bail on symlinks, pack and unpack


a mode that just scans target dirs and hashes

a support for multiple target dirs

