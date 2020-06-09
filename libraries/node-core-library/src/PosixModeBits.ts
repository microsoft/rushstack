// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

// The PosixModeBits are intended to be used with bitwise operations.
/* eslint-disable no-bitwise */

/**
 * An integer value used to specify file permissions for POSIX-like operating systems.
 *
 * @remarks
 *
 * This bitfield corresponds to the "mode_t" structure described in this document:
 * http://pubs.opengroup.org/onlinepubs/9699919799/basedefs/sys_stat.h.html
 *
 * It is used with NodeJS APIs such as fs.Stat.mode and fs.chmodSync().  These values
 * represent a set of permissions and can be combined using bitwise arithmetic.
 *
 * POSIX is a registered trademark of the Institute of Electrical and Electronic Engineers, Inc.
 *
 * @public
 */
export const enum PosixModeBits {
  // The bits

  /**
   * Indicates that the item's owner can read the item.
   */
  UserRead = 1 << 8,

  /**
   * Indicates that the item's owner can modify the item.
   */
  UserWrite = 1 << 7,

  /**
   * Indicates that the item's owner can execute the item (if it is a file)
   * or search the item (if it is a directory).
   */
  UserExecute = 1 << 6,

  /**
   * Indicates that users belonging to the item's group can read the item.
   */
  GroupRead = 1 << 5,

  /**
   * Indicates that users belonging to the item's group can modify the item.
   */
  GroupWrite = 1 << 4,

  /**
   * Indicates that users belonging to the item's group can execute the item (if it is a file)
   * or search the item (if it is a directory).
   */
  GroupExecute = 1 << 3,

  /**
   * Indicates that other users (besides the item's owner user or group) can read the item.
   */
  OthersRead = 1 << 2,

  /**
   * Indicates that other users (besides the item's owner user or group) can modify the item.
   */
  OthersWrite = 1 << 1,

  /**
   * Indicates that other users (besides the item's owner user or group) can execute the item (if it is a file)
   * or search the item (if it is a directory).
   */
  OthersExecute = 1 << 0,

  // Helpful aliases

  /**
   * A zero value where no permissions bits are set.
   */
  None = 0,

  /**
   * An alias combining OthersRead, GroupRead, and UserRead permission bits.
   */
  AllRead = OthersRead | GroupRead | UserRead,

  /**
   * An alias combining OthersWrite, GroupWrite, and UserWrite permission bits.
   */
  AllWrite = OthersWrite | GroupWrite | UserWrite,

  /**
   * An alias combining OthersExecute, GroupExecute, and UserExecute permission bits.
   */
  AllExecute = OthersExecute | GroupExecute | UserExecute,
}
