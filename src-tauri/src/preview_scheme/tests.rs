use crate::test_support::UiText;
use std::path::PathBuf;

use super::*;
use crate::test_support::{git_in, image_bytes, TestDir};

/// Like JavaScript's `encodeURIComponent`, which builds the URLs in the frontend.
fn encode(text: &str) -> String {
    let mut encoded = String::new();
    for byte in text.bytes() {
        if byte.is_ascii_alphanumeric() || b"-_.!~*'()".contains(&byte) {
            encoded.push(byte as char);
        } else {
            encoded.push_str(&format!("%{byte:02X}"));
        }
    }
    encoded
}

fn worktree_path(file_path: &str) -> String {
    format!("/worktree/{}", encode(file_path))
}

fn revision_path(repo_root: &str, revision: &str, file_path: &str) -> String {
    format!("/revision/{}/{}/{}", encode(repo_root), encode(revision), encode(file_path))
}

fn get(folders: &[PathBuf], path: &str, range: Option<&str>) -> PreviewResponse {
    respond(folders, &PreviewRequest { method: "GET", path, range })
}

fn folders_of(workspace: &TestDir) -> Vec<PathBuf> {
    paths::canonical_folders(&[workspace.path_string()])
}

const OID: &str = "0123456789abcdef0123456789abcdef01234567";

#[test]
fn decodes_percent_escapes() {
    assert_eq!(percent_decode("%2FUsers%2Fme%2Fa%20b.png").as_deref(), Some("/Users/me/a b.png"));
    assert_eq!(percent_decode("caf%C3%A9.png").as_deref(), Some("caf\u{e9}.png"));
    assert_eq!(percent_decode("plain").as_deref(), Some("plain"));
    assert_eq!(percent_decode("%2"), None);
    assert_eq!(percent_decode("%zz"), None);
    assert_eq!(percent_decode("%+f"), None);
    assert_eq!(percent_decode("%FF"), None, "not UTF-8");
    assert_eq!(percent_decode("a%00b"), None, "no NUL");
    assert_eq!(percent_decode(""), None);
}

#[test]
fn parses_worktree_and_revision_targets() {
    let path = "/Users/me/my shop/#1 100%?.png";
    assert_eq!(
        parse_target(&worktree_path(path)),
        Some(Target::WorkTree {
            file_path: path.to_string()
        })
    );
    let oid = Oid::from_str(OID).unwrap();
    for (spec, revision) in [
        ("HEAD", Revision::Head),
        ("index", Revision::Index),
        (OID, Revision::Commit(oid)),
        (&format!("{OID}^"), Revision::FirstParent(oid)),
    ] {
        assert_eq!(
            parse_target(&revision_path("/repo", spec, "assets/logo.png")),
            Some(Target::Revision {
                repo_root: "/repo".to_string(),
                revision,
                file_path: "assets/logo.png".to_string(),
            }),
            "{spec}"
        );
    }
    // Short or symbolic revisions, extra or missing parts and other kinds are refused.
    assert_eq!(parse_target(&revision_path("/repo", "abc123", "a.png")), None);
    assert_eq!(parse_target(&revision_path("/repo", "abc123^", "a.png")), None);
    assert_eq!(parse_target(&revision_path("/repo", "main", "a.png")), None);
    assert_eq!(parse_target(&revision_path("/repo", "HEAD~1", "a.png")), None);
    assert_eq!(parse_target("/revision/%2Frepo/HEAD"), None);
    assert_eq!(parse_target(&format!("{}/more", worktree_path("/a.png"))), None);
    assert_eq!(parse_target("/worktree/"), None);
    assert_eq!(parse_target("/other/%2Fa.png"), None);
    assert_eq!(parse_target("worktree/%2Fa.png"), None);
}

#[test]
fn parses_single_byte_ranges() {
    let partial = |start, end| ByteRange::Partial { start, end };
    assert_eq!(parse_range(None, 100), ByteRange::Full);
    assert_eq!(parse_range(Some("bytes=0-9"), 100), partial(0, 9));
    assert_eq!(parse_range(Some("BYTES = 5 - 5"), 100), partial(5, 5));
    assert_eq!(parse_range(Some("bytes=90-"), 100), partial(90, 99));
    assert_eq!(parse_range(Some("bytes=50-1000"), 100), partial(50, 99));
    assert_eq!(parse_range(Some("bytes=-10"), 100), partial(90, 99));
    assert_eq!(parse_range(Some("bytes=-200"), 100), partial(0, 99));
    // Other units and several ranges are ignored: the whole content.
    assert_eq!(parse_range(Some("items=0-1"), 100), ByteRange::Full);
    assert_eq!(parse_range(Some("bytes=0-1,5-6"), 100), ByteRange::Full);
    for bad in ["bytes=100-", "bytes=9-3", "bytes=abc", "bytes=-0", "bytes=-", "bytes=1-x", "bytes", "bytes=+1-2"] {
        assert_eq!(parse_range(Some(bad), 100), ByteRange::Unsatisfiable, "{bad}");
    }
    assert_eq!(parse_range(Some("bytes=0-"), 0), ByteRange::Unsatisfiable);
}

