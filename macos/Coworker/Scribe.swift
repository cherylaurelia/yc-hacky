@preconcurrency import AVFoundation

enum ScribeEvent: Equatable {
    case started
    case partial(String)
    case committed(String)
    case failed(String)
}

/// ElevenLabs realtime Scribe over a websocket. The app only ever holds a single-use token, never the API key.
enum ScribeProtocol {
    /// `language` nil lets Scribe detect it. Manual commit: the transcript is final when the talk key is released.
    static func url(token: String, sampleRate: Int, language: String? = nil) -> URL {
        var c = URLComponents(string: "wss://api.elevenlabs.io/v1/speech-to-text/realtime")!
        c.queryItems = [("model_id", "scribe_v2_realtime"), ("audio_format", "pcm_\(sampleRate)"), ("commit_strategy", "manual"), ("token", token)]
            .map { URLQueryItem(name: $0, value: $1) } + (language.map { [URLQueryItem(name: "language_code", value: $0)] } ?? [])
        return c.url!
    }

    static func audioMessage(_ pcm: Data, sampleRate: Int, commit: Bool) -> String {
        let body: [String: Any] = ["message_type": "input_audio_chunk", "audio_base_64": pcm.base64EncodedString(), "commit": commit, "sample_rate": sampleRate]
        return String(decoding: (try? JSONSerialization.data(withJSONObject: body)) ?? Data(), as: UTF8.self)
    }

    static func parse(_ message: String) -> ScribeEvent? {
        guard let json = (try? JSONSerialization.jsonObject(with: Data(message.utf8))) as? [String: Any],
              let type = json["message_type"] as? String else { return nil }
        if type.hasSuffix("error") || json["error"] != nil { return .failed(json["error"] as? String ?? type) }
        switch type {
        case "session_started": return .started
        case "partial_transcript": return .partial(json["text"] as? String ?? "")
        case "committed_transcript", "committed_transcript_with_timestamps": return .committed(json["text"] as? String ?? "")
        default: return nil
        }
    }
}

/// One dictation: `start()` when the key goes down, `finish()` when it comes up. Delivers the committed text, or a failure, once.
/// Audio is captured from the first instant and queued until the socket is ready, so the first words are not lost to the token fetch.
@MainActor
final class ScribeClient {
    private static let sampleRate = 16000
    private static let answerTimeout: TimeInterval = 10

    var onCommitted: ((String) -> Void)?
    var onFailure: ((String) -> Void)?

    private let token: () async throws -> String
    private let language: String?
    private let engine = AVAudioEngine()
    private var tapped = false
    private var socket: URLSessionWebSocketTask?
    private var ready = false
    private var released = false
    private var done = false
    private var waiting: [String] = []  // messages that arrived before session_started
    private var timeout: DispatchWorkItem?

    /// `token` returns a single-use Scribe token; the app gets it through the signed-in page, so the API key stays on the server.
    init(language: String, token: @escaping () async throws -> String) {
        self.token = token
        self.language = language == "auto" ? nil : language
    }

    func start() {
        guard startAudio() else { return }
        Task {
            do { open(try await token()) } catch { fail("Could not start dictation: \(error.localizedDescription)") }
        }
    }

    /// Key released: stop the mic, then commit behind the audio that is already on its way.
    func finish() {
        guard !done else { return }
        stopAudio()
        DispatchQueue.main.async { MainActor.assumeIsolated { self.commit() } }
    }

    func cancel() {
        guard !done else { return }
        done = true
        stopAudio()
        socket?.cancel(with: .goingAway, reason: nil)
    }

    private func commit() {
        guard !done else { return }
        released = true
        send(Data(), commit: true)
        let work = DispatchWorkItem { [weak self] in MainActor.assumeIsolated { self?.fail("Scribe did not answer in time.") } }
        timeout = work
        DispatchQueue.main.asyncAfter(deadline: .now() + Self.answerTimeout, execute: work)
    }

    private func open(_ token: String) {
        guard !done else { return }
        let task = URLSession.shared.webSocketTask(with: ScribeProtocol.url(token: token, sampleRate: Self.sampleRate, language: language))
        socket = task
        task.resume()
        listen(task)
    }

