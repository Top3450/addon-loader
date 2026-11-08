package th.top.addonloader;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.database.Cursor;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.provider.OpenableColumns;
import android.view.Gravity;
import android.view.View;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.widget.Toast;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;

public class MainActivity extends Activity {
    static final String MC = "com.mojang.minecraftpe";
    static final int PICK = 1;
    private volatile File current;
    private TextView status;

    @Override protected void onCreate(Bundle b) {
        super.onCreate(b);
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setPadding(48, 120, 48, 48);
        root.setBackgroundColor(Color.rgb(29, 43, 31));
        TextView title = new TextView(this);
        title.setText("⛏️ Addon Loader TH");
        title.setTextSize(26);
        title.setTextColor(Color.rgb(143, 227, 136));
        title.setGravity(Gravity.CENTER);
        root.addView(title);
        status = new TextView(this);
        status.setTextSize(16);
        status.setTextColor(Color.WHITE);
        status.setGravity(Gravity.CENTER);
        status.setPadding(0, 48, 0, 48);
        status.setText("ยังไม่ได้เลือก Addon\n(.mcaddon / .mcpack / .mcworld / .zip)");
        root.addView(status);
        root.addView(button("📂 เลือก Addon จากเครื่อง", Color.rgb(58, 110, 165), v -> pick()));
        root.addView(button("📥 ใส่ Addon ลงเกม", Color.rgb(92, 184, 92), v -> install()));
        root.addView(button("🎮 เล่น Minecraft", Color.rgb(192, 57, 43), v -> play()));
        setContentView(root);
        handleIncoming(getIntent());
    }

    @Override protected void onNewIntent(Intent i) {
        super.onNewIntent(i);
        handleIncoming(i);
    }

    private Button button(String text, int color, View.OnClickListener l) {
        Button bt = new Button(this);
        bt.setText(text);
        bt.setTextSize(18);
        bt.setAllCaps(false);
        bt.setTextColor(Color.WHITE);
        bt.setBackgroundColor(color);
        bt.setPadding(24, 36, 24, 36);
        bt.setOnClickListener(l);
        LinearLayout.LayoutParams p = new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        p.setMargins(0, 0, 0, 32);
        bt.setLayoutParams(p);
        return bt;
    }

    private void pick() {
        Intent i = new Intent(Intent.ACTION_OPEN_DOCUMENT);
        i.addCategory(Intent.CATEGORY_OPENABLE);
        i.setType("*/*");
        try {
            startActivityForResult(i, PICK);
        } catch (ActivityNotFoundException e) {
            Intent g = new Intent(Intent.ACTION_GET_CONTENT);
            g.addCategory(Intent.CATEGORY_OPENABLE);
            g.setType("*/*");
            try { startActivityForResult(g, PICK); } catch (ActivityNotFoundException e2) { toast("ไม่พบแอพเลือกไฟล์"); }
        }
    }

    @Override protected void onActivityResult(int req, int res, Intent data) {
        super.onActivityResult(req, res, data);
        if (req == PICK && res == RESULT_OK && data != null && data.getData() != null) load(data.getData());
    }

    @SuppressWarnings("deprecation")
    private void handleIncoming(Intent i) {
        if (i == null) return;
        Uri u = null;
        if (Intent.ACTION_VIEW.equals(i.getAction())) u = i.getData();
        else if (Intent.ACTION_SEND.equals(i.getAction())) u = i.getParcelableExtra(Intent.EXTRA_STREAM);
        if (u != null) load(u);
    }

