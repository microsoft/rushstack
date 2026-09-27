use std::ffi::{c_int, c_ulong};
use std::io;

const SET_PARENT_DEATH_SIGNAL: c_int = 1;
const SIGNAL_KILL: c_ulong = 9;
const EXIT_STATUS_AFTER_ORPHANING: c_int = 1;

extern "C" {
    fn fork() -> c_int;
    fn _exit(status: c_int) -> !;
    fn waitpid(process_id: c_int, status: *mut c_int, options: c_int) -> c_int;
    fn prctl(option: c_int, ...) -> c_int;
    fn getppid() -> c_int;
}

pub enum ForkedWorker {
    InParent { worker_process_id: i32 },
    InWorker,
}

pub fn fork_worker_process_of_this_single_threaded_process() -> io::Result<ForkedWorker> {
    let parent_process_id = std::process::id() as c_int;
    match unsafe { fork() } {
        -1 => Err(io::Error::last_os_error()),
        0 => {
            unsafe { prctl(SET_PARENT_DEATH_SIGNAL, SIGNAL_KILL) };
            if unsafe { getppid() } != parent_process_id {
                exit_worker_process_immediately(EXIT_STATUS_AFTER_ORPHANING);
            }
            Ok(ForkedWorker::InWorker)
        }
        worker_process_id => Ok(ForkedWorker::InParent { worker_process_id }),
    }
}

pub fn exit_worker_process_immediately(status: i32) -> ! {
    unsafe { _exit(status) }
}

pub fn wait_for_worker_process(worker_process_id: i32) {
    let mut status: c_int = 0;
    while unsafe { waitpid(worker_process_id, &mut status, 0) } == -1
        && io::Error::last_os_error().kind() == io::ErrorKind::Interrupted
    {}
}
