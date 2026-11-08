package pk.irfanautos.salesman.data

import android.content.Context
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteOpenHelper

/** The database on the phone: small documents (customers, plan, accounts...) and the full parts list, searchable without internet. */
class LocalDb(ctx: Context) : SQLiteOpenHelper(ctx, "salesman.db", null, 1) {
    override fun onCreate(db: SQLiteDatabase) {
        db.execSQL("CREATE TABLE kv (k TEXT PRIMARY KEY, v TEXT NOT NULL, at INTEGER NOT NULL)")
        db.execSQL(
            "CREATE TABLE products (id TEXT PRIMARY KEY, name TEXT, name_lc TEXT, name_ur TEXT, code TEXT, code_lc TEXT, " +
                "brand TEXT, brand_lc TEXT, scheme TEXT, unit TEXT, cp REAL, on_hand REAL)",
        )
        db.execSQL("CREATE INDEX products_name ON products(name_lc)")
    }

    override fun onUpgrade(db: SQLiteDatabase, oldVersion: Int, newVersion: Int) {}

    @Synchronized fun put(k: String, v: String) {
        writableDatabase.execSQL("INSERT OR REPLACE INTO kv(k, v, at) VALUES(?, ?, ?)", arrayOf<Any?>(k, v, System.currentTimeMillis()))
    }

    @Synchronized fun get(k: String): String? {
        readableDatabase.rawQuery("SELECT v FROM kv WHERE k = ?", arrayOf(k)).use { c -> return if (c.moveToFirst()) c.getString(0) else null }
    }

    /** When a document was saved (epoch ms), 0 if it was never saved. */
    @Synchronized fun savedAt(k: String): Long {
        readableDatabase.rawQuery("SELECT at FROM kv WHERE k = ?", arrayOf(k)).use { c -> return if (c.moveToFirst()) c.getLong(0) else 0L }
    }

    /** Forget everything (another person signed in on this phone). */
    @Synchronized fun clearAll() {
        writableDatabase.execSQL("DELETE FROM kv")
        writableDatabase.execSQL("DELETE FROM products")
    }

    @Synchronized fun replaceProducts(list: List<Product>) {
        val db = writableDatabase
        db.beginTransaction()
        try {
            db.execSQL("DELETE FROM products")
            val st = db.compileStatement(
                "INSERT OR REPLACE INTO products(id, name, name_lc, name_ur, code, code_lc, brand, brand_lc, scheme, unit, cp, on_hand) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)",
            )
            for (p in list) {
                st.clearBindings()
                st.bindString(1, p.id)
                st.bindString(2, p.name_en)
                st.bindString(3, p.name_en.lowercase())
                st.bindString(4, p.name_ur ?: "")
                st.bindString(5, p.code_name ?: "")
                st.bindString(6, (p.code_name ?: "").lowercase())
                st.bindString(7, p.brand ?: "")
                st.bindString(8, (p.brand ?: "").lowercase())
                st.bindString(9, p.scheme ?: "")
                st.bindString(10, p.unit ?: "")
                st.bindDouble(11, p.cp)
                st.bindDouble(12, p.on_hand)
                st.executeInsert()
            }
            db.setTransactionSuccessful()
        } finally {
            db.endTransaction()
        }
    }

    @Synchronized fun productCount(): Int {
        readableDatabase.rawQuery("SELECT COUNT(*) FROM products", null).use { c -> return if (c.moveToFirst()) c.getInt(0) else 0 }
    }

    /** Every word typed must appear in the name, code, brand or Urdu name. A code that starts with the first word is listed first. */
    @Synchronized fun searchProducts(q: String, limit: Int = 40): List<Product> {
        val words = q.trim().lowercase().split(Regex("\\s+")).filter { it.isNotEmpty() }
        if (words.isEmpty()) return emptyList()
        val where = words.joinToString(" AND ") { "(name_lc LIKE ? OR code_lc LIKE ? OR brand_lc LIKE ? OR name_ur LIKE ?)" }
        val args = ArrayList<String>()
        for (w in words) {
            val like = "%$w%"
            repeat(4) { args.add(like) }
        }
        args.add(words[0])
        args.add(words[0] + "%")
        val sql = "SELECT id, name, code, brand, scheme, unit, cp, on_hand, name_ur FROM products WHERE $where " +
            "ORDER BY CASE WHEN code_lc = ? THEN 0 WHEN code_lc LIKE ? THEN 1 ELSE 2 END, name_lc LIMIT $limit"
        val out = ArrayList<Product>()
        readableDatabase.rawQuery(sql, args.toTypedArray()).use { c ->
            while (c.moveToNext()) {
                out.add(
                    Product(
                        id = c.getString(0), name_en = c.getString(1), code_name = c.getString(2).ifEmpty { null }, brand = c.getString(3).ifEmpty { null },
                        scheme = c.getString(4).ifEmpty { null }, unit = c.getString(5).ifEmpty { null }, cp = c.getDouble(6), on_hand = c.getDouble(7),
                        name_ur = c.getString(8).ifEmpty { null },
                    ),
                )
            }
        }
        return out
    }
}
