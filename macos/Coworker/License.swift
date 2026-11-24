import Foundation
import Security

/// Pro and Team licenses are Lemon Squeezy (LS) license keys. The server is the real gate (it checks every key against LS);
/// this file keeps the key in the Keychain, shows its state in Settings, and hands the key to the page.
enum LicensePlan: String, Codable, Equatable {
    case pro, team

    var title: String { self == .pro ? "Pro" : "Team" }
}

/// Which LS store and products this build sells, from Info.plist (macos/build.sh writes T1StoreID and T1ProductIDs from
/// LEMONSQUEEZY_STORE_ID, LEMONSQUEEZY_PRODUCT_IDS and LEMONSQUEEZY_TEAM_PRODUCT_IDS). Empty (a dev build) trusts whatever LS says is valid
/// and the server does the filtering. Something that is set but is not a number matches nothing, so a typo never loosens the check.
enum LicenseConfig {
    static func parse(storeID: String?, productIDs: String?) -> (storeID: Int?, productIDs: Set<Int>) {
        let store = storeID?.trimmingCharacters(in: .whitespaces) ?? ""
        let products = (productIDs ?? "").split(separator: ",").map { $0.trimmingCharacters(in: .whitespaces) }.filter { !$0.isEmpty }
        return (store.isEmpty ? nil : Int(store) ?? -1, Set(products.map { Int($0) ?? -1 }))
    }

    private static let bundled = parse(storeID: Bundle.main.object(forInfoDictionaryKey: "T1StoreID") as? String,
                                       productIDs: Bundle.main.object(forInfoDictionaryKey: "T1ProductIDs") as? String)
    static let storeID: Int? = bundled.storeID
    static let productIDs: Set<Int> = bundled.productIDs
}

/// What the page needs to prove this Mac holds a seat on the key: the key and the activation (instance) id LS gave it.
struct LicenseGrant: Equatable {
    var key: String
    var instanceID: String
}

enum LicenseState: Equatable {
    case unlicensed
    case active(plan: LicensePlan, validatedAt: Date)
    case offlineGrace(plan: LicensePlan, validatedAt: Date)
    case invalid(reason: String)

    /// How long a license that LS last confirmed keeps working while LS cannot be reached.
    static let grace: TimeInterval = 7 * 24 * 3600

    enum Check: Equatable {
        case valid(LicensePlan)
        case rejected(String)
        case unreachable
    }

    /// LS saying no ends the license at once. Only an unreachable LS gets the grace, counted from the last yes.
    static func resolve(_ check: Check, last: (plan: LicensePlan, at: Date)?, now: Date) -> LicenseState {
        switch check {
        case .valid(let plan): return .active(plan: plan, validatedAt: now)
        case .rejected(let reason): return .invalid(reason: reason)
        case .unreachable:
            guard let last, now.timeIntervalSince(last.at) < grace else {
                return .invalid(reason: "Terminal 1 could not check your license. Connect to the internet to keep Pro.")
            }
            return .offlineGrace(plan: last.plan, validatedAt: last.at)
        }
    }

    var unlocksPro: Bool {
        switch self {
        case .active, .offlineGrace: return true
        case .unlicensed, .invalid: return false
        }
    }

    var summary: String {
        switch self {
        case .unlicensed: return "Free. Enter a license key to unlock voice."
        case .active(let plan, _): return "\(plan.title) is active."
        case .offlineGrace(let plan, let at): return "\(plan.title) is active while offline. Last checked \(at.formatted(date: .abbreviated, time: .omitted))."
        case .invalid(let reason): return reason
        }
    }
}

/// The page reads `window.__T1_LICENSE__` and `window.__T1_INSTANCE__`; the app puts them there before the page's own scripts run.
enum LicenseScript {
    /// The check keeps the key away from any other site the panel might navigate to.
    static func source(_ grant: LicenseGrant, origin: String) -> String {
        "if (location.origin === \(json(origin))) { window.__T1_LICENSE__ = \(json(grant.key)); window.__T1_INSTANCE__ = \(json(grant.instanceID)); }"
    }

    /// scheme://host[:port], as `location.origin` writes it.
    static func origin(of url: URL) -> String? {
        guard let scheme = url.scheme, let host = url.host else { return nil }
        let port = url.port.flatMap { $0 == (scheme == "https" ? 443 : 80) ? nil : ":\($0)" } ?? ""
        return "\(scheme)://\(host)\(port)"
    }

    private static func json(_ s: String) -> String {
        (try? JSONEncoder().encode(s)).map { String(decoding: $0, as: UTF8.self) } ?? "\"\""
    }
}

struct StoredLicense: Codable, Equatable {
    var key: String
    var instanceID: String
    var plan: LicensePlan?
    var validatedAt: Date?

    var last: (plan: LicensePlan, at: Date)? {
        guard let plan, let validatedAt else { return nil }
        return (plan, validatedAt)
    }
}

