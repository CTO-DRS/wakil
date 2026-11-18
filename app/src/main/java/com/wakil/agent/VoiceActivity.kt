package com.wakil.agent

import android.app.Activity
import android.content.ActivityNotFoundException
import android.content.Intent
import android.os.Bundle
import android.speech.RecognizerIntent
import android.widget.Toast

/** Invisible screen that opens Android's speech recognizer and hands the words to the agent. Used by the floating bubble. */
class VoiceActivity : Activity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        if (savedInstanceState != null) return
        try {
            startActivityForResult(recognizerIntent(), 1)
        } catch (e: ActivityNotFoundException) {
            Toast.makeText(this, NO_RECOGNIZER, Toast.LENGTH_LONG).show(); finish()
        }
    }

    @Deprecated("Deprecated in Java")
    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)
        val text = data?.getStringArrayListExtra(RecognizerIntent.EXTRA_RESULTS)?.firstOrNull()
        if (resultCode == RESULT_OK && !text.isNullOrBlank()) (application as WakilApp).agent.send(text, fromVoice = true)
        finish()
    }

    companion object {
        const val NO_RECOGNIZER = "لا يوجد محرّك تعرّف على الكلام في الجهاز. ثبّت تطبيق Google أو فعّل الكتابة الصوتية."
        fun recognizerIntent(): Intent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH)
            .putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
            .putExtra(RecognizerIntent.EXTRA_LANGUAGE, "ar-SA")
            .putExtra(RecognizerIntent.EXTRA_LANGUAGE_PREFERENCE, "ar-SA")
            .putExtra(RecognizerIntent.EXTRA_PREFER_OFFLINE, true)
            .putExtra(RecognizerIntent.EXTRA_PROMPT, "تكلّم… وكيل يسمعك")
    }
}
