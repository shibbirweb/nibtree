// Pure helpers behind scripts/deb-package.ts: the control file of the Linux .deb, kept separate so they can be tested.

/** Replaces the `Version:` field; returns null when the control file has none. */
export function setControlVersion(control: string, version: string): string | null {
  const field = /^Version: .*$/m;
  return field.test(control) ? control.replace(field, `Version: ${version}`) : null;
}

/** What is wrong with a control file for `version`: the fields apt shows, checked before a .deb ships. */
export function controlProblems(control: string, version: string): string[] {
  const value = (name: string) => new RegExp(`^${name}: (.*)$`, "m").exec(control)?.[1]?.trim() ?? null;
  const problems: string[] = [];
  if (value("Version") !== version) {
    problems.push(`Version is ${value("Version") ?? "missing"}, expected ${version}`);
  }
  if (!/<[^<>@\s]+@[^<>@\s]+>$/.test(value("Maintainer") ?? "")) {
    problems.push("Maintainer needs a name and an email, like Name <name@example.com> (Cargo.toml authors)");
  }
  const description = /^Description: .*\n((?: .*\n?)*)/m.exec(control)?.[1]?.trim() ?? "";
  if (!description || description === "(none)") {
    problems.push("Description has no long text (bundle.longDescription in tauri.conf.json)");
  }
  if (!value("Homepage")) {
    problems.push("Homepage is missing (Cargo.toml homepage)");
  }
  return problems;
}
