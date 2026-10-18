import AppKit
import Combine
import NibtreeUI
import SwiftUI

/// The compare tool's native window (`--live <file>`, started by scripts/compare.ts): the scenario in that file drawn
/// by the real Swift components in light and dark, redrawn whenever the compare page writes the file, so hover and
/// pointing can be tried next to the live web component. The file is `{ "scenario": ..., "focus": n }`; a new
/// `focus` brings the window to the front.
enum LiveWindow {
    /// The file to follow, when the showcase was started with `--live <file>`.
    static var file: URL? {
        let arguments = CommandLine.arguments
        guard let index = arguments.firstIndex(of: "--live"), index + 1 < arguments.count else {
            return nil
        }
        return URL(fileURLWithPath: arguments[index + 1])
    }
}

private struct LiveMessage: Decodable {
    let scenario: Scenario
    let focus: Int?
}

/// Reads the file when its folder changes (the server replaces the file in one rename), so nothing polls.
@MainActor
final class LiveModel: ObservableObject {
    @Published private(set) var scenario: Scenario?
    @Published private(set) var node: ResolvedNode?
    @Published private(set) var problem: String?
    private let file: URL
    private var focus: Int?
    private var source: DispatchSourceFileSystemObject?

    init(file: URL) {
        self.file = file
        load()
        watch()
    }

    private func watch() {
        let folder = open(file.deletingLastPathComponent().path, O_EVTONLY)
        guard folder >= 0 else {
            problem = "Cannot watch \(file.deletingLastPathComponent().path)"
            return
        }
        let source = DispatchSource.makeFileSystemObjectSource(fileDescriptor: folder, eventMask: .write, queue: .main)
        source.setEventHandler { [weak self] in
            MainActor.assumeIsolated { self?.load() }
        }
        source.setCancelHandler { close(folder) }
        source.resume()
        self.source = source
    }

    private func load() {
        guard let data = try? Data(contentsOf: file) else {
            return
        }
        do {
            let message = try JSONDecoder().decode(LiveMessage.self, from: data)
            scenario = message.scenario
            node = ResolvedNode(message.scenario.node)
            problem = nil
            if let next = message.focus, focus != nil, next != focus {
                NSApplication.shared.activate()
            }
            focus = message.focus
        } catch {
            problem = "Cannot read the scenario: \(error.localizedDescription)"
        }
    }
}

struct LiveView: View {
    @StateObject private var model: LiveModel

    init(file: URL) {
        _model = StateObject(wrappedValue: LiveModel(file: file))
    }

    var body: some View {
        // The window in the system's appearance, the scenario in both themes inside it; the content from the top left,
        // scrolling only when it does not fit.
        NStack(gap: .lg, padding: .xl, align: .start, scroll: .both) {
            if let problem = model.problem {
                NText(problem, tone: .danger)
            }
            if let scenario = model.scenario, let node = model.node {
                NText(scenario.id, variant: .title)
                ForEach([ColorScheme.light, .dark], id: \.self) { scheme in
                    ParityFrame(width: scenario.width) { ScenarioView(node: node).sized(scenario.height) }
                        .nibtreeTheme()
                        .environment(\.colorScheme, scheme)
                }
            } else {
                NText("Waiting for the compare page.", tone: .dim)
            }
        }
        .frame(minWidth: 360, maxWidth: .infinity, minHeight: 240, maxHeight: .infinity, alignment: .topLeading)
        .background(LiveBackground())
        .nibtreeTheme()
    }
}

/// The window's own surface, in the theme it is shown in.
private struct LiveBackground: View {
    @Environment(\.nibtreePalette) private var palette

    var body: some View {
        palette.color(.editorBg).ignoresSafeArea()
    }
}

/// Quits the live window's process when its window closes; the compare page can open it again.
final class ShowcaseAppDelegate: NSObject, NSApplicationDelegate {
    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool {
        LiveWindow.file != nil
    }
}
