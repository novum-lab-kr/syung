// 앱 묶음 안 지도(assets/map — plugins/with-map-bundle.js 가 싣는다)를 http://127.0.0.1:<포트> 로 내준다.
// 지도 라이브러리(maplibre)가 http(s) 페이지에서만 Worker 를 띄워 file:// 로는 바탕 지도가 그려지지 않는다(계획서 D5).
// 루프백에서만 받고 GET · HEAD 만 답한다. 지도 폴더 밖 경로는 404.
package com.novumlab.syung.mapserver

import android.content.res.AssetManager
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.BufferedInputStream
import java.io.ByteArrayOutputStream
import java.io.FileNotFoundException
import java.io.IOException
import java.net.InetAddress
import java.net.ServerSocket
import java.net.Socket
import java.net.URLDecoder
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors

class MapServerModule : Module() {
  private var server: MapFileServer? = null

  override fun definition() = ModuleDefinition {
    Name("MapServer")

    // 이미 떠 있으면 그대로 · 닫혔으면 다시 띄운다
    AsyncFunction("start") { port: Int ->
      val context = appContext.reactContext ?: throw Exceptions.ReactContextLost()
      val current = server ?: MapFileServer(context.assets, port).also { server = it }
      try {
        current.start()
      } catch (error: IOException) {
        throw CodedException("ERR_MAP_SERVER", "지도 서버를 띄우지 못했다: ${error.message}", error)
      }
    }

    OnDestroy {
      server?.stop()
    }
  }
}

private const val ROOT = "map"
private const val MAX_HEAD = 64 * 1024

class MapFileServer(private val assets: AssetManager, private val port: Int) {
  private var socket: ServerSocket? = null
  private var workers: ExecutorService? = null

  @Synchronized
  fun start() {
    val open = socket
    if (open != null && !open.isClosed) return
    val listening = ServerSocket(port, 64, InetAddress.getByName("127.0.0.1"))
    val pool = Executors.newFixedThreadPool(6)
    socket = listening
    workers = pool
    Thread({
      while (!listening.isClosed) {
        val client = try { listening.accept() } catch (_: IOException) { break }
        pool.execute { serve(client) }
      }
    }, "syung-map-server").apply { isDaemon = true }.start()
  }

  @Synchronized
  fun stop() {
    try { socket?.close() } catch (_: IOException) {}
    workers?.shutdownNow()
    socket = null
    workers = null
  }

  private fun serve(client: Socket) {
    client.use {
      try {
        client.soTimeout = 10_000
        val input = BufferedInputStream(client.getInputStream())
        val firstLine = readHead(input) ?: return
        val parts = firstLine.split(" ")
        if (parts.size < 2) { send(client, "400 Bad Request", "text/plain", ByteArray(0)); return }
        val method = parts[0]
        if (method != "GET" && method != "HEAD") { send(client, "405 Method Not Allowed", "text/plain", ByteArray(0)); return }
        val relative = resolve(parts[1])
        val body = relative?.let { read(it) }
        if (relative == null || body == null) { send(client, "404 Not Found", "text/plain", ByteArray(0)); return }
        send(client, "200 OK", contentType(relative.substringAfterLast('.', "")), body, headOnly = method == "HEAD")
      } catch (_: IOException) {
        // 웹뷰가 요청을 끊었다 — 할 일 없음
      }
    }
  }

  // 요청 머리(빈 줄까지)를 읽고 첫 줄을 돌려준다 — 몸통이 있는 요청은 받지 않는다
  private fun readHead(input: BufferedInputStream): String? {
    val head = ByteArrayOutputStream()
    var matched = 0
    val ending = byteArrayOf(13, 10, 13, 10)
    while (matched < ending.size) {
      val next = input.read()
      if (next < 0 || head.size() > MAX_HEAD) return null
      head.write(next)
      matched = if (next.toByte() == ending[matched]) matched + 1 else if (next == 13) 1 else 0
    }
    return head.toString(Charsets.UTF_8.name()).substringBefore("\r\n")
  }

  // 요청 경로 → 지도 폴더 안 상대 경로(밖으로 나가는 경로는 null)
  private fun resolve(target: String): String? {
    val pathPart = target.substringBefore('?')
    if (!pathPart.startsWith("/")) return null
    val decoded = try { URLDecoder.decode(pathPart.replace("+", "%2B"), "UTF-8") } catch (_: IllegalArgumentException) { return null }
    val relative = if (decoded == "/") "index.html" else decoded.removePrefix("/")
    val segments = relative.split("/")
    if (segments.any { segment -> segment.isEmpty() || segment == "." || segment == ".." }) return null
    return relative
  }

  private fun read(relative: String): ByteArray? =
    try { assets.open("$ROOT/$relative").use { stream -> stream.readBytes() } } catch (_: FileNotFoundException) { null }

  private fun send(client: Socket, status: String, type: String, body: ByteArray, headOnly: Boolean = false) {
    // 웹 운영과 같이 캐시하지 않는다(자산 주소에 ?v= 를 붙이지 않는 레포 규칙)
    val header = "HTTP/1.1 $status\r\nContent-Type: $type\r\nContent-Length: ${body.size}\r\nCache-Control: no-store\r\nConnection: close\r\n\r\n"
    val output = client.getOutputStream()
    output.write(header.toByteArray(Charsets.UTF_8))
    if (!headOnly) output.write(body)
    output.flush()
  }

  private fun contentType(ext: String): String = when (ext.lowercase()) {
    "html" -> "text/html; charset=utf-8"
    "mjs", "js" -> "text/javascript; charset=utf-8"
    "css" -> "text/css; charset=utf-8"
    "json", "webmanifest" -> "application/json; charset=utf-8"
    "jsonl", "md", "txt" -> "text/plain; charset=utf-8"
    "png" -> "image/png"
    "jpg", "jpeg" -> "image/jpeg"
    "webp" -> "image/webp"
    "svg" -> "image/svg+xml"
    "ico" -> "image/x-icon"
    "wasm" -> "application/wasm"
    "woff2" -> "font/woff2"
    else -> "application/octet-stream"
  }
}
