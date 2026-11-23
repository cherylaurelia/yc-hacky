// Spec: the local relay. Agents on this Mac post events and long-poll for your answer, with no GitHub in the path.
// Needs macos/Coworker/Relay.swift (+ Pill.swift for BoardAlert):
//   final class RelayServer { init(token:); var onEvent: ((RelayEvent) -> Void)?; func start(port: UInt16) throws -> UInt16;
//     func answer(id:text:); func stop(); static func writeDiscovery(port:token:to:) throws }
//   struct RelayEvent { id, agent, kind, text: String; var alert: BoardAlert }
// HTTP on 127.0.0.1 (the CLI and hooks speak exactly this):
//   GET  /v1/health                      -> 200 {"ok":true}            (no auth)
//   POST /v1/events {agent,kind,text,..} -> 200 {"id":"..."}           (Authorization: Bearer <token>, else 401)
//   GET  /v1/events/<id>/answer?wait=N   -> 200 {"answer":"..."} once answered, else 204 after N seconds
//   POST /v1/events/<id>/answer {answer} -> 200                       (another client answers, e.g. the page)
// Discovery: ~/.coworker/relay.json {"port":N,"token":"..."}, mode 0600.
import Foundation

@main struct Spec {
    static func main() {
        var fails = 0
        func check(_ ok: Bool, _ m: String) { print(ok ? "ok   \(m)" : "FAIL \(m)"); if !ok { fails += 1 } }

        let server = RelayServer(token: "t0k")
        let lock = NSLock()
        var got: [RelayEvent] = []
        server.onEvent = { e in lock.lock(); got.append(e); lock.unlock() }
        guard let port = try? server.start(port: 0), port > 0 else { print("FAIL relay starts on a free port"); exit(1) }

        func call(_ method: String, _ path: String, token: String? = "t0k", body: [String: Any]? = nil) -> (Int, [String: Any]) {
            var r = URLRequest(url: URL(string: "http://127.0.0.1:\(port)\(path)")!, timeoutInterval: 15)
            r.httpMethod = method
            if let token { r.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization") }
            if let body { r.httpBody = try? JSONSerialization.data(withJSONObject: body); r.setValue("application/json", forHTTPHeaderField: "Content-Type") }
            let sem = DispatchSemaphore(value: 0)
            var out: (Int, [String: Any]) = (0, [:])
            URLSession.shared.dataTask(with: r) { d, resp, _ in
                out = ((resp as? HTTPURLResponse)?.statusCode ?? 0, d.flatMap { try? JSONSerialization.jsonObject(with: $0) as? [String: Any] } ?? [:])
                sem.signal()
            }.resume()
            sem.wait()
            return out
        }

        let h = call("GET", "/v1/health", token: nil)
        check(h.0 == 200 && h.1["ok"] as? Bool == true, "health needs no token")
        check(call("POST", "/v1/events", token: nil, body: ["agent": "x", "kind": "done", "text": "t"]).0 == 401, "events need the token")
        check(call("POST", "/v1/events", token: "wrong", body: ["agent": "x", "kind": "done", "text": "t"]).0 == 401, "a wrong token is refused")

        let p = call("POST", "/v1/events", body: ["agent": "Sam's Claude", "kind": "approval", "text": "npm run migrate"])
        let id = p.1["id"] as? String ?? ""
        check(p.0 == 200 && !id.isEmpty, "an event gets an id")
        lock.lock(); let first = got.first; lock.unlock()
        check(first?.kind == "approval" && first?.agent == "Sam's Claude" && first?.id == id, "the app hears the event")
        check(first?.alert == BoardAlert(agent: "Sam's Claude", text: "npm run migrate", id: id), "the event becomes a pill alert")

        var t0 = Date()
        let none = call("GET", "/v1/events/\(id)/answer?wait=1")
        let waited = Date().timeIntervalSince(t0)
        check(none.0 == 204 && waited > 0.7 && waited < 3, "no answer: 204 after the wait")
        check(call("GET", "/v1/events/\(id)/answer?wait=0", token: nil).0 == 401, "answers need the token")

        DispatchQueue.global().asyncAfter(deadline: .now() + 0.2) { server.answer(id: id, text: "allow") }
        t0 = Date()
        let a = call("GET", "/v1/events/\(id)/answer?wait=5")
        check(a.0 == 200 && a.1["answer"] as? String == "allow", "the long poll gets the answer")
        check(Date().timeIntervalSince(t0) < 1.0, "within a second of answering")

        let id2 = call("POST", "/v1/events", body: ["agent": "Sam's Codex", "kind": "question", "text": "202 or 200?"]).1["id"] as? String ?? ""
        check(call("POST", "/v1/events/\(id2)/answer", body: ["answer": "202"]).0 == 200, "another client can answer")
        let a2 = call("GET", "/v1/events/\(id2)/answer?wait=0")
        check(a2.0 == 200 && a2.1["answer"] as? String == "202", "and the agent reads it")

        let dir = FileManager.default.temporaryDirectory.appendingPathComponent("relay-\(UUID().uuidString)")
        let file = dir.appendingPathComponent("relay.json")
        do {
            try RelayServer.writeDiscovery(port: port, token: "t0k", to: file)
            let j = (try JSONSerialization.jsonObject(with: Data(contentsOf: file))) as? [String: Any] ?? [:]
            let mode = ((try FileManager.default.attributesOfItem(atPath: file.path))[.posixPermissions] as? NSNumber)?.intValue ?? 0
            check((j["port"] as? Int) == Int(port) && j["token"] as? String == "t0k", "discovery file has port and token")
            check(mode & 0o077 == 0, "discovery file is private (0600)")
        } catch {
            check(false, "discovery file: \(error)")
        }
        server.stop()
        exit(fails == 0 ? 0 : 1)
    }
}
