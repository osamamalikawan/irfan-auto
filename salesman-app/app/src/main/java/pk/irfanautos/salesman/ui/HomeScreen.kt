@file:OptIn(ExperimentalMaterial3Api::class)

package pk.irfanautos.salesman.ui

import android.Manifest
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.PowerManager
import android.provider.Settings
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.ShoppingCart
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalLifecycleOwner
import androidx.compose.ui.unit.dp
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import java.time.LocalTime
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import pk.irfanautos.salesman.App
import pk.irfanautos.salesman.data.Api
import pk.irfanautos.salesman.data.Load
import pk.irfanautos.salesman.data.Net
import pk.irfanautos.salesman.data.Offline
import pk.irfanautos.salesman.data.Outbox
import pk.irfanautos.salesman.data.Pings
import pk.irfanautos.salesman.data.Submit
import pk.irfanautos.salesman.data.Sync
import pk.irfanautos.salesman.data.ago
import pk.irfanautos.salesman.data.clockTime
import pk.irfanautos.salesman.data.elapsedText
import pk.irfanautos.salesman.data.load
import pk.irfanautos.salesman.data.parseTime
import pk.irfanautos.salesman.data.todayPk
import pk.irfanautos.salesman.location.Gps
import pk.irfanautos.salesman.location.GpsException
import pk.irfanautos.salesman.location.LocationWatch
import pk.irfanautos.salesman.location.Tracking

private fun isIgnoringBattery(ctx: Context): Boolean =
    (ctx.getSystemService(Context.POWER_SERVICE) as PowerManager).isIgnoringBatteryOptimizations(ctx.packageName)

