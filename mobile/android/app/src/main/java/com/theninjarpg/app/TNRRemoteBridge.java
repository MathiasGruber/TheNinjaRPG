package com.theninjarpg.app;

import android.net.Uri;
import androidx.webkit.WebViewCompat;
import androidx.webkit.WebViewFeature;
import com.getcapacitor.Bridge;
import com.getcapacitor.JSExport;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginHandle;
import com.getcapacitor.PluginManager;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashSet;
import java.util.List;
import org.json.JSONObject;

/** Export the installed Capacitor runtime before scripts on trusted remote documents. */
final class TNRRemoteBridge {
    static void install(Bridge bridge, List<Class<? extends Plugin>> appPlugins) {
        if (!WebViewFeature.isFeatureSupported(WebViewFeature.DOCUMENT_START_SCRIPT)) return;
        var origins = new HashSet<>(bridge.getAllowedOriginRules());
        // Capacitor already injects the bundled origin; older WebViews use its HTML injector.
        origins.remove(Uri.parse(bridge.getAppUrl()).buildUpon().path(null).fragment(null).clearQuery().build().toString());
        if (origins.isEmpty()) return;
        WebViewCompat.addDocumentStartJavaScript(bridge.getWebView(), export(bridge, appPlugins), origins);
    }

    static String export(Bridge bridge, List<Class<? extends Plugin>> appPlugins) {
        try {
            // PluginManager supplies cap-sync's installed plugins; the shell owns its local list.
            // Core plugins are registered by Bridge itself rather than capacitor.plugins.json.
            var classes = new ArrayList<Class<? extends Plugin>>(List.of(
                com.getcapacitor.plugin.CapacitorCookies.class,
                com.getcapacitor.plugin.WebView.class,
                com.getcapacitor.plugin.CapacitorHttp.class,
                com.getcapacitor.plugin.SystemBars.class
            ));
            classes.addAll(new PluginManager(bridge.getContext().getAssets()).loadPluginClasses());
            classes.addAll(appPlugins);
            var handles = new LinkedHashSet<PluginHandle>();
            for (var plugin : classes) {
                var annotation = plugin.getAnnotation(CapacitorPlugin.class);
                String id = annotation.name().isEmpty() ? plugin.getSimpleName() : annotation.name();
                handles.add(bridge.getPlugin(id));
            }
            return "(function(){if(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform())return;\n" +
                String.join("\n\n",
                    JSExport.getGlobalJS(bridge.getContext(), bridge.getConfig().isLoggingEnabled(), bridge.isDevMode()),
                    "window.WEBVIEW_SERVER_URL = " + JSONObject.quote(bridge.getLocalUrl()) + ";",
                    JSExport.getBridgeJS(bridge.getContext()),
                    JSExport.getPluginJS(handles),
                    JSExport.getCordovaJS(bridge.getContext()),
                    JSExport.getCordovaPluginsFileJS(bridge.getContext()),
                    JSExport.getCordovaPluginJS(bridge.getContext())
                ) + "\n})();";
        } catch (Exception error) {
            throw new IllegalStateException("Unable to export the native bridge for trusted navigation", error);
        }
    }
}
