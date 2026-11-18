package com.wakil.agent.ui

import android.annotation.SuppressLint
import android.webkit.CookieManager
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import com.wakil.agent.github.GitHub
import com.wakil.agent.ui.components.CircleIconButton
import com.wakil.agent.ui.theme.Neon
import kotlinx.coroutines.delay
import java.net.URLEncoder

/** JS that fills the token form and returns a freshly generated token if one is on the page. */
private const val GRAB_JS = """(function(){
 try{
  var d=document.querySelector('#oauth_access_description'); if(d&&!d.value){d.value='Wakil Android';}
  var e=document.querySelector('#token_expiration'); if(e&&!e.dataset.wakil){e.dataset.wakil='1'; for(var i=0;i<e.options.length;i++){if(e.options[i].value=='90'){e.value='90';e.dispatchEvent(new Event('change',{bubbles:true}));}}}
  ['repo','workflow'].forEach(function(s){var c=document.querySelector('input[type=checkbox][value="'+s+'"]'); if(c&&!c.checked){c.click();}});
  var c=document.querySelector('#new-oauth-token'); if(c&&/gh[po]_/.test(c.textContent)) return c.textContent.trim();
  var cc=document.querySelector('clipboard-copy[value^="ghp_"],clipboard-copy[value^="gho_"]'); if(cc) return cc.getAttribute('value');
  var m=document.body&&document.body.innerText.match(/gh[po]_[A-Za-z0-9]{36,}/); return m?m[0]:'';
 }catch(err){return '';}
})()"""

/** In-app GitHub sign-in: the user logs in inside Wakil, taps Generate token, and Wakil picks the token up by itself. */
@SuppressLint("SetJavaScriptEnabled")
@Composable
fun GhWebLogin(onToken: (String) -> Unit, onClose: () -> Unit) {
    var web by remember { mutableStateOf<WebView?>(null) }
    var progress by remember { mutableIntStateOf(0) }
    var url by remember { mutableStateOf("") }
    var got by remember { mutableStateOf(false) }
    BackHandler { if (web?.canGoBack() == true) web?.goBack() else onClose() }

    fun grab() {
        web?.evaluateJavascript(GRAB_JS) { r ->
            val t = r?.trim('"').orEmpty()
            if (!got && Regex("^gh[po]_[A-Za-z0-9]{36,}$").matches(t)) { got = true; onToken(t) }
        }
    }
    LaunchedEffect(web) { while (web != null && !got) { delay(1200); grab() } }

    Column(Modifier.fillMaxSize().background(Color.Black)) {
        Row(Modifier.fillMaxWidth().background(Color(0xFF0B1120)).padding(10.dp), verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                Text(
                    when {
                        got -> "✓ تم التقاط الرمز، جارٍ الربط…"
                        url.contains("/settings/tokens") -> "انزل لأسفل واضغط «Generate token» — وكيل يلتقط الرمز وحده"
                        else -> "سجّل دخولك إلى GitHub"
                    },
                    color = if (got) Neon.Green else Neon.Text, style = MaterialTheme.typography.titleSmall
                )
                Text("الصلاحيات repo و workflow محددة تلقائياً", color = Neon.TextDim, style = MaterialTheme.typography.labelSmall)
            }
            CircleIconButton(Icons.Filled.Close, "إغلاق", onClose)
        }
        if (progress in 1..99) LinearProgressIndicator({ progress / 100f }, Modifier.fillMaxWidth(), color = Neon.Violet)
        AndroidView(
            factory = { ctx ->
                WebView(ctx).apply {
                    settings.javaScriptEnabled = true
                    settings.domStorageEnabled = true
                    settings.setSupportMultipleWindows(false)
                    CookieManager.getInstance().setAcceptCookie(true)
                    webChromeClient = object : android.webkit.WebChromeClient() {
                        override fun onProgressChanged(view: WebView?, p: Int) { progress = p }
                    }
                    webViewClient = object : WebViewClient() {
                        override fun shouldOverrideUrlLoading(view: WebView?, req: WebResourceRequest?): Boolean {
                            val host = req?.url?.host.orEmpty()
                            // keep GitHub inside; anything else (help pages etc.) stays here too but only https
                            return req?.url?.scheme != "https" || !(host.endsWith("github.com") || host.endsWith("githubusercontent.com") || host.endsWith("githubassets.com"))
                        }
                        override fun onPageFinished(view: WebView?, u: String?) { url = u.orEmpty(); grab() }
                    }
                    val path = GitHub.TOKEN_URL.removePrefix("https://github.com")
                    loadUrl("https://github.com/login?return_to=" + URLEncoder.encode(path, "UTF-8"))
                    web = this
                }
            },
            onRelease = { it.stopLoading(); it.destroy() },
            modifier = Modifier.fillMaxSize()
        )
    }
}

fun clearGitHubCookies() = runCatching { CookieManager.getInstance().removeAllCookies(null) }
