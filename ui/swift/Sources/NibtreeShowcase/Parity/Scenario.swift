import Foundation

/// A parity scenario from ui/swift/parity/<Component>.json (format: scripts/parity/scenario.ts).
struct Scenario: Decodable, Sendable {
    let id: String
    let width: Double
    /// Set for components that fill their parent (frames, split panes); otherwise the content's height.
    let height: Double?
    let node: ScenarioNode

    /// Every scenario of every file in `folder`.
    static func load(from folder: URL) throws -> [Scenario] {
        let files = try FileManager.default.contentsOfDirectory(at: folder, includingPropertiesForKeys: nil)
            .filter { $0.pathExtension == "json" }
            .sorted { $0.lastPathComponent < $1.lastPathComponent }
        return try files.flatMap { try JSONDecoder().decode([Scenario].self, from: Data(contentsOf: $0)) }
    }
}

struct ScenarioNode: Decodable, Sendable {
    let component: String
    let props: [String: PropValue]?
    let text: String?
    let children: [ScenarioNode]?
    /// Named content for components that take it as slots (SplitPane's first and second).
    let slots: [String: [ScenarioNode]]?
    /// Drawn as if hovered, pressed, focused or dragged (`nibtreeForcedState`).
    let state: String?

    func number(_ name: String) -> Double? {
        if case .number(let value) = props?[name] {
            return value
        }
        return nil
    }

    func string(_ name: String) -> String? {
        if case .string(let value) = props?[name] {
            return value
        }
        return nil
    }

    func object(_ name: String) -> [String: String]? {
        if case .object(let value) = props?[name] {
            return value
        }
        return nil
    }

    func flag(_ name: String, default fallback: Bool = false) -> Bool {
        if case .bool(let value) = props?[name] {
            return value
        }
        return fallback
    }
}

/// A prop's JSON value.
enum PropValue: Decodable, Sendable {
    case string(String)
    case number(Double)
    case bool(Bool)
    case object([String: String])

    init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        if let value = try? container.decode(Bool.self) {
            self = .bool(value)
        } else if let value = try? container.decode(Double.self) {
            self = .number(value)
        } else if let value = try? container.decode([String: String].self) {
            self = .object(value)
        } else {
            self = .string(try container.decode(String.self))
        }
    }
}
