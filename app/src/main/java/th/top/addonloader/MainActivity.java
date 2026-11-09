package th.top.addonloader;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.content.SharedPreferences;
import android.database.Cursor;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.provider.DocumentsContract;
import android.provider.DocumentsContract.Document;
import android.provider.OpenableColumns;
import android.view.Gravity;
import android.view.View;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import android.widget.Toast;
import org.json.JSONObject;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;

public class MainActivity extends Activity {
    static final String MC = "com.mojang.minecraftpe";
    static final int PICK = 1, PICK_TREE = 2;
    static final String KEY_TREE = "mc_tree";
    static final int BG = Color.rgb(29, 43, 31), CARD = Color.rgb(43, 61, 45), BLUE = Color.rgb(58, 110, 165),
            GREEN = Color.rgb(92, 184, 92), RED = Color.rgb(192, 57, 43), GRAY = Color.rgb(85, 85, 95);
    private TextView status;
    private LinearLayout libList, gameList;

    @Override protected void onCreate(Bundle b) {
        super.onCreate(b);
        ScrollView sv = new ScrollView(this);
        sv.setBackgroundColor(BG);
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setPadding(40, 100, 40, 80);
        sv.addView(root);

        TextView title = text("⛏️ Addon Loader TH", 26, Color.rgb(143, 227, 136));
        title.setGravity(Gravity.CENTER);
        root.addView(title);
        status = text("เพิ่ม Addon เข้าคลัง แล้วกดใส่ลงเกมได้ทุกเมื่อ", 15, Color.WHITE);
        status.setGravity(Gravity.CENTER);
        status.setPadding(0, 32, 0, 32);
        root.addView(status);
        root.addView(button("🛠 Mod Studio — สร้างม็อดเอง", Color.rgb(126, 87, 194), v -> startActivity(new Intent(this, StudioActivity.class))));
        root.addView(button("📂 เพิ่ม Addon จากเครื่อง", BLUE, v -> pick()));
        root.addView(button("🎮 เล่น Minecraft", RED, v -> play()));

        root.addView(header("📦 คลัง Addon ของฉัน"));
        libList = column();
        root.addView(libList);

        root.addView(header("🧩 Addon ที่อยู่ในเกม"));
        root.addView(button("📁 เชื่อมโฟลเดอร์ Minecraft", GRAY, v -> pickTree()));
        gameList = column();
        root.addView(gameList);
        TextView help = text("ถ้าเชื่อมโฟลเดอร์ไม่ได้ (Android 13 ขึ้นไป หรือ Minecraft เก็บไฟล์ไว้ในแอพ) ให้ลบในเกมแทน:\n"
                + "เปิด Minecraft → ตั้งค่า → พื้นที่จัดเก็บ (Storage) → เลือก Addon → ลบ", 13, Color.rgb(190, 210, 190));
        help.setPadding(0, 24, 0, 0);
        root.addView(help);

        setContentView(sv);
        refreshLibrary();
        refreshGame();
        handleIncoming(getIntent());
    }

    @Override protected void onNewIntent(Intent i) {
        super.onNewIntent(i);
        handleIncoming(i);
    }

    @Override protected void onResume() {
        super.onResume();
        refreshLibrary();
        refreshGame();
    }

    // ---------------- UI helpers ----------------
    private TextView text(String s, int size, int color) {
        TextView t = new TextView(this);
        t.setText(s);
        t.setTextSize(size);
        t.setTextColor(color);
        return t;
    }

    private TextView header(String s) {
        TextView t = text(s, 19, Color.rgb(143, 227, 136));
        t.setPadding(0, 48, 0, 16);
        return t;
    }

    private LinearLayout column() {
        LinearLayout l = new LinearLayout(this);
        l.setOrientation(LinearLayout.VERTICAL);
        return l;
    }

    private Button button(String label, int color, View.OnClickListener l) {
        Button bt = small(label, color, l);
        bt.setTextSize(18);
        bt.setPadding(24, 36, 24, 36);
        LinearLayout.LayoutParams p = new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        p.setMargins(0, 0, 0, 24);
        bt.setLayoutParams(p);
        return bt;
    }

    private Button small(String label, int color, View.OnClickListener l) {
        Button bt = new Button(this);
        bt.setText(label);
        bt.setTextSize(14);
        bt.setAllCaps(false);
        bt.setTextColor(Color.WHITE);
        bt.setBackgroundColor(color);
        bt.setOnClickListener(l);
        return bt;
    }

