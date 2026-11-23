import Foundation
import Network

struct RelayEvent {
    var id: String
    var agent: String
    var kind: String
    var text: String
    /// The event as the agent sent it, plus its id, ready to hand to the page.
    var json: String

    var alert: BoardAlert { BoardAlert(agent: agent, text: text, id: id) }
}

/// The local relay: agents on this Mac post events and long-poll for your answer over plain HTTP on 127.0.0.1, with no GitHub in the path.
/// One request per connection, JSON bodies. Everything except /v1/health needs `Authorization: Bearer <token>`.
final class RelayServer {
    private struct Request {
        var method: String
        var path: String
        var query: [String: String]
        var headers: [String: String]
        var body: Data
    }

    private struct StartFailed: LocalizedError {
        var errorDescription: String? { "the relay could not listen on 127.0.0.1" }
    }

    private static let maxRequest = 1 << 20
    private static let maxWait = 30
    private static let reasons = [200: "OK", 204: "No Content", 400: "Bad Request", 401: "Unauthorized", 404: "Not Found"]

    /// Called on the relay's queue, before the agent gets its id back.
    var onEvent: ((RelayEvent) -> Void)?

    private let token: String
    private let queue = DispatchQueue(label: "coworker.relay")
    private var listener: NWListener?
    // Touched only on `queue`.
    private static let maxPending = 64
    private var unparsed = Set<ObjectIdentifier>()  // connections still sending their request
    private var answers: [String: String] = [:]
    private var waiting: [String: [NWConnection]] = [:]

    init(token: String) { self.token = token }

    static func makeToken() -> String { (0..<32).map { _ in String(format: "%02x", UInt8.random(in: .min ... .max)) }.joined() }

    /// Port 0 picks a free one. Returns once the listener is up, with the port it got.
    func start(port: UInt16) throws -> UInt16 {
        let params = NWParameters.tcp
        params.requiredLocalEndpoint = .hostPort(host: .ipv4(.loopback), port: NWEndpoint.Port(rawValue: port) ?? .any)
        let listener = try NWListener(using: params)
        let up = DispatchSemaphore(value: 0)
        var failure: NWError?
        listener.stateUpdateHandler = { state in
            switch state {
            case .ready: up.signal()
            case .failed(let error): failure = error; up.signal()
            default: break
            }
        }
        listener.newConnectionHandler = { [weak self] in self?.serve($0) }
        listener.start(queue: queue)
        guard up.wait(timeout: .now() + 5) == .success, failure == nil, let bound = listener.port?.rawValue else {
            listener.cancel()
            throw failure ?? StartFailed()
        }
        self.listener = listener
        return bound
    }

    func stop() {
        listener?.cancel()
        listener = nil
    }

    /// Answers an event: wakes its long-poll, and answers any later poll at once.
    func answer(id: String, text: String) {
        queue.async { self.deliver(id, text) }
    }

    static func writeDiscovery(port: UInt16, token: String, to file: URL) throws {
        try FileManager.default.createDirectory(at: file.deletingLastPathComponent(), withIntermediateDirectories: true, attributes: [.posixPermissions: 0o700])
        let data = try JSONSerialization.data(withJSONObject: ["port": Int(port), "token": token])
        guard FileManager.default.createFile(atPath: file.path, contents: data, attributes: [.posixPermissions: 0o600]) else { throw CocoaError(.fileWriteUnknown) }
    }

    /// ~/.coworker/relay.json, or under $COWORKER_HOME, the same place the coworker CLI looks.
    static var discoveryFile: URL {
        let dir = ProcessInfo.processInfo.environment["COWORKER_HOME"].map { URL(fileURLWithPath: $0) }
            ?? FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent(".coworker")
        return dir.appendingPathComponent("relay.json")
    }

    // MARK: HTTP

    private func serve(_ c: NWConnection) {
        // A local process that opens sockets and never finishes a request must not use up the app's file descriptors.
        guard unparsed.count < Self.maxPending else { return c.cancel() }
        let key = ObjectIdentifier(c)
        unparsed.insert(key)
        c.start(queue: queue)
        receive(c, Data())
        queue.asyncAfter(deadline: .now() + 10) { [weak self] in
            if self?.unparsed.remove(key) != nil { c.cancel() }
        }
    }

    private func receive(_ c: NWConnection, _ received: Data) {
        c.receive(minimumIncompleteLength: 1, maximumLength: 65536) { [weak self] data, _, closed, error in
            guard let self else { return c.cancel() }
            let buffer = received + (data ?? Data())
            switch Self.parse(buffer) {
            case .request(let request):
                unparsed.remove(ObjectIdentifier(c))
                route(request, c)
            case .bad: reply(c, 400, ["error": "bad request"])
            case .incomplete:
                if closed || error != nil || buffer.count > Self.maxRequest { c.cancel() } else { receive(c, buffer) }
            }
        }
    }

