package pk.irfanautos.salesman.location

import android.Manifest
import android.annotation.SuppressLint
import android.content.Context
import android.content.pm.PackageManager
import androidx.core.content.ContextCompat
import com.google.android.gms.location.LocationServices
import com.google.android.gms.location.Priority
import com.google.android.gms.tasks.CancellationTokenSource
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withTimeoutOrNull
import pk.irfanautos.salesman.App
import pk.irfanautos.salesman.data.Fix

class GpsException(message: String) : Exception(message)

object Gps {
    private const val UNAVAILABLE = "Your location could not be read. Turn on GPS (location) and try again, preferably in an open area."

    fun hasPermission(ctx: Context): Boolean =
        ContextCompat.checkSelfPermission(ctx, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED ||
            ContextCompat.checkSelfPermission(ctx, Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED

    /** A fresh position if the GPS finds one within 15 seconds; otherwise the last position the phone saved in the last 6 hours (so work can start
     *  and end offline, indoors, with a cold GPS); otherwise an error. */
    suspend fun best(ctx: Context): Fix {
        val fresh = withTimeoutOrNull(15_000L) { runCatching { current(ctx) }.getOrNull() }
        if (fresh != null) return fresh
        App.prefs.recentFix(6 * 3600_000L)?.let { return it }
        throw GpsException(UNAVAILABLE)
    }

    /** One fresh reading of the phone's position. */
    @SuppressLint("MissingPermission")
    suspend fun current(ctx: Context): Fix = suspendCancellableCoroutine { cont ->
        val client = LocationServices.getFusedLocationProviderClient(ctx)
        val cts = CancellationTokenSource()
        cont.invokeOnCancellation { cts.cancel() }

        fun done(f: Fix) { if (cont.isActive) cont.resume(f) }
        fun fail(m: String) { if (cont.isActive) cont.resumeWithException(GpsException(m)) }

        try {
            client.getCurrentLocation(Priority.PRIORITY_HIGH_ACCURACY, cts.token)
                .addOnSuccessListener { loc ->
                    if (loc != null) {
                        done(Fix(loc.latitude, loc.longitude, loc.accuracy.toDouble()))
                    } else {
                        client.lastLocation
                            .addOnSuccessListener { last ->
                                if (last != null) done(Fix(last.latitude, last.longitude, last.accuracy.toDouble())) else fail(UNAVAILABLE)
                            }
                            .addOnFailureListener { fail(UNAVAILABLE) }
                    }
                }
                .addOnFailureListener { fail(UNAVAILABLE) }
        } catch (e: SecurityException) {
            fail("Location permission is missing. Allow location for this app in the phone settings.")
        }
    }
}
