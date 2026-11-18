package com.drsai.assistant.ui.navigation

import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument
import com.drsai.assistant.di.AppContainer
import com.drsai.assistant.ui.chat.ChatScreen
import com.drsai.assistant.ui.history.HistoryScreen
import com.drsai.assistant.ui.onboarding.OnboardingScreen
import com.drsai.assistant.ui.settings.LicensesScreen
import com.drsai.assistant.ui.settings.SettingsScreen

object Routes {
    const val ONBOARDING = "onboarding"
    const val CHAT = "chat?conversationId={conversationId}"
    const val HISTORY = "history"
    const val SETTINGS = "settings"
    const val LICENSES = "licenses"
    fun chat(id: Long = -1L) = "chat?conversationId=$id"
}

@Composable
fun DrsNavHost(container: AppContainer) {
    val nav = rememberNavController()
    val start = remember { if (container.models.selectedRepository().isModelReady()) Routes.CHAT else Routes.ONBOARDING }

    NavHost(navController = nav, startDestination = start) {
        composable(Routes.ONBOARDING) {
            OnboardingScreen(container, onReady = {
                nav.navigate(Routes.chat()) { popUpTo(Routes.ONBOARDING) { inclusive = true } }
            })
        }
        composable(
            Routes.CHAT,
            arguments = listOf(navArgument("conversationId") { type = NavType.LongType; defaultValue = -1L }),
        ) { entry ->
            val id = entry.arguments?.getLong("conversationId") ?: -1L
            ChatScreen(
                container = container,
                conversationId = id,
                onNewChat = {
                    nav.navigate(Routes.chat()) { popUpTo(nav.graph.id) { inclusive = true } }
                },
                onOpenHistory = { nav.navigate(Routes.HISTORY) },
                onOpenSettings = { nav.navigate(Routes.SETTINGS) },
            )
        }
        composable(Routes.HISTORY) {
            HistoryScreen(
                container = container,
                onBack = { nav.popBackStack() },
                onOpen = { id -> nav.navigate(Routes.chat(id)) { popUpTo(nav.graph.id) { inclusive = true } } },
            )
        }
        composable(Routes.SETTINGS) {
            SettingsScreen(
                container = container,
                onBack = { nav.popBackStack() },
                onModelDeleted = {
                    nav.navigate(Routes.ONBOARDING) { popUpTo(nav.graph.id) { inclusive = true } }
                },
                onOpenLicenses = { nav.navigate(Routes.LICENSES) },
            )
        }
        composable(Routes.LICENSES) {
            LicensesScreen(onBack = { nav.popBackStack() })
        }
    }
}
