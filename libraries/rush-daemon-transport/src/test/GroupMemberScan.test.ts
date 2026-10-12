// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import fs from 'node:fs';

import { hasLiveGroupMember } from '../DaemonGroupMemberScan';
import { POSIX_PROCESS_GROUP_OPS } from '../DaemonProcessGroup';

const GROUP_ID: number = 4242;
const OTHER_GROUP_ID: number = 4243;
const MEMBER_PID: number = 101;
const LEADER_STAT_PATH: string = `/proc/${GROUP_ID}/stat`;
// A `/proc` listing of the group's leader and one other member; `self` is no pid.
const PROC_LISTING: string[] = [String(GROUP_ID), String(MEMBER_PID), 'self'];
// proc_pid_stat(5): "pid (comm) state ppid pgrp session", then 15 fields up to starttime.
const FIELDS_BEFORE_START_TIME: number = 15;
const LIVE: string = 'S';
const ZOMBIE: string = 'Z';

type ReadRecord = () => string;

function inGroup(state: string): ReadRecord {
  return () => `0 (sleep) ${state} 1 ${GROUP_ID} ${GROUP_ID}${' 0'.repeat(FIELDS_BEFORE_START_TIME)} 777`;
}

function failing(code: string): ReadRecord {
  return () => {
    throw Object.assign(new Error(code), { code });
  };
}

const GONE: ReadRecord = failing('ENOENT');

// `readLeader` and `readMember` give the stat records of the group's leader and of its other member.
function mockProc(readLeader: ReadRecord, readMember: ReadRecord): jest.SpyInstance {
  jest
    .spyOn(fs, 'readFileSync')
    .mockImplementation((path: fs.PathOrFileDescriptor) =>
      path === LEADER_STAT_PATH ? readLeader() : readMember()
    );
  return (jest.spyOn(fs, 'readdirSync') as jest.SpyInstance).mockReturnValue(PROC_LISTING);
}

afterEach(() => {
  jest.restoreAllMocks();
});

it('answers from a live leader without listing /proc', () => {
  const listing: jest.SpyInstance = mockProc(inGroup(LIVE), inGroup(ZOMBIE));
  expect(hasLiveGroupMember(GROUP_ID)).toBe(true);
  expect(listing).not.toHaveBeenCalled();
});

it('counts a live member when the leader is gone or a zombie, and no zombie or other group', () => {
  mockProc(GONE, inGroup(LIVE));
  expect(hasLiveGroupMember(GROUP_ID)).toBe(true);
  expect(hasLiveGroupMember(OTHER_GROUP_ID)).toBe(false);
  mockProc(inGroup(ZOMBIE), inGroup(LIVE));
  expect(hasLiveGroupMember(GROUP_ID)).toBe(true);
  mockProc(inGroup(ZOMBIE), inGroup(ZOMBIE));
  expect(hasLiveGroupMember(GROUP_ID)).toBe(false);
});

it.each(['ENOENT', 'ESRCH'])('does not count a listed process that is gone (%s)', (code: string) => {
  mockProc(failing(code), failing(code));
  expect(hasLiveGroupMember(GROUP_ID)).toBe(false);
});

it('counts a listed process whose record it cannot read, as under hidepid, as a live member', () => {
  mockProc(GONE, failing('EACCES'));
  expect(hasLiveGroupMember(GROUP_ID)).toBe(true);
});

it('throws when it cannot list /proc', () => {
  mockProc(GONE, GONE).mockImplementation(failing('EMFILE'));
  expect(() => hasLiveGroupMember(GROUP_ID)).toThrow('EMFILE');
});

describe('a group that kill() still finds', () => {
  beforeEach(() => {
    jest.spyOn(process, 'kill').mockImplementation(() => true);
  });

  it('is gone once every member that /proc lists has exited', () => {
    jest.spyOn(fs, 'existsSync').mockReturnValue(true);
    mockProc(inGroup(ZOMBIE), inGroup(ZOMBIE));
    expect(POSIX_PROCESS_GROUP_OPS.groupExists(GROUP_ID)).toBe(false);
    mockProc(GONE, inGroup(LIVE));
    expect(POSIX_PROCESS_GROUP_OPS.groupExists(GROUP_ID)).toBe(true);
  });

  it('exists where there is no /proc to tell', () => {
    jest.spyOn(fs, 'existsSync').mockReturnValue(false);
    mockProc(GONE, GONE).mockImplementation(failing('ENOENT'));
    expect(POSIX_PROCESS_GROUP_OPS.groupExists(GROUP_ID)).toBe(true);
  });
});
