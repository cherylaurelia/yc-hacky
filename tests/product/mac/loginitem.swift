// Spec: launch at login through SMAppService, reporting the real state when macOS refuses.
// Needs macos/Coworker/LoginItem.swift: protocol LoginService { var enabled: Bool { get }; func register() throws; func unregister() throws }
// and enum LoginItem { static func apply(_ on: Bool, _ s: LoginService) -> Bool } (returns the resulting state).
import Foundation

struct Refused: Error {}
final class FakeService: LoginService {
    var enabled = false
    var fail = false
    func register() throws { if fail { throw Refused() }; enabled = true }
    func unregister() throws { if fail { throw Refused() }; enabled = false }
}

@main struct Spec {
    static func main() {
        var fails = 0
        func check(_ ok: Bool, _ m: String) { print(ok ? "ok   \(m)" : "FAIL \(m)"); if !ok { fails += 1 } }
        let f = FakeService()
        check(LoginItem.apply(true, f) && f.enabled, "turns on")
        check(!LoginItem.apply(false, f) && !f.enabled, "turns off")
        f.fail = true
        check(LoginItem.apply(true, f) == false, "a refused register reports off")
        exit(fails == 0 ? 0 : 1)
    }
}
