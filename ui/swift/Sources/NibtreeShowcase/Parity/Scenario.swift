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

    /// The node with `placeholder` in its text and its children's replaced, for a slot that is a template per item.
    func replacing(_ placeholder: String, with value: String) -> ScenarioNode {
        ScenarioNode(
            component: component, props: props, text: text?.replacingOccurrences(of: placeholder, with: value),
            children: children?.map { $0.replacing(placeholder, with: value) }, slots: slots, state: state)
    }

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

    /// A list prop, such as Breadcrumbs' crumbs.
    func list(_ name: String) -> [PropValue]? {
        if case .list(let value) = props?[name] {
            return value
        }
        return nil
    }

    /// An object prop with values other than words, such as Breadcrumbs' `at` or a crumb.
    func record(_ name: String) -> [String: PropValue]? {
        props?[name]?.record
    }

    func flag(_ name: String, default fallback: Bool = false) -> Bool {
        if case .bool(let value) = props?[name] {
            return value
        }
        return fallback
    }
}

/// A prop's JSON value.
indirect enum PropValue: Decodable, Sendable {
    case string(String)
    case number(Double)
    case bool(Bool)
    case object([String: String])
    /// An object with numbers, flags or objects in it.
    case nested([String: PropValue])
    case list([PropValue])
    /// A JSON null, such as StatusLetter's kind for a conflict.
    case null

    var text: String? {
        if case .string(let value) = self {
            return value
        }
        return nil
    }

    var numberValue: Double? {
        if case .number(let value) = self {
            return value
        }
        return nil
    }

    /// Any object, its words as `.string`s.
    var record: [String: PropValue]? {
        switch self {
        case .object(let value): value.mapValues { .string($0) }
        case .nested(let value): value
        default: nil
        }
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        if container.decodeNil() {
            self = .null
        } else if let value = try? container.decode(Bool.self) {
            self = .bool(value)
        } else if let value = try? container.decode(Double.self) {
            self = .number(value)
        } else if let value = try? container.decode([String: String].self) {
            self = .object(value)
        } else if let value = try? container.decode([String: PropValue].self) {
            self = .nested(value)
        } else if let value = try? container.decode([PropValue].self) {
            self = .list(value)
        } else {
            self = .string(try container.decode(String.self))
        }
    }
}