/// The key, its LS instance id and when LS last said yes, as one generic-password item in the login Keychain.
struct LicenseStore {
    struct Failure: Error, LocalizedError {
        let status: OSStatus
        var errorDescription: String? { (SecCopyErrorMessageString(status, nil) as String?) ?? "Keychain error \(status)" }
    }

    var service = "com.terminal1.license"
    private let account = "license"

    private var query: [String: Any] {
        [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: service, kSecAttrAccount as String: account]
    }

    func load() -> StoredLicense? {
        var q = query
        q[kSecReturnData as String] = true
        q[kSecMatchLimit as String] = kSecMatchLimitOne
        var out: CFTypeRef?
        let status = SecItemCopyMatching(q as CFDictionary, &out)
        guard status == errSecSuccess, let data = out as? Data else {
            if status != errSecItemNotFound { NSLog("Terminal 1: could not read the license from the Keychain: \(Failure(status: status).localizedDescription)") }
            return nil
        }
        do { return try JSONDecoder().decode(StoredLicense.self, from: data) } catch {
            NSLog("Terminal 1: the saved license is unreadable: \(error.localizedDescription)")
            return nil
        }
    }

    func save(_ license: StoredLicense) throws {
        let data = try JSONEncoder().encode(license)
        var status = SecItemUpdate(query as CFDictionary, [kSecValueData as String: data] as CFDictionary)
        if status == errSecItemNotFound {
            var add = query
            add[kSecValueData as String] = data
            status = SecItemAdd(add as CFDictionary, nil)
        }
        guard status == errSecSuccess else { throw Failure(status: status) }
    }

    func delete() throws {
        let status = SecItemDelete(query as CFDictionary)
        guard status == errSecSuccess || status == errSecItemNotFound else { throw Failure(status: status) }
    }
}

/// Lemon Squeezy's license API: no API key needed, the license key is the credential.
struct LSClient {
    struct Reply: Equatable {
        var check: LicenseState.Check
        var instanceID: String?
    }

    static let base = "https://api.lemonsqueezy.com/v1/licenses"
    static let unreachable = "I could not reach the license server. Check your connection and try again."

    /// Sends one request, answering the body and the HTTP status. Replaced in tests.
    var send: (URLRequest) async throws -> (Data, Int) = { request in
        let (data, response) = try await URLSession.shared.data(for: request)
        return (data, (response as? HTTPURLResponse)?.statusCode ?? 0)
    }
    var storeID = LicenseConfig.storeID
    var productIDs = LicenseConfig.productIDs

    static func request(_ path: String, _ fields: [(String, String)]) -> URLRequest {
        var r = URLRequest(url: URL(string: "\(base)/\(path)")!, timeoutInterval: 10)
        r.httpMethod = "POST"
        r.setValue("application/json", forHTTPHeaderField: "Accept")
        r.setValue("application/x-www-form-urlencoded", forHTTPHeaderField: "Content-Type")
        let unreserved = CharacterSet(charactersIn: "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~")
        r.httpBody = Data(fields.map { "\($0.0)=\($0.1.addingPercentEncoding(withAllowedCharacters: unreserved) ?? "")" }.joined(separator: "&").utf8)
        return r
    }