    private func listen(_ task: URLSessionWebSocketTask) {
        task.receive { result in
            DispatchQueue.main.async { MainActor.assumeIsolated { self.received(result, from: task) } }
        }
    }

    private func received(_ result: Result<URLSessionWebSocketTask.Message, Error>, from task: URLSessionWebSocketTask) {
        guard !done else { return }
        switch result {
        case .failure(let error):
            fail("Lost the connection to Scribe: \(error.localizedDescription)")
        case .success(let message):
            if case .string(let text) = message, let event = ScribeProtocol.parse(text) { handle(event) }
            if !done { listen(task) }
        }
    }

    private func handle(_ event: ScribeEvent) {
        switch event {
        case .started:
            ready = true
            waiting.forEach(write)
            waiting = []
        case .committed(let text):
            guard released else { return }
            done = true
            timeout?.cancel()
            socket?.cancel(with: .normalClosure, reason: nil)
            onCommitted?(text)
        case .failed(let message):
            fail(message)
        case .partial:
            break
        }
    }

    private func send(_ pcm: Data, commit: Bool) {
        guard !done else { return }
        let message = ScribeProtocol.audioMessage(pcm, sampleRate: Self.sampleRate, commit: commit)
        if ready { write(message) } else { waiting.append(message) }
    }

    private func write(_ message: String) {
        socket?.send(.string(message)) { error in
            guard let error else { return }
            DispatchQueue.main.async { MainActor.assumeIsolated { self.fail("Could not send audio to Scribe: \(error.localizedDescription)") } }
        }
    }

    private func fail(_ message: String) {
        guard !done else { return }
        done = true
        timeout?.cancel()
        stopAudio()
        socket?.cancel(with: .goingAway, reason: nil)
        onFailure?(message)
    }

    // MARK: microphone

    private func startAudio() -> Bool {
        guard AVCaptureDevice.authorizationStatus(for: .audio) == .authorized else {
            fail("Microphone access is off. Turn Coworker on in System Settings > Privacy & Security > Microphone.")
            return false
        }
        let input = engine.inputNode
        let inFormat = input.outputFormat(forBus: 0)
        guard inFormat.sampleRate > 0, let outFormat = AVAudioFormat(commonFormat: .pcmFormatInt16, sampleRate: Double(Self.sampleRate), channels: 1, interleaved: true),
              let converter = AVAudioConverter(from: inFormat, to: outFormat) else {
            fail("No usable microphone found.")
            return false
        }
        input.installTap(onBus: 0, bufferSize: 4096, format: inFormat) { [weak self] buffer, _ in
            guard let pcm = Self.convert(buffer, with: converter, to: outFormat) else { return }
            DispatchQueue.main.async { MainActor.assumeIsolated { self?.send(pcm, commit: false) } }
        }
        tapped = true
        do {
            try engine.start()
            return true
        } catch {
            fail("Could not start the microphone: \(error.localizedDescription)")
            return false
        }
    }

    private func stopAudio() {
        guard tapped else { return }
        tapped = false
        engine.stop()
        engine.inputNode.removeTap(onBus: 0)
    }

    /// Runs on the audio thread: whatever the mic delivers (often 48 kHz float) becomes 16 kHz mono Int16 little-endian.
    private nonisolated static func convert(_ buffer: AVAudioPCMBuffer, with converter: AVAudioConverter, to format: AVAudioFormat) -> Data? {
        let capacity = AVAudioFrameCount(Double(buffer.frameLength) * format.sampleRate / buffer.format.sampleRate) + 64
        guard let out = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: capacity) else { return nil }
        var supplied = false
        var error: NSError?
        converter.convert(to: out, error: &error) { _, status in
            if supplied { status.pointee = .noDataNow; return nil }
            supplied = true
            status.pointee = .haveData
            return buffer
        }
        guard error == nil, out.frameLength > 0, let samples = out.int16ChannelData?[0] else { return nil }
        return Data(bytes: samples, count: Int(out.frameLength) * MemoryLayout<Int16>.size)
    }
}
