package org.datapeaks.expert;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.app.AlertDialog;
import android.content.ClipData;
import android.content.ClipDescription;
import android.content.ClipboardManager;
import android.content.Context;
import android.content.SharedPreferences;
import android.content.pm.verify.domain.DomainVerificationManager;
import android.content.pm.verify.domain.DomainVerificationUserState;
import android.provider.Settings;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.graphics.Color;
import android.graphics.Insets;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowInsets;
import android.webkit.CookieManager;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.TextView;

/**
 * The ACAPS expert app as a native Android app. It shows the live expert site full-screen, so every
 * expert feature (sign-in by email, questions, group view, globe, profile) is the same as on the web.
 *
 * - Links from ACAPS emails (sign-in, invite, join) open here, and the token is saved on the phone
 *   by the web app itself (localStorage), exactly as in a browser.
 * - Links to other sites (report sources) open in the phone's browser.
 */
public class MainActivity extends Activity {

    private static final String APP_URL = BuildConfig.APP_URL;
    private static final String APP_HOST = Uri.parse(APP_URL).getHost();

    private WebView web;
    private ProgressBar progress;
    private View loading;
    private View offline;
    private boolean firstPageShown = false;
    private boolean askedLinkSetting = false;
    private SharedPreferences prefs;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        prefs = getSharedPreferences("app", MODE_PRIVATE);
        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(Color.parseColor("#F8FAFC"));

        web = new WebView(this);
        configure(web);
        root.addView(web, match());

        loading = buildLoading();
        root.addView(loading, match());

        offline = buildOffline();
        offline.setVisibility(View.GONE);
        root.addView(offline, match());

