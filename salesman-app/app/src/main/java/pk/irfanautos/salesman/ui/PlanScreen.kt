@file:OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)

package pk.irfanautos.salesman.ui

import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import androidx.compose.foundation.text.KeyboardOptions
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put
import pk.irfanautos.salesman.data.Api
import pk.irfanautos.salesman.data.LastVisit
import pk.irfanautos.salesman.data.MyCustomer
import pk.irfanautos.salesman.data.Offline
import pk.irfanautos.salesman.data.Outbox
import pk.irfanautos.salesman.data.Submit
import pk.irfanautos.salesman.data.Sync
import pk.irfanautos.salesman.data.addDaysIso
import pk.irfanautos.salesman.data.dayLabel
import pk.irfanautos.salesman.data.money
import pk.irfanautos.salesman.data.todayPk

private val OUTCOMES = listOf(
    "Visited", "Order placed", "Payment collected", "No order", "Customer unavailable", "Customer closed", "Rescheduled", "Cancelled",
)

private fun outcomeColor(outcome: String): Color = when (outcome) {
    "Visited", "Order placed", "Payment collected" -> Good
    "No order", "Customer unavailable", "Rescheduled" -> Warn
    else -> Bad
}

/** The visit plan: which routes and customers he visits today (and the next days), the answer he got at each one, and his remarks.
 *  Everything is saved on the phone and works without internet. */
