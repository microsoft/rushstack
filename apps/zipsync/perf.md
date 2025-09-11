# zipsync performance testing

### tar

```
bharatmiddha@itisamac odsp-media % time tar -zcf release.tar.gz release
tar -zcf release.tar.gz release  18.02s user 5.59s system 76% cpu 30.751 total
```

### zip

```
bharatmiddha@itisamac odsp-media % time zip -q -Z deflate -r release.zip release
zip -q -Z deflate -r release.zip release  18.56s user 1.10s system 82% cpu 23.845 total
```

### zipsync

```
bharatmiddha@itisamac odsp-media % time node /Users/bharatmiddha/code/rushstack/apps/zipsync-custom/lib/start.js -m pack -a release.zipsync -t release

zipsync 0.5.16 - https://rushstack.io

Packing to release.zip from release
Found 11854 files to pack
Successfully packed 11855 files
node /Users/bharatmiddha/code/rushstack/apps/zipsync-custom/lib/start.js -m    1.21s user 0.35s system 100% cpu 1.551 total
```

### file sizes
```
-rw-r--r--   1 bharatmiddha  staff   801M Sep  9 19:42 release.tar
-rw-r--r--   1 bharatmiddha  staff   804M Sep  9 19:41 release.zip
-rw-r--r--   1 bharatmiddha  staff   804M Sep  9 19:43 release.zipsync
```

## extract archive

### clean
```
bharatmiddha@itisamac odsp-media % time rm -rf release
rm -rf release  0.01s user 0.81s system 54% cpu 1.495 total
```

### tar

```bharatmiddha@itisamac odsp-media % time tar -xf release.tar
tar -xf release.tar  1.56s user 6.10s system 40% cpu 18.704 total
```

### unzip

```
bharatmiddha@itisamac odsp-media % time unzip -qo release.zip
unzip -qo release.zip  4.84s user 2.42s system 74% cpu 9.808 total
```

### zipsync (clean)

```
bharatmiddha@itisamac odsp-media % time node /Users/bharatmiddha/code/rushstack/apps/zipsync-custom/lib/start.js -m unpack -a release.zipsync -t release

zipsync 0.5.16 - https://rushstack.io

Unpacking to release from release.zipsync
Found 11866 files in archive
Extraction complete: 11865 extracted, 0 skipped, 0 deleted
node /Users/bharatmiddha/code/rushstack/apps/zipsync-custom/lib/start.js -m    2.17s user 1.43s system 90% cpu 3.953 total
```

### zipsync (partial sync)

```
bharatmiddha@itisamac odsp-media % time node /Users/bharatmiddha/code/rushstack/apps/zipsync-custom/lib/start.js -m unpack -a release.zipsync -t release

zipsync 0.5.16 - https://rushstack.io

Unpacking to release from release.zipsync
Found 11866 files in archive
Extraction complete: 346 extracted, 11519 skipped, 396 deleted
node /Users/bharatmiddha/code/rushstack/apps/zipsync-custom/lib/start.js -m    0.67s user 0.66s system 73% cpu 1.815 total
```

### zipsync (fully synced)

```
bharatmiddha@itisamac odsp-media % time node /Users/bharatmiddha/code/rushstack/apps/zipsync-custom/lib/start.js -m unpack -a release.zipsync -t release

zipsync 0.5.16 - https://rushstack.io

Unpacking to release from release.zipsync
Found 11866 files in archive
Extraction complete: 0 extracted, 11865 skipped, 0 deleted
node /Users/bharatmiddha/code/rushstack/apps/zipsync-custom/lib/start.js -m    0.66s user 0.65s system 71% cpu 1.824 total
```