#[test]
fn serves_a_work_tree_file_whole_or_by_range() {
    let workspace = TestDir::new();
    workspace.write("docs/manual.pdf", b"%PDF-1.7 hello");
    workspace.write("logo.png", image_bytes(b"pixels"));
    let folders = folders_of(&workspace);

    let full = get(&folders, &worktree_path(&workspace.file_string("logo.png")), None);
    assert_eq!(full.status, 200);
    assert_eq!(full.body, image_bytes(b"pixels"));
    assert_eq!(full.header("Content-Type"), Some("image/png"));
    assert_eq!(full.header("Content-Length"), Some(full.body.len().to_string().as_str()));
    assert_eq!(full.header("Accept-Ranges"), Some("bytes"));
    assert_eq!(full.header("Cache-Control"), Some("no-store"));
    assert_eq!(full.header("Content-Range"), None);

    let pdf = worktree_path(&workspace.file_string("docs/manual.pdf"));
    let ranged = get(&folders, &pdf, Some("bytes=2-5"));
    assert_eq!(ranged.status, 206);
    assert_eq!(ranged.body, b"DF-1");
    assert_eq!(ranged.header("Content-Range"), Some("bytes 2-5/14"));
    assert_eq!(ranged.header("Content-Length"), Some("4"));
    assert_eq!(ranged.header("Content-Type"), Some("application/pdf"));

    let tail = get(&folders, &pdf, Some("bytes=-5"));
    assert_eq!(tail.body, b"hello");

    let beyond = get(&folders, &pdf, Some("bytes=14-"));
    assert_eq!(beyond.status, 416);
    assert_eq!(beyond.header("Content-Range"), Some("bytes */14"));
    assert!(beyond.body.is_empty());

    let head = respond(
        &folders,
        &PreviewRequest {
            method: "HEAD",
            path: &pdf,
            range: None,
        },
    );
    assert_eq!(head.status, 200);
    assert_eq!(head.header("Content-Length"), Some("14"));
    assert!(head.body.is_empty());

    let post = respond(
        &folders,
        &PreviewRequest {
            method: "POST",
            path: &pdf,
            range: None,
        },
    );
    assert_eq!(post.status, 405);
}

#[test]
fn a_range_answer_holds_at_most_the_chunk_and_big_pdfs_stream() {
    let workspace = TestDir::new();
    let folders = folders_of(&workspace);
    let book = std::fs::File::create(workspace.file("book.pdf")).unwrap();
    book.set_len(media::MAX_PDF_PREVIEW_BYTES + 1).unwrap();
    let path = worktree_path(&workspace.file_string("book.pdf"));

    // Too big to send whole, but every range can be read.
    assert_eq!(get(&folders, &path, None).status, 413);
    let open = get(&folders, &path, Some("bytes=0-"));
    assert_eq!(open.status, 206);
    assert_eq!(open.body.len() as u64, MAX_RANGE_BYTES);
    assert_eq!(
        open.header("Content-Range").unwrap(),
        format!("bytes 0-{}/{}", MAX_RANGE_BYTES - 1, media::MAX_PDF_PREVIEW_BYTES + 1)
    );
    let last = get(&folders, &path, Some("bytes=-3"));
    assert_eq!(last.status, 206);
    assert_eq!(last.body.len(), 3);

    // Images are decoded whole, so their limit holds for ranges too.
    let photo = std::fs::File::create(workspace.file("photo.png")).unwrap();
    photo.set_len(media::MAX_IMAGE_PREVIEW_BYTES + 1).unwrap();
    let photo_path = worktree_path(&workspace.file_string("photo.png"));
    assert_eq!(get(&folders, &photo_path, Some("bytes=0-9")).status, 413);
}

