use std::io;

#[allow(dead_code)]
pub enum ForkedWorker {
    InParent { worker_process_id: i32 },
    InWorker,
}

pub fn fork_worker_process_of_this_single_threaded_process() -> io::Result<ForkedWorker> {
    Err(io::Error::from(io::ErrorKind::Unsupported))
}

pub fn exit_worker_process_immediately(status: i32) -> ! {
    std::process::exit(status)
}

pub fn wait_for_worker_process(_worker_process_id: i32) {}
