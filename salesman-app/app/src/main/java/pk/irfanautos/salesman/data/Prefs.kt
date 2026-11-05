package pk.irfanautos.salesman.data

import android.content.Context
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import pk.irfanautos.salesman.App

/** Everything the phone remembers: the sign-in, the server address, whether he is on duty, and the offline queues. */
class Prefs(ctx: Context) {
    private val sp = ctx.getSharedPreferences("salesman", Context.MODE_PRIVATE)

    var token: String?
        get() = sp.getString("token", null)
        set(v) { sp.edit().apply { if (v == null) remove("token") else putString("token", v) }.apply() }

    var userId: String?
        get() = sp.getString("user_id", null)
        set(v) { sp.edit().apply { if (v == null) remove("user_id") else putString("user_id", v) }.apply() }

    var userName: String?
        get() = sp.getString("user_name", null)
        set(v) { sp.edit().apply { if (v == null) remove("user_name") else putString("user_name", v) }.apply() }

    /** Who the queued items below belong to: they are dropped if someone else signs in. */
    var queueOwner: String?
        get() = sp.getString("queue_owner", null)
        set(v) { sp.edit().apply { if (v == null) remove("queue_owner") else putString("queue_owner", v) }.apply() }

    var onDuty: Boolean
        get() = sp.getBoolean("on_duty", false)
        set(v) { sp.edit().putBoolean("on_duty", v).apply() }

    var batteryAsked: Boolean
        get() = sp.getBoolean("battery_asked", false)
        set(v) { sp.edit().putBoolean("battery_asked", v).apply() }

    var outbox: String
        get() = sp.getString("outbox", null) ?: "[]"
        set(v) { sp.edit().putString("outbox", v).apply() }

    var pings: String
        get() = sp.getString("pings", null) ?: "[]"
        set(v) { sp.edit().putString("pings", v).apply() }

    var events: String
        get() = sp.getString("events", null) ?: "[]"
        set(v) { sp.edit().putString("events", v).apply() }

    /** What the phone last reported about location while on duty: "ok", "location_off" or "permission_off". */
    var lastLocState: String
        get() = sp.getString("last_loc_state", null) ?: "ok"
        set(v) { sp.edit().putString("last_loc_state", v).apply() }

    var customersCache: String?
        get() = sp.getString("customers_cache", null)
        set(v) { sp.edit().apply { if (v == null) remove("customers_cache") else putString("customers_cache", v) }.apply() }

    var methodsCache: String?
        get() = sp.getString("methods_cache", null)
        set(v) { sp.edit().apply { if (v == null) remove("methods_cache") else putString("methods_cache", v) }.apply() }

    /** The last position the phone knew, added to requests so the office sees where they were made. */
    fun saveFix(fix: Fix, atMillis: Long = System.currentTimeMillis()) {
        sp.edit().putString("fix_lat", fix.lat.toString()).putString("fix_lng", fix.lng.toString()).putLong("fix_at", atMillis).apply()
    }

    fun recentFix(maxAgeMillis: Long = 15 * 60_000L): Fix? {
        val at = sp.getLong("fix_at", 0L)
        val lat = sp.getString("fix_lat", null)?.toDoubleOrNull()
        val lng = sp.getString("fix_lng", null)?.toDoubleOrNull()
        return if (lat != null && lng != null && System.currentTimeMillis() - at <= maxAgeMillis) Fix(lat, lng, 0.0) else null
    }
}

/** Compose-visible sign-in state: the app shows the sign-in screen whenever this turns false. */
object Session {
    var loggedIn by mutableStateOf(false)

    fun refresh() {
        loggedIn = App.prefs.token != null
    }

    /** Sign out (the queued items stay for the same person; they are dropped if another person signs in). */
    fun signOut() {
        App.prefs.token = null
        App.prefs.onDuty = false
        loggedIn = false
    }
}

data class Fix(val lat: Double, val lng: Double, val accuracy: Double)
