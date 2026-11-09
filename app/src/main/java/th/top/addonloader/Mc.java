package th.top.addonloader;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.net.Uri;
import android.widget.Toast;
import java.io.File;

/** Shared Minecraft helpers: send an addon from the library into the game, launch the game, open its store page. */
final class Mc {
    static final String PKG = "com.mojang.minecraftpe";

    private Mc() { }

    static void toast(Activity a, String s) { Toast.makeText(a, s, Toast.LENGTH_LONG).show(); }

    static void install(Activity a, File f) {
        if (f == null || !f.isFile()) { toast(a, "ไม่พบไฟล์ในคลัง"); return; }
        if (a.getPackageManager().getLaunchIntentForPackage(PKG) == null) { toast(a, "ยังไม่ได้ติดตั้ง Minecraft"); store(a); return; }
        Uri u = Uri.parse("content://" + AddonProvider.AUTH + "/" + Uri.encode(f.getName()));
        Intent i = new Intent(Intent.ACTION_VIEW);
        i.setDataAndType(u, "application/octet-stream");
        i.setPackage(PKG);
        i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
        try {
            a.startActivity(i);
            toast(a, "ส่งเข้า Minecraft แล้ว รอเกมนำเข้าสักครู่");
        } catch (ActivityNotFoundException e) {
            i.setPackage(null);
            try { a.startActivity(Intent.createChooser(i, "เลือก Minecraft")); }
            catch (ActivityNotFoundException e2) { toast(a, "Minecraft ไม่รับไฟล์นี้"); }
        }
    }

    static void play(Activity a) {
        Intent i = a.getPackageManager().getLaunchIntentForPackage(PKG);
        if (i == null) { toast(a, "ยังไม่ได้ติดตั้ง Minecraft"); store(a); return; }
        a.startActivity(i);
    }

    static void store(Activity a) {
        try {
            a.startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse("market://details?id=" + PKG)));
        } catch (ActivityNotFoundException e) {
            try { a.startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse("https://play.google.com/store/apps/details?id=" + PKG))); }
            catch (ActivityNotFoundException e2) { toast(a, "เปิดร้านค้าไม่ได้"); }
        }
    }
}