@Composable
fun HomeScreen(onNav: (String) -> Unit) {
    val ctx = LocalContext.current
    val scope = rememberCoroutineScope()
    var onDuty by remember { mutableStateOf(App.prefs.onDuty) }
    var startAt by remember { mutableStateOf(App.prefs.dutyStartAt) }
    var busy by remember { mutableStateOf(false) }
    var msg by remember { mutableStateOf("") }
    var tick by remember { mutableStateOf(0) }
    var waiting by remember { mutableStateOf(Outbox.waiting()) }
    var pingsWaiting by remember { mutableStateOf(Pings.count()) }
    var lastFix by remember { mutableStateOf(App.prefs.lastFixAt()) }
    var clock by remember { mutableStateOf(System.currentTimeMillis()) }
    var askBattery by remember { mutableStateOf(false) }

    // once on opening (and when coming back to the app): compare with the office when there is internet, then send what is waiting
    LaunchedEffect(tick) {
        if (App.prefs.onDuty && Gps.hasPermission(ctx)) Tracking.start(ctx) // keeps tracking alive after a phone restart
        if (!App.prefs.onDuty) Tracking.stop(ctx)
        val t = load { Api.today() }
        if (t is Load.Ok && !Outbox.hasAttendance()) {
            val on = t.value.on_duty
            if (on != App.prefs.onDuty) {
                App.prefs.onDuty = on
                onDuty = on
                if (on) {
                    startAt = parseTime(t.value.attendance?.check_in_at)?.toInstant()?.toEpochMilli() ?: System.currentTimeMillis()
                    App.prefs.dutyStartAt = startAt
                    if (Gps.hasPermission(ctx)) Tracking.start(ctx)
                } else {
                    Tracking.stop(ctx)
                }
            }
        }
        Sync.runAll()
    }
    // keep an eye on location and on what is waiting to be sent
    LaunchedEffect(Unit) {
        while (true) {
            LocationWatch.refresh(ctx)
            waiting = Outbox.waiting()
            pingsWaiting = Pings.count()
            lastFix = App.prefs.lastFixAt()
            clock = System.currentTimeMillis()
            delay(5_000)
        }
    }
    val lifecycleOwner = LocalLifecycleOwner.current
    DisposableEffect(lifecycleOwner) {
        val observer = LifecycleEventObserver { _, event ->
            if (event == Lifecycle.Event.ON_RESUME) {
                LocationWatch.refresh(ctx)
                tick++ // coming back (for example from the settings screen): check again
            }
        }
        lifecycleOwner.lifecycle.addObserver(observer)
        onDispose { lifecycleOwner.lifecycle.removeObserver(observer) }
    }

    // Start / end of work is saved on the phone at once (with the real time) and sent whenever there is internet.
    fun toggle(start: Boolean) {
        scope.launch {
            busy = true; msg = ""
            try {
                val fix = Gps.best(ctx)
                val at = System.currentTimeMillis()
                val body = buildJsonObject { put("lat", fix.lat); put("lng", fix.lng); put("accuracy", fix.accuracy); put("at", at) }
                if (start) {
                    Submit.queue("att_start", body, "Start work")
                    App.prefs.onDuty = true
                    App.prefs.dutyStartAt = at
                    App.prefs.lastLocState = "ok"
                    App.prefs.saveFix(fix, at)
                    startAt = at
                    onDuty = true
                    Tracking.start(ctx)
                    if (!App.prefs.batteryAsked && !isIgnoringBattery(ctx)) askBattery = true
                } else {
                    Submit.queue("att_end", body, "End work")
                    Tracking.stop(ctx)
                    App.prefs.onDuty = false
                    onDuty = false
                }
            } catch (e: GpsException) {
                msg = e.message ?: ""
            } finally {
                busy = false
            }
        }
    }

    val permissions = remember {
        buildList {
            add(Manifest.permission.ACCESS_FINE_LOCATION)
            add(Manifest.permission.ACCESS_COARSE_LOCATION)
            if (Build.VERSION.SDK_INT >= 33) add(Manifest.permission.POST_NOTIFICATIONS)
        }.toTypedArray()
    }
    val launcher = rememberLauncherForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) { res ->
        val ok = res[Manifest.permission.ACCESS_FINE_LOCATION] == true || res[Manifest.permission.ACCESS_COARSE_LOCATION] == true
        if (ok) toggle(true) else msg = "Location permission is needed to start work. Allow it and try again."
    }
    fun requestStart() { if (Gps.hasPermission(ctx)) toggle(true) else launcher.launch(permissions) }

    val plan = remember(Offline.version, clock / 60_000) { Offline.plan() }
    val todayIds = plan?.days?.firstOrNull { it.date == todayPk() }?.routes?.flatMap { it.customer_ids }?.distinct() ?: emptyList()
    val doneCount = todayIds.count { plan?.done_today?.containsKey(it) == true }
    val problem = LocationWatch.problem
    val hour = remember(clock / 60_000) { LocalTime.now().hour }
    val greeting = if (hour < 12) "Good morning" else if (hour < 17) "Good afternoon" else "Good evening"

    Column(Modifier.fillMaxSize().background(Bg).verticalScroll(rememberScrollState()).padding(16.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                Text(greeting, style = MaterialTheme.typography.bodyMedium, color = Muted)
                Text(App.prefs.userName ?: "", style = MaterialTheme.typography.headlineMedium)
            }
            OnlineChip()
        }

        // the shift card
        Box(Modifier.fillMaxWidth().clip(RoundedCornerShape(24.dp)).background(Brush.linearGradient(listOf(Navy, Brand))).padding(20.dp)) {
            Column {
                if (onDuty) Pill("ON DUTY", Color.White, Color.White.copy(alpha = 0.18f)) else Pill("OFF DUTY", Color.White, Color.White.copy(alpha = 0.18f))
                if (onDuty) {
                    Text(elapsedText(startAt), style = MaterialTheme.typography.headlineMedium, color = Color.White, modifier = Modifier.padding(top = 12.dp))
                    Text("Started at " + clockTime(startAt), style = MaterialTheme.typography.bodyMedium, color = Color.White.copy(alpha = 0.8f))
                } else {
                    Text("Ready to start your day?", style = MaterialTheme.typography.titleLarge, color = Color.White, modifier = Modifier.padding(top = 12.dp))
                    Text("Your location is recorded while you are on duty.", style = MaterialTheme.typography.bodyMedium, color = Color.White.copy(alpha = 0.8f))
                }
                Spacer(Modifier.height(16.dp))
                Button(
                    onClick = { if (onDuty) toggle(false) else requestStart() },
                    enabled = !busy,
                    shape = RoundedCornerShape(16.dp),
                    colors = ButtonDefaults.buttonColors(containerColor = Color.White, contentColor = if (onDuty) Bad else Navy),
                    modifier = Modifier.fillMaxWidth().height(54.dp).padding(top = 0.dp),
                ) { Text(if (busy) (if (onDuty) "Ending shift..." else "Starting shift...") else if (onDuty) "End work" else "Start work", style = MaterialTheme.typography.titleMedium) }
            }
        }
        if (msg.isNotEmpty()) InfoBanner(msg, Bad)

        // location switched off or permission removed while on duty
        if (onDuty && problem != null) {
            AppCard(color = BadSoft) {
                Column(Modifier.padding(16.dp)) {
                    Text(
                        if (problem == LocationWatch.Problem.LOCATION_OFF) "Your location is OFF" else "Location permission was removed",
                        color = Bad, style = MaterialTheme.typography.titleMedium,
                    )
                    Text("The office cannot see where you are. Fix this now.", modifier = Modifier.padding(vertical = 6.dp))
                    Button(
                        onClick = {
                            val i = if (problem == LocationWatch.Problem.LOCATION_OFF) Intent(Settings.ACTION_LOCATION_SOURCE_SETTINGS)
                            else Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:" + ctx.packageName))
                            runCatching { ctx.startActivity(i) }
                        },
                        colors = ButtonDefaults.buttonColors(containerColor = Bad),
                    ) { Text(if (problem == LocationWatch.Problem.LOCATION_OFF) "Turn on location" else "Allow location") }
                }
            }
        }

        // today's visit plan
        AppCard(onClick = { onNav("plan") }) {
            Column(Modifier.padding(16.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text("Today's visit plan", style = MaterialTheme.typography.titleMedium, modifier = Modifier.weight(1f))
                    Text("Open", color = Brand, style = MaterialTheme.typography.labelLarge)
                }
                if (todayIds.isEmpty()) {
                    Text(if (plan == null) "Not downloaded yet. Connect to the internet once." else "No visits planned for today.", style = MaterialTheme.typography.bodyMedium, color = Muted, modifier = Modifier.padding(top = 4.dp))
                } else {
                    Text("$doneCount of ${todayIds.size} customers visited", style = MaterialTheme.typography.bodyMedium, color = Muted, modifier = Modifier.padding(top = 4.dp, bottom = 10.dp))
                    LinearProgressIndicator(progress = doneCount.toFloat() / todayIds.size, modifier = Modifier.fillMaxWidth().height(8.dp).clip(CircleShape), color = Good, trackColor = Line)
                }
            }
        }

        // location tracking status: shows him that positions are being saved even without internet
        AppCard {
            Column(Modifier.padding(16.dp)) {
                Text("Location tracking", style = MaterialTheme.typography.titleMedium)
                if (onDuty) {
                    Text("Last position saved " + ago(lastFix), style = MaterialTheme.typography.bodyMedium, color = Muted, modifier = Modifier.padding(top = 4.dp))
                    if (pingsWaiting > 0) {
                        Text(
                            if (Net.online) "$pingsWaiting positions are being sent" else "$pingsWaiting positions saved on the phone. They are sent when the internet is back.",
                            style = MaterialTheme.typography.bodySmall, color = Warn, modifier = Modifier.padding(top = 2.dp),
                        )
                    }
                } else {
                    Text("Starts when you start work.", style = MaterialTheme.typography.bodyMedium, color = Muted, modifier = Modifier.padding(top = 4.dp))
                }
            }
        }

        // quick actions
        Row(horizontalArrangement = Arrangement.spacedBy(12.dp), modifier = Modifier.fillMaxWidth()) {
            ActionTile("New order", Icons.Filled.ShoppingCart) { onNav("order") }
            ActionTile("Collect payment", Icons.Filled.Add) { onNav("payment") }
        }
        Row(horizontalArrangement = Arrangement.spacedBy(12.dp), modifier = Modifier.fillMaxWidth()) {
            ActionTile("Return / claim", Icons.Filled.Refresh) { onNav("return") }
            ActionTile("Customers", Icons.Filled.Person) { onNav("customers") }
        }

        // what is saved on the phone and what is waiting
        AppCard {
            Row(Modifier.padding(16.dp), verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f)) {
                    when {
                        Offline.syncing -> {
                            Text("Updating...", style = MaterialTheme.typography.titleSmall, color = Brand)
                            Text(Offline.syncText, style = MaterialTheme.typography.bodySmall, color = Muted)
                        }
                        waiting > 0 -> {
                            Text("$waiting waiting to be sent", style = MaterialTheme.typography.titleSmall, color = Warn)
                            Text(if (Net.online) "Sending now..." else "Saved on the phone. Sent automatically when the internet is back.", style = MaterialTheme.typography.bodySmall, color = Muted)
                        }
                        else -> {
                            Text("Everything is saved and sent", style = MaterialTheme.typography.titleSmall, color = Good)
                            Text("Customers, parts and plan updated " + ago(Offline.updatedAt()), style = MaterialTheme.typography.bodySmall, color = Muted)
                        }
                    }
                }
                OutlinedButton(onClick = { scope.launch { Sync.runAll(true); tick++ } }, enabled = !Offline.syncing) { Text("Sync") }
            }
        }
        Spacer(Modifier.height(4.dp))
    }

    if (askBattery) {
        AlertDialog(
            onDismissRequest = { askBattery = false; App.prefs.batteryAsked = true },
            title = { Text("Keep tracking in the background") },
            text = { Text("Some phones stop apps to save battery. On the next screen choose Allow (or Unrestricted) so your location keeps being saved while the screen is off.") },
            confirmButton = {
                TextButton(onClick = {
                    askBattery = false; App.prefs.batteryAsked = true
                    try {
                        ctx.startActivity(Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, Uri.parse("package:" + ctx.packageName)))
                    } catch (e: Exception) {
                        runCatching { ctx.startActivity(Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS)) }
                    }
                }) { Text("Open settings") }
            },
            dismissButton = { TextButton(onClick = { askBattery = false; App.prefs.batteryAsked = true }) { Text("Not now") } },
        )
    }
}

@Composable
private fun RowScope.ActionTile(label: String, icon: ImageVector, onClick: () -> Unit) {
    AppCard(Modifier.weight(1f), onClick = onClick) {
        Column(Modifier.padding(16.dp)) {
            Box(Modifier.size(40.dp).clip(CircleShape).background(BrandSoft), contentAlignment = Alignment.Center) {
                Icon(icon, contentDescription = null, tint = Brand)
            }
            Text(label, style = MaterialTheme.typography.titleSmall, modifier = Modifier.padding(top = 10.dp))
        }
    }
}
