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
import android.net.Uri;
import android.os.Binder;
import androidx.browser.customtabs.CustomTabsCallback;
import androidx.browser.customtabs.CustomTabsClient;
import androidx.browser.customtabs.CustomTabsSession;
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
    private ShadowActivity activity;
    private String browserPackage = "com.android.chrome";
    private final List<CustomTabsCallback> callbacks = new ArrayList<>();
    private final List<Integer> events = new ArrayList<>();

    @Before
    public void setUp() {
        Activity context = Robolectric.buildActivity(Activity.class).setup().get();
        activity = org.robolectric.Shadows.shadowOf(context);
        browser = new Browser(context);
        browser.setBrowserEventListener(events::add);
        CustomTabsClient client = mock(CustomTabsClient.class);
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
        browser.open(Uri.parse("https://www.theninja-rpg.com/native-sign-in?flow=first&step=callback"));
        callbacks.get(0).onNavigationEvent(CustomTabsCallback.NAVIGATION_FINISHED, null);
        callbacks.get(0).onNavigationEvent(CustomTabsCallback.TAB_HIDDEN, null);
        assertEquals(List.of(), events);

        callbacks.get(1).onNavigationEvent(CustomTabsCallback.TAB_SHOWN, null);
        callbacks.get(1).onNavigationEvent(CustomTabsCallback.NAVIGATION_FINISHED, null);
        assertEquals(List.of(Browser.BROWSER_LOADED), events);
        callbacks.get(1).onNavigationEvent(CustomTabsCallback.TAB_HIDDEN, null);
        assertEquals(List.of(Browser.BROWSER_LOADED, Browser.BROWSER_FINISHED), events);
    }

    @Test
    public void fallbackLaunchStillRetiresThePriorSession() {
        browser.open(Uri.parse("https://www.theninja-rpg.com/native-sign-in?flow=first"));
        ReflectionHelpers.setField(browser, "customTabsClient", null);
        browser.open(Uri.parse("https://www.theninja-rpg.com/native-sign-in?flow=second"));
        callbacks.get(0).onNavigationEvent(CustomTabsCallback.TAB_HIDDEN, null);
        assertEquals(List.of(), events);
    }
}
