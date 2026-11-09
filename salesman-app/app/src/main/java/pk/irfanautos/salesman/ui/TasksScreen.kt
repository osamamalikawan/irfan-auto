@file:OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)

package pk.irfanautos.salesman.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.Checkbox
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import pk.irfanautos.salesman.data.MyCustomer
import pk.irfanautos.salesman.data.Offline
import pk.irfanautos.salesman.data.Submit
import pk.irfanautos.salesman.data.TaskRow
import pk.irfanautos.salesman.data.addDaysIso
import pk.irfanautos.salesman.data.dayLabel
import pk.irfanautos.salesman.data.money
import pk.irfanautos.salesman.data.todayPk

private fun sectionOf(date: String, today: String, openOnly: Boolean): String = when {
    openOnly && date < today -> "Overdue"
    date == today -> "Today"
    date == addDaysIso(today, 1) -> "Tomorrow"
    else -> dayLabel(date)
}

/** His tasks: scheduled actions on his orders (pack / deliver), promises his customers made to pay, and his own tasks.
 *  Everything is on the phone; a task added or ticked off without internet is sent later. */
@Composable
fun TasksScreen(onBack: () -> Unit, onInvoice: (key: String, customerId: String?) -> Unit, onCustomer: (String) -> Unit) {
    val version = Offline.version
    val pack = remember(version) { Offline.tasks() }
    val canStatus = remember(version) { Offline.canSaleStatus() }
    val today = todayPk()
    var showDone by remember { mutableStateOf(false) }
    var adding by remember { mutableStateOf(false) }

    val all = pack?.items ?: emptyList()
    val shown = all.filter { it.done == showDone }.let { l -> if (showDone) l.sortedByDescending { it.date } else l.sortedBy { it.date } }
    val groups = shown.groupBy { sectionOf(it.date, today, !showDone) }

    Page("Tasks", onBack, actions = { OnlineChip(); Spacer(Modifier.width(12.dp)) }) {
        Row(Modifier.padding(horizontal = 16.dp, vertical = 10.dp), horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
            FilterChip(selected = !showDone, onClick = { showDone = false }, label = { Text("To do") })
            FilterChip(selected = showDone, onClick = { showDone = true }, label = { Text("Done") })
            Spacer(Modifier.weight(1f))
            Button(onClick = { adding = true }) { Text("+ Add task", maxLines = 1, softWrap = false) }
        }
        if (pack == null) {
            EmptyState("Tasks are not downloaded yet", "Connect to the internet once. After that your tasks are always on this phone.")
        } else if (shown.isEmpty()) {
            EmptyState(if (showDone) "Nothing done yet" else "No tasks to do", if (showDone) "Finished tasks show here." else "You are all caught up.")
        } else {
            LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(start = 16.dp, end = 16.dp, bottom = 16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                groups.forEach { (title, list) ->
                    item(key = "h$title") {
                        Text(title, style = MaterialTheme.typography.titleSmall, color = if (title == "Overdue") Bad else Muted, modifier = Modifier.padding(top = 6.dp))
                    }
                    items(list, key = { it.id }) { t -> TaskCard(t, canStatus, onInvoice, onCustomer) }
                }
            }
        }
    }

    if (adding) {
        AddTaskDialog(
            onDismiss = { adding = false },
            onSave = { title, date, note, customer ->
                val key = Submit.newKey()
                val body = buildJsonObject {
                    put("title", title)
                    put("due_date", date)
                    if (note.isNotBlank()) put("note", note)
                    if (customer != null) put("customer_id", customer.id)
                    put("idem_key", key)
                }
                Submit.queue("task_add", body, title)
                Offline.addLocalTask(TaskRow(id = "local:$key", kind = "task", date = date, title = title, sub = customer?.name ?: "", done = false, customer_id = customer?.id, note = note.ifBlank { null }))
                adding = false
            },
        )
    }
}

