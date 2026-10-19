import Foundation

/// Arrow-key movement in a row of choices (Segmented, Tabs, RadioGroup), the Swift side of ui/web
/// `logic/roving.ts`: wraps at the ends and skips disabled ones.
public enum NRoving {
    public enum Key: Sendable {
        case previous, next, first, last
    }

    /// The index `key` moves to from `current` among `count` items; `disabled(i)` items are skipped, and with none
    /// to move to it stays.
    public static func next(_ current: Int, count: Int, key: Key, disabled: (Int) -> Bool = { _ in false }) -> Int {
        if count == 0 {
            return -1
        }
        switch key {
        case .first:
            return (0..<count).first { !disabled($0) } ?? current
        case .last:
            return (0..<count).reversed().first { !disabled($0) } ?? current
        case .previous, .next:
            let step = key == .previous ? -1 : 1
            var index = current
            for _ in 0..<count {
                index = (index + step + count) % count
                if !disabled(index) {
                    return index
                }
            }
            return current
        }
    }
}