        progress = new ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal);
        progress.setMax(100);
        progress.setIndeterminate(false);
        FrameLayout.LayoutParams lp = new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(4));
        lp.gravity = Gravity.TOP;
        root.addView(progress, lp);

        // Android 15 draws apps edge to edge: keep content clear of the status bar, the navigation bar
        // and the keyboard (so the answer box is never hidden behind it).
        root.setOnApplyWindowInsetsListener((v, insets) -> {
            if (Build.VERSION.SDK_INT >= 30) {
                Insets i = insets.getInsets(WindowInsets.Type.systemBars() | WindowInsets.Type.ime()
                        | WindowInsets.Type.displayCutout());
                v.setPadding(i.left, i.top, i.right, i.bottom);
                return WindowInsets.CONSUMED;
            }
            v.setPadding(insets.getSystemWindowInsetLeft(), insets.getSystemWindowInsetTop(),
                    insets.getSystemWindowInsetRight(), insets.getSystemWindowInsetBottom());
            return insets.consumeSystemWindowInsets();
        });

        setContentView(root);

        if (savedInstanceState != null) {
            web.restoreState(savedInstanceState);
        } else {
            web.loadUrl(startUrl(getIntent()));
        }
    }

    @SuppressLint("SetJavaScriptEnabled")
    private void configure(WebView w) {
        WebSettings s = w.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);      // the web app keeps the expert's token in localStorage
        s.setDatabaseEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(true);
        s.setSupportMultipleWindows(false); // target=_blank links come through shouldOverrideUrlLoading
        s.setLoadWithOverviewMode(true);
        s.setUseWideViewPort(true);
        s.setSupportZoom(false);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(false);
        s.setUserAgentString(s.getUserAgentString() + " DataPeaksApp/" + BuildConfig.VERSION_NAME);
        CookieManager.getInstance().setAcceptCookie(true);
        w.setOverScrollMode(View.OVER_SCROLL_NEVER);

        w.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                if (isAppUrl(uri)) return false;
                openOutside(uri);
                return true;
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                if (!firstPageShown && offline.getVisibility() != View.VISIBLE) {
                    firstPageShown = true;
                    loading.setVisibility(View.GONE);
                }
                CookieManager.getInstance().flush();
                maybeAskToOpenLinksHere();
            }

            @Override
            public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                if (request.isForMainFrame()) showOffline();
            }
        });
        w.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onProgressChanged(WebView view, int p) {
                progress.setProgress(p);
                progress.setVisibility(p >= 100 ? View.GONE : View.VISIBLE);
            }
        });
    }

    /** The app's own pages stay in the app; anything else (sources, mail) goes to the phone. */
    private static boolean isAppUrl(Uri uri) {
        return uri != null && "https".equals(uri.getScheme()) && APP_HOST.equalsIgnoreCase(uri.getHost());
    }

    /** A link from an ACAPS email (?token= or ?join=) if the app was opened by one, else the home page. */
    private static String startUrl(Intent intent) {
        Uri data = intent == null ? null : intent.getData();
        return isAppUrl(data) ? data.toString() : APP_URL + "/";
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        Uri data = intent.getData();
        if (isAppUrl(data)) {
            offline.setVisibility(View.GONE);
            web.loadUrl(data.toString());
        }
    }

    private void openOutside(Uri uri) {
        try {
            startActivity(new Intent(Intent.ACTION_VIEW, uri).addCategory(Intent.CATEGORY_BROWSABLE));
        } catch (ActivityNotFoundException ignored) {
            // No app on the phone handles this link
        }
    }

    private void showOffline() {
        loading.setVisibility(View.GONE);
        offline.setVisibility(View.VISIBLE);
    }

    private void retry() {
        offline.setVisibility(View.GONE);
        if (!firstPageShown) loading.setVisibility(View.VISIBLE);
        String url = web.getUrl();
        if (url == null || !isAppUrl(Uri.parse(url))) url = APP_URL + "/";
        web.loadUrl(url);
    }

    @Override
    public void onBackPressed() {
        if (offline.getVisibility() == View.VISIBLE && web.canGoBack()) {
            offline.setVisibility(View.GONE);
            web.goBack();
        } else if (web.canGoBack()) {
            web.goBack();
        } else {
            super.onBackPressed();
        }
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        super.onSaveInstanceState(outState);
        web.saveState(outState);
    }

    @Override
    protected void onPause() {
        super.onPause();
        CookieManager.getInstance().flush();
        web.onPause();
    }

    @Override
    protected void onResume() {
        super.onResume();
        web.onResume();
    }

    @Override
    protected void onDestroy() {
        web.destroy();
        super.onDestroy();
    }

    // Getting the emailed sign-in link into the app.
    // Android 12+ opens https links in an app only once the site's assetlinks.json verifies it, or the
    // user has turned the link on in "Open by default". Until then the link lands in the browser.

    /** Signed out and links not yet handed to this app: offer to open the Android setting. */
    private void maybeAskToOpenLinksHere() {
        if (askedLinkSetting || Build.VERSION.SDK_INT < 31 || linksOpenHere()) return;
        web.evaluateJavascript("localStorage.getItem('dp-expert-token')", value -> {
            boolean signedIn = value != null && !"null".equals(value) && !"\"\"".equals(value);
            if (signedIn || askedLinkSetting || isFinishing()) return;
            askedLinkSetting = true;
            new AlertDialog.Builder(this)
                    .setTitle("Open sign-in links in this app")
                    .setMessage("So the link in the ACAPS email opens here instead of your browser:\n\n"
                            + "1. Tap \"Open settings\"\n"
                            + "2. Turn on \"Open supported links\"\n"
                            + "3. Tap \"Add link\" and tick " + APP_HOST + "\n\n"
                            + "Or copy the link from the email and come back: the app picks it up.")
                    .setPositiveButton("Open settings", (d, w) -> openLinkSettings())
                    .setNegativeButton("Not now", null)
                    .show();
        });
    }

    private boolean linksOpenHere() {
        if (Build.VERSION.SDK_INT < 31) return true; // older Android asks which app to use
        try {
            DomainVerificationManager m = getSystemService(DomainVerificationManager.class);
            DomainVerificationUserState st = m.getDomainVerificationUserState(getPackageName());
            if (st == null || !st.isLinkHandlingAllowed()) return false;
            Integer state = st.getHostToStateMap().get(APP_HOST);
            return state != null && state != DomainVerificationUserState.DOMAIN_STATE_NONE;
        } catch (Exception e) {
            return true; // can't tell: don't nag
        }
    }

    private void openLinkSettings() {
        Uri pkg = Uri.parse("package:" + getPackageName());
        try {
            startActivity(new Intent(Settings.ACTION_APP_OPEN_BY_DEFAULT_SETTINGS, pkg));
        } catch (ActivityNotFoundException e) {
            startActivity(new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, pkg));
        }
    }

    private static final Pattern URL_IN_TEXT = Pattern.compile("https://\\S+");

    /** A sign-in/invite/join link just copied (e.g. long-press in the email): offer to use it. */
    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (!hasFocus) return;
        try {
            ClipboardManager cm = (ClipboardManager) getSystemService(Context.CLIPBOARD_SERVICE);
            if (cm == null || !cm.hasPrimaryClip()) return;
            ClipDescription desc = cm.getPrimaryClipDescription();
            if (desc == null || !(desc.hasMimeType("text/*"))) return;
            long ts = desc.getTimestamp();
            if (ts != 0 && ts <= prefs.getLong("clipSeen", 0)) return; // only new copies
            prefs.edit().putLong("clipSeen", ts).apply();
            ClipData clip = cm.getPrimaryClip();
            if (clip == null || clip.getItemCount() == 0) return;
            CharSequence text = clip.getItemAt(0).coerceToText(this);
            if (text == null) return;
            Matcher mt = URL_IN_TEXT.matcher(text);
            if (!mt.find()) return;
            Uri link = Uri.parse(mt.group());
            if (!isAppUrl(link)) return;
            if (link.getQueryParameter("token") == null && link.getQueryParameter("join") == null) return;
            new AlertDialog.Builder(this)
                    .setTitle("Sign in with the copied link?")
                    .setMessage("You copied an ACAPS expert link. Open it in the app?")
                    .setPositiveButton("Sign in", (d, w) -> {
                        offline.setVisibility(View.GONE);
                        web.loadUrl(link.toString());
                    })
                    .setNegativeButton("No", null)
                    .show();
        } catch (Exception ignored) {
            // Clipboard not readable: nothing to offer
        }
    }

    // Native screens shown before the site loads, and when the phone can't reach it

    private View buildLoading() {
        LinearLayout box = column();
        box.setBackgroundColor(Color.parseColor("#F8FAFC"));
        box.addView(title("ACAPS expert panel"));
        box.addView(body("Connecting to the server…\nThe first start can take up to a minute while the server wakes up."));
        ProgressBar spin = new ProgressBar(this);
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(dp(40), dp(40));
        lp.topMargin = dp(24);
        box.addView(spin, lp);
        return box;
    }

    private View buildOffline() {
        LinearLayout box = column();
        box.setBackgroundColor(Color.parseColor("#F8FAFC"));
        box.addView(title("Can't reach ACAPS"));
        box.addView(body("Check your internet connection and try again."));
        Button b = new Button(this);
        b.setText("Try again");
        b.setTextColor(Color.WHITE);
        b.setBackgroundColor(Color.parseColor("#0F172A"));
        b.setOnClickListener(v -> retry());
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(52));
        lp.topMargin = dp(24);
        box.addView(b, lp);
        return box;
    }

    private LinearLayout column() {
        LinearLayout box = new LinearLayout(this);
        box.setOrientation(LinearLayout.VERTICAL);
        box.setGravity(Gravity.CENTER);
        box.setPadding(dp(32), dp(32), dp(32), dp(32));
        box.setClickable(true); // swallow taps so the page underneath can't be touched
        return box;
    }

    private TextView title(String text) {
        TextView t = new TextView(this);
        t.setText(text);
        t.setTextSize(24);
        t.setTextColor(Color.parseColor("#0F172A"));
        t.setGravity(Gravity.CENTER);
        t.setTypeface(t.getTypeface(), android.graphics.Typeface.BOLD);
        return t;
    }

    private TextView body(String text) {
        TextView t = new TextView(this);
        t.setText(text);
        t.setTextSize(15);
        t.setTextColor(Color.parseColor("#475569"));
        t.setGravity(Gravity.CENTER);
        t.setPadding(0, dp(12), 0, 0);
        return t;
    }

    private static FrameLayout.LayoutParams match() {
        return new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT);
    }

    private int dp(int v) {
        return Math.round(v * getResources().getDisplayMetrics().density);
    }
}
