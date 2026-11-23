// Spec: settings persist and have sane defaults.
// Needs macos/Coworker/Settings.swift: struct AppSettings: Equatable { talkKey: TalkKey; dictationLanguage: String;
// agentAlerts: Bool; alertSound: Bool; launchAtLogin: Bool; static func load(_: UserDefaults) -> AppSettings; func save(_: UserDefaults) }.
import Foundation

@main struct Spec {
    static func main() {
        var fails = 0
        func check(_ ok: Bool, _ m: String) { print(ok ? "ok   \(m)" : "FAIL \(m)"); if !ok { fails += 1 } }
        let d = UserDefaults(suiteName: "coworker.spec.\(UUID().uuidString)")!
        let s = AppSettings.load(d)
        check(s.agentAlerts && s.alertSound, "agent alerts and their sound are on by default")
        check(!s.launchAtLogin, "launch at login is opt-in")
        check(s.dictationLanguage == "auto", "dictation detects the language by default")
        var t = s
        t.talkKey = .rightCommand; t.dictationLanguage = "en"; t.agentAlerts = false; t.alertSound = false; t.launchAtLogin = true
        t.save(d)
        check(AppSettings.load(d) == t, "round trip")
        exit(fails == 0 ? 0 : 1)
    }
}
