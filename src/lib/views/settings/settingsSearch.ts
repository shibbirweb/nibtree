// Search in the Settings dialog: an index of every row and group title with extra words people
// may type for it, and the word matching shared by the section list and the highlights.

import { FILE_TOOLBAR_SWITCHES, type SettingsSection } from "$lib/stores/settingsData";
import { CARET_EXTRA_ROWS, EDITOR_FEATURE_ROWS, SAVE_CLEANUP_ROWS } from "./settingsRows";

export interface SettingsSearchEntry {
  section: SettingsSection;
  /** The row or group title exactly as the dialog shows it. */
  label: string;
  /** More words that find the row, such as synonyms and words from its hint. */
  keywords: string;
  /** The row to point at while this one is hidden (a sub-row of a switch that is off). */
  parent: string | null;
}

type EntrySpec = [label: string, keywords?: string, parent?: string];

const SECTION_ENTRIES: Record<SettingsSection, EntrySpec[]> = {
  appearance: [
    ["Theme", "light dark system mode macos appearance"],
    ["Rounded panels", "corners gap radius layout"],
    ["Project color in the top bar", "header title bar tint gradient glow welcome tile"],
    ["File toolbar", "path bar breadcrumbs navigation top bottom hidden"],
    ...FILE_TOOLBAR_SWITCHES.map((part): EntrySpec => [part.label, `file toolbar ${part.hint}`, "File toolbar"]),
    ["Interface font size", "ui text zoom menus lists buttons"],
    ["File icons", "material minimal icon set type"],
  ],
  editor: [
    ["Color theme", "colour scheme syntax highlighting light dark"],
    ["Editor font family", "typeface monospace"],
    ["Editor font size", "text zoom code"],
    ["Editor font weight", "thin light bold thickness"],
    ["Line spacing", "line height leading"],
    ["Change font size with Ctrl + mouse wheel", "zoom scroll pinch trackpad command"],
    ["Font ligatures", "glyphs fira code arrows"],
    ["Syntax highlighting", "colors grammar language plain text memory"],
    ["Tab size", "indent spaces width"],
    ["Detect indentation", "indent tabs spaces"],
    ["Render whitespace", "show spaces tabs dots invisible characters"],
    ["Word wrap", "soft wrap long lines"],
    ["Cursor style", "caret line block underline shape"],
    ["Cursor width", "caret thickness", "Cursor style"],
    ["Cursor blinking", "caret blink phase smooth solid"],
    ["Smooth caret animation", "cursor glide"],
    ...CARET_EXTRA_ROWS.map((row): EntrySpec => [row.label, "cursor height"]),
    ["Editing features", "ide"],
    ...EDITOR_FEATURE_ROWS.map((row): EntrySpec => [row.label, row.hint]),
    ["Show completion while typing", "autocomplete suggestions", "Code completion"],
    ["Right margin line", "ruler guide column vertical line"],
    ["Margin column", "ruler guide", "Right margin line"],
    ["Tabs", "editor tabs"],
    ["Reopen tabs on start", "restore session files"],
    ["Recent Files", "cmd e recently opened mru"],
    ["Split editor", "split right down side by side stacked vertically horizontally groups"],
    ["Wrap tabs", "multiple rows"],
    ["Tab limit", "max close least recently used"],
    ["Most file tabs", "tab limit number", "Tab limit"],
    ["Single tab title", "one tab name centered", "Tab limit"],
    ["Unload hidden tabs", "memory sleep free editors background"],
    ["Unload after", "minutes hidden tabs", "Unload hidden tabs"],
    ["Saving", "save"],
    ["Auto save", "autosave save automatically focus change"],
    ["Delay", "auto save milliseconds", "Auto save"],
    ["Remember unsaved changes", "hot exit untitled new file keep restore quit backup"],
    ...SAVE_CLEANUP_ROWS.map((row): EntrySpec => [row.label, "save whitespace newline"]),
    ["Local History", "versions backup restore"],
    ["Keep local history", "versions backup restore"],
    ["Keep versions for", "local history days"],
    ["Size limit", "local history disk space"],
    ["Stored", "local history clear disk usage"],
    ["Preview and blame", "markdown annotate"],
    ["Markdown preview", "md view render"],
    ["Current line blame", "annotate author inline"],
    ["Blame gutter", "annotate author column"],
  ],
  merge: [
    ["Diff layout", "side by side inline unified split one column compare view"],
    ["Side by side in Changes", "three 3 two 2 columns panes staged index staging", "Diff layout"],
    ["Side by side for commits", "three 3 two 2 columns panes parents merge result working tree", "Diff layout"],
    ["Merge tool layout", "columns stacked three panes result below conflicts view"],
    ["Ignore whitespace in the merge tool", "conflicts spaces"],
    ["Show all branches in the log", "history graph remotes"],
    ["Auto fetch", "background fetch remotes"],
    ["Fetch every", "auto fetch minutes interval", "Auto fetch"],
    ["Sign off commits", "signed off by trailer dco"],
    ["GPG sign commits", "signing signature ssh key"],
    ["Git Console", "commands output log"],
    ["Commit identity", "author"],
    ["Name and email", "user name email author identity"],
    ["Commit messages", "message"],
    ["Commit box", "commit box per repository single bottom layout"],
    ["Message history", "recent commit messages"],
    ["Subject line guide", "72 characters length commit message"],
    ["Templates", "commit message template"],
  ],
  layout: [
    ["Do not disturb", "notifications toasts quiet"],
    ["Files panel", "file tree project explorer"],
    ["Confirm drag and drop", "move files ask"],
    ["Left sidebar", "activity bar cmd b side"],
    ["Reopen windows on start", "restore session windows"],
  ],
  terminal: [
    ["Shell", "shell"],
    ["Default shell", "zsh bash fish login"],
    ["Font", "terminal font"],
    ["Font family", "terminal typeface monospace"],
    ["Font size", "terminal text zoom"],
    ["Line height", "terminal line spacing"],
    ["Letter spacing", "terminal character spacing"],
    ["Font weight", "terminal bold medium"],
    ["Bold text weight", "terminal bold"],
    ["Font ligatures", "terminal glyphs"],
    ["Icons from patched fonts", "nerd font powerline starship powerlevel10k"],
    ["Cursor", "terminal caret"],
    ["Cursor style", "terminal caret block bar underline"],
    ["Cursor blink", "terminal caret"],
    ["Behavior", "terminal"],
    ["Scrollback", "terminal history lines buffer"],
    ["Copy on selection", "terminal clipboard"],
    ["Find in terminal", "search output cmd f"],
    ["Clickable file paths", "links open file"],
    ["Drop files to type their paths", "finder drag"],
    ["Visual bell", "terminal beep flash"],
    ["Smooth scrolling", "terminal scroll animation"],
    ["Option as Meta key", "alt emacs"],
    ["Keyboard", "terminal shortcuts keys"],
    ["Rendering", "terminal"],
    ["GPU acceleration", "webgl renderer graphics"],
    ["Unicode 11 widths", "emoji wide characters"],
  ],
  keyboard: [],
  github: [["GitHub account", "sign in login token gist fork share"]],
  ai: [
    ["Agent permissions", "ai autonomy yolo skip permissions dangerously approval ask"],
    ["Keep computer awake", "awake sleep power agent running working lid display screen lock caffeinate"],
    ["Usage in status bar", "limits rate limit quota claude codex plan left right hidden 5 hour weekly"],
    ["Show usage of", "claude code codex provider status bar hide show limits", "Usage in status bar"],
    ["Link into new worktrees", "node_modules worktreeinclude env shared folders task"],
    [
      "Agents",
      "ai claude code codex gemini opencode cursor copilot aider amp qwen installed path command arguments flags model prompt yolo",
    ],
  ],
  automation: [
    ["MCP server", "model context protocol ai agent claude cursor"],
    ["Status", "mcp server running"],
    ["Port", "mcp server network"],
    ["Secret token", "mcp password key", "MCP server"],
    ["Connect Claude Code", "mcp ai agent", "MCP server"],
    ["Other MCP clients", "mcp json config", "MCP server"],
    ["Command line tool", "cli terminal scripts nibtree"],
    ["Install", "cli command line tool", "Command line tool"],
    ["The folder is not on your PATH", "cli command line tool windows environment variables", "Command line tool"],
    ["Examples", "cli command line tool", "Command line tool"],
    ["Memory log", "ram debug"],
    ["Log memory changes", "ram debug"],
    ["Read memory every", "memory log interval"],
    ["Write a line when it changes by", "memory log threshold"],
    ["Log file", "memory log", "Log memory changes"],
  ],
  updates: [
    ["Version", "update check"],
    ["Check for updates automatically", "auto update new release"],
    ["Update channel", "beta stable pre-release"],
    ["Release notes", "changelog what's new"],
    ["Skipped version", "update"],
  ],
  files: [
    ["Settings folder", "settings.json state.json config nibtree path"],
    ["Changed from defaults", "modified settings"],
  ],
  about: [
    ["Star on GitHub", "about"],
    ["Report a Bug", "issue feedback problem"],
    ["Request a Feature", "idea feedback suggestion"],
    ["Release Notes", "changelog what's new"],
  ],
};

