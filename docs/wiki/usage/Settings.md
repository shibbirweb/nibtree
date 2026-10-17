# Settings

Settings change how Nibtree looks and behaves, apply at once and are saved. A mark such as **+70 MB** means a setting uses more memory when on ([Memory Use](Memory-Use.md#settings-that-use-more-memory)).

## Open Settings

- Click the gear at the top right of the header (**Settings (Cmd+,)**).
- Or press Cmd+,, or choose **Nibtree > Settings...** in the menu bar (**File > Settings...** on Windows and Linux).
- Or click the gear on the [welcome screen](Welcome-Screen.md).

Settings opens on **Appearance**. The status bar's **Spaces** opens **Editor**, the terminal's **Default Shell...** opens **Terminal**, and **About Nibtree** opens **About**.

The sections are on the left, under a [search field](Settings-Search.md). Esc or the x closes it. Drag the title to move it; double-click it to center it.

**Reset to Defaults** at the bottom left puts every setting in `settings.json` back to its default, after asking (**Reset Settings**). Panel choices and sizes live in `state.json` and are kept.

## Appearance

![Appearance settings](../images/settings-appearance.png)

*The Appearance section.*

| Setting | What it does | Default |
| --- | --- | --- |
| Theme | **System** follows the system, or pick **Light** or **Dark**. Colors are picked in **Editor**. | System |
| Rounded panels | Rounded panels with space between them. See [Rounded Panels](Rounded-Panels.md). | Off |
| Project color in the top bar | A glow in the project's [Welcome](Welcome-Screen.md) color. | On |
| File toolbar | **Top**, **Bottom** or **Hidden**, plus switches. See [Navigation Bar](Navigation-Bar.md#the-file-toolbar-top-bottom-or-hidden). | Top |
| Interface font size | Size of menus, lists and buttons, 11 to 16 px in half steps. | 13 px |
| File icons | **No icons**, **Minimal** or **Material Icons** in the file lists. See [File Icons](File-Icons.md). | No icons |

The theme is also in **View > Appearance**. The sun button in the header (**Toggle light/dark theme**) switches between Light and Dark; **System** follows the system.

![Dark theme](../images/dark-theme.png)

*Nibtree in the dark theme.*

## Editor

![Editor settings](../images/settings-editor.png)

*The top of the Editor section: the color theme pickers.*

**Color theme** has two lists, **Light theme** and **Dark theme**: the one in use depends on the Appearance. See [Color Themes](Color-Themes.md).

![Editor fonts and spacing](../images/settings-editor-fonts.png)

*Font family with a live preview, font size, font weight and line spacing.*

| Setting | What it does | Default |
| --- | --- | --- |
| Editor font family | A comma-separated list. The first installed font is used; `monospace` is always added last. | 'JetBrains Mono', Menlo, Monaco, 'Cascadia Mono', Consolas, 'Courier New', monospace |
| Editor font size | Code in the editor, diffs and the merge tool, 10 to 20 px in half steps. See [Zoom](Code-Appearance.md#zoom). | 13 px |
| Editor font weight | Thin to Black. See [Font weight](Code-Appearance.md#font-weight). | Regular |
| Line spacing | Space between lines, 1.0 to 2.5 times the font size. Double-click the slider to reset it. | 1.25 |
| Change font size with Ctrl + mouse wheel | Hold Control (or Command) and scroll over code, or pinch. | Off |
| Font ligatures | Draws `=>`, `!=` and `===` as single symbols with fonts such as Fira Code. | Off |
| Syntax highlighting | Colors code by language. See [Syntax highlighting](Code-Appearance.md#syntax-highlighting). | On |
| Tab size | Spaces per indent level (2, 4 or 8) when not detected, and the width of a tab. | 4 |
| Detect indentation | Indent like the file does. Also View > Detect Indentation. See [Indentation](Code-Appearance.md#indentation). | On |
| Render whitespace | Draws spaces as dots and tabs as arrows: **None**, **Boundary**, **Selection**, **Trailing** or **All**. See [Render whitespace](Code-Appearance.md#render-whitespace). | Selection |
| Word wrap | Wraps long lines in the file editor, also with View > Word Wrap (Option+Z). Diffs and the merge tool never wrap. | Off |
| Cursor style, width, blinking, smooth caret, caret extra top and bottom | The shape, thickness, blinking and size of the cursor. See [The cursor](Code-Appearance.md#the-cursor). | Line, 2 px, Blink, Off, 0, 0 |
| Editing features | Auto-close brackets, completion, fold arrows, indent guides, word highlight, scroll past the end, column selection, a margin line. See [IDE features](Editing-Code.md#ide-features). | On; margin line off |
| Markdown preview | How Markdown files open: **Editor only**, **Editor and preview** or **Rich editor**. See [Markdown Editor](Markdown-Editor.md). | Editor and preview |
| Current line blame | Author, age and commit at the end of the cursor line. Cmd+click it to open the commit in the Log; Cmd+Option-click copies the hash. See [Blame](Blame.md). | On |
| Blame gutter | A blame column beside the line numbers. Also the **Blame** button in the editor path bar and the diff toolbar. | Off |
| Recent Files | Cmd+E lists recent files. See [Recent Files](Recent-Files.md). | On |

![More editor settings](../images/settings-editor-more.png)

*The lower part of the Editor section: render whitespace, word wrap, Markdown preview and blame.*

Type a font list and press Enter, or click a font name below it. **Reset** goes back to the default font.

## Git

![Git settings](../images/settings-merge.png)

*Defaults for diffs, the merge tool, the Log, commits and the Git Console.*

| Setting | What it does | Default |
| --- | --- | --- |
| Diff layout | Every diff **Side by side** or **Inline** ([Inline Diffs](Inline-Diffs.md)); the diff toolbar's buttons set it too. | Side by side |
| Side by side in Changes, for commits | **3 columns**: the [Staging View](Staging-View.md), or a commit beside your working tree. | 2, 3 |
| Merge tool layout | [Merge Tool](Merge-Tool.md) panes: Columns or Stacked. | Columns |
| Ignore whitespace in the merge tool | Hides whitespace-only differences when a merge starts; its button sets it too. | Off |
| Show all branches in the log | Includes every local and remote branch in the [Log](History-and-Log.md). | On |
| Sign off commits | Adds a `Signed-off-by` line to every commit (`--signoff`). Also in [Commit Options](Commit-Options.md). | Off |
| Commit box | **Single** or **Per repository** ([Commit Box Layout](Commit-Box-Layout.md)). | Single |
| GPG sign commits | **Default** follows git's `commit.gpgSign`, **Sign** adds `-S`, **Do not sign** adds `--no-gpg-sign`. | Default |
| Git Console | Lists the git commands the app runs in a tab next to Terminal; off, nothing is recorded ([Git Console](Git-Console.md)). | Off |

**Git > Update Project...** remembers merge or rebase (`updateMethod`, default merge); see [Git Dialogs](Git-Dialogs.md#update-project).

## Layout

![Layout settings](../images/settings-layout.png)

*Which sidebars are shown.*

| Setting | What it does | Default |
| --- | --- | --- |
| Files panel | Shows the file tree on the right (also Cmd+B). | On |
| Confirm drag and drop | Asks before a drag in the Files panel moves files (see [File Operations](File-Operations.md)). | On |
| Left sidebar | **Changes**, **Branches** or **Hidden** (also Option+Cmd+B and the activity bar). | Changes |

Two header buttons show or hide the **activity bars**, the icon strips at the window edges (also in the **View** menu). Drag a panel's edge to resize it; double-click to reset. All this is saved in `state.json`, but **Confirm drag and drop** is in `settings.json`.

## Terminal, GitHub and Automation

![Automation settings](../images/settings-automation.png)

*Automation: the MCP server, the command line tool and the memory log, all off by default.*

- **Terminal**: the shell, font, cursor, scrollback and copy on selection.
- **AI**: agent permissions and arguments ([AI Agents](AI-Agents.md#settings)).
- **GitHub**: sign in to GitHub for Share Project, Sync Fork and Create Gist.
- **Automation**: the MCP server, the `nibtree cli` tool and the memory log.

Every option is described in [Terminal, GitHub and Automation Settings](Settings-Terminal-and-Automation.md).

## Updates and About

**Updates** controls the update check and the release channel ([Updates](Updates.md)). **About** has the version and links to star the project, report a bug or request a feature ([Status Bar and Help](Status-Bar-and-Help.md)).

## Settings Files

![Settings Files section](../images/settings-files.png)

*The settings folder and the list of settings changed from their defaults.*

Where your settings are saved and which ones you changed. A banner shows when a settings file cannot be read:

![The state.json banner](../images/settings-state-error.png)

*The state.json banner: Try Again rereads the file, Reset replaces it with a fresh one.*

[Settings Files](Settings-Files.md) explains both files, every key and the banners.

## Related

- [Color Themes](Color-Themes.md)
- [Settings Files](Settings-Files.md)
- [Terminal, GitHub and Automation Settings](Settings-Terminal-and-Automation.md)
- [Editor and Tabs](Editor-and-Tabs.md)
- [How settings work (developer)](../developer/How-Settings-Work.md)