#[test]
fn refuses_work_tree_files_outside_the_folders_and_other_types() {
    let workspace = TestDir::new();
    let outside = TestDir::new();
    outside.write("secret.png", b"x");
    workspace.write("notes.txt", b"hello");
    workspace.mkdir("folder.png");
    let folders = folders_of(&workspace);

    let refused = |path: &str| get(&folders, &worktree_path(path), None);
    let forbidden = refused(&outside.file_string("secret.png"));
    assert_eq!(forbidden.status, 403);
    assert!(forbidden.body.is_empty(), "no detail in the body");
    let sneaky = format!("{}/../../{}", workspace.path_string(), outside.file_string("secret.png"));
    assert_eq!(refused(&sneaky).status, 403);
    assert_eq!(refused("relative/logo.png").status, 403);
    assert_eq!(refused(&workspace.file_string("notes.txt")).status, 403);
    assert_eq!(refused(&workspace.file_string("missing.png")).status, 404);
    assert_eq!(refused(&workspace.file_string("folder.png")).status, 404);
    assert_eq!(get(&folders, "/worktree/%zz", None).status, 404);

    // Nothing is served before the frontend names the folders.
    workspace.write("logo.png", b"x");
    assert_eq!(get(&[], &worktree_path(&workspace.file_string("logo.png")), None).status, 403);
}

#[cfg(unix)]
#[test]
fn refuses_symlinks_that_leave_the_folders() {
    let workspace = TestDir::new();
    let outside = TestDir::new();
    outside.write("secret.png", b"x");
    workspace.write("logo.png", b"inside");
    std::os::unix::fs::symlink(outside.file("secret.png"), workspace.file("link.png")).unwrap();
    std::os::unix::fs::symlink(workspace.file("logo.png"), workspace.file("alias.png")).unwrap();
    let folders = folders_of(&workspace);

    assert_eq!(get(&folders, &worktree_path(&workspace.file_string("link.png")), None).status, 403);
    let alias = get(&folders, &worktree_path(&workspace.file_string("alias.png")), None);
    assert_eq!(alias.status, 200, "a link that stays inside is fine");
    assert_eq!(alias.body, b"inside");
}

/// A repository in a workspace: logo.png v1 in the first commit, v2 in the second,
/// v3 staged and v4 in the work tree.
struct Shop {
    workspace: TestDir,
    root: String,
    first: String,
    second: String,
}

fn shop() -> Shop {
    let workspace = TestDir::new();
    let root = workspace.init_repo("shop");
    let commit = |message: &str| {
        git_in(&root, &["add", "-A"]);
        git_in(&root, &["-c", "user.name=T", "-c", "user.email=t@example.com", "commit", "-q", "-m", message]);
        git_in(&root, &["rev-parse", "HEAD"]).trim().to_string()
    };
    workspace.write("shop/assets/logo.png", image_bytes(b"v1"));
    workspace.write("shop/manual.pdf", b"%PDF-1.7 first");
    let first = commit("first");
    workspace.write("shop/assets/logo.png", image_bytes(b"v2"));
    let second = commit("second");
    workspace.write("shop/assets/logo.png", image_bytes(b"v3"));
    workspace.write("shop/assets/new.png", image_bytes(b"new"));
    git_in(&root, &["add", "assets/logo.png", "assets/new.png"]);
    workspace.write("shop/assets/logo.png", image_bytes(b"v4"));
    Shop {
        root: root.ui(),
        workspace,
        first,
        second,
    }
}

#[test]
fn serves_head_index_commits_and_parents() {
    let shop = shop();
    let folders = folders_of(&shop.workspace);
    let body = |revision: &str, file_path: &str| {
        let response = get(&folders, &revision_path(&shop.root, revision, file_path), None);
        (response.status, response.body)
    };
    assert_eq!(body("HEAD", "assets/logo.png"), (200, image_bytes(b"v2")));
    assert_eq!(body("index", "assets/logo.png"), (200, image_bytes(b"v3")));
    assert_eq!(body(&shop.second, "assets/logo.png"), (200, image_bytes(b"v2")));
    assert_eq!(body(&format!("{}^", shop.second), "assets/logo.png"), (200, image_bytes(b"v1")));
    assert_eq!(body(&shop.first, "assets/logo.png"), (200, image_bytes(b"v1")));
    let worktree = get(&folders, &worktree_path(&format!("{}/assets/logo.png", shop.root)), None);
    assert_eq!(worktree.body, image_bytes(b"v4"));

    // Missing sides: a root commit has no parent, a new file is not in HEAD yet.
    assert_eq!(body(&format!("{}^", shop.first), "assets/logo.png").0, 404);
    assert_eq!(body("HEAD", "assets/new.png").0, 404);
    assert_eq!(body("index", "assets/new.png"), (200, image_bytes(b"new")));
    assert_eq!(body("HEAD", "assets/none.png").0, 404);
    assert_eq!(body(OID, "assets/logo.png").0, 404);

    let response = get(&folders, &revision_path(&shop.root, "HEAD", "assets/logo.png"), None);
    assert_eq!(response.header("Content-Type"), Some("image/png"));
    assert_eq!(response.header("Cache-Control"), Some("no-store"));
}

