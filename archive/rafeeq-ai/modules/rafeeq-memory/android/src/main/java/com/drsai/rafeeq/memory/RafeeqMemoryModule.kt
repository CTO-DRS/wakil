// Copyright (c) 2026 DRS AI. All rights reserved.
package com.drsai.rafeeq.memory

import android.app.ActivityManager
import android.content.ComponentCallbacks2
import android.content.Context
import android.content.res.Configuration
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * Exposes the device's available RAM (ActivityManager.MemoryInfo) and forwards
 * onTrimMemory callbacks to JavaScript so the app can release the model under pressure.
 */
class RafeeqMemoryModule : Module() {
  private var callbacks: ComponentCallbacks2? = null

  override fun definition() = ModuleDefinition {
    Name("RafeeqMemory")

    Events("onTrimMemory")

    Function("getMemoryInfo") {
      val ctx = appContext.reactContext ?: throw IllegalStateException("React context unavailable")
      val am = ctx.getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager
      val info = ActivityManager.MemoryInfo()
      am.getMemoryInfo(info)
      mapOf(
        "availMem" to info.availMem.toDouble(),
        "totalMem" to info.totalMem.toDouble(),
        "threshold" to info.threshold.toDouble(),
        "lowMemory" to info.lowMemory
      )
    }

    OnCreate {
      val ctx = appContext.reactContext?.applicationContext ?: return@OnCreate
      val cb = object : ComponentCallbacks2 {
        override fun onTrimMemory(level: Int) {
          try {
            sendEvent("onTrimMemory", mapOf("level" to level))
          } catch (_: Throwable) {
            // JS side may not be ready; ignore.
          }
        }

        override fun onConfigurationChanged(newConfig: Configuration) {}

        @Deprecated("Deprecated in Java")
        override fun onLowMemory() {
          try {
            sendEvent("onTrimMemory", mapOf("level" to 80))
          } catch (_: Throwable) {
          }
        }
      }
      ctx.registerComponentCallbacks(cb)
      callbacks = cb
    }

    OnDestroy {
      val ctx = appContext.reactContext?.applicationContext
      callbacks?.let { ctx?.unregisterComponentCallbacks(it) }
      callbacks = null
    }
  }
}
