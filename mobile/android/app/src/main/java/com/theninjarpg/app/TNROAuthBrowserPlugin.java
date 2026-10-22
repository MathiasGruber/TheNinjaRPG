package com.theninjarpg.app;

import android.content.ActivityNotFoundException;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.contract.ActivityResultContract;
import androidx.activity.result.contract.ActivityResultContracts;
import androidx.browser.customtabs.CustomTabsClient;
import androidx.core.app.ActivityOptionsCompat;
import com.capacitorjs.plugins.browser.Browser;
import com.capacitorjs.plugins.browser.BrowserControllerActivity;
import com.capacitorjs.plugins.browser.BrowserPlugin;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.function.Consumer;

/** Scope each OAuth tab independently while retaining Capacitor's result/PiP controller. */
@CapacitorPlugin(name = "Browser")
public class TNROAuthBrowserPlugin extends Plugin {
    private Session session;
    private boolean resumed;

    @Override
    public void load() {
        session = createSession();
    }

    protected Session createSession() {
        return new Session(getContext(), source -> {
            if (session == source) notifyListeners("browserFinished", null);
        });
    }

    @PluginMethod
    public void open(PluginCall call) {
        String url = call.getString("url");
        if (url == null || url.isEmpty()) {
            call.reject("Must provide a URL to open");
            return;
        }
        getActivity().runOnUiThread(() -> {
            if (session.opened) {
                session.retire();
                session = createSession();
                if (resumed) session.bind();
            }
            Session current = session;
            current.opened = true;
            BrowserPlugin.setBrowserControllerListener(activity -> {
                if (session != current || current.finished.get()) {
                    activity.finish();
                    return;
                }
                current.controller = activity;
                try {
                    activity.open(current, Uri.parse(url), null);
                    call.resolve();
                } catch (ActivityNotFoundException error) {
                    current.retire();
                    activity.finish();
                    call.reject("No external browser is available", error);
                }
            });
            Intent intent = new Intent(getContext(), BrowserControllerActivity.class);
            intent.addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
        });
    }

    @PluginMethod
    public void close(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            if (session.controller != null) session.controller.finish();
            call.resolve();
        });
    }

    @Override
    protected void handleOnResume() {
        resumed = true;
        session.bind();
    }

    @Override
    protected void handleOnPause() {
        resumed = false;
        session.unbind();
    }

    @Override
    protected void handleOnDestroy() {
        session.retire();
        if (session.controller != null) session.controller.finish();
    }

    /** A fresh upstream Browser owns one cached CustomTabsSession and its callbacks. */
    public static class Session extends Browser {
        private final Context context;
        private final Consumer<Session> onFinished;
        private final AtomicBoolean finished = new AtomicBoolean(false);
        private boolean bound;
        private boolean opened;
        private BrowserControllerActivity controller;

        public Session(Context context, Consumer<Session> onFinished) {
            super(context);
            this.context = context;
            this.onFinished = onFinished;
            setCustomTabLauncher(null);
        }

        void bind() {
            if (!bound) bound = bindService();
        }

        void unbind() {
            if (bound) {
                unbindService();
                bound = false;
            }
        }

        public void retire() {
            finished.set(true);
            setBrowserEventListener(null);
            unbind();
        }

        @Override
        public void notifyBrowserFinished() {
            if (finished.compareAndSet(false, true)) {
                super.notifyBrowserFinished();
                onFinished.accept(this);
            }
        }

        @Override
        public void setCustomTabLauncher(ActivityResultLauncher<Intent> launcher) {
            super.setCustomTabLauncher(new ActivityResultLauncher<Intent>() {
                @Override
                public void launch(Intent intent, ActivityOptionsCompat options) {
                    if (intent.getPackage() == null) intent.setPackage(browserPackage(context));
                    if (launcher == null) context.startActivity(intent, options == null ? null : options.toBundle());
                    else launcher.launch(intent, options);
                }

                @Override
                public void unregister() {
                    if (launcher != null) launcher.unregister();
                }

                @Override
                public ActivityResultContract<Intent, ?> getContract() {
                    return launcher == null ? new ActivityResultContracts.StartActivityForResult() : launcher.getContract();
                }
            });
        }
    }

    static String browserPackage(Context context) {
        String customTabs = CustomTabsClient.getPackageName(context, null);
        if (customTabs != null && !customTabs.equals(context.getPackageName())) return customTabs;
        // Resolve a generic web URL, never the game's verified App Link back into this app.
        Intent web = new Intent(Intent.ACTION_VIEW, Uri.parse("https://example.com"));
        web.addCategory(Intent.CATEGORY_BROWSABLE);
        for (var candidate : context.getPackageManager().queryIntentActivities(web, android.content.pm.PackageManager.MATCH_DEFAULT_ONLY)) {
            String name = candidate.activityInfo.packageName;
            if (!name.equals(context.getPackageName())) return name;
        }
        throw new ActivityNotFoundException("No external browser is available");
    }
}