#[test]
fn a_blob_is_always_sent_whole() {
    let shop = shop();
    let folders = folders_of(&shop.workspace);
    let path = revision_path(&shop.root, &shop.first, "manual.pdf");
    // Each range would inflate the whole blob again, so the range is ignored and none offered.
    for range in [None, Some("bytes=9-"), Some("bytes=0-3"), Some("bytes=20-")] {
        let response = get(&folders, &path, range);
        assert_eq!(response.status, 200, "{range:?}");
        assert_eq!(response.body, b"%PDF-1.7 first");
        assert_eq!(response.header("Content-Length"), Some("14"));
        assert_eq!(response.header("Accept-Ranges"), None);
        assert_eq!(response.header("Content-Range"), None);
    }
    let head = respond(
        &folders,
        &PreviewRequest {
            method: "HEAD",
            path: &path,
            range: None,
        },
    );
    assert_eq!(head.status, 200);
    assert_eq!(head.header("Accept-Ranges"), None);

    // A work tree file of the same repository still answers ranges.
    let worktree = worktree_path(&format!("{}/manual.pdf", shop.root));
    let ranged = get(&folders, &worktree, Some("bytes=9-"));
    assert_eq!(ranged.status, 206);
    assert_eq!(ranged.body, b"first");
    assert_eq!(ranged.header("Accept-Ranges"), Some("bytes"));
}

#[test]
fn serves_work_tree_svg_with_a_csp_that_runs_nothing() {
    let workspace = TestDir::new();
    let svg = b"<svg xmlns=\"http://www.w3.org/2000/svg\"><script>alert(1)</script></svg>";
    workspace.write("docs/icon.SVG", svg);
    workspace.write("logo.png", image_bytes(b"pixels"));
    let folders = folders_of(&workspace);

    let response = get(&folders, &worktree_path(&workspace.file_string("docs/icon.SVG")), None);
    assert_eq!(response.status, 200);
    assert_eq!(response.body, svg);
    assert_eq!(response.header("Content-Type"), Some(SVG_MIME));
    assert_eq!(
        response.header("Content-Security-Policy"),
        Some("default-src 'none'; style-src 'unsafe-inline'; sandbox")
    );
    assert_eq!(response.header("X-Content-Type-Options"), Some("nosniff"));
    // Other types get no CSP of their own.
    let png = get(&folders, &worktree_path(&workspace.file_string("logo.png")), None);
    assert_eq!(png.header("Content-Security-Policy"), None);

    let stat = stat(
        &folders,
        &Target::WorkTree {
            file_path: workspace.file_string("docs/icon.SVG"),
        },
    )
    .unwrap();
    assert!(stat.exists);
}

#[test]
fn svg_is_served_from_the_work_tree_only() {
    let shop = shop();
    shop.workspace.write("shop/icon.svg", b"<svg/>");
    git_in(Path::new(&shop.root), &["add", "icon.svg"]);
    let folders = folders_of(&shop.workspace);
    assert_eq!(get(&folders, &revision_path(&shop.root, "index", "icon.svg"), None).status, 403);
    assert_eq!(get(&folders, &worktree_path(&format!("{}/icon.svg", shop.root)), None).status, 200);
    let outside = TestDir::new();
    outside.write("icon.svg", b"<svg/>");
    assert_eq!(get(&folders, &worktree_path(&outside.file_string("icon.svg")), None).status, 403);
}

#[test]
fn refuses_revisions_outside_the_folders_and_bad_paths() {
    let shop = shop();
    let other = TestDir::new();
    let folders = paths::canonical_folders(&[other.path_string()]);
    assert_eq!(get(&folders, &revision_path(&shop.root, "HEAD", "assets/logo.png"), None).status, 403);

    let folders = folders_of(&shop.workspace);
    let status = |repo_root: &str, file_path: &str| get(&folders, &revision_path(repo_root, "HEAD", file_path), None).status;
    assert_eq!(status(&shop.root, "../shop/assets/logo.png"), 403);
    assert_eq!(status(&shop.root, &format!("{}/assets/logo.png", shop.root)), 403);
    assert_eq!(status(&shop.root, "README.md"), 403);
    assert_eq!(status(&shop.workspace.path_string(), "logo.png"), 403, "not a repository");
}

