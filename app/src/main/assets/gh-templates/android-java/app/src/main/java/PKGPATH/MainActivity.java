package @@PACKAGE@@;

import android.app.Activity;
import android.os.Bundle;
import android.widget.Button;
import android.widget.TextView;

public class MainActivity extends Activity {
    private int count = 0;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);
        TextView title = findViewById(R.id.title);
        Button button = findViewById(R.id.button);
        button.setOnClickListener(v -> title.setText("ضغطت " + (++count) + " مرة"));
    }
}
