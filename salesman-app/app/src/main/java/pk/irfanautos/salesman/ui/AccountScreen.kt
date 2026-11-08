@file:OptIn(ExperimentalMaterial3Api::class)

package pk.irfanautos.salesman.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.launch
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.doubleOrNull
import kotlinx.serialization.json.jsonObject
import pk.irfanautos.salesman.App
import pk.irfanautos.salesman.data.Api
import pk.irfanautos.salesman.data.Load
import pk.irfanautos.salesman.data.Offline
import pk.irfanautos.salesman.data.Outbox
import pk.irfanautos.salesman.data.Session
import pk.irfanautos.salesman.data.Sync
import pk.irfanautos.salesman.data.ago
import pk.irfanautos.salesman.data.load
import pk.irfanautos.salesman.data.money
import pk.irfanautos.salesman.location.Tracking

// The account answer is read field by field, so a small change on the server never stops this screen from opening.
private fun JsonElement?.obj(k: String): JsonObject? = (this as? JsonObject)?.get(k) as? JsonObject
private fun JsonElement?.num(k: String): Double = ((this as? JsonObject)?.get(k) as? JsonPrimitive)?.doubleOrNull ?: 0.0
private fun JsonElement?.text(k: String): String? = ((this as? JsonObject)?.get(k) as? JsonPrimitive)?.contentOrNull
private fun JsonElement?.list(k: String): List<JsonObject> = ((this as? JsonObject)?.get(k) as? JsonArray)?.mapNotNull { it as? JsonObject } ?: emptyList()

private val RANGES = listOf("today" to "Today", "week" to "This week", "month" to "This month")

/** His own account: money still to hand over to the office, what his customers owe, sales and collections against target, and the settings.
 *  The last answer is kept on the phone, so this opens without internet. */