#[cfg(unix)]
#[test]
fn a_committed_symlink_is_not_served() {
    let shop = shop();
    std::os::unix::fs::symlink("assets/logo.png", PathBuf::from(&shop.root).join("link.png")).unwrap();
    git_in(PathBuf::from(&shop.root).as_path(), &["add", "link.png"]);
    let folders = folders_of(&shop.workspace);
    assert_eq!(get(&folders, &revision_path(&shop.root, "index", "link.png"), None).status, 404);
}

#[test]
fn stat_tells_size_missing_and_too_big() {
    let shop = shop();
    let folders = folders_of(&shop.workspace);
    let target = |revision: &str, file_path: &str| Target::Revision {
        repo_root: shop.root.clone(),
        revision: Revision::parse(revision).unwrap(),
        file_path: file_path.to_string(),
    };
    assert_eq!(
        stat(&folders, &target("HEAD", "assets/logo.png")).unwrap(),
        PreviewStat {
            exists: true,
            size: image_bytes(b"v2").len() as u64,
            limit: None,
        }
    );
    assert!(!stat(&folders, &target("HEAD", "assets/new.png")).unwrap().exists);
    let big = std::fs::File::create(PathBuf::from(&shop.root).join("big.png")).unwrap();
    big.set_len(media::MAX_IMAGE_PREVIEW_BYTES + 1).unwrap();
    let too_big = stat(
        &folders,
        &Target::WorkTree {
            file_path: format!("{}/big.png", shop.root),
        },
    )
    .unwrap();
    assert_eq!(too_big.limit, Some(media::MAX_IMAGE_PREVIEW_BYTES));
    assert!(stat(&[], &target("HEAD", "assets/logo.png")).is_err());
}

#[test]
fn builds_targets_from_command_arguments() {
    assert_eq!(
        Target::from_parts("/a.png".to_string(), None, None).unwrap(),
        Target::WorkTree {
            file_path: "/a.png".to_string()
        }
    );
    assert_eq!(
        Target::from_parts("a.png".to_string(), Some("/repo".to_string()), Some("index".to_string())).unwrap(),
        Target::Revision {
            repo_root: "/repo".to_string(),
            revision: Revision::Index,
            file_path: "a.png".to_string(),
        }
    );
    assert!(Target::from_parts("a.png".to_string(), Some("/repo".to_string()), Some("main".to_string())).is_err());
    assert!(Target::from_parts("a.png".to_string(), None, Some("HEAD".to_string())).is_err());
}

#[test]
fn the_folder_registry_keeps_existing_folders_only() {
    let workspace = TestDir::new();
    let registry = PreviewFolders::default();
    assert!(registry.get("main").is_empty());
    registry.set("main", &[workspace.path_string(), "/definitely/missing".to_string()]);
    assert_eq!(registry.get("main"), vec![workspace.path.clone()]);
    // Each window reaches only its own folders, and a closed window none.
    assert!(registry.get("window-2").is_empty());
    registry.set("window-2", &[workspace.path_string()]);
    registry.remove("main");
    assert!(registry.get("main").is_empty());
    assert_eq!(registry.get("window-2"), vec![workspace.path.clone()]);
    registry.set("window-2", &[]);
    assert!(registry.get("window-2").is_empty());
}

#[test]
#[cfg(feature = "desktop")]
fn the_tauri_wrapper_passes_method_path_and_range() {
    let workspace = TestDir::new();
    workspace.write("manual.pdf", b"%PDF-1.7");
    let folders = folders_of(&workspace);
    let uri = format!("gmpreview://localhost{}?v=3", worktree_path(&workspace.file_string("manual.pdf")));
    let request = tauri::http::Request::builder()
        .method("GET")
        .uri(uri)
        .header("Range", "bytes=0-3")
        .body(Vec::new())
        .unwrap();
    let response = http_response(&folders, &request);
    assert_eq!(response.status(), 206);
    assert_eq!(response.body(), b"%PDF");
    assert_eq!(response.headers()["content-range"], "bytes 0-3/8");
    assert_eq!(response.headers()["content-type"], "application/pdf");

    // The Windows form of the same URL.
    let windows = format!("http://gmpreview.localhost{}", worktree_path(&workspace.file_string("manual.pdf")));
    let request = tauri::http::Request::builder().uri(windows).body(Vec::new()).unwrap();
    assert_eq!(http_response(&folders, &request).body(), b"%PDF-1.7");
}
