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
import androidx.compose.material3.FilterChip
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.doubleOrNull
import pk.irfanautos.salesman.data.Api
import pk.irfanautos.salesman.data.Load
import pk.irfanautos.salesman.data.load
import pk.irfanautos.salesman.data.money

// The account answer is read field by field, so a small change on the server never stops this screen from opening.
private fun JsonElement?.obj(k: String): JsonObject? = (this as? JsonObject)?.get(k) as? JsonObject
private fun JsonElement?.num(k: String): Double = ((this as? JsonObject)?.get(k) as? JsonPrimitive)?.doubleOrNull ?: 0.0
private fun JsonElement?.text(k: String): String? = ((this as? JsonObject)?.get(k) as? JsonPrimitive)?.contentOrNull
private fun JsonElement?.list(k: String): List<JsonObject> = ((this as? JsonObject)?.get(k) as? JsonArray)?.mapNotNull { it as? JsonObject } ?: emptyList()

private val RANGES = listOf("today" to "Today", "week" to "This week", "month" to "This month")

/** His own account: sales, collections and visits against target, the money he still has to hand over, and what his customers owe. */
@Composable
fun AccountScreen(onBack: () -> Unit) {
    var range by remember { mutableStateOf("month") }
    var tick by remember { mutableStateOf(0) }
    var state by remember { mutableStateOf<Load<JsonObject>>(Load.Loading) }
    LaunchedEffect(range, tick) {
        state = Load.Loading
        state = load { Api.account(range) }
    }

    Screen("My account", onBack, actions = { TextButton(onClick = { tick++ }) { Text("Refresh", color = Color.White) } }) {
        Row(Modifier.padding(horizontal = 12.dp, vertical = 8.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            RANGES.forEach { (k, label) -> FilterChip(selected = range == k, onClick = { range = k }, label = { Text(label) }) }
        }
        when (val s = state) {
            is Load.Loading -> LoadingBox()
            is Load.Err -> Column(Modifier.padding(16.dp)) {
                ErrorText(if (s.offline) "No internet. Your account needs a connection to load." else s.message)
                Button(onClick = { tick++ }) { Text("Try again") }
            }
            is Load.Ok -> {
                val o = s.value
                val perf = o.obj("performance")
                val cash = o.obj("cash")
                val entries = cash.list("entries").asReversed().take(60)
                LazyColumn(contentPadding = PaddingValues(12.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    item {
                        Card(Modifier.fillMaxWidth()) {
                            Column(Modifier.padding(16.dp)) {
                                Text("Money still to hand over to the office", style = MaterialTheme.typography.bodyMedium)
                                Text(money(cash.num("closing")), style = MaterialTheme.typography.headlineMedium, color = if (cash.num("closing") > 0) Bad else Good)
                                Text("Collected " + money(cash.num("collected")) + "  ·  handed over " + money(cash.num("handed_over")), style = MaterialTheme.typography.bodySmall, color = Color.Gray)
                            }
                        }
                    }
                    item {
                        Card(Modifier.fillMaxWidth()) {
                            Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                                Text("My customers owe", style = MaterialTheme.typography.bodyMedium)
                                Text(money(o.obj("receivable").num("total")), style = MaterialTheme.typography.titleLarge)
                                Text(o.obj("receivable").num("customers").toInt().toString() + " customers with a balance", style = MaterialTheme.typography.bodySmall, color = Color.Gray)
                                val pending = o.obj("pending").num("total").toInt()
                                if (pending > 0) Text("$pending of my requests are waiting for the office", color = Warn)
                            }
                        }
                    }
                    if (perf != null) {
                        item {
                            Card(Modifier.fillMaxWidth()) {
                                Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                                    Text("Against my targets", style = MaterialTheme.typography.titleMedium)
                                    Metric("Sales", perf.obj("sales"), asMoney = true)
                                    Metric("Money collected", perf.obj("collection"), asMoney = true)
                                    Metric("Customer visits", perf.obj("visits"), asMoney = false)
                                }
                            }
                        }
                    }
                    item { Text("Cash statement", style = MaterialTheme.typography.titleMedium, modifier = Modifier.padding(top = 4.dp)) }
                    if (entries.isEmpty()) item { Text("Nothing in this period.", color = Color.Gray) }
                    items(entries.size) { i ->
                        val e = entries[i]
                        val amount = e.num("amount")
                        Column(Modifier.fillMaxWidth()) {
                            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                                Text(
                                    if (e.text("type") == "handover") "Handed over to office" else "Collected from " + (e.text("customer_name") ?: "customer"),
                                    modifier = Modifier.weight(1f),
                                )
                                Text((if (amount < 0) "-" else "+") + money(Math.abs(amount)), color = if (amount < 0) Good else Color.Unspecified)
                            }
                            Text(
                                (e.text("entry_date") ?: "") + (e.text("method")?.let { " · $it" } ?: "") + "  ·  balance " + money(e.num("balance")),
                                style = MaterialTheme.typography.bodySmall, color = Color.Gray,
                            )
                            HorizontalDivider(Modifier.padding(top = 6.dp))
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun Metric(label: String, m: JsonObject?, asMoney: Boolean) {
    val actual = m.num("actual")
    val target = m.num("target")
    val shown = { v: Double -> if (asMoney) money(v) else v.toLong().toString() }
    Column {
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
            Text(label)
            Text(if (target > 0) shown(actual) + " of " + shown(target) else shown(actual))
        }
        if (target > 0) {
            val pct = (actual / target * 100).toInt()
            Text("$pct% of target", style = MaterialTheme.typography.bodySmall, color = if (pct >= 100) Good else Color.Gray)
        }
    }
}
