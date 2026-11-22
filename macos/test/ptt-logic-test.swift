import Foundation

// Build and run with macos/test.sh
@main
struct PttLogicTest {
    enum Step {
        case fn(Bool, other: Bool = false, t: TimeInterval)
        case key
    }

    static func run(_ steps: [Step]) -> [PttEvent] {
        var m = PttMachine()
        var out: [PttEvent] = []
        for s in steps {
            let e: PttEvent?
            switch s {
            case .fn(let down, let other, let t): e = m.flagsChanged(fn: down, otherModifiers: other, at: t)
            case .key: e = m.keyDown()
            }
            if let e { out.append(e) }
        }
        return out
    }

    static func main() {
        let cases: [(String, [Step], [PttEvent])] = [
            ("hold 1s", [.fn(true, t: 10), .fn(false, t: 11)], [.down, .up(cancelled: false)]),
            ("tap 100ms is cancelled", [.fn(true, t: 10), .fn(false, t: 10.1)], [.down, .up(cancelled: true)]),
            ("exactly 150ms counts as a hold", [.fn(true, t: 10), .fn(false, t: 10.15)], [.down, .up(cancelled: false)]),
            ("fn+arrow cancels at the key, fn up is silent",
             [.fn(true, t: 10), .key, .fn(false, t: 10.5)], [.down, .up(cancelled: true)]),
            ("key typed while fn held then more keys: one cancel only",
             [.fn(true, t: 10), .key, .key, .fn(false, t: 11)], [.down, .up(cancelled: true)]),
            ("cmd already held when fn goes down is ignored",
             [.fn(true, other: true, t: 10), .fn(false, t: 11)], []),
            ("shift joins the hold: cancel, then silent",
             [.fn(true, t: 10), .fn(true, other: true, t: 10.5), .fn(true, t: 10.6), .fn(false, t: 11)],
             [.down, .up(cancelled: true)]),
            ("next hold works after an ignored one",
             [.fn(true, t: 10), .key, .fn(false, t: 11), .fn(true, t: 12), .fn(false, t: 13)],
             [.down, .up(cancelled: true), .down, .up(cancelled: false)]),
            ("key with fn up is ignored", [.key, .key], []),
            ("fn up without a down is ignored", [.fn(false, t: 10)], []),
            ("repeated fn-down flags do not re-emit", [.fn(true, t: 10), .fn(true, t: 10.2), .fn(false, t: 11)],
             [.down, .up(cancelled: false)]),
        ]
        var failed = 0
        for (name, steps, want) in cases {
            let got = run(steps)
            if got == want { print("ok   \(name)") }
            else { failed += 1; print("FAIL \(name)\n  want \(want)\n  got  \(got)") }
        }
        if failed > 0 { print("\(failed) failed"); exit(1) }
        print("all \(cases.count) passed")
    }
}