    /// What an LS validate answer means for us. A 429, a 5xx or a body that is not JSON is "could not ask", not "no".
    static func judge(_ data: Data, status: Int, allowInactive: Bool = false, storeID: Int?, productIDs: Set<Int>) -> LicenseState.Check {
        guard status != 429, status < 500, let json = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any] else { return .unreachable }
        let license = json["license_key"] as? [String: Any]
        let state = license?["status"] as? String
        if state == "expired" { return .rejected("That license has expired.") }
        if state == "disabled" { return .rejected("That license has been turned off.") }
        guard json["valid"] as? Bool == true else { return .rejected("That license key is not valid.") }
        let meta = json["meta"] as? [String: Any]
        if let storeID, meta?["store_id"] as? Int != storeID { return .rejected("That license key is not for Terminal 1.") }
        if !productIDs.isEmpty, !productIDs.contains(meta?["product_id"] as? Int ?? -1) { return .rejected("That license key is not for Terminal 1.") }
        guard state == "active" || (allowInactive && state == "inactive") else { return .rejected("That license key has not been activated yet.") }
        let name = "\(meta?["variant_name"] as? String ?? "") \(meta?["product_name"] as? String ?? "")"
        return .valid(name.localizedCaseInsensitiveContains("team") ? .team : .pro)
    }

    func validate(key: String, instanceID: String?) async -> LicenseState.Check {
        var fields = [("license_key", key)]
        if let instanceID { fields.append(("instance_id", instanceID)) }
        return await ask("validate", fields).map { Self.judge($0.0, status: $0.1, storeID: storeID, productIDs: productIDs) } ?? .unreachable
    }

    /// Checks the key is ours first, so a stranger's LS key does not use up one of its seats.
    func activate(key: String, name: String = "Terminal 1 Mac") async -> Reply {
        guard let pre = await ask("validate", [("license_key", key)]) else { return Reply(check: .unreachable) }
        let check = Self.judge(pre.0, status: pre.1, allowInactive: true, storeID: storeID, productIDs: productIDs)
        guard case .valid = check else { return Reply(check: check) }
        guard let (data, status) = await ask("activate", [("license_key", key), ("instance_name", name)]) else { return Reply(check: .unreachable) }
        let json = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any]
        guard status != 429, status < 500, json != nil else { return Reply(check: .unreachable) }
        guard json?["activated"] as? Bool == true, let id = (json?["instance"] as? [String: Any])?["id"] as? String else {
            return Reply(check: .rejected(String((json?["error"] as? String ?? "That license key could not be activated.").prefix(200))))
        }
        return Reply(check: check, instanceID: id)
    }

    /// True when LS answered (even with a no), false when it could not be reached.
    func deactivate(key: String, instanceID: String) async -> Bool {
        guard let (data, status) = await ask("deactivate", [("license_key", key), ("instance_id", instanceID)]), status != 429, status < 500 else { return false }
        if (try? JSONSerialization.jsonObject(with: data) as? [String: Any])?["deactivated"] as? Bool != true { NSLog("Terminal 1: LS did not deactivate the instance (HTTP \(status))") }
        return true
    }

    private func ask(_ path: String, _ fields: [(String, String)]) async -> (Data, Int)? {
        do { return try await send(Self.request(path, fields)) } catch {
            NSLog("Terminal 1: license server unreachable: \((error as NSError).domain) \((error as NSError).code)")  // never the request, it holds the key
            return nil
        }
    }
}

/// The app's one license: what is saved, what LS last said, and the buttons in Settings.
@MainActor
final class LicenseManager {
    private(set) var state: LicenseState = .unlicensed
    /// Called with the new key and activation (nil when removed) after Activate or Deactivate, so the page can pick them up.
    var onKeyChange: ((LicenseGrant?) -> Void)?
    var key: String? { stored?.key }
    var grant: LicenseGrant? { stored.map { LicenseGrant(key: $0.key, instanceID: $0.instanceID) } }

    private let store: LicenseStore
    private let ls: LSClient
    private var stored: StoredLicense?

    init(store: LicenseStore = LicenseStore(), ls: LSClient = LSClient()) {
        self.store = store
        self.ls = ls
        stored = store.load()
        if let stored { state = LicenseState.resolve(.unreachable, last: stored.last, now: Date()) }
    }

    func validateOnLaunch() async {
        guard var s = stored else { return }
        let check = await ls.validate(key: s.key, instanceID: s.instanceID)
        state = LicenseState.resolve(check, last: s.last, now: Date())
        switch check {
        case .valid(let plan): (s.plan, s.validatedAt) = (plan, Date())
        case .rejected: (s.plan, s.validatedAt) = (nil, nil)  // LS said no: no grace later
        case .unreachable: return
        }
        save(s)
    }

    /// Nil on success, else a sentence for Settings. Replaces any license already saved.
    func activate(_ rawKey: String) async -> String? {
        let key = rawKey.trimmingCharacters(in: .whitespacesAndNewlines)
        let reply = await ls.activate(key: key)
        guard case .valid(let plan) = reply.check, let id = reply.instanceID else {
            if case .rejected(let why) = reply.check { return why }
            return LSClient.unreachable
        }
        let new = StoredLicense(key: key, instanceID: id, plan: plan, validatedAt: Date())
        do { try store.save(new) } catch {
            _ = await ls.deactivate(key: key, instanceID: id)  // do not keep a seat we cannot remember
            return "Could not save the license in the Keychain: \(error.localizedDescription)"
        }
        let old = stored
        stored = new
        state = .active(plan: plan, validatedAt: new.validatedAt!)
        if let old, !(await ls.deactivate(key: old.key, instanceID: old.instanceID)) { NSLog("Terminal 1: the previous activation could not be released") }
        onKeyChange?(LicenseGrant(key: key, instanceID: id))
        return nil
    }

    /// Nil on success. If LS cannot be reached the seat would stay taken, so the license stays too.
    func deactivate() async -> String? {
        guard let s = stored else { return nil }
        guard await ls.deactivate(key: s.key, instanceID: s.instanceID) else { return LSClient.unreachable }
        do { try store.delete() } catch { return "Could not remove the license from the Keychain: \(error.localizedDescription)" }
        stored = nil
        state = .unlicensed
        onKeyChange?(nil)
        return nil
    }

    private func save(_ s: StoredLicense) {
        do { try store.save(s); stored = s } catch { NSLog("Terminal 1: could not save the license: \(error.localizedDescription)") }
    }
}
