// Spec: a fresh install opens the hosted Coworker page, not a dev server or one team's repo.
// Needs macos/Coworker/AppConfig.swift: enum AppConfig { static let defaultPage: URL }.
import Foundation

@main struct Spec {
    static func main() {
        var fails = 0
        func check(_ ok: Bool, _ m: String) { print(ok ? "ok   \(m)" : "FAIL \(m)"); if !ok { fails += 1 } }
        let u = AppConfig.defaultPage
        check(u.scheme == "https", "https")
        check(!["localhost", "127.0.0.1", "0.0.0.0"].contains(u.host ?? ""), "not a local dev server")
        check((u.query ?? "").contains("embed=1"), "embedded mode")
        check(!u.absoluteString.contains("cherylaurelia"), "no hardcoded repo")
        exit(fails == 0 ? 0 : 1)
    }
}