    private void load(final Uri uri) {
        status.setText("กำลังโหลด...");
        new Thread(() -> {
            try {
                String name = displayName(uri);
                File dir = new File(getCacheDir(), "addons");
                if (!dir.isDirectory() && !dir.mkdirs()) throw new IOException("สร้างโฟลเดอร์ไม่ได้");
                File[] old = dir.listFiles();
                if (old != null) for (File f : old) f.delete();
                File tmp = new File(dir, "tmp.bin");
                try (InputStream in = getContentResolver().openInputStream(uri);
                     OutputStream out = new FileOutputStream(tmp)) {
                    if (in == null) throw new IOException("เปิดไฟล์ไม่ได้");
                    byte[] buf = new byte[65536];
                    int n;
                    while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
                }
                String ext = detectExt(name, tmp);
                if (ext == null) { tmp.delete(); throw new IOException("ไฟล์นี้ไม่ใช่ Addon ของ Minecraft"); }
                String base = name.replaceAll("\\.[^.]*$", "").replaceAll("[^\\w\\u0E00-\\u0E7F-]+", "_");
                if (base.isEmpty()) base = "addon";
                final File dst = new File(dir, base + ext);
                if (!tmp.renameTo(dst)) throw new IOException("บันทึกไฟล์ไม่ได้");
                current = dst;
                runOnUiThread(() -> status.setText("✅ พร้อมใส่ลงเกม:\n" + dst.getName()));
            } catch (Exception e) {
                current = null;
                final String msg = e.getMessage() == null ? e.toString() : e.getMessage();
                runOnUiThread(() -> status.setText("❌ " + msg));
            }
        }).start();
    }

    private String displayName(Uri uri) {
        String n = null;
        try (Cursor c = getContentResolver().query(uri, new String[]{OpenableColumns.DISPLAY_NAME}, null, null, null)) {
            if (c != null && c.moveToFirst()) n = c.getString(0);
        } catch (Exception ignored) { }
        if (n == null) n = uri.getLastPathSegment();
        if (n == null) return "addon";
        int s = n.lastIndexOf('/');
        return s >= 0 ? n.substring(s + 1) : n;
    }

    /** Returns the extension Minecraft expects, or null when the file is not an addon. */
    private String detectExt(String name, File f) {
        String low = name.toLowerCase();
        for (String e : new String[]{".mcaddon", ".mcpack", ".mcworld", ".mctemplate"})
            if (low.endsWith(e)) return e;
        boolean any = false, manifest = false, level = false;
        try (ZipInputStream z = new ZipInputStream(new FileInputStream(f))) {
            ZipEntry e;
            while ((e = z.getNextEntry()) != null) {
                any = true;
                if (e.getName().equals("manifest.json")) manifest = true;
                if (e.getName().equals("level.dat")) level = true;
            }
        } catch (Exception ex) {
            if (!any) return null;
        }
        if (!any) return null;
        if (level) return ".mcworld";
        return manifest ? ".mcpack" : ".mcaddon";
    }

    private void install() {
        File f = current;
        if (f == null || !f.isFile()) { toast("เลือก Addon ก่อน"); return; }
        if (getPackageManager().getLaunchIntentForPackage(MC) == null) { toast("ยังไม่ได้ติดตั้ง Minecraft"); store(); return; }
        Uri u = Uri.parse("content://" + AddonProvider.AUTH + "/" + Uri.encode(f.getName()));
        Intent i = new Intent(Intent.ACTION_VIEW);
        i.setDataAndType(u, "application/octet-stream");
        i.setPackage(MC);
        i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
        try {
            startActivity(i);
            toast("ส่งเข้า Minecraft แล้ว รอเกมนำเข้าสักครู่");
        } catch (ActivityNotFoundException e) {
            i.setPackage(null);
            try { startActivity(Intent.createChooser(i, "เลือก Minecraft")); }
            catch (ActivityNotFoundException e2) { toast("Minecraft ไม่รับไฟล์นี้"); }
        }
    }

    private void play() {
        Intent i = getPackageManager().getLaunchIntentForPackage(MC);
        if (i == null) { toast("ยังไม่ได้ติดตั้ง Minecraft"); store(); return; }
        startActivity(i);
    }

    private void store() {
        try {
            startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse("market://details?id=" + MC)));
        } catch (ActivityNotFoundException e) {
            startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse("https://play.google.com/store/apps/details?id=" + MC)));
        }
    }

    private void toast(String s) { Toast.makeText(this, s, Toast.LENGTH_LONG).show(); }
}
