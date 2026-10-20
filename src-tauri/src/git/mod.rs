pub mod base_file;
pub mod bisect;
pub mod blame;
pub mod cancel;
pub mod cli;
pub mod commit_files;
pub mod compare;
pub mod conflicts;
pub mod diff;
pub mod files;
pub mod history;
pub mod identity;
pub mod lfs;
pub mod log;
pub mod messages;
pub mod opstate;
pub mod partial;
pub mod reflog;
pub mod refs;
pub mod repo;
pub mod stash;
pub mod status;
pub mod submodule;
pub mod workspace;
pub mod worktree;
pub mod worktree_summary;
pub mod worktree_prepare;

#[cfg(test)]
mod commit_files_tests;
#[cfg(test)]
mod tests;
