@file:OptIn(ExperimentalMaterial3Api::class)

package pk.irfanautos.salesman.ui

import androidx.compose.foundation.clickable
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
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonObject
import pk.irfanautos.salesman.App
import pk.irfanautos.salesman.data.Api
import pk.irfanautos.salesman.data.EmpLedger
import pk.irfanautos.salesman.data.LedgerResp
import pk.irfanautos.salesman.data.Load
import pk.irfanautos.salesman.data.Offline
import pk.irfanautos.salesman.data.addDaysIso
import pk.irfanautos.salesman.data.ago
import pk.irfanautos.salesman.data.load
import pk.irfanautos.salesman.data.money
import pk.irfanautos.salesman.data.todayPk

@Composable
private fun Figure(label: String, value: String, modifier: Modifier = Modifier, color: androidx.compose.ui.graphics.Color = Ink) {
    AppCard(modifier) {
        Column(Modifier.padding(12.dp)) {
            Text(label, style = MaterialTheme.typography.bodySmall, color = Muted)
            Text(value, style = MaterialTheme.typography.titleSmall, color = color, maxLines = 1)
        }
    }
}

/** The full account of one customer: every entry of the chosen period with the running balance. Tap an invoice to open it.
 *  Each period is kept on the phone after it was opened once; without internet the latest 40 entries saved with the customer are shown. */
