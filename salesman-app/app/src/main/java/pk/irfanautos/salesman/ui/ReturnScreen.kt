@file:OptIn(ExperimentalMaterial3Api::class)

package pk.irfanautos.salesman.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Checkbox
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.launch
import kotlinx.serialization.json.addJsonObject
import kotlinx.serialization.json.put
import kotlinx.serialization.json.putJsonArray
import pk.irfanautos.salesman.data.InvoiceSnap
import pk.irfanautos.salesman.data.MyCustomer
import pk.irfanautos.salesman.data.Offline
import pk.irfanautos.salesman.data.Submit
import pk.irfanautos.salesman.data.SubmitResult
import pk.irfanautos.salesman.data.money
import pk.irfanautos.salesman.data.qtyText

/** Goods taken back from a customer: choose the delivered invoice they were sold on, then how many of each came back.
 *  The delivered invoices of each customer are on the phone, so this works without internet. */
@Composable
fun ReturnScreen(customerId: String?, onBack: () -> Unit) {
    val scope = rememberCoroutineScope()
    var customer by remember { mutableStateOf<MyCustomer?>(customerId?.let { Offline.customer(it) }) }
    var sale by remember { mutableStateOf<InvoiceSnap?>(null) }
    val qtys = remember { mutableStateMapOf<String, String>() }
    var kind by remember { mutableStateOf("return") }
    var damaged by remember { mutableStateOf(false) }
    var reason by remember { mutableStateOf("") }
    var busy by remember { mutableStateOf(false) }
    var result by remember { mutableStateOf<SubmitResult?>(null) }

    val snap = remember(customer?.id, Offline.version) { customer?.let { Offline.snap(it.id) } }
    val invoices = (snap?.invoices ?: emptyList()).filter { inv -> inv.items.any { it.remaining > 0 } }
    LaunchedEffect(customer?.id) { sale = null; qtys.clear() }

    fun q(id: String) = qtys[id]?.toDoubleOrNull() ?: 0.0
    val parts = (sale?.items ?: emptyList()).filter { it.remaining > 0 }
    val chosen = parts.filter { q(it.id) > 0 }
    val tooMany = parts.any { q(it.id) > it.remaining + 0.0001 }
    val canSend = sale != null && chosen.isNotEmpty() && !tooMany && !busy

    Page("Return / claim", onBack, actions = { OnlineChip(); Spacer(Modifier.width(12.dp)) }) {
        LazyColumn(contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            item { CustomerField(customer) { customer = it } }

            if (customer != null) {
                item { SectionTitle("1. Choose the invoice") }
                if (snap == null) item { InfoBanner("This customer's invoices are not on the phone yet. Connect to the internet once to download them.") }
                else if (invoices.isEmpty()) item { Text("This customer has no delivered orders to return from. A return or claim can only be made for an order that has been delivered.", color = Muted) }
                items(invoices, key = { it.id }) { inv ->
                    val on = sale?.id == inv.id
                    AppCard(Modifier.fillMaxWidth(), onClick = { sale = inv; qtys.clear() }, color = if (on) BrandSoft else androidx.compose.ui.graphics.Color.White) {
                        Row(Modifier.padding(14.dp).fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                            Text(inv.no + (inv.sale_date?.let { "  ($it)" } ?: ""), style = MaterialTheme.typography.titleSmall)
                            Text(money(inv.total), style = MaterialTheme.typography.titleSmall)
                        }
                    }
                }
            }

            if (sale != null) {
                item { SectionTitle("2. How many came back?") }
                items(parts, key = { it.id }) { it2 ->
                    AppCard(Modifier.fillMaxWidth()) {
                        Row(Modifier.padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
                            androidx.compose.foundation.layout.Column(Modifier.weight(1f)) {
                                Text(it2.name, style = MaterialTheme.typography.titleSmall)
                                Text("sold " + qtyText(it2.sold) + ", can return " + qtyText(it2.remaining), style = MaterialTheme.typography.bodySmall, color = Muted)
                                if (q(it2.id) > it2.remaining + 0.0001) Text("More than can be returned", style = MaterialTheme.typography.bodySmall, color = Bad)
                            }
                            OutlinedTextField(
                                value = qtys[it2.id] ?: "", onValueChange = { v -> qtys[it2.id] = v.filter { ch -> ch.isDigit() || ch == '.' } },
                                singleLine = true, label = { Text("Qty") }, keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                                shape = RoundedCornerShape(12.dp), modifier = Modifier.width(92.dp),
                            )
                        }
                    }
                }
                item {
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        FilterChip(selected = kind == "return", onClick = { kind = "return" }, label = { Text("Return") })
                        FilterChip(selected = kind == "claim", onClick = { kind = "claim" }, label = { Text("Claim (defective)") })
                    }
                }
                item {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Checkbox(checked = damaged, onCheckedChange = { damaged = it })
                        Text("Goods are damaged")
                    }
                }
                item { OutlinedTextField(value = reason, onValueChange = { reason = it }, label = { Text("Reason (optional)") }, shape = RoundedCornerShape(16.dp), modifier = Modifier.fillMaxWidth()) }
                item { Text("The office checks the goods, then the customer is credited and the stock is updated.", style = MaterialTheme.typography.bodySmall, color = Muted) }
                item {
                    BigButton(
                        text = if (busy) "Saving..." else "Send to office for approval", enabled = canSend,
                        onClick = {
                            val inv = sale
                            val c = customer
                            if (inv != null && c != null) {
                                scope.launch {
                                    busy = true
                                    val body = Submit.withKey {
                                        put("sale_id", inv.id)
                                        put("kind", kind)
                                        put("damaged", damaged)
                                        putJsonArray("lines") { chosen.forEach { r -> addJsonObject { put("item_id", r.id); put("qty", q(r.id)) } } }
                                        if (reason.isNotBlank()) put("reason", reason.trim())
                                    }
                                    result = Submit.send("returns", body, c.name)
                                    busy = false
                                }
                            }
                        },
                    )
                }
            }
        }
    }
    SubmitResultDialog(result) { leave -> result = null; if (leave) onBack() }
}
