// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type * as fs from 'node:fs';
import * as path from 'node:path';

import { RealNodeModulePathResolver } from '../RealNodeModulePath';

const mockReadlinkSync: jest.Mock<
  ReturnType<typeof fs.readlinkSync>,
  Parameters<typeof fs.readlinkSync>
> = jest.fn();
const readlinkSync: typeof fs.readlinkSync = mockReadlinkSync as unknown as typeof fs.readlinkSync;

describe('realNodeModulePath', () => {
  beforeEach(() => {
    mockReadlinkSync.mockReset();
  });

  describe('POSIX paths', () => {
    const resolver: RealNodeModulePathResolver = new RealNodeModulePathResolver({
      readlinkSync,
      path: path.posix
    });
    const { realNodeModulePath } = resolver;

    beforeEach(() => {
      resolver.clearCache();
    });

    it('should return the input path if it does not contain node_modules', () => {
      for (const input of ['/foo/bar', '/', 'ab', '../foo/bar/baz']) {
        expect(realNodeModulePath(input)).toBe(input);
        expect(mockReadlinkSync).not.toHaveBeenCalled();
      }
    });

    it('Should handle absolute link targets', () => {
      mockReadlinkSync.mockReturnValueOnce('/link/target');
      expect(realNodeModulePath('/foo/node_modules/link')).toBe('/link/target');
      expect(mockReadlinkSync).toHaveBeenCalledWith('/foo/node_modules/link', 'utf8');
      expect(mockReadlinkSync).toHaveBeenCalledTimes(1);
    });

    it('Caches resolved symlinks', () => {
      mockReadlinkSync.mockReturnValueOnce('/link/target');
      expect(realNodeModulePath('/foo/node_modules/link')).toBe('/link/target');
      expect(realNodeModulePath('/foo/node_modules/link/bar')).toBe('/link/target/bar');
      expect(mockReadlinkSync).toHaveBeenCalledWith('/foo/node_modules/link', 'utf8');
      expect(mockReadlinkSync).toHaveBeenCalledTimes(1);
    });

    it('Should stop after a single absolute link target', () => {
      mockReadlinkSync.mockReturnValueOnce('/link/target');
      expect(realNodeModulePath('/node_modules/foo/node_modules/link')).toBe('/link/target');
      expect(mockReadlinkSync).toHaveBeenCalledWith('/node_modules/foo/node_modules/link', 'utf8');
      expect(mockReadlinkSync).toHaveBeenCalledTimes(1);
    });

    it('Should handle relative link targets', () => {
      mockReadlinkSync.mockReturnValueOnce('../../link/target');
      expect(realNodeModulePath('/foo/node_modules/link')).toBe('/link/target');
      expect(mockReadlinkSync).toHaveBeenCalledWith('/foo/node_modules/link', 'utf8');
      expect(mockReadlinkSync).toHaveBeenCalledTimes(1);
    });

    it('Should recursively handle relative link targets', () => {
      mockReadlinkSync.mockReturnValueOnce('../../link');
      mockReadlinkSync.mockReturnValueOnce('/other/root/bar');
      expect(realNodeModulePath('/foo/1/2/3/node_modules/bar/node_modules/link/4/5/6')).toBe(
        '/other/root/link/4/5/6'
      );
      expect(mockReadlinkSync).toHaveBeenCalledWith('/foo/1/2/3/node_modules/bar/node_modules/link', 'utf8');
      expect(mockReadlinkSync).toHaveBeenCalledWith('/foo/1/2/3/node_modules/bar', 'utf8');
      expect(mockReadlinkSync).toHaveBeenCalledTimes(2);
    });

    it('Caches multi-layer resolution', () => {
      mockReadlinkSync.mockReturnValueOnce('../../link');
      mockReadlinkSync.mockReturnValueOnce('/other/root/bar');
      expect(realNodeModulePath('/foo/1/2/3/node_modules/bar/node_modules/link/4/5/6')).toBe(
        '/other/root/link/4/5/6'
      );
      expect(realNodeModulePath('/foo/1/2/3/node_modules/bar/node_modules/link/a/b')).toBe(
        '/other/root/link/a/b'
      );
      expect(realNodeModulePath('/foo/1/2/3/node_modules/bar/a/b')).toBe('/other/root/bar/a/b');
      expect(mockReadlinkSync).toHaveBeenCalledWith('/foo/1/2/3/node_modules/bar/node_modules/link', 'utf8');
      expect(mockReadlinkSync).toHaveBeenCalledWith('/foo/1/2/3/node_modules/bar', 'utf8');
      expect(mockReadlinkSync).toHaveBeenCalledTimes(2);
    });
  });

  describe('Windows paths', () => {
    const resolver: RealNodeModulePathResolver = new RealNodeModulePathResolver({
      readlinkSync,
      path: path.win32
    });
    const { realNodeModulePath } = resolver;

    beforeEach(() => {
      resolver.clearCache();
    });

    it('should return the input path if it does not contain node_modules', () => {
      for (const input of ['C:\\foo\\bar', 'C:\\', 'ab', '..\\foo\\bar\\baz']) {
        expect(realNodeModulePath(input)).toBe(input);
        expect(mockReadlinkSync).not.toHaveBeenCalled();
      }
    });

    it('should return the normalized input path if it does not contain node_modules', () => {
      for (const input of ['C:/foo/bar', 'C:/', 'ab', '../foo/bar/baz']) {
        expect(realNodeModulePath(input)).toBe(path.win32.normalize(input));
        expect(mockReadlinkSync).not.toHaveBeenCalled();
      }
    });

    it('Should handle absolute link targets', () => {
      mockReadlinkSync.mockReturnValueOnce('C:\\link\\target');
      expect(realNodeModulePath('C:\\foo\\node_modules\\link')).toBe('C:\\link\\target');
      expect(mockReadlinkSync).toHaveBeenCalledWith('C:\\foo\\node_modules\\link', 'utf8');
      expect(mockReadlinkSync).toHaveBeenCalledTimes(1);
    });

    it('Should normalize input', () => {
      mockReadlinkSync.mockReturnValueOnce('C:\\link\\target');
      expect(realNodeModulePath('C:\\foo\\node_modules\\link')).toBe('C:\\link\\target');
      expect(mockReadlinkSync).toHaveBeenCalledWith('C:\\foo\\node_modules\\link', 'utf8');
      expect(mockReadlinkSync).toHaveBeenCalledTimes(1);
    });

    it('Should stop after a single absolute link target', () => {
      mockReadlinkSync.mockReturnValueOnce('D:\\link\\target');
      expect(realNodeModulePath('C:\\node_modules\\foo\\node_modules\\link')).toBe('D:\\link\\target');
      expect(mockReadlinkSync).toHaveBeenCalledWith('C:\\node_modules\\foo\\node_modules\\link', 'utf8');
      expect(mockReadlinkSync).toHaveBeenCalledTimes(1);
    });

    it('Should handle relative link targets', () => {
      mockReadlinkSync.mockReturnValueOnce('..\\..\\link\\target');
      expect(realNodeModulePath('C:\\foo\\node_modules\\link')).toBe('C:\\link\\target');
      expect(mockReadlinkSync).toHaveBeenCalledWith('C:\\foo\\node_modules\\link', 'utf8');
      expect(mockReadlinkSync).toHaveBeenCalledTimes(1);
    });

    it('Should recursively handle relative link targets', () => {
      mockReadlinkSync.mockReturnValueOnce('..\\..\\link');
      mockReadlinkSync.mockReturnValueOnce('D:\\other\\root\\bar');
      expect(realNodeModulePath('C:\\foo\\1\\2\\3\\node_modules\\bar\\node_modules\\link\\4\\5\\6')).toBe(
        'D:\\other\\root\\link\\4\\5\\6'
      );
      expect(mockReadlinkSync).toHaveBeenCalledWith(
        'C:\\foo\\1\\2\\3\\node_modules\\bar\\node_modules\\link',
        'utf8'
      );
      expect(mockReadlinkSync).toHaveBeenCalledWith('C:\\foo\\1\\2\\3\\node_modules\\bar', 'utf8');
      expect(mockReadlinkSync).toHaveBeenCalledTimes(2);
    });

    it('Caches multi-layer resolution', () => {
      mockReadlinkSync.mockReturnValueOnce('..\\..\\link');
      mockReadlinkSync.mockReturnValueOnce('D:\\other\\root\\bar');
      expect(realNodeModulePath('C:\\foo\\1\\2\\3\\node_modules\\bar\\node_modules\\link\\4\\5\\6')).toBe(
        'D:\\other\\root\\link\\4\\5\\6'
      );
      expect(realNodeModulePath('C:\\foo\\1\\2\\3\\node_modules\\bar\\node_modules\\link\\a\\b')).toBe(
        'D:\\other\\root\\link\\a\\b'
      );
      expect(realNodeModulePath('C:\\foo\\1\\2\\3\\node_modules\\bar\\a\\b')).toBe(
        'D:\\other\\root\\bar\\a\\b'
      );
      expect(mockReadlinkSync).toHaveBeenCalledWith(
        'C:\\foo\\1\\2\\3\\node_modules\\bar\\node_modules\\link',
        'utf8'
      );
      expect(mockReadlinkSync).toHaveBeenCalledWith('C:\\foo\\1\\2\\3\\node_modules\\bar', 'utf8');
      expect(mockReadlinkSync).toHaveBeenCalledTimes(2);
    });
  });
});
