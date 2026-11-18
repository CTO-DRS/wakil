package com.drsai.assistant

import android.app.Application
import com.drsai.assistant.di.AppContainer

class DrsApp : Application() {
    lateinit var container: AppContainer
        private set

    override fun onCreate() {
        super.onCreate()
        container = AppContainer(this)
    }
}