    private void row(LinearLayout list, String label, Button... buttons) {
        LinearLayout r = new LinearLayout(this);
        r.setOrientation(LinearLayout.HORIZONTAL);
        r.setGravity(Gravity.CENTER_VERTICAL);
        r.setBackgroundColor(CARD);
        r.setPadding(24, 16, 16, 16);
        TextView t = text(label, 14, Color.WHITE);
        r.addView(t, new LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f));
        for (Button b : buttons) {
            LinearLayout.LayoutParams p = new LinearLayout.LayoutParams(LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT);
            p.setMargins(12, 0, 0, 0);
            r.addView(b, p);
        }
        LinearLayout.LayoutParams p = new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        p.setMargins(0, 0, 0, 12);
        list.addView(r, p);
    }

    private void note(LinearLayout list, String s) {
        list.removeAllViews();
        TextView t = text(s, 14, Color.rgb(170, 190, 170));
        t.setPadding(8, 8, 8, 8);
        list.addView(t);
    }

    private void confirm(String msg, Runnable yes) {
        new AlertDialog.Builder(this).setMessage(msg)
                .setPositiveButton("ลบ", (d, w) -> yes.run())
                .setNegativeButton("ยกเลิก", null).show();
    }

    private void toast(String s) { Toast.makeText(this, s, Toast.LENGTH_LONG).show(); }

    // ---------------- library (addons kept inside the app) ----------------
    private File lib() {
        File d = new File(getFilesDir(), "library");
        if (!d.isDirectory()) d.mkdirs();
        return d;
    }

    private void refreshLibrary() {
        File[] files = lib().listFiles((d, n) -> !n.equals("tmp.bin"));
        if (files == null || files.length == 0) { note(libList, "ยังไม่มี Addon ในคลัง — กด “เพิ่ม Addon จากเครื่อง”"); return; }
        Arrays.sort(files, (a, b) -> Long.compare(b.lastModified(), a.lastModified()));
        libList.removeAllViews();
        for (File f : files) {
            String size = f.length() >= 1048576 ? String.format("%.1f MB", f.length() / 1048576f) : (f.length() / 1024 + " KB");
            row(libList, f.getName() + "\n" + size,
                    small("📥 ใส่เกม", GREEN, v -> install(f)),
                    small("🗑", RED, v -> confirm("ลบ " + f.getName() + " ออกจากคลัง?", () -> {
                        if (f.delete()) toast("ลบออกจากคลังแล้ว");
                        refreshLibrary();
                    })));
        }
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
        if (res != RESULT_OK || data == null || data.getData() == null) return;
        if (req == PICK) load(data.getData());
        else if (req == PICK_TREE) {
            Uri tree = data.getData();
            try {
                getContentResolver().takePersistableUriPermission(tree,
                        Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION);
            } catch (SecurityException e) { toast("ขอสิทธิ์โฟลเดอร์ไม่สำเร็จ"); }
            getPreferences(MODE_PRIVATE).edit().putString(KEY_TREE, tree.toString()).apply();
            refreshGame();
        }
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
        status.setText("กำลังเก็บลงคลัง...");
        new Thread(() -> {
            try {
                String name = displayName(uri);
                File tmp = new File(lib(), "tmp.bin");
                try (InputStream in = getContentResolver().openInputStream(uri); OutputStream out = new FileOutputStream(tmp)) {
                    if (in == null) throw new IOException("เปิดไฟล์ไม่ได้");
                    byte[] buf = new byte[65536];
                    int n;
                    while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
                }
                String ext = detectExt(name, tmp);
                if (ext == null) { tmp.delete(); throw new IOException("ไฟล์นี้ไม่ใช่ Addon ของ Minecraft"); }
                String base = name.replaceAll("\\.[^.]*$", "").replaceAll("[^\\w\\u0E00-\\u0E7F-]+", "_");
                if (base.isEmpty()) base = "addon";
                final File dst = new File(lib(), base + ext);
                if (dst.exists()) dst.delete();
                if (!tmp.renameTo(dst)) throw new IOException("บันทึกไฟล์ไม่ได้");
                runOnUiThread(() -> {
                    status.setText("✅ เก็บลงคลังแล้ว: " + dst.getName());
                    refreshLibrary();
                });
            } catch (Exception e) {
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

    private void install(File f) {
        if (!f.isFile()) { toast("ไม่พบไฟล์ในคลัง"); refreshLibrary(); return; }
        Mc.install(this, f);
    }

    private void play() { Mc.play(this); }

    // ---------------- packs installed in the game (via a granted folder) ----------------
    private void pickTree() {
        Intent i = new Intent(Intent.ACTION_OPEN_DOCUMENT_TREE);
        i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION
                | Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION);
        if (Build.VERSION.SDK_INT >= 26)
            i.putExtra(DocumentsContract.EXTRA_INITIAL_URI, Uri.parse(
                    "content://com.android.externalstorage.documents/document/primary%3AAndroid%2Fdata%2Fcom.mojang.minecraftpe%2Ffiles%2Fgames%2Fcom.mojang"));
        try { startActivityForResult(i, PICK_TREE); } catch (ActivityNotFoundException e) { toast("เครื่องนี้เลือกโฟลเดอร์ไม่ได้"); }
    }

    private Uri savedTree() {
        String s = getPreferences(MODE_PRIVATE).getString(KEY_TREE, null);
        return s == null ? null : Uri.parse(s);
    }

    private List<String[]> children(Uri tree, String docId) {
        List<String[]> out = new ArrayList<>();
        Uri u = DocumentsContract.buildChildDocumentsUriUsingTree(tree, docId);
        try (Cursor c = getContentResolver().query(u, new String[]{Document.COLUMN_DOCUMENT_ID,
                Document.COLUMN_DISPLAY_NAME, Document.COLUMN_MIME_TYPE}, null, null, null)) {
            while (c != null && c.moveToNext()) out.add(new String[]{c.getString(0), c.getString(1), c.getString(2)});
        }
        return out;
    }

    private String child(Uri tree, String docId, String name) {
        for (String[] c : children(tree, docId)) if (name.equalsIgnoreCase(c[1])) return c[0];
        return null;
    }

    /** Finds the com.mojang folder whether the user picked it, its parent "games", or a folder above. */
    private String mojangRoot(Uri tree) {
        String root = DocumentsContract.getTreeDocumentId(tree);
        if (child(tree, root, "behavior_packs") != null || child(tree, root, "resource_packs") != null) return root;
        String cm = child(tree, root, "com.mojang");
        if (cm != null) return cm;
        String games = child(tree, root, "games");
        if (games != null) return child(tree, games, "com.mojang");
        String files = child(tree, root, "files");
        if (files != null && (games = child(tree, files, "games")) != null) return child(tree, games, "com.mojang");
        return null;
    }

    private String packName(Uri tree, String docId, String fallback) {
        String m = child(tree, docId, "manifest.json");
        if (m == null) return fallback;
        try (InputStream in = getContentResolver().openInputStream(DocumentsContract.buildDocumentUriUsingTree(tree, m))) {
            ByteArrayOutputStream bo = new ByteArrayOutputStream();
            byte[] buf = new byte[8192];
            int n;
            while (in != null && (n = in.read(buf)) > 0) bo.write(buf, 0, n);
            String txt = bo.toString("UTF-8").replaceAll("(?m)^\\s*//.*$", "");
            String name = new JSONObject(txt).getJSONObject("header").optString("name", fallback);
            return name.replaceAll("§.", "");
        } catch (Exception e) {
            return fallback;
        }
    }

    private void refreshGame() {
        final Uri tree = savedTree();
        if (tree == null) { note(gameList, "ยังไม่ได้เชื่อมโฟลเดอร์ — กด “เชื่อมโฟลเดอร์ Minecraft” แล้วเลือกโฟลเดอร์ com.mojang"); return; }
        note(gameList, "กำลังอ่าน Addon ในเกม...");
        new Thread(() -> {
            final List<String[]> packs = new ArrayList<>(); // docId, label
            String error = null;
            try {
                String root = mojangRoot(tree);
                if (root == null) error = "ไม่พบโฟลเดอร์ behavior_packs / resource_packs ในโฟลเดอร์ที่เลือก";
                else {
                    for (String[] kind : new String[][]{{"behavior_packs", "BP"}, {"resource_packs", "RP"}}) {
                        String dir = child(tree, root, kind[0]);
                        if (dir == null) continue;
                        for (String[] c : children(tree, dir))
                            if (Document.MIME_TYPE_DIR.equals(c[2]))
                                packs.add(new String[]{c[0], "[" + kind[1] + "] " + packName(tree, c[0], c[1]) + "\n" + c[1]});
                    }
                    if (packs.isEmpty()) error = "ไม่มี Addon ในเกม";
                }
            } catch (Exception e) {
                error = "อ่านโฟลเดอร์ไม่ได้ (" + e.getClass().getSimpleName() + ") — ลองเชื่อมโฟลเดอร์ใหม่ หรือลบในเกมตามวิธีด้านล่าง";
            }
            final String err = error;
            runOnUiThread(() -> {
                if (err != null) { note(gameList, err); return; }
                gameList.removeAllViews();
                for (String[] p : packs)
                    row(gameList, p[1], small("🗑 ลบ", RED, v -> confirm("ลบ Addon นี้ออกจากเกม?\n" + p[1], () -> deleteGamePack(tree, p[0]))));
            });
        }).start();
    }

    private void deleteGamePack(Uri tree, String docId) {
        new Thread(() -> {
            boolean ok;
            try {
                ok = DocumentsContract.deleteDocument(getContentResolver(), DocumentsContract.buildDocumentUriUsingTree(tree, docId));
            } catch (Exception e) {
                ok = false;
            }
            final boolean done = ok;
            runOnUiThread(() -> {
                toast(done ? "ลบออกจากเกมแล้ว" : "ลบไม่สำเร็จ — ลองลบในเกม: ตั้งค่า → พื้นที่จัดเก็บ");
                refreshGame();
            });
        }).start();
    }
}
