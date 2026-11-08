package th.top.addonloader;

import android.content.ContentProvider;
import android.content.ContentValues;
import android.database.Cursor;
import android.database.MatrixCursor;
import android.net.Uri;
import android.os.ParcelFileDescriptor;
import android.provider.OpenableColumns;
import java.io.File;
import java.io.FileNotFoundException;

/** Serves an addon from the app library (files/library) to Minecraft, read-only. */
public class AddonProvider extends ContentProvider {
    static final String AUTH = "th.top.addonloader.files";

    private File file(Uri u) {
        String n = u.getLastPathSegment();
        if (n == null || n.contains("/") || n.contains("..")) return null;
        File f = new File(new File(getContext().getFilesDir(), "library"), n);
        return f.isFile() ? f : null;
    }

    @Override public boolean onCreate() { return true; }

    @Override public String getType(Uri u) { return "application/octet-stream"; }

    @Override public ParcelFileDescriptor openFile(Uri u, String mode) throws FileNotFoundException {
        File f = file(u);
        if (f == null) throw new FileNotFoundException(String.valueOf(u));
        return ParcelFileDescriptor.open(f, ParcelFileDescriptor.MODE_READ_ONLY);
    }

    @Override public Cursor query(Uri u, String[] proj, String sel, String[] args, String sort) {
        File f = file(u);
        if (f == null) return null;
        MatrixCursor c = new MatrixCursor(new String[]{OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE});
        c.addRow(new Object[]{f.getName(), f.length()});
        return c;
    }

    @Override public Uri insert(Uri u, ContentValues v) { return null; }
    @Override public int delete(Uri u, String s, String[] a) { return 0; }
    @Override public int update(Uri u, ContentValues v, String s, String[] a) { return 0; }
}
