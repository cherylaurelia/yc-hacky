// Spec: dictated text lands in the focused app by paste, and the user's clipboard comes back.
// Needs macos/Coworker/Insert.swift: protocol Clipboard { read() -> String?; write(String?) }
// and TextInserter(clipboard:paste:later:) with insert(_:). `later` runs the restore after the paste lands.
import Foundation

final class FakeClipboard: Clipboard {
    var value: String?
    init(_ v: String?) { value = v }
    func read() -> String? { value }
    func write(_ text: String?) { value = text }
}

@main struct Spec {
    static func main() {
        var fails = 0
        func check(_ ok: Bool, _ m: String) { print(ok ? "ok   \(m)" : "FAIL \(m)"); if !ok { fails += 1 } }

        let cb = FakeClipboard("old")
        var pasted: [String?] = []
        var later: [() -> Void] = []
        let ins = TextInserter(clipboard: cb, paste: { pasted.append(cb.value) }, later: { later.append($0) })
        ins.insert("hello world")
        check(pasted == ["hello world"], "pastes once, with the text on the clipboard")
        later.forEach { $0() }
        check(cb.value == "old", "restores the previous clipboard afterwards")

        pasted = []; later = []
        ins.insert("  \n ")
        later.forEach { $0() }
        check(pasted.isEmpty && cb.value == "old", "blank text pastes nothing and leaves the clipboard")

        let empty = FakeClipboard(nil)
        var later2: [() -> Void] = []
        let ins2 = TextInserter(clipboard: empty, paste: {}, later: { later2.append($0) })
        ins2.insert("x")
        later2.forEach { $0() }
        check(empty.value == nil, "an empty clipboard stays empty")
        exit(fails == 0 ? 0 : 1)
    }
}
