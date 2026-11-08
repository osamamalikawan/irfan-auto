@file:OptIn(ExperimentalMaterial3Api::class)

package pk.irfanautos.salesman.ui

import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material3.Button
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.launch
import pk.irfanautos.salesman.data.Offline
import pk.irfanautos.salesman.data.Sync
import pk.irfanautos.salesman.data.ago
import pk.irfanautos.salesman.data.money

@Composable
fun CustomersScreen(onOpen: (String) -> Unit) {
    val scope = rememberCoroutineScope()
    val version = Offline.version
    val all = remember(version) { Offline.customers() }
    var q by remember { mutableStateOf("") }
    var owingOnly by remember { mutableStateOf(false) }
    val totalOwing = all.filter { it.balance > 0 }.sumOf { it.balance }
    var list = all.matching(q)
    if (owingOnly) list = list.filter { it.balance > 0 }.sortedByDescending { it.balance }

    Column(Modifier.fillMaxSize()) {
        TabHeader(
            "Customers", "${all.size} customers  ·  owe " + money(totalOwing),
            trailing = { IconButton(onClick = { scope.launch { Sync.runAll(true) } }, enabled = !Offline.syncing) { Icon(Icons.Filled.Refresh, contentDescription = "Refresh") } },
        )
        Column(Modifier.padding(horizontal = 16.dp)) {
            OutlinedTextField(
                value = q, onValueChange = { q = it }, label = { Text("Search name, phone, area") }, singleLine = true,
                shape = RoundedCornerShape(16.dp), modifier = Modifier.fillMaxWidth(),
            )
            Row(Modifier.padding(top = 8.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                FilterChip(selected = !owingOnly, onClick = { owingOnly = false }, label = { Text("All") })
                FilterChip(selected = owingOnly, onClick = { owingOnly = true }, label = { Text("Owing money") })
            }
            if (Offline.syncing) InfoBanner(Offline.syncText.ifEmpty { "Updating..." }, Brand, Modifier.padding(top = 8.dp))
            else if (all.isNotEmpty()) Text("Saved on this phone, updated " + ago(Offline.updatedAt()), style = MaterialTheme.typography.bodySmall, color = Muted, modifier = Modifier.padding(top = 8.dp))
        }
        if (all.isEmpty()) {
            EmptyState("Your customers are not downloaded yet", "Connect to the internet once. After that your customers are always on this phone.")
            Button(onClick = { scope.launch { Sync.runAll(true) } }, modifier = Modifier.padding(horizontal = 32.dp).fillMaxWidth()) { Text("Download now") }
        } else {
            LazyColumn(contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                items(list, key = { it.id }) { c ->
                    AppCard(Modifier.fillMaxWidth(), onClick = { onOpen(c.id) }) {
                        Row(Modifier.padding(14.dp), verticalAlignment = Alignment.CenterVertically) {
                            Avatar(c.name)
                            Column(Modifier.weight(1f).padding(horizontal = 12.dp)) {
                                Text(c.name, style = MaterialTheme.typography.titleSmall)
                                val sub = listOfNotNull(c.area, c.route, c.phone).joinToString(" · ")
                                if (sub.isNotEmpty()) Text(sub, style = MaterialTheme.typography.bodySmall, color = Muted)
                            }
                            Column(horizontalAlignment = Alignment.End) {
                                Text(money(c.balance), style = MaterialTheme.typography.titleSmall, color = if (c.balance > 0) Bad else Muted)
                                if (c.balance > 0) Text("owes", style = MaterialTheme.typography.bodySmall, color = Muted)
                            }
                        }
                    }
                }
            }
        }
    }
}

/** One customer: what he owes, the last visit, unpaid bills and the account statement, with the things a salesman does for him.
 *  Shown from the phone straight away; the numbers are refreshed when there is internet. */
@Composable
fun CustomerScreen(id: String, onBack: () -> Unit, onAction: (String) -> Unit) {
    val ctx = LocalContext.current
    val version = Offline.version
    val c = remember(version) { Offline.customer(id) }
    val snap = remember(version) { Offline.snap(id) }
    val last = remember(version) { Offline.lastVisits()[id] }
    LaunchedEffect(id) { Offline.refreshLedger(id) }

    Page(c?.name ?: "Customer", onBack, actions = { OnlineChip(); Spacer(Modifier.width(12.dp)) }) {
        if (c == null) {
            EmptyState("Customer not found", "This customer is not in your list.")
        } else {
            val balance = snap?.balance ?: c.balance
            val limit = snap?.credit_limit ?: c.credit_limit
            LazyColumn(contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                item {
                    AppCard(Modifier.fillMaxWidth()) {
                        Column(Modifier.padding(18.dp)) {
                            Text(if (balance > 0) "Owes" else if (balance < 0) "We owe" else "Nothing owed", style = MaterialTheme.typography.bodyMedium, color = Muted)
                            Text(money(Math.abs(balance)), style = MaterialTheme.typography.headlineMedium, color = if (balance > 0) Bad else Good)
                            if (limit > 0) Text("Credit limit " + money(limit), style = MaterialTheme.typography.bodySmall, color = Muted)
                            val sub = listOfNotNull(c.area, c.route).joinToString(" · ")
                            if (sub.isNotEmpty()) Text(sub, style = MaterialTheme.typography.bodySmall, color = Muted, modifier = Modifier.padding(top = 6.dp))
                            if (!c.phone.isNullOrBlank()) {
                                OutlinedButton(onClick = { runCatching { ctx.startActivity(Intent(Intent.ACTION_DIAL, Uri.parse("tel:" + c.phone))) } }, modifier = Modifier.padding(top = 10.dp)) { Text("Call " + c.phone) }
                            }
                        }
                    }
                }
                item {
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        Button(onClick = { onAction("order") }, modifier = Modifier.weight(1f)) { Text("Order") }
                        Button(onClick = { onAction("payment") }, modifier = Modifier.weight(1f)) { Text("Payment") }
                        OutlinedButton(onClick = { onAction("return") }, modifier = Modifier.weight(1f)) { Text("Return") }
                    }
                }
                if (snap == null) item { InfoBanner("The account details are downloaded when you have internet. The balance above is from the last update.") }
                if (last != null) {
                    item {
                        AppCard(Modifier.fillMaxWidth()) {
                            Column(Modifier.padding(16.dp)) {
                                Text("Last visit  ·  " + last.date, style = MaterialTheme.typography.titleSmall)
                                Text(last.outcome + (if (!last.notes.isNullOrBlank()) "\n" + last.notes else ""), style = MaterialTheme.typography.bodyMedium, color = Muted, modifier = Modifier.padding(top = 4.dp))
                            }
                        }
                    }
                }
                val unpaid = snap?.unpaid ?: emptyList()
                if (unpaid.isNotEmpty()) {
                    item { SectionTitle("Unpaid bills") }
                    item {
                        AppCard(Modifier.fillMaxWidth()) {
                            Column(Modifier.padding(horizontal = 16.dp, vertical = 8.dp)) {
                                unpaid.forEachIndexed { i, b ->
                                    Row(Modifier.fillMaxWidth().padding(vertical = 8.dp), horizontalArrangement = Arrangement.SpaceBetween) {
                                        Text(b.no, style = MaterialTheme.typography.bodyMedium)
                                        Text(money(b.due) + " of " + money(b.total), style = MaterialTheme.typography.bodyMedium, color = Bad)
                                    }
                                    if (i < unpaid.size - 1) HorizontalDivider(color = Line)
                                }
                            }
                        }
                    }
                }
                val rows = (snap?.rows ?: emptyList()).asReversed()
                if (rows.isNotEmpty()) {
                    item { SectionTitle("Statement") }
                    items(rows.size) { i ->
                        val r = rows[i]
                        Column(Modifier.fillMaxWidth()) {
                            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                                Text(r.label, style = MaterialTheme.typography.bodyMedium, modifier = Modifier.weight(1f))
                                Text(if (r.debit > 0) "+" + money(r.debit) else "-" + money(r.credit), style = MaterialTheme.typography.titleSmall, color = if (r.debit > 0) Bad else Good)
                            }
                            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                                Text(r.date, style = MaterialTheme.typography.bodySmall, color = Muted)
                                Text("balance " + money(r.balance), style = MaterialTheme.typography.bodySmall, color = Muted)
                            }
                            HorizontalDivider(Modifier.padding(top = 8.dp), color = Line)
                        }
                    }
                }
            }
        }
    }
}
