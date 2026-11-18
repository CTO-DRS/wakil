package com.drsai.assistant

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import com.drsai.assistant.ui.navigation.DrsNavHost
import com.drsai.assistant.ui.theme.DrsTheme

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        val container = (application as DrsApp).container
        setContent {
            DrsTheme {
                DrsNavHost(container)
            }
        }
    }
}
