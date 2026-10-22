package com.theninjarpg.app;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotSame;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.ComponentName;
import android.net.Uri;
import androidx.appcompat.app.AppCompatActivity;
import com.capacitorjs.plugins.browser.BrowserControllerActivity;
import com.capacitorjs.plugins.browser.BrowserPlugin;
import com.getcapacitor.Bridge;
import com.getcapacitor.JSObject;
import com.getcapacitor.PluginCall;
import java.util.ArrayList;
import java.util.List;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.Robolectric;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.annotation.Config;
import org.robolectric.shadows.ShadowActivity;

@RunWith(RobolectricTestRunner.class)
@Config(sdk = {29, 36}, manifest = Config.NONE)
public class TNROAuthBrowserPluginTest {
    private TestPlugin plugin;
    private ShadowActivity activity;

    public static class TestPlugin extends TNROAuthBrowserPlugin {
        final List<Session> sessions = new ArrayList<>();
        final List<String> events = new ArrayList<>();

        @Override
        protected Session createSession() {
            Session session = super.createSession();
            sessions.add(session);
            return session;
        }

        @Override
        protected void notifyListeners(String event, JSObject data) {
            events.add(event);
        }
    }

    @Before
    public void setUp() {
        var bridge = mock(Bridge.class);
        var context = Robolectric.buildActivity(Activity.class).setup().get();
        activity = org.robolectric.Shadows.shadowOf(context);
        when(bridge.getContext()).thenReturn(context);
        var activity = mock(AppCompatActivity.class);
        doAnswer(call -> { ((Runnable) call.getArgument(0)).run(); return null; }).when(activity).runOnUiThread(any());
        when(bridge.getActivity()).thenReturn(activity);
        plugin = new TestPlugin();
        plugin.setBridge(bridge);
        plugin.load();
    }

    @After
    public void tearDown() {
        plugin.handleOnDestroy();
        BrowserPlugin.setBrowserControllerListener(null);
    }

    private PluginCall open(String url, BrowserControllerActivity controller) {
        var call = mock(PluginCall.class);
        when(call.getString("url")).thenReturn(url);
        plugin.open(call);
        BrowserPlugin.browserControllerListener.onControllerReady(controller);
        return call;
    }

    @Test
    public void replacementRetiresItsCallbacksAndFinishesAtMostOnce() {
        var firstController = mock(BrowserControllerActivity.class);
        var firstCall = open("https://www.theninja-rpg.com/native-sign-in?flow=first", firstController);
        verify(firstCall).resolve();
        var first = plugin.sessions.get(0);
        var replacementController = mock(BrowserControllerActivity.class);
        var replacementCall = open("https://www.theninja-rpg.com/native-sign-in?flow=first&step=callback", replacementController);
        verify(replacementCall).resolve();
        var replacement = plugin.sessions.get(1);
        assertNotSame(first, replacement);
        first.notifyBrowserFinished();
        assertEquals(List.of(), plugin.events);
        replacement.notifyBrowserFinished();
        replacement.notifyBrowserFinished();
        assertEquals(List.of("browserFinished"), plugin.events);
    }

    @Test
    public void closeBringsTheUpstreamControllerForwardOnlyOnce() {
        var controller = mock(BrowserControllerActivity.class);
        open("https://www.theninja-rpg.com/native-sign-in?flow=close", controller);
        activity.getNextStartedActivity();
        var call = mock(PluginCall.class);
        plugin.close(call);
        var closeIntent = activity.getNextStartedActivity();
        assertEquals(new ComponentName(plugin.getContext(), BrowserControllerActivity.class), closeIntent.getComponent());
        assertTrue(closeIntent.getBooleanExtra("close", false));
        verify(call).resolve();
        plugin.close(mock(PluginCall.class));
        assertNull(activity.getNextStartedActivity());
    }

    @Test
    public void closeWithoutAnOpenTabDoesNotLaunchAController() {
        var call = mock(PluginCall.class);
        plugin.close(call);
        assertNull(activity.getNextStartedActivity());
        verify(call).resolve();
    }

    @Test
    public void closeDoesNotRelaunchAFinishingOrDestroyedController() {
        for (boolean destroyed : new boolean[] {false, true}) {
            var controller = mock(BrowserControllerActivity.class);
            when(controller.isFinishing()).thenReturn(!destroyed);
            when(controller.isDestroyed()).thenReturn(destroyed);
            open("https://www.theninja-rpg.com/native-sign-in?flow=finished", controller);
            activity.getNextStartedActivity();
            var call = mock(PluginCall.class);
            plugin.close(call);
            assertNull(activity.getNextStartedActivity());
            verify(call).resolve();
        }
    }

    @Test
    public void failedLaunchRejectsAndReleasesTheController() {
        var controller = mock(BrowserControllerActivity.class);
        doThrow(new ActivityNotFoundException()).when(controller).open(any(), any(Uri.class), any());
        var call = open("https://www.theninja-rpg.com/native-sign-in?flow=missing", controller);
        verify(call).reject(eq("No external browser is available"), any(ActivityNotFoundException.class));
        verify(controller).finish();
        assertEquals(List.of(), plugin.events);
    }

    @Test
    public void failedServiceBindingDoesNotUnbindAnUnregisteredConnection() {
        var unbound = new TNROAuthBrowserPlugin.Session(plugin.getContext(), ignored -> {}) {
            @Override public boolean bindService() { return false; }
            @Override public void unbindService() { throw new AssertionError("No connection was registered"); }
        };
        unbound.bind();
        unbound.unbind();
        unbound.retire();
    }
}
