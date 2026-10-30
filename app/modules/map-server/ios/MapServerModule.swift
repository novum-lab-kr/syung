// 앱 묶음 안 지도(<번들>/map — plugins/with-map-bundle.js 가 싣는다)를 http://127.0.0.1:<포트> 로 내준다.
// 지도 라이브러리(maplibre)가 http(s) 페이지에서만 Worker 를 띄워 file:// 로는 바탕 지도가 그려지지 않는다(계획서 D5).
// 루프백에서만 받고 GET · HEAD 만 답한다. 지도 폴더 밖 경로는 404.
import ExpoModulesCore
import Foundation
import Network

public class MapServerModule: Module {
  private var server: MapFileServer?

  public func definition() -> ModuleDefinition {
    Name("MapServer")

    // 이미 떠 있으면 그대로 · 앱이 쉬는 동안 시스템이 닫았으면 다시 띄운다
    AsyncFunction("start") { (port: Int, promise: Promise) in
      guard let root = Bundle.main.resourceURL?.appendingPathComponent("map", isDirectory: true),
            FileManager.default.fileExists(atPath: root.appendingPathComponent("index.html").path) else {
        promise.reject("ERR_MAP_MISSING", "앱 묶음에 지도 파일이 없다")
        return
      }
      guard let endpointPort = NWEndpoint.Port(rawValue: UInt16(clamping: port)) else {
        promise.reject("ERR_MAP_PORT", "포트 값이 잘못됐다")
        return
      }
      let server = self.server ?? MapFileServer(root: root.standardizedFileURL, port: endpointPort)
      self.server = server
      server.start { error in
        if let error {
          promise.reject("ERR_MAP_SERVER", "지도 서버를 띄우지 못했다: \(error.localizedDescription)")
        } else {
          promise.resolve(nil)
        }
      }
    }

    OnDestroy {
      self.server?.stop()
    }
  }
}

final class MapFileServer {
  private let root: URL
  private let port: NWEndpoint.Port
  private let queue = DispatchQueue(label: "com.novumlab.syung.map-server")
  private var listener: NWListener?

  init(root: URL, port: NWEndpoint.Port) {
    self.root = root
    self.port = port
  }

  func start(completion: @escaping (Error?) -> Void) {
    queue.async {
      if let listener = self.listener, listener.state == .ready {
        completion(nil)
        return
      }
      self.listener?.cancel()
      let parameters = NWParameters.tcp
      parameters.requiredInterfaceType = .loopback
      parameters.allowLocalEndpointReuse = true
      let listener: NWListener
      do {
        listener = try NWListener(using: parameters, on: self.port)
      } catch {
        completion(error)
        return
      }
      var answered = false
      listener.stateUpdateHandler = { [weak self, weak listener] state in
        switch state {
        case .ready:
          if !answered { answered = true; completion(nil) }
        case .failed(let error):
          if !answered { answered = true; completion(error) }
          listener?.cancel()
          if let self, self.listener === listener { self.listener = nil }
        default:
          break
        }
      }
      listener.newConnectionHandler = { [weak self] connection in
        self?.accept(connection)
      }
      self.listener = listener
      listener.start(queue: self.queue)
    }
  }

  func stop() {
    queue.async {
      self.listener?.cancel()
      self.listener = nil
    }
  }

  private func accept(_ connection: NWConnection) {
    connection.start(queue: queue)
    readHead(connection, buffer: Data())
  }

  // 요청 머리(빈 줄까지)만 읽는다 — 몸통이 있는 요청은 받지 않는다
  private func readHead(_ connection: NWConnection, buffer: Data) {
    connection.receive(minimumIncompleteLength: 1, maximumLength: 16 * 1024) { [weak self] data, _, isComplete, error in
      guard let self else { connection.cancel(); return }
      var head = buffer
      if let data { head.append(data) }
      if head.range(of: Data("\r\n\r\n".utf8)) != nil {
        self.respond(connection, head: head)
      } else if error != nil || isComplete || head.count > 64 * 1024 {
        connection.cancel()
      } else {
        self.readHead(connection, buffer: head)
      }
    }
  }

  private func respond(_ connection: NWConnection, head: Data) {
    let firstLine = String(decoding: head.prefix { $0 != 0x0D }, as: UTF8.self)
    let parts = firstLine.split(separator: " ")
    guard parts.count >= 2 else { send(connection, status: "400 Bad Request", type: "text/plain", body: Data()); return }
    let method = String(parts[0])
    guard method == "GET" || method == "HEAD" else {
      send(connection, status: "405 Method Not Allowed", type: "text/plain", body: Data())
      return
    }
    guard let file = resolve(String(parts[1])), let body = try? Data(contentsOf: file) else {
      send(connection, status: "404 Not Found", type: "text/plain", body: Data())
      return
    }
    send(connection, status: "200 OK", type: MapFileServer.contentType(file.pathExtension), body: body, headOnly: method == "HEAD")
  }

  // 요청 경로 → 지도 폴더 안 파일(밖으로 나가는 경로 · 폴더는 nil)
  private func resolve(_ target: String) -> URL? {
    let pathPart = target.split(separator: "?", maxSplits: 1).first.map(String.init) ?? "/"
    guard let decoded = pathPart.removingPercentEncoding, decoded.hasPrefix("/") else { return nil }
    let relative = decoded == "/" ? "index.html" : String(decoded.dropFirst())
    let file = root.appendingPathComponent(relative).standardizedFileURL
    guard file.path.hasPrefix(root.path + "/") else { return nil }
    var isDirectory: ObjCBool = false
    guard FileManager.default.fileExists(atPath: file.path, isDirectory: &isDirectory), !isDirectory.boolValue else { return nil }
    return file
  }

  private func send(_ connection: NWConnection, status: String, type: String, body: Data, headOnly: Bool = false) {
    // 웹 운영과 같이 캐시하지 않는다(자산 주소에 ?v= 를 붙이지 않는 레포 규칙)
    let header = "HTTP/1.1 \(status)\r\nContent-Type: \(type)\r\nContent-Length: \(body.count)\r\nCache-Control: no-store\r\nConnection: close\r\n\r\n"
    var payload = Data(header.utf8)
    if !headOnly { payload.append(body) }
    connection.send(content: payload, completion: .contentProcessed { _ in connection.cancel() })
  }

  static func contentType(_ ext: String) -> String {
    switch ext.lowercased() {
    case "html": return "text/html; charset=utf-8"
    case "mjs", "js": return "text/javascript; charset=utf-8"
    case "css": return "text/css; charset=utf-8"
    case "json", "webmanifest": return "application/json; charset=utf-8"
    case "jsonl", "md", "txt": return "text/plain; charset=utf-8"
    case "png": return "image/png"
    case "jpg", "jpeg": return "image/jpeg"
    case "webp": return "image/webp"
    case "svg": return "image/svg+xml"
    case "ico": return "image/x-icon"
    case "wasm": return "application/wasm"
    case "woff2": return "font/woff2"
    default: return "application/octet-stream"
    }
  }
}
