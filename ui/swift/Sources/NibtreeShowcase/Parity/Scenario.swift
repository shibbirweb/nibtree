import Foundation

/// A parity scenario from ui/swift/parity/<Component>.json (format: scripts/parity/scenario.ts).
struct Scenario: Decodable, Sendable {
    let id: String
    let width: Double
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

    func string(_ name: String) -> String? {
        if case .string(let value) = props?[name] {
            return value
        }
        return nil
    }

    func flag(_ name: String) -> Bool {
        if case .bool(let value) = props?[name] {
            return value
        }
        return false
    }
}

/// A prop's JSON value.
enum PropValue: Decodable, Sendable {
    case string(String)
    case number(Double)
    case bool(Bool)

    init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        if let value = try? container.decode(Bool.self) {
            self = .bool(value)
        } else if let value = try? container.decode(Double.self) {
            self = .number(value)
        } else {
            self = .string(try container.decode(String.self))
        }
    }
}
