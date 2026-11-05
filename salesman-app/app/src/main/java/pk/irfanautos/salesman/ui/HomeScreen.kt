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
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.MoreVert
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
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
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalLifecycleOwner
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import pk.irfanautos.salesman.App
import pk.irfanautos.salesman.data.Api
import pk.irfanautos.salesman.data.ApiException
import pk.irfanautos.salesman.data.Load
import pk.irfanautos.salesman.data.Outbox
import pk.irfanautos.salesman.data.Pings
import pk.irfanautos.salesman.data.Session
import pk.irfanautos.salesman.data.Sync
import pk.irfanautos.salesman.data.TodayResp
import pk.irfanautos.salesman.data.durationText
import pk.irfanautos.salesman.data.fmtTime
import pk.irfanautos.salesman.data.load
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
    var today by remember { mutableStateOf<Load<TodayResp>>(Load.Loading) }
    var onDuty by remember { mutableStateOf(App.prefs.onDuty) }
    var busy by remember { mutableStateOf(false) }
    var msg by remember { mutableStateOf("") }
    var waiting by remember { mutableStateOf(0) }
    var tick by remember { mutableStateOf(0) }
    var clock by remember { mutableStateOf(System.currentTimeMillis()) }
    var askBattery by remember { mutableStateOf(false) }
    var confirmSignOut by remember { mutableStateOf(false) }
    var menu by remember { mutableStateOf(false) }

    fun refreshWaiting() { waiting = Outbox.waiting() + Pings.count() }
    fun doSignOut() { Tracking.stop(ctx); Session.signOut() }

    // load today's attendance, and send whatever is waiting from when the phone was offline
    LaunchedEffect(tick) {
        today = load { Api.today() }
        val t = today
        if (t is Load.Ok) {
            onDuty = t.value.on_duty
            App.prefs.onDuty = t.value.on_duty
            if (t.value.on_duty && Gps.hasPermission(ctx)) Tracking.start(ctx) // keeps tracking alive after a phone restart
            if (!t.value.on_duty) Tracking.stop(ctx)
        }
        Outbox.flush()
        Sync.uploadPings()
        refreshWaiting()
    }
    LaunchedEffect(Unit) {
        while (true) {
            delay(30_000)
            clock = System.currentTimeMillis()
        }
    }
    // keep an eye on location: switched off, or the permission taken away, while on duty
    LaunchedEffect(Unit) {
        while (true) {
            LocationWatch.refresh(ctx)
            delay(5_000)
        }
    }
    val lifecycleOwner = LocalLifecycleOwner.current
    DisposableEffect(lifecycleOwner) {
        val observer = LifecycleEventObserver { _, event ->
            if (event == Lifecycle.Event.ON_RESUME) {
                LocationWatch.refresh(ctx)
                tick++ // coming back from the settings screen: reload the day and restart tracking if it was fixed
            }
        }
        lifecycleOwner.lifecycle.addObserver(observer)
        onDispose { lifecycleOwner.lifecycle.removeObserver(observer) }
    }

    fun toggle(start: Boolean) {
        scope.launch {
            busy = true; msg = ""
            try {
                val fix = Gps.current(ctx)
                if (start) {
                    Api.checkIn(fix)
                    App.prefs.onDuty = true
                    App.prefs.lastLocState = "ok"
                    App.prefs.saveFix(fix)
                    onDuty = true
                    Tracking.start(ctx)
                    if (!App.prefs.batteryAsked && !isIgnoringBattery(ctx)) askBattery = true
                } else {
                    Sync.uploadPings() // points taken before ending work must reach the office first
                    Api.checkOut(fix)
                    Tracking.stop(ctx)
                    App.prefs.onDuty = false
                    onDuty = false
                }
                tick++
            } catch (e: GpsException) {
                msg = e.message ?: ""
            } catch (e: ApiException) {
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

    Screen(
        title = "Irfan Autos",
        actions = {
            IconButton(onClick = { menu = true }) { Icon(Icons.Default.MoreVert, contentDescription = "Menu") }
            DropdownMenu(expanded = menu, onDismissRequest = { menu = false }) {
                DropdownMenuItem(text = { Text("Change PIN") }, onClick = { menu = false; onNav("pin") })
                DropdownMenuItem(text = { Text("Sign out") }, onClick = {
                    menu = false
                    when {
                        onDuty -> msg = "End work before signing out."
                        waiting > 0 -> confirmSignOut = true
                        else -> doSignOut()
                    }
                })
            }
        },
    ) {
        Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Text("Hello, " + (App.prefs.userName ?: ""), style = MaterialTheme.typography.titleLarge)

            val problem = LocationWatch.problem
            if (onDuty && problem != null) {
                Card(Modifier.fillMaxWidth(), colors = CardDefaults.cardColors(containerColor = Color(0xFFFDECEA))) {
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

            Card(Modifier.fillMaxWidth()) {
                Column(Modifier.padding(16.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                    val att = (today as? Load.Ok)?.value?.attendance
                    when {
                        today is Load.Loading && !onDuty -> LoadingBox()
                        onDuty -> {
                            Text("On duty", color = Good, style = MaterialTheme.typography.titleMedium)
                            val elapsed = remember(clock, att) { durationText(att?.check_in_at) }
                            Text(if (att != null) "Started " + fmtTime(att.check_in_at) + "  -  " + elapsed else "Tracking your location", modifier = Modifier.padding(vertical = 8.dp))
                            Button(
                                onClick = { toggle(false) }, enabled = !busy, colors = ButtonDefaults.buttonColors(containerColor = Bad),
                                modifier = Modifier.fillMaxWidth().height(52.dp),
                            ) { Text(if (busy) "Ending shift..." else "End work") }
                        }
                        att?.check_out_at != null -> {
                            Text("Finished for today", style = MaterialTheme.typography.titleMedium)
                            Text(fmtTime(att.check_in_at) + " to " + fmtTime(att.check_out_at) + "  -  " + durationText(att.check_in_at, att.check_out_at), modifier = Modifier.padding(vertical = 8.dp))
                            OutlinedButton(onClick = { requestStart() }, enabled = !busy, modifier = Modifier.fillMaxWidth().height(52.dp)) { Text(if (busy) "Starting shift..." else "Start again") }
                        }
                        else -> {
                            Text("You have not started work today.", modifier = Modifier.padding(bottom = 8.dp))
                            Button(onClick = { requestStart() }, enabled = !busy, modifier = Modifier.fillMaxWidth().height(64.dp)) {
                                Text(if (busy) "Starting shift..." else "Start work", style = MaterialTheme.typography.titleLarge)
                            }
                        }
                    }
                    (today as? Load.Err)?.let { Text(if (it.offline) "No internet. Your day will update when it is back." else it.message, color = Warn, modifier = Modifier.padding(top = 8.dp)) }
                }
            }

            if (msg.isNotEmpty()) ErrorText(msg)
            if (waiting > 0) {
                Card(Modifier.fillMaxWidth()) {
                    Row(Modifier.padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
                        Text("$waiting waiting to be sent (no internet earlier)", color = Warn, modifier = Modifier.weight(1f))
                        TextButton(onClick = { scope.launch { Outbox.flush(); Sync.uploadPings(); refreshWaiting() } }) { Text("Send now") }
                    }
                }
            }

            val tiles = listOf(
                "Customers" to "customers", "New order" to "order", "Collect payment" to "payment",
                "Return / claim" to "return", "My requests" to "requests", "My account" to "account",
            )
            tiles.chunked(2).forEach { pair ->
                Row(horizontalArrangement = Arrangement.spacedBy(12.dp), modifier = Modifier.fillMaxWidth()) {
                    pair.forEach { (label, route) -> Tile(label) { onNav(route) } }
                    if (pair.size == 1) Spacer(Modifier.weight(1f))
                }
            }
        }
    }

    if (askBattery) {
        AlertDialog(
            onDismissRequest = { askBattery = false; App.prefs.batteryAsked = true },
            title = { Text("Keep tracking in the background") },
            text = { Text("Some phones stop apps to save battery. On the next screen choose Allow (or Unrestricted) so your location keeps reaching the office while the screen is off.") },
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
    if (confirmSignOut) {
        AlertDialog(
            onDismissRequest = { confirmSignOut = false },
            title = { Text("Sign out?") },
            text = { Text("$waiting item(s) have not been sent yet. They stay on this phone and are sent when you sign in again.") },
            confirmButton = { TextButton(onClick = { confirmSignOut = false; doSignOut() }) { Text("Sign out") } },
            dismissButton = { TextButton(onClick = { confirmSignOut = false }) { Text("Stay") } },
        )
    }
}

@Composable
private fun RowScope.Tile(label: String, onClick: () -> Unit) {
    Card(Modifier.weight(1f).height(96.dp).clickable { onClick() }) {
        Column(Modifier.fillMaxSize().padding(8.dp), verticalArrangement = Arrangement.Center, horizontalAlignment = Alignment.CenterHorizontally) {
            Text(label, style = MaterialTheme.typography.titleMedium, textAlign = TextAlign.Center)
        }
    }
}