@Composable
private fun TaskCard(t: TaskRow, canStatus: Boolean, onInvoice: (String, String?) -> Unit, onCustomer: (String) -> Unit) {
    val local = t.id.startsWith("local:")
    AppCard(Modifier.fillMaxWidth()) {
        Column(Modifier.padding(14.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                when (t.kind) {
                    "order" -> Pill("Order", Brand)
                    "promise" -> Pill("Promise", Warn)
                    else -> Pill("Task", Teal)
                }
                Text(dayLabel(t.date), style = MaterialTheme.typography.bodySmall, color = Muted, modifier = Modifier.weight(1f).padding(start = 10.dp))
                if (t.kind == "task") {
                    Checkbox(
                        checked = t.done, enabled = !local,
                        onCheckedChange = { now ->
                            Offline.setTaskDone(t.id, now)
                            Submit.queue("task_done", buildJsonObject { put("done", now); put("idem_key", Submit.newKey()) }, t.title, path = "/api/tasks/" + t.id, method = "PATCH")
                        },
                    )
                }
            }
            Text(t.title, style = MaterialTheme.typography.titleSmall, modifier = Modifier.padding(top = 6.dp))
            if (t.sub.isNotBlank()) Text(t.sub, style = MaterialTheme.typography.bodyMedium, color = Muted)
            if (!t.note.isNullOrBlank()) Text(t.note, style = MaterialTheme.typography.bodySmall, color = Muted, modifier = Modifier.padding(top = 2.dp))
            if (t.kind == "promise" && t.status != null) {
                Text(
                    (if (t.status == "kept") "Kept" else if (t.status == "broken") "Not kept" else "Waiting") + (if (t.amount != null) " - " + money(t.amount) else ""),
                    style = MaterialTheme.typography.bodySmall, color = if (t.status == "kept") Good else if (t.status == "broken") Bad else Warn,
                )
            }
            if (local) Text("Saved on the phone, not sent yet", style = MaterialTheme.typography.bodySmall, color = Warn, modifier = Modifier.padding(top = 2.dp))
            Row(Modifier.padding(top = 8.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                if (t.kind == "order" && (t.sale_id != null || t.sale_no != null)) {
                    OutlinedButton(onClick = { onInvoice(t.sale_id ?: t.sale_no.orEmpty(), t.customer_id) }) { Text("Open invoice", maxLines = 1, softWrap = false) }
                    if (canStatus && !t.done) {
                        Button(onClick = {
                            Offline.setTaskDone(t.id, true)
                            Submit.queue("sale_task", buildJsonObject { put("done", true); put("idem_key", Submit.newKey()) }, t.title, path = "/api/sale-tasks/" + t.id, method = "PATCH")
                        }) { Text("Mark " + (t.action ?: "done"), maxLines = 1, softWrap = false) }
                    }
                }
                if (t.kind != "order" && t.customer_id != null) {
                    OutlinedButton(onClick = { onCustomer(t.customer_id) }) { Text("Open customer", maxLines = 1, softWrap = false) }
                }
            }
        }
    }
}

@Composable
private fun AddTaskDialog(onDismiss: () -> Unit, onSave: (title: String, date: String, note: String, customer: MyCustomer?) -> Unit) {
    var title by remember { mutableStateOf("") }
    var note by remember { mutableStateOf("") }
    var days by remember { mutableStateOf(0) }
    var customer by remember { mutableStateOf<MyCustomer?>(null) }
    var withCustomer by remember { mutableStateOf(false) }
    val today = todayPk()

    Dialog(onDismissRequest = onDismiss, properties = DialogProperties(usePlatformDefaultWidth = false)) {
        Surface(shape = RoundedCornerShape(24.dp), modifier = Modifier.fillMaxWidth(0.94f)) {
            Column(Modifier.verticalScroll(rememberScrollState()).padding(20.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Text("New task", style = MaterialTheme.typography.titleLarge)
                OutlinedTextField(
                    value = title, onValueChange = { title = it.take(120) }, label = { Text("What to do") }, singleLine = true,
                    shape = RoundedCornerShape(14.dp), modifier = Modifier.fillMaxWidth(),
                )
                Text("When", style = MaterialTheme.typography.titleSmall)
                FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    listOf(0 to "Today", 1 to "Tomorrow", 3 to "In 3 days", 7 to "Next week").forEach { (d, label) ->
                        FilterChip(selected = days == d, onClick = { days = d }, label = { Text(label) })
                    }
                }
                OutlinedTextField(
                    value = note, onValueChange = { note = it.take(300) }, label = { Text("Note (optional)") }, minLines = 2, maxLines = 4,
                    shape = RoundedCornerShape(14.dp), modifier = Modifier.fillMaxWidth(),
                )
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Checkbox(checked = withCustomer, onCheckedChange = { withCustomer = it; if (!it) customer = null })
                    Text("About a customer")
                }
                if (withCustomer) CustomerField(customer) { customer = it }
                Row(Modifier.fillMaxWidth().padding(top = 6.dp), horizontalArrangement = Arrangement.End) {
                    TextButton(onClick = onDismiss) { Text("Cancel") }
                    Button(
                        enabled = title.isNotBlank() && (!withCustomer || customer != null),
                        onClick = { onSave(title.trim(), addDaysIso(today, days.toLong()), note.trim(), customer) },
                    ) { Text("Save task") }
                }
            }
        }
    }
}
