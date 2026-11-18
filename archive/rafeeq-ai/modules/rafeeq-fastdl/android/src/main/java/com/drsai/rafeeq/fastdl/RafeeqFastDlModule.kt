// Copyright (c) 2026 DRS AI. All rights reserved.
package com.drsai.rafeeq.fastdl

import android.Manifest
import android.net.Uri
import android.os.Build
import expo.modules.interfaces.permissions.PermissionsResponseListener
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.records.Field
import expo.modules.kotlin.records.Record
import java.io.File
import java.io.RandomAccessFile
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors
import java.util.concurrent.ScheduledExecutorService
import java.util.concurrent.TimeUnit

class SegmentArgs : Record {
  @Field val taskId: String = ""
  @Field val segmentId: Int = 0
  @Field val url: String = ""
  @Field val path: String = ""
  @Field val start: Double = 0.0
  @Field val pos: Double = 0.0
  @Field val end: Double = -1.0
  @Field val maxRetries: Int = 5
}

/**
 * Byte-moving primitives for multi-connection ("fast") model downloads. Planning,
 * work stealing and resume decisions live in TypeScript (src/models/fastdl); this
 * module probes URLs, preallocates the .part file, runs ranges on worker threads,
 * reports their positions about four times a second, and keeps the process alive
 * with a foreground service while downloads run.
 */
class RafeeqFastDlModule : Module() {
  private val io: ExecutorService = Executors.newCachedThreadPool()
  private var ticker: ScheduledExecutorService? = null
  private val tasks = ConcurrentHashMap<String, ConcurrentHashMap<Int, SegmentWorker>>()
  private val keepAliveKeys = ConcurrentHashMap.newKeySet<String>()

  private fun toFile(path: String): File {
    return if (path.startsWith("file:")) File(Uri.parse(path).path ?: path.removePrefix("file://")) else File(path)
  }

  private fun ensureTicker() {
    if (ticker != null) return
    val t = Executors.newSingleThreadScheduledExecutor()
    t.scheduleWithFixedDelay({ emitProgress() }, 250, 250, TimeUnit.MILLISECONDS)
    ticker = t
  }

  private fun emitProgress() {
    for ((taskId, workers) in tasks) {
      if (workers.isEmpty()) continue
      val positions = workers.values.map { mapOf("id" to it.segmentId, "pos" to it.pos.toDouble()) }
      try {
        sendEvent("onProgress", mapOf("taskId" to taskId, "positions" to positions))
      } catch (_: Throwable) {
      }
    }
  }

  override fun definition() = ModuleDefinition {
    Name("RafeeqFastDl")

    Events("onProgress")

    AsyncFunction("probe") { url: String, promise: Promise ->
      io.execute {
        try {
          promise.resolve(Http.probe(url))
        } catch (e: HttpStatusException) {
          promise.reject("HTTP_${e.status}", "HTTP_${e.status}", null)
        } catch (e: Throwable) {
          promise.reject("NETWORK_ERROR", "NETWORK_ERROR: ${e.message}", null)
        }
      }
    }

    AsyncFunction("preallocate") { path: String, size: Double, promise: Promise ->
      io.execute {
        try {
          val f = toFile(path)
          f.parentFile?.mkdirs()
          RandomAccessFile(f, "rw").use { raf ->
            val target = if (size < 0) 0L else size.toLong()
            if (size < 0 || raf.length() != target) raf.setLength(target)
          }
          promise.resolve(null)
        } catch (e: Throwable) {
          promise.reject("IO_ERROR", "IO_ERROR: ${e.message}", null)
        }
      }
    }

    AsyncFunction("runSegment") { args: SegmentArgs, promise: Promise ->
      val workers = tasks.getOrPut(args.taskId) { ConcurrentHashMap() }
      val worker = SegmentWorker(
        args.taskId,
        args.segmentId,
        args.url,
        toFile(args.path),
        args.pos.toLong(),
        args.end.toLong(),
        args.maxRetries
      ) { w, completed, error ->
        tasks[w.taskId]?.let { m ->
          m.remove(w.segmentId, w)
          if (m.isEmpty()) tasks.remove(w.taskId, m)
        }
        if (error != null) promise.reject(error, error, null)
        else promise.resolve(mapOf("completed" to completed, "pos" to w.pos.toDouble()))
      }
      workers[args.segmentId]?.stop()
      workers[args.segmentId] = worker
      ensureTicker()
      io.execute(worker)
    }

    Function("setSegmentEnd") { taskId: String, segmentId: Int, newEnd: Double ->
      tasks[taskId]?.get(segmentId)?.setEnd(newEnd.toLong()) ?: false
    }

    Function("stopTask") { taskId: String ->
      val workers = tasks[taskId]
      if (workers != null) for (w in workers.values) w.stop()
    }

    Function("startKeepAlive") { key: String, title: String ->
      val ctx = appContext.reactContext?.applicationContext
      if (ctx == null) {
        false
      } else {
        keepAliveKeys.add(key)
        FastDlService.start(ctx, title)
      }
    }

    Function("updateKeepAlive") { key: String, title: String, percent: Int ->
      val ctx = appContext.reactContext?.applicationContext
      if (ctx != null && keepAliveKeys.contains(key)) FastDlService.update(ctx, title, percent)
    }

    Function("stopKeepAlive") { key: String ->
      keepAliveKeys.remove(key)
      val ctx = appContext.reactContext?.applicationContext
      if (ctx != null && keepAliveKeys.isEmpty()) FastDlService.stop(ctx)
    }

    AsyncFunction("requestNotificationPermission") { promise: Promise ->
      if (Build.VERSION.SDK_INT < 33) {
        promise.resolve(true)
        return@AsyncFunction
      }
      val perms = appContext.permissions
      if (perms == null) {
        promise.resolve(false)
        return@AsyncFunction
      }
      if (perms.hasGrantedPermissions(Manifest.permission.POST_NOTIFICATIONS)) {
        promise.resolve(true)
        return@AsyncFunction
      }
      try {
        perms.askForPermissions(
          PermissionsResponseListener { _ ->
            promise.resolve(perms.hasGrantedPermissions(Manifest.permission.POST_NOTIFICATIONS))
          },
          Manifest.permission.POST_NOTIFICATIONS
        )
      } catch (_: Throwable) {
        promise.resolve(false)
      }
    }

    OnDestroy {
      for (workers in tasks.values) workers.values.forEach { it.stop() }
      tasks.clear()
      ticker?.shutdownNow()
      ticker = null
      val ctx = appContext.reactContext?.applicationContext
      if (ctx != null && keepAliveKeys.isNotEmpty()) FastDlService.stop(ctx)
      keepAliveKeys.clear()
    }
  }
}
