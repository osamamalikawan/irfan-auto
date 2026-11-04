@file:OptIn(ExperimentalMaterial3Api::class)

package pk.irfanautos.salesman.ui

import androidx.compose.foundation.clickable
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
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
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
import pk.irfanautos.salesman.data.Api
import pk.irfanautos.salesman.data.Cached
import pk.irfanautos.salesman.data.LedgerResp
import pk.irfanautos.salesman.data.Load
import pk.irfanautos.salesman.data.MyCustomer
import pk.irfanautos.salesman.data.Repo
import pk.irfanautos.salesman.data.load
import pk.irfanautos.salesman.data.money

@Composable
fun CustomersScreen(onBack: () -> Unit, onOpen: (String) -> Unit) {
    var state by remember { mutableStateOf<Load<Cached<List<MyCustomer>>>>(Load.Loading) }
    var q by remember { mutableStateOf("") }
    var owingOnly by remember { mutableStateOf(false) }
    var tick by remember { mutableStateOf(0) }
    LaunchedEffect(tick) {
        state = Load.Loading
        state = load { Repo.customers() }
    }

    Screen("My customers", onBack, actions = { TextButton(onClick = { tick++ }) { Text("Refresh", color = Color.White) } }) {
        Column(Modifier.padding(horizontal = 12.dp, vertical = 8.dp)) {
            OutlinedTextField(value = q, onValueChange = { q = it }, label = { Text("Search name, phone, area") }, singleLine = true, modifier = Modifier.fillMaxWidth())
            Row(Modifier.padding(top = 8.dp)) {
                FilterChip(selected = owingOnly, onClick = { owingOnly = !owingOnly }, label = { Text("Owing only") })
            }
        }
        when (val s = state) {
            is Load.Loading -> LoadingBox()
            is Load.Err -> Column(Modifier.padding(16.dp)) { ErrorText(s.message); Button(onClick = { tick++ }) { Text("Try again") } }
            is Load.Ok -> {
                val all = s.value.value
                var list = all.matching(q)
                if (owingOnly) list = list.filter { it.balance > 0 }.sortedByDescending { it.balance }
                val totalOwing = all.filter { it.balance > 0 }.sumOf { it.balance }
                if (s.value.fromCache) InfoBanner("No internet: showing the list saved on this phone.", modifier = Modifier.padding(horizontal = 12.dp))
                Text("${list.size} customers  -  all together owe ${money(totalOwing)}", style = MaterialTheme.typography.bodyMedium, modifier = Modifier.padding(horizontal = 16.dp, vertical = 4.dp))
                LazyColumn(contentPadding = PaddingValues(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    items(list, key = { it.id }) { c ->
                        Card(Modifier.fillMaxWidth().clickable { onOpen(c.id) }) {
                            Column(Modifier.padding(12.dp)) {
                                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                                    Text(c.name, style = MaterialTheme.typography.titleMedium, modifier = Modifier.weight(1f))
                                    Text(money(c.balance), color = if (c.balance > 0) Bad else Color.Gray, style = MaterialTheme.typography.titleMedium)
                                }
                                val sub = listOfNotNull(c.area, c.route, c.phone).joinToString(" · ")
                                if (sub.isNotEmpty()) Text(sub, style = MaterialTheme.typography.bodySmall, color = Color.Gray)
                            }
                        }
                    }
                }
            }
        }
    }
}

/** One customer: what he owes, the unpaid bills and the account statement, with the three things a salesman does for him. */
@Composable
fun CustomerScreen(id: String, onBack: () -> Unit, onAction: (String) -> Unit) {
    var state by remember { mutableStateOf<Load<LedgerResp>>(Load.Loading) }
    var tick by remember { mutableStateOf(0) }
    LaunchedEffect(id, tick) {
        state = Load.Loading
        state = load { Api.ledger(id) }
    }

    Screen("Customer account", onBack, actions = { TextButton(onClick = { tick++ }) { Text("Refresh", color = Color.White) } }) {
        when (val s = state) {
            is Load.Loading -> LoadingBox()
            is Load.Err -> Column(Modifier.padding(16.dp)) {
                ErrorText(if (s.offline) "No internet. The account needs a connection to load." else s.message)
                Button(onClick = { tick++ }) { Text("Try again") }
            }
            is Load.Ok -> {
                val l = s.value
                LazyColumn(contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    item {
                        Text(l.customer?.name ?: "", style = MaterialTheme.typography.headlineSmall)
                        Text(if (l.balance > 0) "Owes " + money(l.balance) else if (l.balance < 0) "We owe " + money(-l.balance) else "Nothing owed",
                            color = if (l.balance > 0) Bad else Good, style = MaterialTheme.typography.titleLarge)
                        if ((l.customer?.credit_limit ?: 0.0) > 0) Text("Credit limit " + money(l.customer!!.credit_limit), color = Color.Gray)
                    }
                    item {
                        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            Button(onClick = { onAction("order") }, modifier = Modifier.weight(1f)) { Text("Order") }
                            Button(onClick = { onAction("payment") }, modifier = Modifier.weight(1f)) { Text("Payment") }
                            OutlinedButton(onClick = { onAction("return") }, modifier = Modifier.weight(1f)) { Text("Return") }
                        }
                    }
                    if (l.unpaid.isNotEmpty()) {
                        item { Text("Unpaid bills", style = MaterialTheme.typography.titleMedium, modifier = Modifier.padding(top = 8.dp)) }
                        items(l.unpaid.size) { i ->
                            val b = l.unpaid[i]
                            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                                Text(b.no)
                                Text(money(b.due) + " of " + money(b.total), color = Bad)
                            }
                        }
                    }
                    item { Text("Statement", style = MaterialTheme.typography.titleMedium, modifier = Modifier.padding(top = 8.dp)) }
                    val rows = l.rows.asReversed().take(100)
                    if (rows.isEmpty()) item { Text("No entries yet.", color = Color.Gray) }
                    items(rows.size) { i ->
                        val r = rows[i]
                        Column(Modifier.fillMaxWidth()) {
                            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                                Text(r.label, modifier = Modifier.weight(1f))
                                Text(if (r.debit > 0) "+" + money(r.debit) else "-" + money(r.credit), color = if (r.debit > 0) Bad else Good)
                            }
                            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                                Text(r.date, style = MaterialTheme.typography.bodySmall, color = Color.Gray)
                                Text("balance " + money(r.balance), style = MaterialTheme.typography.bodySmall, color = Color.Gray)
                            }
                            HorizontalDivider(Modifier.padding(top = 6.dp))
                        }
                    }
                    if (l.rows.size > 100) item { Text("Showing the latest 100 entries.", color = Color.Gray) }
                }
            }
        }
    }
}