@Composable
fun PlanScreen(onOpenCustomer: (String) -> Unit) {
    val ctx = LocalContext.current
    val scope = rememberCoroutineScope()
    val version = Offline.version
    val plan = remember(version) { Offline.plan() }
    val customers = remember(version) { Offline.customers().associateBy { it.id } }
    val last = remember(version) { Offline.lastVisits() }
    val today = todayPk()
    var day by remember { mutableStateOf(today) }
    var visitFor by remember { mutableStateOf<MyCustomer?>(null) }
    var queued by remember { mutableStateOf(setOf<String>()) } // customers whose visit has not reached the office yet

    LaunchedEffect(Unit) {
        while (true) {
            queued = Outbox.all().filter { it.type == "visit" && it.error == null }
                .mapNotNull { runCatching { Api.json.parseToJsonElement(it.body).jsonObject["customer_id"]?.jsonPrimitive?.content }.getOrNull() }.toSet()
            delay(2500)
        }
    }

    val dayData = plan?.days?.firstOrNull { it.date == day }
    val ids = dayData?.routes?.flatMap { it.customer_ids }?.distinct() ?: emptyList()
    val done = if (day == today) ids.count { plan?.done_today?.containsKey(it) == true } else 0

    Column(Modifier.fillMaxSize()) {
        TabHeader("Visit plan", dayLabel(day), trailing = { OnlineChip() })
        if (plan != null) {
            Row(Modifier.horizontalScroll(rememberScrollState()).padding(horizontal = 16.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                plan.days.forEach { d ->
                    val label = when (d.date) { today -> "Today"; addDaysIso(today, 1) -> "Tomorrow"; else -> dayLabel(d.date) }
                    FilterChip(selected = day == d.date, onClick = { day = d.date }, label = { Text(label) })
                }
            }
        }
        when {
            plan == null -> {
                EmptyState("Your plan is not downloaded yet", "Connect to the internet once. After that the plan is always on your phone.")
                Button(onClick = { scope.launch { Sync.runAll(true) } }, modifier = Modifier.padding(horizontal = 32.dp).fillMaxWidth()) { Text("Download now") }
            }
            ids.isEmpty() -> EmptyState("No visits planned", if (day == today) "Nothing is planned for today." else "Nothing is planned for this day.")
            else -> {
                if (day == today) {
                    Column(Modifier.padding(horizontal = 20.dp, vertical = 10.dp)) {
                        Text("$done of ${ids.size} customers visited", style = MaterialTheme.typography.titleSmall)
                        LinearProgressIndicator(progress = done.toFloat() / ids.size, modifier = Modifier.fillMaxWidth().padding(top = 6.dp).height(8.dp).clip(CircleShape), color = Good, trackColor = Line)
                    }
                }
                LazyColumn(contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    dayData?.routes?.forEach { route ->
                        item(key = "r" + route.id) {
                            Text(route.name + "  ·  " + route.frequency, style = MaterialTheme.typography.titleSmall, color = Muted, modifier = Modifier.padding(top = 6.dp))
                        }
                        items(route.customer_ids, key = { route.id + it }) { id ->
                            val c = customers[id] ?: return@items
                            val result = plan.done_today[id]
                            val lv = last[id]
                            AppCard(Modifier.fillMaxWidth(), onClick = { onOpenCustomer(id) }) {
                                Column(Modifier.padding(14.dp)) {
                                    Row(verticalAlignment = Alignment.CenterVertically) {
                                        Avatar(c.name)
                                        Column(Modifier.weight(1f).padding(horizontal = 12.dp)) {
                                            Text(c.name, style = MaterialTheme.typography.titleSmall)
                                            val sub = listOfNotNull(c.area, c.phone).joinToString(" · ")
                                            if (sub.isNotEmpty()) Text(sub, style = MaterialTheme.typography.bodySmall, color = Muted)
                                            Text("Owes " + money(c.balance), style = MaterialTheme.typography.bodySmall, color = if (c.balance > 0) Bad else Muted)
                                        }
                                        if (day == today && result != null) Pill(result.outcome, outcomeColor(result.outcome)) else if (day == today) Pill("Pending", Muted)
                                    }
                                    if (day == today && result != null && !result.notes.isNullOrBlank()) {
                                        Text("Your remarks: " + result.notes, style = MaterialTheme.typography.bodySmall, modifier = Modifier.padding(top = 8.dp))
                                    }
                                    if (day == today && id in queued) Text("Saved on the phone, not sent yet", style = MaterialTheme.typography.bodySmall, color = Warn, modifier = Modifier.padding(top = 4.dp))
                                    if (lv != null && (result == null || day != today)) {
                                        Text(
                                            "Last visit (" + lv.date + "): " + lv.outcome + (if (!lv.notes.isNullOrBlank()) " - " + lv.notes else ""),
                                            style = MaterialTheme.typography.bodySmall, color = Muted, modifier = Modifier.padding(top = 8.dp),
                                        )
                                    }
                                    Row(Modifier.fillMaxWidth().padding(top = 10.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                        if (!c.phone.isNullOrBlank()) {
                                            OutlinedButton(onClick = { runCatching { ctx.startActivity(Intent(Intent.ACTION_DIAL, Uri.parse("tel:" + c.phone))) } }, modifier = Modifier.weight(1f)) { Text("Call") }
                                        }
                                        if (day == today) {
                                            Button(onClick = { visitFor = c }, modifier = Modifier.weight(1f)) { Text(if (result == null) "Record visit" else "Update visit") }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    visitFor?.let { c ->
        VisitDialog(
            customer = c, last = last[c.id], current = plan?.done_today?.get(c.id)?.let { it.outcome to (it.notes ?: "") },
            onDismiss = { visitFor = null },
            onSave = { outcome, notes, promiseDate, promiseAmount ->
                val body = buildJsonObject {
                    put("customer_id", c.id)
                    put("outcome", outcome)
                    if (notes.isNotBlank()) put("notes", notes.trim())
                    put("date", todayPk())
                    if (promiseDate != null && promiseAmount > 0) {
                        put("promise_date", promiseDate)
                        put("promise_amount", promiseAmount)
                    }
                    put("idem_key", Submit.newKey())
                }
                Submit.queue("visit", body, c.name)
                Offline.recordDone(c.id, outcome, notes.trim().ifBlank { null })
                visitFor = null
            },
        )
    }
}

@Composable
private fun VisitDialog(
    customer: MyCustomer, last: LastVisit?, current: Pair<String, String>?,
    onDismiss: () -> Unit, onSave: (outcome: String, notes: String, promiseDate: String?, promiseAmount: Double) -> Unit,
) {
    var outcome by remember { mutableStateOf(current?.first ?: "") }
    var notes by remember { mutableStateOf(current?.second ?: "") }
    var promise by remember { mutableStateOf(false) }
    var days by remember { mutableStateOf(1) }
    var amount by remember { mutableStateOf("") }
    val amountValue = amount.toDoubleOrNull() ?: 0.0
    val today = todayPk()

    Dialog(onDismissRequest = onDismiss, properties = DialogProperties(usePlatformDefaultWidth = false)) {
        Surface(shape = RoundedCornerShape(24.dp), modifier = Modifier.fillMaxWidth(0.94f)) {
            Column(Modifier.verticalScroll(rememberScrollState()).padding(20.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Text(customer.name, style = MaterialTheme.typography.titleLarge)
                if (last != null) {
                    Text("Last visit (" + last.date + "): " + last.outcome + (if (!last.notes.isNullOrBlank()) " - " + last.notes else ""), style = MaterialTheme.typography.bodySmall, color = Muted)
                }
                Text("What happened?", style = MaterialTheme.typography.titleSmall, modifier = Modifier.padding(top = 4.dp))
                FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    OUTCOMES.forEach { o -> FilterChip(selected = outcome == o, onClick = { outcome = o }, label = { Text(o) }) }
                }
                OutlinedTextField(
                    value = notes, onValueChange = { notes = it.take(300) }, label = { Text("Remarks") }, minLines = 3, maxLines = 5,
                    shape = RoundedCornerShape(14.dp), modifier = Modifier.fillMaxWidth(),
                )
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text("Customer promised to pay", style = MaterialTheme.typography.titleSmall, modifier = Modifier.weight(1f))
                    Switch(checked = promise, onCheckedChange = { promise = it })
                }
                if (promise) {
                    Text("Promised date", style = MaterialTheme.typography.bodySmall, color = Muted)
                    FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        listOf(1 to "Tomorrow", 3 to "In 3 days", 7 to "In a week", 14 to "In 2 weeks").forEach { (d, label) ->
                            FilterChip(selected = days == d, onClick = { days = d }, label = { Text(label) })
                        }
                    }
                    OutlinedTextField(
                        value = amount, onValueChange = { amount = it.filter { ch -> ch.isDigit() || ch == '.' } }, label = { Text("Promised amount (Rs)") }, singleLine = true,
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number), shape = RoundedCornerShape(14.dp), modifier = Modifier.fillMaxWidth(),
                    )
                }
                Row(Modifier.fillMaxWidth().padding(top = 6.dp), horizontalArrangement = Arrangement.End) {
                    TextButton(onClick = onDismiss) { Text("Cancel") }
                    Button(
                        enabled = outcome.isNotEmpty() && (!promise || amountValue > 0),
                        onClick = { onSave(outcome, notes, if (promise && amountValue > 0) addDaysIso(today, days.toLong()) else null, if (promise) amountValue else 0.0) },
                    ) { Text("Save visit") }
                }
            }
        }
    }
}
