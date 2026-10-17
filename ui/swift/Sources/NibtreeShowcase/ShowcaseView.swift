import NibtreeTokens
import NibtreeUI
import SwiftUI

/// The list of stories at the left; the chosen one in light and dark at the right, each in its picked color theme.
struct ShowcaseView: View {
    @State private var selection: String? = Stories.all.first?.id
    @State private var lightTheme = Palette.lightThemeId
    @State private var darkTheme = Palette.darkThemeId

    private var groups: [(String, [Story])] {
        Dictionary(grouping: Stories.all, by: \.group).sorted { $0.key < $1.key }
            .map { ($0.key, $0.value.sorted { $0.name < $1.name }) }
    }

    var body: some View {
        NavigationSplitView {
            List(selection: $selection) {
                ForEach(groups, id: \.0) { group, stories in
                    Section(group) {
                        ForEach(stories) { story in
                            Text(story.name).tag(story.id)
                        }
                    }
                }
            }
            .navigationSplitViewColumnWidth(min: 160, ideal: 200)
        } detail: {
            if let story = Stories.all.first(where: { $0.id == selection }) {
                HStack(spacing: 0) {
                    PreviewPane(story: story, scheme: .light, lightTheme: lightTheme, darkTheme: darkTheme)
                    PreviewPane(story: story, scheme: .dark, lightTheme: lightTheme, darkTheme: darkTheme)
                }
                .toolbar {
                    ThemePicker(title: "Light theme", kinds: ["light", "high-contrast-light"], selection: $lightTheme)
                    ThemePicker(title: "Dark theme", kinds: ["dark", "high-contrast-dark"], selection: $darkTheme)
                }
            }
        }
    }
}

/// One appearance of a story, on its theme's panel color.
private struct PreviewPane: View {
    let story: Story
    let scheme: ColorScheme
    let lightTheme: String
    let darkTheme: String

    var body: some View {
        Painted { story.make() }
            .nibtreeTheme(light: lightTheme, dark: darkTheme)
            .environment(\.colorScheme, scheme)
    }
}

/// Reads the palette set by `.nibtreeTheme` and paints the pane in it.
private struct Painted<Content: View>: View {
    @ViewBuilder let content: () -> Content
    @Environment(\.nibtreePalette) private var palette

    var body: some View {
        ScrollView {
            content()
                .padding(24)
                .frame(maxWidth: .infinity, alignment: .topLeading)
        }
        .background(palette.color(.panel))
    }
}

private struct ThemePicker: View {
    let title: String
    let kinds: [String]
    @Binding var selection: String

    var body: some View {
        Picker(title, selection: $selection) {
            ForEach(GMTheme.all.filter { kinds.contains($0.kind) }, id: \.id) { theme in
                Text(theme.name).tag(theme.id)
            }
        }
        .help(title)
    }
}
