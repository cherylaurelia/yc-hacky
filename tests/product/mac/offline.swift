// Spec: when the page can't load, the panel shows why and a way to retry, never a blank window.
// Needs macos/Coworker/OfflinePage.swift: enum OfflinePage { static func html(url: URL, reason: String) -> String }.
import Foundation

@main struct Spec {
    static func main() {
        var fails = 0
        func check(_ ok: Bool, _ m: String) { print(ok ? "ok   \(m)" : "FAIL \(m)"); if !ok { fails += 1 } }
        let h = OfflinePage.html(url: URL(string: "https://coworker.example/?embed=1")!, reason: "<script>x</script> offline")
        check(h.contains("Retry"), "has a Retry action")
        check(h.contains("offline"), "says why")
        check(!h.contains("<script>x"), "escapes the reason")
        check(h.contains("&lt;script&gt;"), "escaped as HTML")
        exit(fails == 0 ? 0 : 1)
    }
}
