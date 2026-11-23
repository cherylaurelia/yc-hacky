import Foundation
import JavaScriptCore

// Logic for the license: the offline grace rule, reading Lemon Squeezy's answers, the activate/deactivate calls and the script
// that hands the key to the page. No network and no Keychain. Build and run with macos/test.sh
@main
struct LicenseLogicTest {
    static var failed = 0

    static func check<T: Equatable>(_ name: String, _ got: T, _ want: T) {
        if got == want { print("ok   \(name)") } else { failed += 1; print("FAIL \(name)\n  want \(want)\n  got  \(got)") }
    }

    static let t0 = Date(timeIntervalSince1970: 1_800_000_000)
    static let day: TimeInterval = 86_400

    static func body(_ json: [String: Any]) -> Data { try! JSONSerialization.data(withJSONObject: json) }
    static func answer(valid: Bool = true, status: String = "active", store: Int = 111, product: Int = 10, variant: String = "Pro Monthly") -> Data {
        body(["valid": valid, "error": NSNull(), "license_key": ["status": status], "meta": ["store_id": store, "product_id": product, "variant_name": variant, "product_name": "Terminal 1"]])
    }
    static func judge(_ data: Data, status: Int = 200, allowInactive: Bool = false) -> LicenseState.Check {
        LSClient.judge(data, status: status, allowInactive: allowInactive, storeID: 111, productIDs: [10, 20])
    }

    /// An LSClient whose server is a closure: answers each path with the next canned reply and records what it was sent.
    final class Fake {
        var replies: [String: [(Data, Int)]]
        var sent: [(path: String, body: String)] = []
        var down = false
        init(_ replies: [String: [(Data, Int)]]) { self.replies = replies }
        var client: LSClient {
            var c = LSClient(storeID: 111, productIDs: [10, 20])
            c.send = { [self] request in
                let path = request.url!.lastPathComponent
                sent.append((path, String(decoding: request.httpBody ?? Data(), as: UTF8.self)))
                if down { throw URLError(.notConnectedToInternet) }
                var queue = replies[path] ?? []
                let reply = queue.count > 1 ? queue.removeFirst() : (queue.first ?? (Data("{}".utf8), 404))
                replies[path] = queue
                return reply
            }
            return c
        }
    }

