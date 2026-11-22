import Foundation

// Logic for every talk key. Build and run with macos/test.sh
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

    // Raw modifier flags as a keyboard reports them: generic bit plus the device bit for the side.
    static let shift: UInt = 1 << 17, lShift: UInt = 0x2
    static let lControl: UInt = (1 << 18) | 0x1
    static let lOption: UInt = (1 << 19) | 0x20
    static let lCommand: UInt = (1 << 20) | 0x8

    /// Every talk key runs the same flag-to-machine path as PttMonitor.
    static func runKey(_ key: TalkKey, _ flagSteps: [(flags: UInt, t: TimeInterval)]) -> [PttEvent] {
        var m = PttMachine()
        return flagSteps.compactMap {
            let s = key.sample(rawFlags: $0.flags)
            return m.flagsChanged(fn: s.down, otherModifiers: s.others, at: $0.t)
        }
    }

    static func keyCases() -> Int {
        var failed = 0
        func check(_ name: String, _ got: [PttEvent], _ want: [PttEvent]) {
            if got == want { print("ok   \(name)") }
            else { failed += 1; print("FAIL \(name)\n  want \(want)\n  got  \(got)") }
        }
        let codes: [TalkKey: UInt16] = [.fn: 63, .rightOption: 61, .rightCommand: 54, .rightControl: 62]
        for key in TalkKey.allCases {
            let me = key.downFlags
            check("\(key.title): keyCode is \(codes[key]!)", [], key.keyCode == codes[key]! ? [] : [.down])
            check("\(key.title): hold 1s", runKey(key, [(me, 10), (0, 11)]), [.down, .up(cancelled: false)])
            check("\(key.title): 100ms tap is cancelled", runKey(key, [(me, 10), (0, 10.1)]), [.down, .up(cancelled: true)])
            check("\(key.title): shift joins the hold, cancel then silent",
                  runKey(key, [(me, 10), (me | shift | lShift, 10.5), (me, 10.6), (0, 11)]), [.down, .up(cancelled: true)])
            check("\(key.title): shift already held is ignored", runKey(key, [(me | shift | lShift, 10), (0, 11)]), [])
            if key != .rightOption {
                check("\(key.title): left Option never triggers", runKey(key, [(lOption, 10), (0, 11)]), [])
            }
            if key != .rightCommand {
                check("\(key.title): left Command never triggers", runKey(key, [(lCommand, 10), (0, 11)]), [])
            }
            if key != .rightControl {
                check("\(key.title): left Control never triggers", runKey(key, [(lControl, 10), (0, 11)]), [])
            }
            if key != .fn {
                check("\(key.title): fn alone never triggers", runKey(key, [(1 << 23, 10), (0, 11)]), [])
                let left = key == .rightOption ? lOption : key == .rightCommand ? lCommand : lControl
                check("\(key.title): left twin held first is ignored", runKey(key, [(left, 10), (left | me, 10.2), (left, 10.4), (0, 11)]), [])
                check("\(key.title): left twin joins the hold, cancel", runKey(key, [(me, 10), (left | me, 10.5), (left, 10.6), (0, 11)]),
                      [.down, .up(cancelled: true)])
            }
        }
        check("default without Wispr is fn", [], TalkKey.defaultKey(wisprInstalled: false) == .fn ? [] : [.down])
        check("default with Wispr is Right Option", [], TalkKey.defaultKey(wisprInstalled: true) == .rightOption ? [] : [.down])
        return failed
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
        failed += keyCases()
        for (name, steps, want) in cases {
            let got = run(steps)
            if got == want { print("ok   \(name)") }
            else { failed += 1; print("FAIL \(name)\n  want \(want)\n  got  \(got)") }
        }
        if failed > 0 { print("\(failed) failed"); exit(1) }
        print("all passed")
    }
}
