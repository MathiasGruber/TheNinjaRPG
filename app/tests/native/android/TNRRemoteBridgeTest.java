package com.theninjarpg.app;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.mockStatic;
import static org.mockito.Mockito.when;

import android.webkit.WebView;
import android.content.Context;
import android.content.res.AssetManager;
import androidx.webkit.WebViewCompat;
import androidx.webkit.WebViewFeature;
import com.getcapacitor.Bridge;
import com.getcapacitor.CapConfig;
import com.getcapacitor.PluginHandle;
import java.util.List;
import java.util.Set;
import java.nio.file.Files;
import java.nio.file.Path;
import org.json.JSONObject;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.annotation.Config;

@RunWith(RobolectricTestRunner.class)
@Config(sdk = {29, 36}, manifest = Config.NONE)
public class TNRRemoteBridgeTest {
    private Bridge bridge;
    private WebView webView;

    @Before
    public void setUp() throws Exception {
        bridge = mock(Bridge.class);
        webView = mock(WebView.class);
        var context = mock(Context.class);
        var assets = mock(AssetManager.class);
        when(context.getAssets()).thenReturn(assets);
        when(assets.list(anyString())).thenReturn(new String[0]);
        when(assets.open(anyString())).thenAnswer(call -> {
            String name = call.getArgument(0);
            Path mobile = Path.of(System.getProperty("tnr.mobileRoot"));
            Path asset = mobile.resolve("android/app/src/main/assets").resolve(name);
            if (!Files.exists(asset)) asset = mobile.resolve("node_modules/@capacitor/android/capacitor/src/main/assets").resolve(name);
            return Files.newInputStream(asset);
        });
        when(bridge.getContext()).thenReturn(context);
        when(bridge.getConfig()).thenReturn(mock(CapConfig.class));
        when(bridge.getWebView()).thenReturn(webView);
        when(bridge.getAppUrl()).thenReturn("https://localhost");
        when(bridge.getLocalUrl()).thenReturn("https://localhost");
        when(bridge.getAllowedOriginRules()).thenReturn(Set.of(
            "https://localhost", "https://www.theninja-rpg.com", "https://clerk.theninja-rpg.com"
        ));
        when(bridge.getPlugin(anyString())).thenAnswer(call -> {
            var handle = mock(PluginHandle.class);
            when(handle.getId()).thenReturn(call.getArgument(0));
            when(handle.getMethods()).thenReturn(List.of());
            return handle;
        });
    }

    @Test
    public void exportsInstalledRuntimeAndAllPluginFamilies() {
        String script = TNRRemoteBridge.export(bridge, List.of(TNRWidgetSyncPlugin.class, TNROAuthBrowserPlugin.class));
        assertTrue(script.contains("nativePromise"));
        assertTrue(script.contains("window.WEBVIEW_SERVER_URL = " + JSONObject.quote("https://localhost")));
        for (String name : List.of("CapacitorCookies", "WebView", "CapacitorHttp", "SystemBars",
                "App", "Browser", "PushNotifications", "Purchases", "TNRWidgetSync")) {
            assertTrue("Missing native plugin " + name, script.contains("\"name\":\"" + name + "\""));
        }
        assertFalse(script.contains("undefined\n"));
    }

    @Test
    public void injectsOnlyTrustedRemoteOriginsAndLeavesLocalInjectionToCapacitor() {
        try (var features = mockStatic(WebViewFeature.class); var compat = mockStatic(WebViewCompat.class)) {
            features.when(() -> WebViewFeature.isFeatureSupported(WebViewFeature.DOCUMENT_START_SCRIPT)).thenReturn(true);
            TNRRemoteBridge.install(bridge, List.of());
            compat.verify(() -> WebViewCompat.addDocumentStartJavaScript(eq(webView), anyString(), eq(Set.of(
                "https://www.theninja-rpg.com", "https://clerk.theninja-rpg.com"
            ))));
        }
    }

    @Test
    public void customOriginsDoNotInheritProductionOrClerkTrust() {
        when(bridge.getAllowedOriginRules()).thenReturn(Set.of("https://localhost", "https://staging.example.com:8443"));
        try (var features = mockStatic(WebViewFeature.class); var compat = mockStatic(WebViewCompat.class)) {
            features.when(() -> WebViewFeature.isFeatureSupported(WebViewFeature.DOCUMENT_START_SCRIPT)).thenReturn(true);
            TNRRemoteBridge.install(bridge, List.of());
            compat.verify(() -> WebViewCompat.addDocumentStartJavaScript(eq(webView), anyString(), eq(Set.of("https://staging.example.com:8443"))));
        }
    }

    @Test
    public void olderWebViewsKeepTheUpstreamHtmlInjectionFallback() {
        try (var features = mockStatic(WebViewFeature.class); var compat = mockStatic(WebViewCompat.class)) {
            features.when(() -> WebViewFeature.isFeatureSupported(WebViewFeature.DOCUMENT_START_SCRIPT)).thenReturn(false);
            TNRRemoteBridge.install(bridge, List.of());
            compat.verifyNoInteractions();
        }
    }
}
