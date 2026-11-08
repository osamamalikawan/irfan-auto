@file:OptIn(ExperimentalMaterial3Api::class)

package pk.irfanautos.salesman.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Tab
import androidx.compose.material3.TabRow
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
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.encodeToString
import pk.irfanautos.salesman.App
import pk.irfanautos.salesman.data.Api
import pk.irfanautos.salesman.data.ApiException
import pk.irfanautos.salesman.data.Load
import pk.irfanautos.salesman.data.Outbox
import pk.irfanautos.salesman.data.OutboxItem
import pk.irfanautos.salesman.data.RequestRow
import pk.irfanautos.salesman.data.Sync
import pk.irfanautos.salesman.data.fmtDateTime
import pk.irfanautos.salesman.data.load
import pk.irfanautos.salesman.data.money
import pk.irfanautos.salesman.data.qtyText

private val TABS = listOf("orders" to "Orders", "payments" to "Payments", "returns" to "Returns")

/** Everything saved on the phone that has not reached the office yet, and everything already sent with its answer
 *  (waiting / approved / rejected with the office's reason). The last answer is kept, so this opens without internet. */
@Composable
fun RequestsScreen() {
    val scope = rememberCoroutineScope()
    var tab by remember { mutableStateOf(0) }
    var tick by remember { mutableStateOf(0) }
    var rows by remember { mutableStateOf<List<RequestRow>>(emptyList()) }
    var loading by remember { mutableStateOf(true) }
    var offlineNote by remember { mutableStateOf(false) }
    var outbox by remember { mutableStateOf(Outbox.all()) }
    var msg by remember { mutableStateOf("") }
    val type = TABS[tab].first

    LaunchedEffect(Unit) {
        while (true) {
            outbox = Outbox.all()
            delay(2500)
        }
    }
    LaunchedEffect(tab, tick) {
        // the saved list appears at once; then it is refreshed when there is internet
        val saved = App.localDb.get("requests:$type")
        rows = if (saved != null) runCatching { Api.json.decodeFromString<List<RequestRow>>(saved) }.getOrDefault(emptyList()) else emptyList()
        loading = rows.isEmpty()
        when (val r = load { Api.requests(type) }) {
            is Load.Ok -> {
                rows = r.value
                App.localDb.put("requests:$type", Api.json.encodeToString(r.value))
                offlineNote = false
            }
            is Load.Err -> offlineNote = true
            else -> {}
        }
        loading = false
    }

    Column(Modifier.fillMaxSize()) {
        TabHeader("Requests", "What you sent to the office", trailing = { OnlineChip() })
        TabRow(selectedTabIndex = tab, containerColor = Color.White) {
            TABS.forEachIndexed { i, t -> Tab(selected = tab == i, onClick = { tab = i }, text = { Text(t.second) }) }
        }
        LazyColumn(contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            if (offlineNote) item { InfoBanner("No internet: showing the list as it was last saved.") }
            if (msg.isNotEmpty()) item { ErrorText(msg) }

            if (outbox.isNotEmpty()) {
                item { SectionTitle("Waiting to be sent (" + outbox.size + ")") }
                items(outbox, key = { it.id }) { o -> OutboxCard(o, onDelete = { Outbox.remove(o.id); outbox = Outbox.all() }) }
                item { TextButton(onClick = { scope.launch { Sync.runAll(); tick++ } }) { Text("Try sending now") } }
            }

            item { SectionTitle("Sent") }
            if (loading) item { LoadingBox() }
            else if (rows.isEmpty()) item { Text("Nothing here yet.", color = Muted) }
            items(rows, key = { it.id }) { x ->
                AppCard(Modifier.fillMaxWidth()) {
                    Column(Modifier.padding(14.dp)) {
                        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                            Text(x.customer_name, style = MaterialTheme.typography.titleSmall, modifier = Modifier.weight(1f))
                            StatusPill(x.status)
                        }
                        Text(x.no + "  ·  " + fmtDateTime(x.created_at), style = MaterialTheme.typography.bodySmall, color = Muted)
                        Text(detail(type, x), style = MaterialTheme.typography.bodyMedium, modifier = Modifier.padding(top = 6.dp))
                        if (x.status == "approved" && x.sale != null) Text("Invoice " + x.sale.no + " created", color = Good, style = MaterialTheme.typography.bodyMedium)
                        if (x.status == "rejected" && !x.review_note.isNullOrBlank()) Text("Office says: " + x.review_note, color = Bad, style = MaterialTheme.typography.bodyMedium)
                        if (x.status == "pending") {
                            TextButton(onClick = {
                                scope.launch {
                                    msg = ""
                                    try {
                                        Api.cancelRequest(type, x.id)
                                        tick++
                                    } catch (e: ApiException) {
                                        msg = if (e.offline) "You need internet to withdraw a request." else e.message ?: "Could not withdraw it."
                                    }
                                }
                            }) { Text("Withdraw", color = Bad) }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun OutboxCard(o: OutboxItem, onDelete: () -> Unit) {
    AppCard(Modifier.fillMaxWidth(), color = if (o.error != null) BadSoft else WarnSoft) {
        Row(Modifier.padding(14.dp), verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                Text(Outbox.title(o.type) + (if (o.customer.isNotBlank() && o.customer != Outbox.title(o.type)) "  ·  " + o.customer else ""), style = MaterialTheme.typography.titleSmall)
                if (o.error != null) Text("The office system refused it: " + o.error, color = Bad, style = MaterialTheme.typography.bodySmall)
                else Text("Saved on the phone " + fmtDateTime(java.time.Instant.ofEpochMilli(o.at).toString()) + ". Sent automatically when there is internet.", color = Warn, style = MaterialTheme.typography.bodySmall)
            }
            // start / end of work are never deleted by hand: they resolve themselves
            if (o.type != "att_start" && o.type != "att_end") TextButton(onClick = onDelete) { Text("Delete", color = Bad) }
        }
    }
}

private fun detail(type: String, x: RequestRow): String = when (type) {
    "orders" -> x.lines.size.toString() + (if (x.lines.size == 1) " item" else " items") + "  ·  about " + money(x.lines.sumOf { it.qty * it.price }) +
        (if (x.term == "cash") "  ·  cash" else "  ·  credit")
    "payments" -> money(x.amount) + (x.method?.let { "  ·  $it" } ?: "")
    else -> (if (x.kind == "claim") "Claim" else "Return") + "  ·  " + (x.sale_no ?: "") + "  ·  " +
        x.lines.joinToString(", ") { qtyText(it.qty) + " x " + it.name }
}
