@file:OptIn(ExperimentalMaterial3Api::class)

package pk.irfanautos.salesman.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Button
import androidx.compose.material3.Card
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
import kotlinx.coroutines.launch
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

/** Everything this salesman sent to the office, and whether it was approved, rejected (with the reason) or is still waiting. */
@Composable
fun RequestsScreen(onBack: () -> Unit) {
    val scope = rememberCoroutineScope()
    var tab by remember { mutableStateOf(0) }
    var tick by remember { mutableStateOf(0) }
    var rows by remember { mutableStateOf<Load<List<RequestRow>>>(Load.Loading) }
    var outbox by remember { mutableStateOf<List<OutboxItem>>(emptyList()) }
    var msg by remember { mutableStateOf("") }
    val type = TABS[tab].first

    LaunchedEffect(tab, tick) {
        outbox = Outbox.all()
        rows = Load.Loading
        rows = load { Api.requests(type) }
    }

    Screen("My requests", onBack, actions = { TextButton(onClick = { tick++ }) { Text("Refresh", color = Color.White) } }) {
        TabRow(selectedTabIndex = tab) {
            TABS.forEachIndexed { i, t -> Tab(selected = tab == i, onClick = { tab = i }, text = { Text(t.second) }) }
        }
        LazyColumn(contentPadding = PaddingValues(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            val mine = outbox.filter { it.type == type }
            if (mine.isNotEmpty()) {
                item { Text("Not sent yet", style = MaterialTheme.typography.titleSmall, color = Warn) }
                items(mine, key = { it.id }) { o ->
                    Card(Modifier.fillMaxWidth()) {
                        Row(Modifier.padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
                            Column(Modifier.weight(1f)) {
                                Text(o.customer, style = MaterialTheme.typography.titleSmall)
                                if (o.error != null) Text("The office system refused it: " + o.error, color = Bad, style = MaterialTheme.typography.bodySmall)
                                else Text("Waiting for internet. It will be sent by itself.", color = Warn, style = MaterialTheme.typography.bodySmall)
                            }
                            TextButton(onClick = { Outbox.remove(o.id); outbox = Outbox.all() }) { Text("Delete", color = Bad) }
                        }
                    }
                }
                item {
                    TextButton(onClick = { scope.launch { Outbox.flush(); Sync.uploadPings(); tick++ } }) { Text("Try sending now") }
                }
            }
            if (msg.isNotEmpty()) item { ErrorText(msg) }
            when (val r = rows) {
                is Load.Loading -> item { LoadingBox() }
                is Load.Err -> item {
                    Column {
                        ErrorText(if (r.offline) "No internet. The list will load when you are back online." else r.message)
                        Button(onClick = { tick++ }) { Text("Try again") }
                    }
                }
                is Load.Ok -> {
                    if (r.value.isEmpty() && mine.isEmpty()) item { Text("Nothing here yet.", color = Color.Gray) }
                    items(r.value, key = { it.id }) { x ->
                        Card(Modifier.fillMaxWidth()) {
                            Column(Modifier.padding(12.dp)) {
                                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                                    Text(x.customer_name, style = MaterialTheme.typography.titleSmall, modifier = Modifier.weight(1f))
                                    StatusPill(x.status)
                                }
                                Text(x.no + "  ·  " + fmtDateTime(x.created_at), style = MaterialTheme.typography.bodySmall, color = Color.Gray)
                                Text(detail(type, x), modifier = Modifier.padding(top = 4.dp))
                                if (x.status == "approved" && x.sale != null) Text("Invoice " + x.sale.no + " created", color = Good)
                                if (x.status == "rejected" && !x.review_note.isNullOrBlank()) Text("Office says: " + x.review_note, color = Bad)
                                if (x.status == "pending") {
                                    TextButton(onClick = {
                                        scope.launch {
                                            msg = ""
                                            try {
                                                Api.cancelRequest(type, x.id)
                                                tick++
                                            } catch (e: ApiException) {
                                                msg = e.message ?: "Could not withdraw it."
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
    }
}

private fun detail(type: String, x: RequestRow): String = when (type) {
    "orders" -> x.lines.size.toString() + (if (x.lines.size == 1) " item" else " items") + "  ·  about " + money(x.lines.sumOf { it.qty * it.price }) +
        (if (x.term == "cash") "  ·  cash" else "  ·  credit")
    "payments" -> money(x.amount) + (x.method?.let { "  ·  $it" } ?: "")
    else -> (if (x.kind == "claim") "Claim" else "Return") + "  ·  " + (x.sale_no ?: "") + "  ·  " +
        x.lines.joinToString(", ") { qtyText(it.qty) + " x " + it.name }
}