export const SETTINGS_SEARCH_INDEX: SettingsSearchEntry[] = Object.entries(SECTION_ENTRIES).flatMap(
  ([section, specs]) =>
    specs.map(([label, keywords, parent]) => ({
      section: section as SettingsSection,
      label,
      keywords: keywords ?? "",
      parent: parent ?? null,
    })),
);

const WORD = /[\p{L}\p{N}]+/gu;

/** The words of a search, lowercased; punctuation separates words, so "Cmd+E" is "cmd" and "e". */
export function searchWords(query: string): string[] {
  return [...new Set(query.toLowerCase().match(WORD) ?? [])];
}

/** True when every search word starts a word of the text. */
export function textMatches(text: string, words: readonly string[]): boolean {
  if (words.length === 0) {
    return false;
  }
  const textWords = text.toLowerCase().match(WORD) ?? [];
  return words.every((word) => textWords.some((textWord) => textWord.startsWith(word)));
}

/** The entries every word finds in the label, its keywords or its section's name. */
export function matchingEntries(
  words: readonly string[],
  sectionLabels: Readonly<Record<SettingsSection, string>>,
  index: readonly SettingsSearchEntry[] = SETTINGS_SEARCH_INDEX,
): SettingsSearchEntry[] {
  if (words.length === 0) {
    return [];
  }
  return index.filter((entry) =>
    textMatches(`${entry.label} ${entry.keywords} ${sectionLabels[entry.section]}`, words),
  );
}