@Composable
fun LedgerScreen(customerId: String, onBack: () -> Unit, onInvoice: (String) -> Unit) {
    val customer = remember(Offline.version) { Offline.customer(customerId) }
    var range by remember { mutableStateOf("90") }
    var tick by remember { mutableStateOf(0) }
    var data by remember { mutableStateOf<LedgerResp?>(null) }
    var loading by remember { mutableStateOf(true) }
    var note by remember { mutableStateOf("") }

    LaunchedEffect(customerId, range, tick) {
        val key = "ledger:$customerId:$range"
        data = App.localDb.get(key)?.let { s -> runCatching { Api.json.decodeFromString<LedgerResp>(s) }.getOrNull() }
        loading = data == null
        note = ""
        val from = when (range) { "30" -> addDaysIso(todayPk(), -30); "90" -> addDaysIso(todayPk(), -90); else -> null }
        when (val r = load { Api.ledgerFrom(customerId, from) }) {
            is Load.Ok -> {
                data = r.value
                App.localDb.put(key, Api.json.encodeToString(r.value))
            }
            is Load.Err -> {
                if (data == null) {
                    val snap = Offline.snap(customerId)
                    if (snap != null) {
                        data = LedgerResp(balance = snap.balance, opening = snap.opening, closing = snap.closing, rows = snap.rows, unpaid = snap.unpaid)
                        note = "No internet: showing the latest 40 entries saved on this phone."
                    } else {
                        note = "No internet and nothing saved for this customer yet."
                    }
                } else {
                    note = "No internet: showing this ledger as it was last saved " + ago(App.localDb.savedAt(key)) + "."
                }
            }
            else -> {}
        }
        loading = false
    }

    Page((customer?.name ?: "Customer") + " - ledger", onBack, actions = { OnlineChip(); Spacer(Modifier.width(12.dp)) }) {
        Row(Modifier.padding(horizontal = 16.dp, vertical = 10.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            listOf("30" to "30 days", "90" to "90 days", "all" to "Everything").forEach { (k, label) ->
                FilterChip(selected = range == k, onClick = { range = k }, label = { Text(label) })
            }
        }
        val d = data
        if (d == null) {
            if (loading) LoadingBox() else EmptyState("Nothing to show", note)
        } else {
            val rows = d.rows.asReversed()
            LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(start = 16.dp, end = 16.dp, bottom = 16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                if (note.isNotEmpty()) item { InfoBanner(note) }
                item {
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        Figure("Opening", money(d.opening), Modifier.weight(1f))
                        Figure("Closing", money(d.closing), Modifier.weight(1f), if (d.closing > 0) Bad else Good)
                    }
                }
                if (rows.isEmpty()) item { Text("No entries in this period.", color = Muted) }
                items(rows.size) { i ->
                    val r = rows[i]
                    val inv = invoiceNoIn(r.label)
                    Column(Modifier.fillMaxWidth().then(if (inv != null) Modifier.clickable { onInvoice(inv) } else Modifier)) {
                        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                            Text(r.label, style = MaterialTheme.typography.bodyMedium, color = if (inv != null) Brand else Ink, modifier = Modifier.weight(1f))
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

/** The salesman's own ledger: every payment he collected and every handover of money to the office, with the running balance
 *  (what he still has to hand over). */
@Composable
private fun CashLedger() {
    var range by remember { mutableStateOf("month") }
    var tick by remember { mutableStateOf(0) }
    var data by remember { mutableStateOf<JsonObject?>(null) }
    var loading by remember { mutableStateOf(true) }
    var note by remember { mutableStateOf("") }

    LaunchedEffect(range, tick) {
        val key = "myledger:$range"
        data = App.localDb.get(key)?.let { s -> runCatching { Api.json.parseToJsonElement(s).jsonObject }.getOrNull() }
        loading = data == null
        note = ""
        val today = todayPk()
        when (val r = load { if (range == "3m") Api.accountBetween(addDaysIso(today, -89), today) else Api.account(range) }) {
            is Load.Ok -> {
                data = r.value
                App.localDb.put(key, r.value.toString())
            }
            is Load.Err -> note = if (data == null) "No internet and nothing saved for this period yet." else "No internet: showing this ledger as it was last saved " + ago(App.localDb.savedAt(key)) + "."
            else -> {}
        }
        loading = false
    }

    Column(Modifier.fillMaxSize()) {
        Row(Modifier.padding(horizontal = 16.dp, vertical = 10.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            listOf("today" to "Today", "week" to "Week", "month" to "Month", "3m" to "3 months").forEach { (k, label) ->
                FilterChip(selected = range == k, onClick = { range = k }, label = { Text(label) })
            }
        }
        val cash = data.obj("cash")
        if (cash == null) {
            if (loading) LoadingBox() else EmptyState("Nothing to show", note)
        } else {
            val entries = cash.list("entries").asReversed().take(600)
            LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(start = 16.dp, end = 16.dp, bottom = 16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                if (note.isNotEmpty()) item { InfoBanner(note) }
                item {
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        Figure("Opening", money(cash.num("opening")), Modifier.weight(1f))
                        Figure("Collected", money(cash.num("collected")), Modifier.weight(1f))
                    }
                }
                item {
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        Figure("Handed over", money(cash.num("handed_over")), Modifier.weight(1f), Good)
                        Figure("Still to hand over", money(cash.num("closing")), Modifier.weight(1f), if (cash.num("closing") > 0) Bad else Good)
                    }
                }
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
        }
    }
}

private fun typeColor(type: String) = when (type) {
    "salary", "bonus", "opening" -> Good
    "payment" -> Brand
    "advance" -> Warn
    else -> Bad
}

/** His own account with the shop as an employee: salary earned, salary paid, advances, bonuses and deductions, with what is still owed to him.
 *  The last 4 months are downloaded with the rest, and every period he opens is kept, so it works without internet. */
@Composable
private fun SalaryLedger() {
    var range by remember { mutableStateOf("month") }
    var tick by remember { mutableStateOf(0) }
    var data by remember { mutableStateOf<EmpLedger?>(null) }
    var loading by remember { mutableStateOf(true) }
    var note by remember { mutableStateOf("") }

    LaunchedEffect(range, tick) {
        val key = "salary:$range"
        data = App.localDb.get(key)?.let { s -> runCatching { Api.json.decodeFromString<EmpLedger>(s) }.getOrNull() }
        loading = data == null
        note = ""
        when (val r = load { Api.employeeLedger(range) }) {
            is Load.Ok -> {
                data = r.value
                App.localDb.put(key, Api.json.encodeToString(r.value))
            }
            is Load.Err -> {
                if (data == null) {
                    val saved = Offline.myLedger()
                    if (saved?.employee != null) {
                        data = saved
                        note = "No internet: showing the last 4 months saved on this phone."
                    } else {
                        note = "No internet and nothing saved yet."
                    }
                } else {
                    note = "No internet: showing this ledger as it was last saved " + ago(App.localDb.savedAt(key)) + "."
                }
            }
            else -> {}
        }
        loading = false
    }

    Column(Modifier.fillMaxSize()) {
        Row(Modifier.padding(horizontal = 16.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            listOf("month" to "This month", "3m" to "3 months", "year" to "Year", "all" to "Everything").forEach { (k, label) ->
                FilterChip(selected = range == k, onClick = { range = k }, label = { Text(label) })
            }
        }
        val d = data
        val emp = d?.employee
        if (d == null || emp == null) {
            if (loading) LoadingBox()
            else EmptyState(
                if (d != null) "No salary record yet" else "Nothing to show",
                if (d != null) "Your login is not linked to an employee record. Ask the office." else note,
            )
        } else {
            val rows = d.rows.asReversed()
            LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                if (note.isNotEmpty()) item { InfoBanner(note) }
                item {
                    AppCard(Modifier.fillMaxWidth()) {
                        Column(Modifier.padding(18.dp)) {
                            Text(
                                if (d.balance > 0) "The shop owes you" else if (d.balance < 0) "Advance you have taken" else "Nothing owed",
                                style = MaterialTheme.typography.bodyMedium, color = Muted,
                            )
                            Text(money(Math.abs(d.balance)), style = MaterialTheme.typography.headlineMedium, color = if (d.balance > 0) Good else if (d.balance < 0) Warn else Ink)
                            Text(emp.name + "  ·  " + emp.code + (if (!emp.designation.isNullOrBlank()) "  ·  " + emp.designation else ""), style = MaterialTheme.typography.bodySmall, color = Muted, modifier = Modifier.padding(top = 6.dp))
                            if (emp.rate.isNotBlank()) Text("Salary: " + emp.rate, style = MaterialTheme.typography.bodySmall, color = Muted)
                        }
                    }
                }
                item {
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        Figure("Opening", money(d.opening), Modifier.weight(1f))
                        Figure("Earned", money(d.totalDebit), Modifier.weight(1f), Good)
                    }
                }
                item {
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        Figure("Paid / deducted", money(d.totalCredit), Modifier.weight(1f), Brand)
                        Figure("Closing", money(d.closing), Modifier.weight(1f))
                    }
                }
                if (rows.isEmpty()) item { Text("No entries in this period.", color = Muted) }
                items(rows.size) { i ->
                    val r = rows[i]
                    Column(Modifier.fillMaxWidth()) {
                        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                            Text(r.label, style = MaterialTheme.typography.bodyMedium, modifier = Modifier.weight(1f))
                            Text(if (r.debit > 0) "+" + money(r.debit) else "-" + money(r.credit), style = MaterialTheme.typography.titleSmall, color = typeColor(r.type))
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

/** His own ledger: his salary account with the shop, and the cash he collected from customers (what he still has to hand over). */
@Composable
fun MyLedgerScreen(onBack: () -> Unit) {
    var tab by remember { mutableStateOf(0) }
    Page("My ledger", onBack, actions = { OnlineChip(); Spacer(Modifier.width(12.dp)) }) {
        Row(Modifier.padding(horizontal = 16.dp, vertical = 10.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            FilterChip(selected = tab == 0, onClick = { tab = 0 }, label = { Text("My salary") })
            FilterChip(selected = tab == 1, onClick = { tab = 1 }, label = { Text("Cash I collected") })
        }
        if (tab == 0) SalaryLedger() else CashLedger()
    }
}
