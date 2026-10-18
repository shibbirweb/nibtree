use std::path::Path;

use super::blocking;
use crate::error::{AppError, AppResult};
use crate::git::cli;

/// Creates a tag at `commit_id` (HEAD when None): annotated when a message is
/// given, lightweight otherwise. The tag list comes with the refs (`get_refs`).
#[crate::command]
pub async fn create_tag(
    repo_path: String,
    tag_name: String,
    message: Option<String>,
    commit_id: Option<String>,
) -> AppResult<()> {
    blocking(move || {
        let tag_name = tag_name.trim();
        if tag_name.is_empty() || tag_name.starts_with('-') {
            return Err(AppError::invalid(format!("Not a valid tag name: {tag_name}")));
        }
        let root = Path::new(&repo_path);
        let message = message.unwrap_or_default();
        let annotated = !message.trim().is_empty();
        let mut args = vec!["tag"];
        if annotated {
            args.extend(["-a", "-F", "-"]);
        }
        args.push(tag_name);
        if let Some(commit_id) = commit_id.as_deref() {
            args.push(commit_id);
        }
        if annotated {
            cli::run_with_stdin(root, &args, message.as_bytes())?;
        } else {
            cli::run(root, &args)?;
        }
        Ok(())
    })
    .await
}

/// Deletes a local tag (the remote keeps it until pushed with --delete).
#[crate::command]
pub async fn delete_tag(repo_path: String, tag_name: String) -> AppResult<()> {
    blocking(move || {
        cli::run(Path::new(&repo_path), &["tag", "-d", "--", &tag_name])?;
        Ok(())
    })
    .await
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::test_support::{block_on, TestRepo};

    fn repo_with_commit() -> TestRepo {
        let repo = TestRepo::new();
        repo.write("f.txt", "base\n");
        repo.commit_all("base");
        repo
    }

    #[test]
    fn creates_lightweight_and_annotated_tags() {
        let repo = repo_with_commit();
        block_on(create_tag(repo.path_string(), "light".into(), None, None)).unwrap();
        block_on(create_tag(repo.path_string(), "  ".into(), None, None)).unwrap_err();
        block_on(create_tag(
            repo.path_string(),
            "v1.0".into(),
            Some("Release 1.0\n\nNotes".into()),
            None,
        ))
        .unwrap();

        assert_eq!(repo.git(&["cat-file", "-t", "light"]).trim(), "commit");
        assert_eq!(repo.git(&["cat-file", "-t", "v1.0"]).trim(), "tag");
        assert_eq!(repo.git(&["tag", "-l", "--format=%(contents)", "v1.0"]).trim(), "Release 1.0\n\nNotes");
        // An empty message means a lightweight tag, not an annotated one without text.
        block_on(create_tag(repo.path_string(), "blank".into(), Some(" ".into()), None)).unwrap();
        assert_eq!(repo.git(&["cat-file", "-t", "blank"]).trim(), "commit");
    }

    #[test]
    fn tags_a_given_commit_and_refuses_duplicates() {
        let repo = repo_with_commit();
        let first = repo.head();
        repo.write("f.txt", "second\n");
        repo.commit_all("second");
        block_on(create_tag(repo.path_string(), "old".into(), None, Some(first.clone()))).unwrap();
        assert_eq!(repo.rev_parse("old"), first);

        let duplicate = block_on(create_tag(repo.path_string(), "old".into(), None, None));
        assert!(matches!(duplicate, Err(AppError::Command { .. })), "{duplicate:?}");
    }

    #[test]
    fn deletes_a_tag() {
        let repo = repo_with_commit();
        repo.git(&["tag", "gone"]);
        block_on(delete_tag(repo.path_string(), "gone".into())).unwrap();
        assert!(repo.git(&["tag"]).trim().is_empty());
        assert!(block_on(delete_tag(repo.path_string(), "gone".into())).is_err());
    }
}