    private enum Parsed { case incomplete, bad, request(Request) }

    private static func parse(_ data: Data) -> Parsed {
        guard let end = data.range(of: Data("\r\n\r\n".utf8)) else { return .incomplete }
        let head = String(decoding: data[..<end.lowerBound], as: UTF8.self).components(separatedBy: "\r\n")
        let line = head[0].split(separator: " ")
        guard line.count == 3, let url = URLComponents(string: String(line[1])) else { return .bad }
        var headers: [String: String] = [:]
        for h in head.dropFirst() {
            guard let colon = h.firstIndex(of: ":") else { return .bad }
            headers[h[..<colon].lowercased()] = h[h.index(after: colon)...].trimmingCharacters(in: .whitespaces)
        }
        guard let length = Int(headers["content-length"] ?? "0"), (0...maxRequest).contains(length) else { return .bad }
        let body = data[end.upperBound...]
        guard body.count >= length else { return .incomplete }
        let query = Dictionary((url.queryItems ?? []).map { ($0.name, $0.value ?? "") }, uniquingKeysWith: { $1 })
        return .request(Request(method: String(line[0]), path: url.path, query: query, headers: headers, body: Data(body.prefix(length))))
    }

    private func reply(_ c: NWConnection, _ status: Int, _ json: [String: Any]? = nil) {
        let body = json.flatMap { try? JSONSerialization.data(withJSONObject: $0) }
        let head = "HTTP/1.1 \(status) \(Self.reasons[status] ?? "")\r\nConnection: close\r\n"
            + (body.map { "Content-Type: application/json\r\nContent-Length: \($0.count)\r\n" } ?? "") + "\r\n"
        c.send(content: Data(head.utf8) + (body ?? Data()), contentContext: .finalMessage, isComplete: true, completion: .contentProcessed { _ in c.cancel() })
    }

    // MARK: routes

    private func route(_ r: Request, _ c: NWConnection) {
        if r.method == "GET", r.path == "/v1/health" { return reply(c, 200, ["ok": true]) }
        guard r.headers["authorization"] == "Bearer \(token)" else { return reply(c, 401, ["error": "unauthorized"]) }
        let parts = r.path.split(separator: "/").map(String.init)
        if r.method == "POST", parts == ["v1", "events"] { return postEvent(r.body, c) }
        if parts.count == 4, parts[0] == "v1", parts[1] == "events", parts[3] == "answer" {
            if r.method == "GET" { return getAnswer(parts[2], wait: Int(r.query["wait"] ?? "") ?? 0, c) }
            if r.method == "POST" { return postAnswer(parts[2], r.body, c) }
        }
        reply(c, 404, ["error": "not found"])
    }

    private func postEvent(_ body: Data, _ c: NWConnection) {
        guard var json = (try? JSONSerialization.jsonObject(with: body)) as? [String: Any],
              let text = (json["text"] as? String)?.trimmingCharacters(in: .whitespacesAndNewlines), !text.isEmpty else {
            return reply(c, 400, ["error": "send a JSON object with text"])
        }
        let id = UUID().uuidString.lowercased()
        json["id"] = id
        let event = RelayEvent(id: id, agent: json["agent"] as? String ?? "Agent", kind: json["kind"] as? String ?? "done", text: text,
                               json: String(decoding: (try? JSONSerialization.data(withJSONObject: json)) ?? Data(), as: UTF8.self))
        onEvent?(event)
        reply(c, 200, ["id": id])
    }

    private func getAnswer(_ raw: String, wait: Int, _ c: NWConnection) {
        let id = raw.lowercased()  // the page normalizes ids to lowercase; agents poll the id they were given
        if let answer = answers.removeValue(forKey: id) { return reply(c, 200, ["answer": answer]) }
        guard wait > 0 else { return reply(c, 204) }
        waiting[id, default: []].append(c)
        queue.asyncAfter(deadline: .now() + .seconds(min(wait, Self.maxWait))) { [weak self] in
            guard let self, let i = waiting[id]?.firstIndex(where: { $0 === c }) else { return }  // answered meanwhile
            waiting[id]?.remove(at: i)
            reply(c, 204)
        }
    }

    private func postAnswer(_ id: String, _ body: Data, _ c: NWConnection) {
        guard let text = ((try? JSONSerialization.jsonObject(with: body)) as? [String: Any])?["answer"] as? String else {
            return reply(c, 400, ["error": "send {\"answer\": \"...\"}"])
        }
        deliver(id, text)
        reply(c, 200, ["ok": true])
    }

    private func deliver(_ raw: String, _ text: String) {
        let id = raw.lowercased()
        let polls = waiting.removeValue(forKey: id) ?? []
        for c in polls { reply(c, 200, ["answer": text]) }
        if polls.isEmpty { answers[id] = text }  // kept until the agent's next poll reads it
    }
}
