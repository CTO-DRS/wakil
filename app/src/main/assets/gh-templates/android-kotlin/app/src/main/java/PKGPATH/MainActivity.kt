package @@PACKAGE@@

import android.app.Activity
import android.os.Bundle
import android.widget.Button
import android.widget.TextView

class MainActivity : Activity() {
    private var count = 0

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)
        val title = findViewById<TextView>(R.id.title)
        findViewById<Button>(R.id.button).setOnClickListener {
            count++
            title.text = "ضغطت $count مرة"
        }
    }
}
