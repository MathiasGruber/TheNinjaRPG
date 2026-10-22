package com.capacitorjs.plugins.browser;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotSame;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doReturn;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import android.app.Activity;
import android.content.ComponentName;
import android.content.Intent;
import android.content.pm.ActivityInfo;
import android.content.pm.ResolveInfo;
import android.net.Uri;
import android.os.Binder;
import android.os.Build;
import android.os.Bundle;
import androidx.browser.customtabs.CustomTabsCallback;
import androidx.browser.customtabs.CustomTabsClient;
import androidx.browser.customtabs.CustomTabsSession;
import com.theninjarpg.app.TNROAuthBrowserPlugin.Session;
import java.util.ArrayList;
import java.util.List;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.mockito.Answers;
import org.robolectric.Robolectric;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.annotation.Config;
import org.robolectric.shadows.ShadowActivity;
import org.robolectric.util.ReflectionHelpers;

@RunWith(RobolectricTestRunner.class)
@Config(sdk = {29, 36}, manifest = Config.NONE)
public class BrowserTest {
    private Browser browser;
    private Activity context;
    private CustomTabsClient client;
    private ShadowActivity activity;
    private String browserPackage = "com.android.chrome";
    private final List<CustomTabsCallback> callbacks = new ArrayList<>();
    private final List<Integer> events = new ArrayList<>();

    @Before
    public void setUp() {
        context = Robolectric.buildActivity(Activity.class).setup().get();
        activity = org.robolectric.Shadows.shadowOf(context);
        installBrowser("com.android.chrome");
        client = mock(CustomTabsClient.class);
        when(client.newSession(any(CustomTabsCallback.class))).thenAnswer(invocation -> {
            callbacks.add(invocation.getArgument(0));
            Binder token = new Binder();
            return mock(CustomTabsSession.class, call -> {
                // AndroidX exposes these to its intent builder, not to application code.
                switch (call.getMethod().getName()) {
                    case "getBinder":
                        return token;
                    case "getComponentName":
                        return new ComponentName(browserPackage, "CustomTabsService");
                    default:
                        return Answers.RETURNS_DEFAULTS.answer(call);
                }
            });
        });
        replaceBrowser();
    }

    private Intent webIntent() {
        return new Intent(Intent.ACTION_VIEW, Uri.parse("https://example.com"))
            .addCategory(Intent.CATEGORY_BROWSABLE);
    }

    private void installBrowser(String name) {
        var info = new ResolveInfo();
        info.activityInfo = new ActivityInfo();
        info.activityInfo.packageName = name;
        info.activityInfo.name = name + ".BrowserActivity";
        info.isDefault = true;
        org.robolectric.Shadows.shadowOf(context.getPackageManager()).addResolveInfoForIntent(webIntent(), info);
    }

    private void replaceBrowser() {
        if (browser != null) ((Session) browser).retire();
        browser = new Session(context, ignored -> {});
        browser.setBrowserEventListener(events::add);
        ReflectionHelpers.setField(browser, "customTabsClient", client);
    }

    @Test
    public void firstLaunchWithoutBoundServiceStillTargetsBrowser() {
        ReflectionHelpers.setField(browser, "customTabsClient", null);
        Uri signIn = Uri.parse("https://www.theninja-rpg.com/native-sign-in?flow=cold");
        browser.open(signIn);
        Intent launch = activity.getNextStartedActivity();

        // An implicit game-origin intent can resolve back to the app's verified link.
        assertEquals("com.android.chrome", launch.getPackage());
        assertEquals(signIn, launch.getData());
    }

    @Test
    public void unavailableSessionStillTargetsBrowser() {
        CustomTabsClient client = ReflectionHelpers.getField(browser, "customTabsClient");
        doReturn(null).when(client).newSession(any(CustomTabsCallback.class));
        browser.open(Uri.parse("https://www.theninja-rpg.com/native-sign-in?flow=unavailable"));

        assertEquals("com.android.chrome", activity.getNextStartedActivity().getPackage());
    }