/**
 * The [start, end) spans of the text to highlight: the part of each word that a search word
 * starts, the longest one when several do. Spans are in order and never overlap.
 */
export function highlightSpans(text: string, words: readonly string[]): [number, number][] {
  const spans: [number, number][] = [];
  if (words.length === 0) {
    return spans;
  }
  const lower = text.toLowerCase();
  for (const match of lower.matchAll(WORD)) {
    const longest = words.reduce(
      (best, word) => (word.length > best && match[0].startsWith(word) ? word.length : best),
      0,
    );
    if (longest > 0) {
      const start = match.index ?? 0;
      spans.push([start, start + longest]);
    }
  }
  return spans;
}

/** A block of a settings section, in page order, as the search sees it. */
export interface SearchBlock {
  kind: "group" | "hint" | "row" | "subRow" | "other";
  /** The block's own label matched (always false for hints and others). */
  matched: boolean;
}

/**
 * Which blocks stay on screen during a search. A matched group title keeps its whole group; a
 * matched row keeps the sub-rows under it; a group title and its hint show while any of its rows
 * do; anything else follows the block before it, and shows when it comes first.
 */
export function visibleBlocks(blocks: readonly SearchBlock[]): boolean[] {
  const visible = blocks.map(() => false);
  const groupOf = blocks.map(() => -1);
  let group = -1;
  let groupMatched = false;
  let rowVisible = false;
  blocks.forEach((block, index) => {
    if (block.kind === "group") {
      group = index;
      groupMatched = block.matched;
      rowVisible = false;
      return;
    }
    groupOf[index] = group;
    if (block.kind === "row") {
      rowVisible = block.matched || groupMatched;
      visible[index] = rowVisible;
    } else if (block.kind === "subRow") {
      visible[index] = block.matched || groupMatched || rowVisible;
    }
  });
  blocks.forEach((block, index) => {
    if (block.kind === "group") {
      visible[index] = block.matched || groupOf.some((owner, member) => owner === index && visible[member]);
    }
  });
  blocks.forEach((block, index) => {
    if (block.kind === "hint") {
      visible[index] = groupOf[index] >= 0 && visible[groupOf[index]];
    } else if (block.kind === "other") {
      visible[index] = index === 0 || visible[index - 1];
    }
  });
  return visible;
}