    static func main() async {
        // The 7-day offline grace.
        let last = (plan: LicensePlan.pro, at: t0)
        check("a yes from LS is active now", LicenseState.resolve(.valid(.team), last: nil, now: t0 + day), .active(plan: .team, validatedAt: t0 + day))
        check("a no from LS is invalid even inside the grace", LicenseState.resolve(.rejected("That license has expired."), last: last, now: t0 + day), .invalid(reason: "That license has expired."))
        check("unreachable an hour after a yes is offline grace", LicenseState.resolve(.unreachable, last: last, now: t0 + 3600), .offlineGrace(plan: .pro, validatedAt: t0))
        check("unreachable on day 6 is still grace", LicenseState.resolve(.unreachable, last: last, now: t0 + 6 * day + 86_000), .offlineGrace(plan: .pro, validatedAt: t0))
        check("unreachable at 7 days is over", LicenseState.resolve(.unreachable, last: last, now: t0 + 7 * day).unlocksPro, false)
        check("unreachable after 8 days is invalid with a reason", LicenseState.resolve(.unreachable, last: last, now: t0 + 8 * day),
              .invalid(reason: "Terminal 1 could not check your license. Connect to the internet to keep Pro."))
        check("unreachable with no earlier yes is invalid", LicenseState.resolve(.unreachable, last: nil, now: t0).unlocksPro, false)
        check("active and grace unlock Pro", [LicenseState.active(plan: .pro, validatedAt: t0), .offlineGrace(plan: .pro, validatedAt: t0)].map(\.unlocksPro), [true, true])
        check("unlicensed and invalid do not", [LicenseState.unlicensed, .invalid(reason: "x")].map(\.unlocksPro), [false, false])
        check("the summary names the plan", LicenseState.active(plan: .team, validatedAt: t0).summary, "Team is active.")
        check("the summary for invalid is the reason", LicenseState.invalid(reason: "That license has expired.").summary, "That license has expired.")

        // Reading LS's answers.
        check("an active pro key", judge(answer()), .valid(.pro))
        check("a Team variant is the team plan", judge(answer(variant: "Team seat")), .valid(.team))
        check("another store's key is rejected", judge(answer(store: 999)), .rejected("That license key is not for Terminal 1."))
        check("another product is rejected", judge(answer(product: 30)), .rejected("That license key is not for Terminal 1."))
        check("expired is rejected", judge(answer(valid: false, status: "expired")), .rejected("That license has expired."))
        check("disabled is rejected", judge(answer(valid: false, status: "disabled")), .rejected("That license has been turned off."))
        check("valid:false is rejected", judge(answer(valid: false, status: "active")), .rejected("That license key is not valid."))
        check("inactive needs activating", judge(answer(status: "inactive")), .rejected("That license key has not been activated yet."))
        check("inactive passes the pre-activation check", judge(answer(status: "inactive"), allowInactive: true), .valid(.pro))
        check("429 is could-not-ask", judge(answer(), status: 429), .unreachable)
        check("503 is could-not-ask", judge(Data("<html>".utf8), status: 503), .unreachable)
        check("a body that is not JSON is could-not-ask", judge(Data("oops".utf8)), .unreachable)
        check("no store configured trusts LS", LSClient.judge(answer(store: 5), status: 200, storeID: nil, productIDs: []), .valid(.pro))

        // The requests.
        let req = LSClient.request("activate", [("license_key", "a b&c=d+e"), ("instance_name", "Terminal 1 Mac")])
        check("form-encoded POST", [req.httpMethod ?? "", req.value(forHTTPHeaderField: "Content-Type") ?? "", req.value(forHTTPHeaderField: "Accept") ?? ""],
              ["POST", "application/x-www-form-urlencoded", "application/json"])
        check("the body is escaped", String(decoding: req.httpBody ?? Data(), as: UTF8.self), "license_key=a%20b%26c%3Dd%2Be&instance_name=Terminal%201%20Mac")
        check("the url", req.url?.absoluteString, "https://api.lemonsqueezy.com/v1/licenses/activate")

        // Activate: validate first, then activate; a stranger's key never reaches activate.
        let ok = Fake(["validate": [(answer(status: "inactive"), 200)], "activate": [(body(["activated": true, "error": NSNull(), "instance": ["id": "inst-1"]]), 200)]])
        let good = await ok.client.activate(key: "KEY")
        check("activate returns the instance id", good, LSClient.Reply(check: .valid(.pro), instanceID: "inst-1"))
        check("activate validates, then activates", ok.sent.map(\.path), ["validate", "activate"])
        check("activate names the instance", ok.sent.last?.body, "license_key=KEY&instance_name=Terminal%201%20Mac")
        let foreign = Fake(["validate": [(answer(store: 999), 200)]])
        check("a foreign key is refused before activation", await foreign.client.activate(key: "KEY").check, .rejected("That license key is not for Terminal 1."))
        check("and activate was never called", foreign.sent.map(\.path), ["validate"])
        let full = Fake(["validate": [(answer(), 200)], "activate": [(body(["activated": false, "error": "This license key has reached the activation limit."]), 400)]])
        check("LS's own message when the limit is reached", await full.client.activate(key: "KEY").check, .rejected("This license key has reached the activation limit."))
        let offline = Fake([:])
        offline.down = true
        check("activate offline", await offline.client.activate(key: "KEY").check, .unreachable)
        check("validate offline", await offline.client.validate(key: "KEY", instanceID: "i"), .unreachable)
        check("deactivate offline keeps the license", await offline.client.deactivate(key: "KEY", instanceID: "i"), false)
        let live = Fake(["validate": [(answer(), 200)], "deactivate": [(body(["deactivated": true]), 200)]])
        check("validate sends the instance id", await live.client.validate(key: "KEY", instanceID: "inst-1"), .valid(.pro))
        check("  in the form", live.sent.last?.body, "license_key=KEY&instance_id=inst-1")
        check("deactivate answers true when LS answered", await live.client.deactivate(key: "KEY", instanceID: "inst-1"), true)
        check("  and sends both ids", live.sent.last.map { [$0.path, $0.body] }, ["deactivate", "license_key=KEY&instance_id=inst-1"])

        // The script that hands the key to the page, run in a real JS engine.
        func run(_ key: String, pageOrigin: String) -> String? {
            let js = JSContext()!
            js.evaluateScript("var window = {}; var location = { origin: \(pageOrigin.debugDescription) };")
            js.evaluateScript(LicenseScript.source(key: key, origin: "https://t1.example.com"))
            let v = js.evaluateScript("window.__T1_LICENSE__")
            return v?.isString == true ? v?.toString() : nil
        }
        let nasty = "ab\"c\\d</script>\n\u{2028}'é"
        check("the page gets the key exactly, quotes and all", run(nasty, pageOrigin: "https://t1.example.com"), nasty)
        check("another origin gets nothing", run("KEY", pageOrigin: "https://evil.example"), nil)
        check("a different port is another origin", run("KEY", pageOrigin: "https://t1.example.com:8443"), nil)
        check("origin of a url", LicenseScript.origin(of: URL(string: "https://t1.example.com/app?embed=1")!), "https://t1.example.com")
        check("origin drops a default port, as location.origin does", LicenseScript.origin(of: URL(string: "https://t1.example.com:443/app")!), "https://t1.example.com")
        check("origin keeps a port", LicenseScript.origin(of: URL(string: "http://127.0.0.1:3000/app")!), "http://127.0.0.1:3000")

        if failed > 0 { print("\(failed) failed"); exit(1) }
        print("all passed")
    }
}
