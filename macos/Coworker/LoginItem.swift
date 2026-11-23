import Foundation
import ServiceManagement

protocol LoginService {
    var enabled: Bool { get }
    func register() throws
    func unregister() throws
}

struct MainAppLogin: LoginService {
    var enabled: Bool { SMAppService.mainApp.status == .enabled }
    func register() throws { try SMAppService.mainApp.register() }
    func unregister() throws { try SMAppService.mainApp.unregister() }
}

enum LoginItem {
    static var enabled: Bool { MainAppLogin().enabled }

    @discardableResult
    static func apply(_ on: Bool) -> Bool { apply(on, MainAppLogin()) }

    /// Returns the state macOS ends up in, which differs from `on` when it refuses (an unsigned build, or approval pending in System Settings).
    static func apply(_ on: Bool, _ service: LoginService) -> Bool {
        do {
            if on { try service.register() } else { try service.unregister() }
        } catch {
            NSLog("Coworker: launch at login \(on ? "on" : "off") failed: \(error.localizedDescription)")
        }
        return service.enabled
    }
}
