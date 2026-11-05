package pk.irfanautos.salesman.location

import android.annotation.SuppressLint
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.ServiceInfo
import android.location.LocationManager
import android.net.Uri
import android.os.BatteryManager
import android.os.IBinder
import android.os.Looper
import android.provider.Settings
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
        ctx.getSystemService(NotificationManager::class.java).cancel(TrackingService.ALERT_ID)
    }
}

/** While he is on duty this keeps running (with a notification) and every 2 minutes saves his position and sends it to the office.
 *  Positions taken without internet are kept on the phone and sent when it is back.
 *  If location is switched off or the permission is taken away, the notification turns red and says so. */
class TrackingService : Service() {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private var client: FusedLocationProviderClient? = null
    private var running = false
    private var keepAlert = false

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

    /** Android tells us when location is switched on or off in the phone settings. */
    private val locationSwitch = object : BroadcastReceiver() {
        override fun onReceive(context: Context, intent: Intent) {
            LocationWatch.refresh(applicationContext)
            refreshNotifications()
        }
    }

    override fun onCreate() {
        super.onCreate()
        val filter = IntentFilter(LocationManager.PROVIDERS_CHANGED_ACTION).apply { addAction(LocationManager.MODE_CHANGED_ACTION) }
        ContextCompat.registerReceiver(this, locationSwitch, filter, ContextCompat.RECEIVER_EXPORTED)
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        // Android restarted us after killing the app: carry on only if he is still on duty
        if (intent == null && !App.prefs.onDuty) {
            stopSelf()
            return START_NOT_STICKY
        }
        LocationWatch.refresh(this)
        if (!Gps.hasPermission(this)) {
            // the permission was taken away: a location service cannot run without it. The moment is saved for the office;
            // tell him, and leave the message on screen until he fixes it.
            keepAlert = true
            postAlert(LocationWatch.Problem.PERMISSION_OFF)
            stopSelf()
            return START_NOT_STICKY
        }
        try {
            ServiceCompat.startForeground(this, NOTIFICATION_ID, buildNotification(), ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION)
        } catch (e: Exception) {
            stopSelf()
            return START_NOT_STICKY
        }
        refreshNotifications()
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

    // ---- notifications: normal while all is well, red and clear when location is off

    private fun ensureChannels() {
        val nm = getSystemService(NotificationManager::class.java)
        if (nm.getNotificationChannel(CHANNEL_ID) == null) nm.createNotificationChannel(NotificationChannel(CHANNEL_ID, "On duty", NotificationManager.IMPORTANCE_LOW))
        if (nm.getNotificationChannel(ALERT_CHANNEL_ID) == null) nm.createNotificationChannel(NotificationChannel(ALERT_CHANNEL_ID, "Location problems", NotificationManager.IMPORTANCE_HIGH))
    }

    private fun describe(p: LocationWatch.Problem?): Triple<String, String, Intent> = when (p) {
        LocationWatch.Problem.LOCATION_OFF ->
            Triple("Location is OFF", "The office cannot see you. Tap to turn location on.", Intent(Settings.ACTION_LOCATION_SOURCE_SETTINGS))
        LocationWatch.Problem.PERMISSION_OFF ->
            Triple("Location permission removed", "The office cannot see you. Tap to allow location.", Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:$packageName")))
        null ->
            Triple("Irfan Autos: you are on duty", "Your location is shared with the office until you end work.", Intent(this, MainActivity::class.java))
    }

    private fun pending(intent: Intent, code: Int): PendingIntent =
        PendingIntent.getActivity(this, code, intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK), PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)

    private fun buildNotification(): Notification {
        ensureChannels()
        val p = LocationWatch.problem
        val (title, text, intent) = describe(p)
        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_stat_location)
            .setContentTitle(title)
            .setContentText(text)
            .setStyle(NotificationCompat.BigTextStyle().bigText(text))
            .setColor(if (p != null) RED else BLUE)
            .setOngoing(true)
            .setContentIntent(pending(intent, if (p == null) 0 else 1))
            .build()
    }

    private fun postAlert(p: LocationWatch.Problem) {
        ensureChannels()
        val (title, text, intent) = describe(p)
        val n = NotificationCompat.Builder(this, ALERT_CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_stat_location)
            .setContentTitle(title)
            .setContentText(text)
            .setStyle(NotificationCompat.BigTextStyle().bigText(text))
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setCategory(NotificationCompat.CATEGORY_ERROR)
            .setColor(RED)
            .setContentIntent(pending(intent, 2))
            .build()
        getSystemService(NotificationManager::class.java).notify(ALERT_ID, n)
    }

    /** Updates the ongoing notification and shows (or removes) the pop-up warning. */
    private fun refreshNotifications() {
        val nm = getSystemService(NotificationManager::class.java)
        nm.notify(NOTIFICATION_ID, buildNotification())
        val p = LocationWatch.problem
        if (p == null) nm.cancel(ALERT_ID) else postAlert(p)
    }

    private fun batteryPercent(): Int? {
        val bm = getSystemService(Context.BATTERY_SERVICE) as? BatteryManager ?: return null
        val p = bm.getIntProperty(BatteryManager.BATTERY_PROPERTY_CAPACITY)
        return if (p in 1..100) p else null
    }

    override fun onDestroy() {
        runCatching { unregisterReceiver(locationSwitch) }
        client?.removeLocationUpdates(callback)
        scope.cancel()
        if (!keepAlert) getSystemService(NotificationManager::class.java).cancel(ALERT_ID)
        super.onDestroy()
    }

    override fun onBind(intent: Intent?): IBinder? = null

    companion object {
        private const val CHANNEL_ID = "on_duty"
        private const val ALERT_CHANNEL_ID = "location_alert"
        private const val NOTIFICATION_ID = 1
        const val ALERT_ID = 2
        private const val INTERVAL_MS = 120_000L
        private const val RED = 0xFFB3261E.toInt()
        private const val BLUE = 0xFF1F4E8C.toInt()
    }
}
