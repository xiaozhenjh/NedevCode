package com.codespace.app;

import android.content.res.Configuration;
import android.os.Bundle;
import android.view.View;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // 刘海屏与状态栏：统一 edge-to-edge 铺满窗口（Android 15+ 高版本强制，低版本同样生效），
        // 状态栏在主题中透明，内容通过 insets padding 让出状态栏/刘海/导航栏区域
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);

        final View content = findViewById(android.R.id.content);
        if (content == null) {
            return;
        }
        applyStatusBarStripColor(content);
        ViewCompat.setOnApplyWindowInsetsListener(content, (v, windowInsets) -> {
            Insets bars = windowInsets.getInsets(
                WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout());
            v.setPadding(bars.left, bars.top, bars.right, bars.bottom);
            // 不消费 insets，键盘等其余类型继续下发给 WebView
            return windowInsets;
        });
        ViewCompat.requestApplyInsets(content);
    }

    @Override
    public void onConfigurationChanged(Configuration newConfig) {
        super.onConfigurationChanged(newConfig);
        // 系统深浅色切换时，刷新状态栏处露出的背景条颜色
        View content = findViewById(android.R.id.content);
        if (content != null) {
            applyStatusBarStripColor(content);
        }
    }

    /** 状态栏/刘海露出的背景条：深色模式用黑底浅色图标，浅色模式用 #F7F8FA 深色图标（与 Web 端 bg-primary 一致） */
    private void applyStatusBarStripColor(View content) {
        boolean night = (getResources().getConfiguration().uiMode & Configuration.UI_MODE_NIGHT_MASK)
            == Configuration.UI_MODE_NIGHT_YES;
        content.setBackgroundColor(night ? 0xFF000000 : 0xFFF7F8FA);
    }
}