@Composable
fun AccountScreen(onChangePin: () -> Unit) {
    val ctx = LocalContext.current
    val scope = rememberCoroutineScope()
    var range by remember { mutableStateOf("month") }
    var tick by remember { mutableStateOf(0) }
    var data by remember { mutableStateOf<JsonObject?>(null) }
    var savedAt by remember { mutableStateOf(0L) }
    var offlineNote by remember { mutableStateOf(false) }
    var msg by remember { mutableStateOf("") }
    var confirmOut by remember { mutableStateOf(false) }

    fun doSignOut() { Tracking.stop(ctx); Session.signOut() }

    LaunchedEffect(range, tick) {
        val key = "account:$range"
        data = App.localDb.get(key)?.let { s -> runCatching { Api.json.parseToJsonElement(s).jsonObject }.getOrNull() }
        savedAt = App.localDb.savedAt(key)
        when (val r = load { Api.account(range) }) {
            is Load.Ok -> {
                data = r.value
                App.localDb.put(key, r.value.toString())
                savedAt = System.currentTimeMillis()
                offlineNote = false
            }
            is Load.Err -> offlineNote = true
            else -> {}
        }
    }

    Column(Modifier.fillMaxSize()) {
        TabHeader("My account", App.prefs.userName ?: "", trailing = { OnlineChip() })
        Row(Modifier.padding(horizontal = 16.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            RANGES.forEach { (k, label) -> FilterChip(selected = range == k, onClick = { range = k }, label = { Text(label) }) }
        }
        val o = data
        LazyColumn(contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            if (offlineNote && o != null) item { InfoBanner("No internet: these figures were saved " + ago(savedAt) + ".") }
            if (o == null) {
                item { if (offlineNote) InfoBanner("Your account figures need the internet once. They are then kept on the phone.") else LoadingBox() }
            } else {
                val cash = o.obj("cash")
                val perf = o.obj("performance")
                item {
                    AppCard(Modifier.fillMaxWidth()) {
                        Column(Modifier.padding(18.dp)) {
                            Text("Money still to hand over to the office", style = MaterialTheme.typography.bodyMedium, color = Muted)
                            Text(money(cash.num("closing")), style = MaterialTheme.typography.headlineMedium, color = if (cash.num("closing") > 0) Bad else Good)
                            Text("Collected " + money(cash.num("collected")) + "  ·  handed over " + money(cash.num("handed_over")), style = MaterialTheme.typography.bodySmall, color = Muted)
                        }
                    }
                }
                item {
                    AppCard(Modifier.fillMaxWidth()) {
                        Column(Modifier.padding(18.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                            Text("My customers owe", style = MaterialTheme.typography.bodyMedium, color = Muted)
                            Text(money(o.obj("receivable").num("total")), style = MaterialTheme.typography.titleLarge)
                            Text(o.obj("receivable").num("customers").toInt().toString() + " customers with a balance", style = MaterialTheme.typography.bodySmall, color = Muted)
                            val pending = o.obj("pending").num("total").toInt()
                            if (pending > 0) Text("$pending of my requests are waiting for the office", color = Warn, style = MaterialTheme.typography.bodyMedium)
                        }
                    }
                }
                if (perf != null) {
                    item {
                        AppCard(Modifier.fillMaxWidth()) {
                            Column(Modifier.padding(18.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
                                Text("Against my targets", style = MaterialTheme.typography.titleMedium)
                                Metric("Sales", perf.obj("sales"), asMoney = true)
                                Metric("Money collected", perf.obj("collection"), asMoney = true)
                                Metric("Customer visits", perf.obj("visits"), asMoney = false)
                            }
                        }
                    }
                }
                val entries = cash.list("entries").asReversed().take(60)
                item { SectionTitle("Cash statement") }
                if (entries.isEmpty()) item { Text("Nothing in this period.", color = Muted) }
                items(entries.size) { i ->
                    val e = entries[i]
                    val amount = e.num("amount")
                    Column(Modifier.fillMaxWidth()) {
                        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                            Text(
                                if (e.text("type") == "handover") "Handed over to office" else "Collected from " + (e.text("customer_name") ?: "customer"),
                                style = MaterialTheme.typography.bodyMedium, modifier = Modifier.weight(1f),
                            )
                            Text((if (amount < 0) "-" else "+") + money(Math.abs(amount)), style = MaterialTheme.typography.titleSmall, color = if (amount < 0) Good else Ink)
                        }
                        Text(
                            (e.text("entry_date") ?: "") + (e.text("method")?.let { " · $it" } ?: "") + "  ·  balance " + money(e.num("balance")),
                            style = MaterialTheme.typography.bodySmall, color = Muted,
                        )
                        HorizontalDivider(Modifier.padding(top = 8.dp), color = Line)
                    }
                }
            }

            item { SectionTitle("Settings") }
            item {
                AppCard(Modifier.fillMaxWidth()) {
                    Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        Text("Data on this phone", style = MaterialTheme.typography.titleSmall)
                        Text("Customers, parts and plan updated " + ago(Offline.updatedAt()), style = MaterialTheme.typography.bodySmall, color = Muted)
                        OutlinedButton(onClick = { scope.launch { Sync.runAll(true); tick++ } }, enabled = !Offline.syncing, modifier = Modifier.fillMaxWidth()) {
                            Text(if (Offline.syncing) "Updating..." else "Update now")
                        }
                        OutlinedButton(onClick = onChangePin, modifier = Modifier.fillMaxWidth()) { Text("Change PIN") }
                        OutlinedButton(
                            onClick = {
                                when {
                                    App.prefs.onDuty -> msg = "End work before signing out."
                                    Outbox.waiting() > 0 -> confirmOut = true
                                    else -> doSignOut()
                                }
                            },
                            modifier = Modifier.fillMaxWidth(),
                        ) { Text("Sign out", color = Bad) }
                        if (msg.isNotEmpty()) Text(msg, color = Bad, style = MaterialTheme.typography.bodySmall)
                    }
                }
            }
        }
    }

    if (confirmOut) {
        AlertDialog(
            onDismissRequest = { confirmOut = false },
            title = { Text("Sign out?") },
            text = { Text("${Outbox.waiting()} item(s) have not been sent yet. They stay on this phone and are sent when you sign in again.") },
            confirmButton = { TextButton(onClick = { confirmOut = false; doSignOut() }) { Text("Sign out") } },
            dismissButton = { TextButton(onClick = { confirmOut = false }) { Text("Stay") } },
        )
    }
}

@Composable
private fun Metric(label: String, m: JsonObject?, asMoney: Boolean) {
    val actual = m.num("actual")
    val target = m.num("target")
    val shown = { v: Double -> if (asMoney) money(v) else v.toLong().toString() }
    Column {
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
            Text(label, style = MaterialTheme.typography.bodyMedium)
            Text(if (target > 0) shown(actual) + " of " + shown(target) else shown(actual), style = MaterialTheme.typography.titleSmall)
        }
        if (target > 0) {
            val frac = (actual / target).coerceIn(0.0, 1.0).toFloat()
            LinearProgressIndicator(progress = frac, modifier = Modifier.fillMaxWidth().padding(top = 6.dp).height(8.dp).clip(CircleShape), color = if (actual >= target) Good else Brand, trackColor = Line)
            Text((actual / target * 100).toInt().toString() + "% of target", style = MaterialTheme.typography.bodySmall, color = Muted, modifier = Modifier.padding(top = 4.dp))
        }
    }
}
