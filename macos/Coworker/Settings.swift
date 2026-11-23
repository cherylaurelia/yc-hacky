import Foundation

struct AppSettings: Equatable {
    var talkKey = TalkKey.fn
    var dictationLanguage = "auto"  // "auto" lets Scribe detect it; otherwise an ISO 639-1 code
    var agentAlerts = true
    var alertSound = true
    var launchAtLogin = false

    // "talkKey" is the key TalkKeySetting reads and writes too, so the menu and the settings window agree.
    static func load(_ d: UserDefaults = .standard) -> AppSettings {
        var s = AppSettings()
        s.talkKey = d.string(forKey: "talkKey").flatMap(TalkKey.init(rawValue:)) ?? s.talkKey
        s.dictationLanguage = d.string(forKey: "dictationLanguage") ?? s.dictationLanguage
        s.agentAlerts = d.object(forKey: "agentAlerts") as? Bool ?? s.agentAlerts
        s.alertSound = d.object(forKey: "alertSound") as? Bool ?? s.alertSound
        s.launchAtLogin = d.object(forKey: "launchAtLogin") as? Bool ?? s.launchAtLogin
        return s
    }

    func save(_ d: UserDefaults = .standard) {
        d.set(talkKey.rawValue, forKey: "talkKey")
        d.set(dictationLanguage, forKey: "dictationLanguage")
        d.set(agentAlerts, forKey: "agentAlerts")
        d.set(alertSound, forKey: "alertSound")
        d.set(launchAtLogin, forKey: "launchAtLogin")
    }
}
