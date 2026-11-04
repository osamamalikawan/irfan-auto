package pk.irfanautos.salesman.location

import android.annotation.SuppressLint
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.BatteryManager
import android.os.IBinder
import android.os.Looper
import androidx.core.app.NotificationCompat
import androidx.core.app.ServiceCompat
import androidx.core.content.ContextCompat
import com.google.android.gms.location.FusedLocationProviderClient
import com.google.android.gms.location.LocationCallback
import com.google.android.gms.location.LocationRequest
import com.google.android.gms.location.LocationResult
import com.google.android.gms.location.LocationServices
import com.google.android.gms.location.Priority
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import pk.irfanautos.salesman.App
import pk.irfanautos.salesman.MainActivity
import pk.irfanautos.salesman.R
import pk.irfanautos.salesman.data.Fix
import pk.irfanautos.salesman.data.Outbox
import pk.irfanautos.salesman.data.Ping
import pk.irfanautos.salesman.data.Pings
import pk.irfanautos.salesman.data.Sync

object Tracking {
    fun start(ctx: Context) {
        ContextCompat.startForegroundService(ctx, Intent(ctx, TrackingService::class.java))
    }

    fun stop(ctx: Context) {
        ctx.stopService(Intent(ctx, TrackingService::class.java))
    }
}

/** While he is on duty this keeps running (with a notification) and every 2 minutes saves his position and sends it to the office.
 *  Positions taken without internet are kept on the phone and sent when it is back. */
class TrackingService : Service() {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private var client: FusedLocationProviderClient? = null
    private var running = false

    private val callback = object : LocationCallback() {
        override fun onLocationResult(result: LocationResult) {
            val battery = batteryPercent()
            for (l in result.locations) {
                Pings.add(Ping(l.latitude, l.longitude, if (l.hasAccuracy()) l.accuracy.toDouble() else null, l.time, battery))
                App.prefs.saveFix(Fix(l.latitude, l.longitude, if (l.hasAccuracy()) l.accuracy.toDouble() else 0.0), l.time)
            }
            scope.launch {
                val onDuty = Sync.uploadPings()
                if (Outbox.waiting() > 0) Outbox.flush()
                // the office closed his day (or he ended work on another phone): stop tracking
                if (onDuty == false) {
                    App.prefs.onDuty = false
                    stopSelf()
                }
            }
        }
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        // Android restarted us after killing the app: carry on only if he is still on duty
        if (intent == null && !App.prefs.onDuty) {
            stopSelf()
            return START_NOT_STICKY
        }
        try {
            ServiceCompat.startForeground(this, NOTIFICATION_ID, buildNotification(), ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION)
        } catch (e: Exception) {
            stopSelf()
            return START_NOT_STICKY
        }
        if (!running) {
            running = true
            requestUpdates()
        }
        return START_STICKY
    }

    @SuppressLint("MissingPermission")
    private fun requestUpdates() {
        val c = LocationServices.getFusedLocationProviderClient(this)
        client = c
        val request = LocationRequest.Builder(Priority.PRIORITY_HIGH_ACCURACY, INTERVAL_MS)
            .setMinUpdateIntervalMillis(INTERVAL_MS / 2)
            .build()
        try {
            c.requestLocationUpdates(request, callback, Looper.getMainLooper())
        } catch (e: SecurityException) {
            stopSelf()
        }
    }

    private fun buildNotification(): Notification {
        val nm = getSystemService(NotificationManager::class.java)
        if (nm.getNotificationChannel(CHANNEL_ID) == null) {
            nm.createNotificationChannel(NotificationChannel(CHANNEL_ID, "On duty", NotificationManager.IMPORTANCE_LOW))
        }
        val open = PendingIntent.getActivity(
            this, 0, Intent(this, MainActivity::class.java), PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
        )
        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_stat_location)
            .setContentTitle("Irfan Autos: you are on duty")
            .setContentText("Your location is shared with the office until you end work.")
            .setOngoing(true)
            .setContentIntent(open)
            .build()
    }

    private fun batteryPercent(): Int? {
        val bm = getSystemService(Context.BATTERY_SERVICE) as? BatteryManager ?: return null
        val p = bm.getIntProperty(BatteryManager.BATTERY_PROPERTY_CAPACITY)
        return if (p in 1..100) p else null
    }

    override fun onDestroy() {
        client?.removeLocationUpdates(callback)
        scope.cancel()
        super.onDestroy()
    }

    override fun onBind(intent: Intent?): IBinder? = null

    companion object {
        private const val CHANNEL_ID = "on_duty"
        private const val NOTIFICATION_ID = 1
        private const val INTERVAL_MS = 120_000L
    }
}
