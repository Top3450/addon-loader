package th.top.addonloader;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.util.Base64;
import android.util.Log;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import org.json.JSONArray;
import org.json.JSONObject;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;

/** Mod Studio: the web-based model/texture/animation/addon editor (assets/studio) hosted in a WebView. */
public class StudioActivity extends Activity {
    private static final String TAG = "ModStudio";
    private static final int PICK_FILE = 11, SAVE_FILE = 12;
    private WebView web;
    private ValueCallback<Uri[]> fileCallback;
    private byte[] pendingSave;

    @SuppressLint({"SetJavaScriptEnabled", "AddJavascriptInterface"})
    @Override protected void onCreate(Bundle b) {
        super.onCreate(b);
        getWindow().setStatusBarColor(Color.rgb(21, 32, 22));
        web = new WebView(this);
        web.setBackgroundColor(Color.rgb(29, 43, 31));
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setAllowFileAccess(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        web.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView v, String url) {
                return !url.startsWith("file:///android_asset/");
            }
        });
        web.setWebChromeClient(new WebChromeClient() {
            @Override public boolean onShowFileChooser(WebView v, ValueCallback<Uri[]> cb, FileChooserParams p) {
                if (fileCallback != null) fileCallback.onReceiveValue(null);
                fileCallback = cb;
                Intent i = new Intent(Intent.ACTION_GET_CONTENT);
                i.addCategory(Intent.CATEGORY_OPENABLE);
                String[] types = p.getAcceptTypes();
                i.setType(types != null && types.length > 0 && types[0].startsWith("image/") ? "image/*" : "*/*");
                try {
                    startActivityForResult(Intent.createChooser(i, "เลือกไฟล์"), PICK_FILE);
                } catch (ActivityNotFoundException e) {
                    fileCallback = null;
                    Mc.toast(StudioActivity.this, "ไม่พบแอพเลือกไฟล์");
                    return false;
                }
                return true;
            }
        });
        web.addJavascriptInterface(new Bridge(), "Android");
        web.loadUrl("file:///android_asset/studio/index.html");
        setContentView(web);
    }

    @Override public void onBackPressed() {
        web.evaluateJavascript("window.studioBack ? studioBack() : 'false'", v -> {
            if (!"\"true\"".equals(v)) StudioActivity.super.onBackPressed();
        });
    }

    @Override protected void onPause() {
        super.onPause();
        web.evaluateJavascript("window.S && S.saveNow && S.saveNow()", null);
    }

    @Override protected void onDestroy() {
        web.destroy();
        super.onDestroy();
    }

    @Override protected void onActivityResult(int req, int res, Intent data) {
        super.onActivityResult(req, res, data);
        if (req == PICK_FILE) {
            if (fileCallback == null) return;
            Uri u = res == RESULT_OK && data != null ? data.getData() : null;
            fileCallback.onReceiveValue(u == null ? null : new Uri[]{u});
            fileCallback = null;
        } else if (req == SAVE_FILE) {
            final byte[] bytes = pendingSave;
            pendingSave = null;
            if (res != RESULT_OK || data == null || data.getData() == null || bytes == null) return;
            final Uri u = data.getData();
            new Thread(() -> {
                boolean ok;
                try (OutputStream out = getContentResolver().openOutputStream(u)) {
                    if (out == null) throw new IOException("no stream");
                    out.write(bytes);
                    ok = true;
                } catch (Exception e) {
                    Log.e(TAG, "save failed", e);
                    ok = false;
                }
                final boolean done = ok;
                runOnUiThread(() -> Mc.toast(this, done ? "✅ บันทึกไฟล์แล้ว" : "❌ บันทึกไฟล์ไม่สำเร็จ"));
            }).start();
        }
    }

    // ---------------- storage helpers ----------------
    private File dir(String name) {
        File d = new File(getFilesDir(), name);
        if (!d.isDirectory() && !d.mkdirs()) Log.w(TAG, "mkdirs failed: " + d);
        return d;
    }

    private static String safeId(String id) {
        String s = id == null ? "" : id.replaceAll("[^A-Za-z0-9_-]", "");
        return s.isEmpty() ? "x" : s;
    }

    private static String safeName(String n) {
        String s = n == null ? "" : n.replaceAll("[^\\w.\\u0E00-\\u0E7F-]+", "_");
        return s.isEmpty() || s.startsWith(".") ? "addon.mcaddon" : s;
    }

    private static String readText(File f) throws IOException {
        try (InputStream in = new FileInputStream(f)) {
            ByteArrayOutputStream bo = new ByteArrayOutputStream();
            byte[] buf = new byte[65536];
            int n;
            while ((n = in.read(buf)) > 0) bo.write(buf, 0, n);
            return bo.toString("UTF-8");
        }
    }

    private static void writeAtomic(File f, byte[] data) throws IOException {
        File tmp = new File(f.getPath() + ".tmp");
        try (OutputStream out = new FileOutputStream(tmp)) { out.write(data); }
        if (f.exists() && !f.delete()) throw new IOException("cannot replace " + f);
        if (!tmp.renameTo(f)) throw new IOException("cannot rename " + tmp);
    }

    /** Methods called from the studio JavaScript as window.Android.* */
    class Bridge {
        @JavascriptInterface public String listProjects() {
            JSONArray arr = new JSONArray();
            File[] metas = dir("projects").listFiles((d, n) -> n.endsWith(".meta"));
            if (metas == null) return "[]";
            java.util.Arrays.sort(metas, (x, y) -> Long.compare(y.lastModified(), x.lastModified()));
            for (File m : metas) {
                try {
                    JSONObject o = new JSONObject(readText(m));
                    if (new File(dir("projects"), o.optString("id") + ".json").isFile()) arr.put(o);
                } catch (Exception e) { Log.w(TAG, "bad meta " + m, e); }
            }
            return arr.toString();
        }

        @JavascriptInterface public String readProject(String id) {
            File f = new File(dir("projects"), safeId(id) + ".json");
            try { return f.isFile() ? readText(f) : null; } catch (IOException e) { Log.e(TAG, "read", e); return null; }
        }

        @JavascriptInterface public void writeProject(String id, String json, String name) {
            String sid = safeId(id);
            try {
                writeAtomic(new File(dir("projects"), sid + ".json"), json.getBytes(StandardCharsets.UTF_8));
                JSONObject meta = new JSONObject().put("id", sid).put("name", name).put("updated", System.currentTimeMillis());
                writeAtomic(new File(dir("projects"), sid + ".meta"), meta.toString().getBytes(StandardCharsets.UTF_8));
            } catch (Exception e) {
                Log.e(TAG, "write", e);
                runOnUiThread(() -> Mc.toast(StudioActivity.this, "⚠️ บันทึกโปรเจกต์ไม่สำเร็จ"));
            }
        }

        @JavascriptInterface public void deleteProject(String id) {
            String sid = safeId(id);
            new File(dir("projects"), sid + ".json").delete();
            new File(dir("projects"), sid + ".meta").delete();
        }

        @JavascriptInterface public String saveToLibrary(String name, String b64) {
            try {
                String n = safeName(name);
                writeAtomic(new File(dir("library"), n), Base64.decode(b64, Base64.DEFAULT));
                return n;
            } catch (Exception e) {
                Log.e(TAG, "library", e);
                return "";
            }
        }

        @JavascriptInterface public void installAddon(String name) {
            final File f = new File(dir("library"), safeName(name));
            runOnUiThread(() -> Mc.install(StudioActivity.this, f));
        }

        @JavascriptInterface public void playMinecraft() {
            runOnUiThread(() -> Mc.play(StudioActivity.this));
        }

        @JavascriptInterface public void saveFile(String name, String b64, String mime) {
            final byte[] bytes;
            try { bytes = Base64.decode(b64, Base64.DEFAULT); } catch (IllegalArgumentException e) { return; }
            runOnUiThread(() -> {
                pendingSave = bytes;
                Intent i = new Intent(Intent.ACTION_CREATE_DOCUMENT);
                i.addCategory(Intent.CATEGORY_OPENABLE);
                i.setType(mime == null || mime.isEmpty() ? "application/octet-stream" : mime);
                i.putExtra(Intent.EXTRA_TITLE, name);
                try { startActivityForResult(i, SAVE_FILE); }
                catch (ActivityNotFoundException e) { pendingSave = null; Mc.toast(StudioActivity.this, "เครื่องนี้บันทึกไฟล์ไม่ได้"); }
            });
        }
    }
}
