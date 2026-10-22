package com.theninjarpg.app;

import android.os.Bundle;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebView;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.BridgeWebViewClient;
import com.getcapacitor.Plugin;
import java.util.List;

public class MainActivity extends BridgeActivity {
    private static final List<Class<? extends Plugin>> APP_PLUGINS = List.of(
        TNRWidgetSyncPlugin.class, TNRAudioSessionPlugin.class, TNRLiveUpdatesPlugin.class
    );

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Plugins have to be registered before super.onCreate builds the bridge.
        for (var plugin : APP_PLUGINS) registerPlugin(plugin);
        // App instances are registered after discovered classes, retaining the Browser API.
        bridgeBuilder.addPluginInstance(new TNROAuthBrowserPlugin());
        super.onCreate(savedInstanceState);
        TNRRemoteBridge.install(bridge, APP_PLUGINS);

        // The bundled entry point handles cold-start outages. If a later navigation fails,
        // return to that same retry screen instead of leaving Android's raw WebView error.
        bridge.setWebViewClient(new BridgeWebViewClient(bridge) {
            private boolean isRecovering;

            @Override
            public void onPageFinished(WebView view, String url) {
                super.onPageFinished(view, url);
                if (isRecovering && (bridge.getAppUrl().equals(url) || (bridge.getAppUrl() + "/").equals(url))) {
                    // A failed remote page must not remain behind the retry screen.
                    isRecovering = false;
                    view.clearHistory();
                }
            }

            @Override
            public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                super.onReceivedError(view, request, error);
                if (request.isForMainFrame() && !bridge.getHost().equals(request.getUrl().getHost())) {
                    isRecovering = true;
                    view.loadUrl(bridge.getAppUrl());
                }
            }
        });

        // Cheap and idempotent, and it has to happen before the first push arrives:
        // a notification whose channel does not exist is dropped without a trace.
        TNRNotificationChannels.register(this);
    }
}
