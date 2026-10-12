// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';

export const canRunPtyTests: boolean =
  process.platform === 'linux' &&
  spawnSync('python3', ['-c', 'import pty'], { stdio: 'ignore' }).status === 0;

interface IPtyResult {
  readonly exitCode: number;
  readonly output: string;
  readonly restored: boolean;
}

const PYTHON_DRIVER: string = `
import errno,fcntl,json,os,pty,select,signal,struct,subprocess,sys,termios,time
master,slave=pty.openpty()
fcntl.ioctl(slave,termios.TIOCSWINSZ,struct.pack('HHHH',24,123,0,0))
def attach_terminal():
    os.setsid()
    fcntl.ioctl(1,termios.TIOCSCTTY,0)
child=subprocess.Popen(sys.argv[2:]+['-q','tty'],
                       stdin=slave if sys.argv[1]=='tty' else subprocess.DEVNULL,stdout=slave,stderr=slave,
                       close_fds=True,preexec_fn=attach_terminal)
output=b''
signaled=False
try:
    deadline=time.monotonic()+15
    while time.monotonic()<deadline:
        if select.select([master],[],[],0.1)[0]:
            try:
                chunk=os.read(master,65536)
            except OSError as error:
                if error.errno!=errno.EIO: raise
                break
            if not chunk: break
            output+=chunk
            if not signaled and b'raw-ready' in output:
                with open('tty.pid') as pid_file:
                    os.kill(int(pid_file.read()),signal.SIGINT)
                signaled=True
        elif child.poll() is not None:
            break
    if child.poll() is None:
        raise RuntimeError('PTY child did not finish within its deadline')
    state=termios.tcgetattr(slave)[3]
    print(json.dumps({'exitCode':child.wait(),'output':output.decode('utf8'),
                      'restored':bool(state & termios.ICANON and state & termios.ECHO)}))
finally:
    if child.poll() is None:
        os.killpg(child.pid,signal.SIGKILL)
        child.wait()
    os.close(master)
    os.close(slave)
`;

export async function invokeRushxPtyAsync(
  entry: string,
  cwd: string,
  environment: NodeJS.ProcessEnv,
  stdinIsTTY: boolean
): Promise<IPtyResult> {
  const child = spawn(
    'python3',
    ['-c', PYTHON_DRIVER, stdinIsTTY ? 'tty' : 'pipe', process.execPath, entry],
    {
      cwd,
      env: environment,
      stdio: ['ignore', 'pipe', 'pipe']
    }
  );
  let stdout: string = '';
  let stderr: string = '';
  child.stdout.on('data', (bytes: Buffer) => {
    stdout += bytes.toString();
  });
  child.stderr.on('data', (bytes: Buffer) => {
    stderr += bytes.toString();
  });
  const [code] = await once(child, 'close');
  if (code !== 0) throw new Error(`PTY driver failed (${code}): ${stderr}`);
  return JSON.parse(stdout);
}