    @Test
    public void absentChromeUsesInstalledExternalBrowser() {
        org.robolectric.Shadows.shadowOf(context.getPackageManager()).removeResolveInfosForIntent(webIntent(), "com.android.chrome");
        installBrowser("org.mozilla.firefox");
        ReflectionHelpers.setField(browser, "customTabsClient", null);
        browser.open(Uri.parse("https://www.theninja-rpg.com/native-sign-in?flow=firefox"));
        assertEquals("org.mozilla.firefox", activity.getNextStartedActivity().getPackage());
    }

    @Test(expected = android.content.ActivityNotFoundException.class)
    public void absentExternalBrowserFailsInsteadOfOpeningTheVerifiedGameHandler() {
        org.robolectric.Shadows.shadowOf(context.getPackageManager()).removeResolveInfosForIntent(webIntent(), "com.android.chrome");
        installBrowser(context.getPackageName());
        ReflectionHelpers.setField(browser, "customTabsClient", null);
        browser.open(Uri.parse("https://www.theninja-rpg.com/native-sign-in?flow=none"));
    }

    @Test
    public void boundNonChromeSessionKeepsItsBrowser() {
        browserPackage = "org.mozilla.firefox";
        browser.open(Uri.parse("https://www.theninja-rpg.com/native-sign-in?flow=bound"));

        assertEquals(browserPackage, activity.getNextStartedActivity().getPackage());
    }

    @Test
    public void replacementLaunchUsesFreshSessionInSameBrowser() {
        browser.open(Uri.parse("https://www.theninja-rpg.com/native-sign-in?flow=first"));
        Intent first = activity.getNextStartedActivity();
        Uri continuation = Uri.parse("https://www.theninja-rpg.com/native-sign-in?flow=first&step=callback");
        replaceBrowser();
        browser.open(continuation);
        Intent replacement = activity.getNextStartedActivity();

        assertEquals(2, callbacks.size());
        assertEquals("com.android.chrome", first.getPackage());
        assertEquals(first.getPackage(), replacement.getPackage());
        assertEquals(continuation, replacement.getData());
        assertNotSame(
            first.getExtras().getBinder("android.support.customtabs.extra.SESSION"),
            replacement.getExtras().getBinder("android.support.customtabs.extra.SESSION")
        );
    }

    @Test
    public void retiredTabCannotFinishOrLoadItsReplacement() {
        browser.open(Uri.parse("https://www.theninja-rpg.com/native-sign-in?flow=first"));
        replaceBrowser();
        browser.open(Uri.parse("https://www.theninja-rpg.com/native-sign-in?flow=first&step=callback"));
        callbacks.get(0).onNavigationEvent(CustomTabsCallback.NAVIGATION_FINISHED, null);
        callbacks.get(0).onNavigationEvent(CustomTabsCallback.TAB_HIDDEN, null);
        callbacks.get(0).onMinimized(new Bundle());
        assertEquals(List.of(), events);

        callbacks.get(1).onNavigationEvent(CustomTabsCallback.TAB_SHOWN, null);
        callbacks.get(1).onNavigationEvent(CustomTabsCallback.NAVIGATION_FINISHED, null);
        assertEquals(List.of(Browser.BROWSER_LOADED), events);
        callbacks.get(1).onNavigationEvent(CustomTabsCallback.TAB_HIDDEN, null);
        // A hidden tab can still be open. Closure arrives through ActivityResult,
        // with the plugin's PiP fallback on Android versions before API 34.
        assertEquals(List.of(Browser.BROWSER_LOADED), events);
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            callbacks.get(1).onMinimized(new Bundle());
        } else {
            browser.notifyBrowserFinished();
        }
        assertEquals(List.of(Browser.BROWSER_LOADED, Browser.BROWSER_FINISHED), events);
    }

    @Test
    public void fallbackLaunchStillRetiresThePriorSession() {
        browser.open(Uri.parse("https://www.theninja-rpg.com/native-sign-in?flow=first"));
        replaceBrowser();
        ReflectionHelpers.setField(browser, "customTabsClient", null);
        browser.open(Uri.parse("https://www.theninja-rpg.com/native-sign-in?flow=second"));
        callbacks.get(0).onNavigationEvent(CustomTabsCallback.TAB_HIDDEN, null);
        assertEquals(List.of(), events);
    }
}
