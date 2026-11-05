package pk.irfanautos.salesman.location

import android.content.Context
import android.location.LocationManager
import android.os.Build
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import pk.irfanautos.salesman.App
import pk.irfanautos.salesman.data.Events
import pk.irfanautos.salesman.data.Sync

/** Notices when location (GPS) is switched off or the app's location permission is taken away while he is on duty:
 *  the screen shows a warning, the notification says so, and the moment is saved and sent to the office. */
object LocationWatch {
    enum class Problem { LOCATION_OFF, PERMISSION_OFF }

    /** What is wrong right now (null = all good). The home screen watches this. */
    var problem by mutableStateOf<Problem?>(null)
        private set

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    fun check(ctx: Context): Problem? {
        if (!Gps.hasPermission(ctx)) return Problem.PERMISSION_OFF
        val lm = ctx.getSystemService(Context.LOCATION_SERVICE) as LocationManager
        val on = if (Build.VERSION.SDK_INT >= 28) lm.isLocationEnabled
        else lm.isProviderEnabled(LocationManager.GPS_PROVIDER) || lm.isProviderEnabled(LocationManager.NETWORK_PROVIDER)
        return if (on) null else Problem.LOCATION_OFF
    }

    /** Looks again. While on duty, a change is saved as an event for the office ("location_off" now, "location_on" when it is back). */
    fun refresh(ctx: Context) {
        val now = check(ctx)
        problem = now
        val prefs = App.prefs
        if (!prefs.onDuty) {
            prefs.lastLocState = "ok"
            return
        }
        val before = prefs.lastLocState
        val after = when (now) {
            null -> "ok"
            Problem.LOCATION_OFF -> "location_off"
            Problem.PERMISSION_OFF -> "permission_off"
        }
        if (before == after) return
        val t = System.currentTimeMillis()
        if (before != "ok") Events.add(before.replace("_off", "_on"), t) // the earlier problem is over
        if (after != "ok") Events.add(after, t + 1)                       // a new problem starts
        prefs.lastLocState = after
        scope.launch { Sync.uploadPings() } // sent now if there is internet, otherwise with the next upload
    }
}
