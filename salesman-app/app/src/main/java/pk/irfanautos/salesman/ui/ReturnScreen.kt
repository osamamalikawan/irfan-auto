@file:OptIn(ExperimentalMaterial3Api::class)

package pk.irfanautos.salesman.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
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
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.launch
import kotlinx.serialization.json.addJsonObject
import kotlinx.serialization.json.put
import kotlinx.serialization.json.putJsonArray
import pk.irfanautos.salesman.data.InvoiceDoc
import pk.irfanautos.salesman.data.MyCustomer
import pk.irfanautos.salesman.data.Offline
import pk.irfanautos.salesman.data.Submit
import pk.irfanautos.salesman.data.SubmitResult
import pk.irfanautos.salesman.data.money
import pk.irfanautos.salesman.data.qtyText

/** Why goods cannot be returned from this invoice (null = they can). */
private fun whyNot(d: InvoiceDoc): String? = when {
    d.status != "confirmed" -> "This invoice is cancelled."
    d.fulfil_status != "delivered" && d.fulfil_status != "completed" ->
        "Not delivered yet (" + (if (d.fulfil_status == "packed") "Packed" else "Active") + "). A return or claim can be made after the order is delivered."
    d.items.none { it.qty - it.returned > 0 } -> "Everything on this invoice has already been returned."
    else -> null
}

/** Goods taken back from a customer: choose the invoice they were sold on, then how many of each came back.
 *  Every recent invoice of the customer is listed; one that cannot be returned says why. Works without internet.
 *  Opened from an invoice, that invoice is already chosen. */
@Composable
fun ReturnScreen(customerId: String?, saleId: String?, onBack: () -> Unit) {
    val scope = rememberCoroutineScope()
    var customer by remember { mutableStateOf<MyCustomer?>(customerId?.let { Offline.customer(it) }) }
    var saleKey by remember { mutableStateOf(saleId) }
    var extra by remember { mutableStateOf<InvoiceDoc?>(null) }
    val qtys = remember { mutableStateMapOf<String, String>() }
    var kind by remember { mutableStateOf("return") }
    var damaged by remember { mutableStateOf(false) }
    var reason by remember { mutableStateOf("") }
    var busy by remember { mutableStateOf(false) }
    var result by remember { mutableStateOf<SubmitResult?>(null) }

    val snap = remember(customer?.id, Offline.version) { customer?.let { Offline.snap(it.id) } }
    val docs = snap?.docs ?: emptyList()
    val sale = docs.firstOrNull { it.id == saleKey } ?: extra?.takeIf { it.id == saleKey }
    val blocked = sale?.let { whyNot(it) }

    // a different customer was chosen: start again
    LaunchedEffect(customer?.id) {
        if (customer?.id != customerId) saleKey = null
        qtys.clear()
    }
    // an older invoice (not in the customer's saved account) is opened from the phone's copy or from the website
    LaunchedEffect(saleKey, snap) {
        val k = saleKey
        if (k != null && sale == null) extra = Offline.invoiceDoc(customer?.id, k) ?: Offline.fetchInvoice(k)
    }

    fun q(id: String) = qtys[id]?.toDoubleOrNull() ?: 0.0
    val parts = if (sale != null && blocked == null) sale.items.filter { it.qty - it.returned > 0 } else emptyList()
    val chosen = parts.filter { q(it.id) > 0 }
    val tooMany = parts.any { q(it.id) > it.qty - it.returned + 0.0001 }
    val canSend = sale != null && blocked == null && chosen.isNotEmpty() && !tooMany && !busy

    Page("Return / claim", onBack, actions = { OnlineChip(); Spacer(Modifier.width(12.dp)) }) {
        LazyColumn(contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            item { CustomerField(customer) { customer = it } }

            if (customer != null) {
                item { SectionTitle("1. Choose the invoice") }
                if (snap == null) item { InfoBanner("This customer's invoices are not on the phone yet. Connect to the internet once to download them.") }
                else if (docs.isEmpty()) item { Text("This customer has no invoices yet.", color = Muted) }
                items(docs, key = { it.id }) { inv ->
                    val why = whyNot(inv)
                    val on = sale?.id == inv.id
                    AppCard(
                        Modifier.fillMaxWidth(),
                        onClick = { saleKey = inv.id; qtys.clear() },
                        color = if (on) BrandSoft else Color.White,
                    ) {
                        Column(Modifier.padding(14.dp).fillMaxWidth()) {
                            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                                Text(inv.no + (inv.sale_date?.let { "  ($it)" } ?: ""), style = MaterialTheme.typography.titleSmall)
                                Text(money(inv.total), style = MaterialTheme.typography.titleSmall)
                            }
                            if (why != null) Text(why, style = MaterialTheme.typography.bodySmall, color = Warn, modifier = Modifier.padding(top = 4.dp))
                        }
                    }
                }
            }

            if (sale != null && blocked != null) item { InfoBanner(sale.no + ": " + blocked) }

            if (sale != null && blocked == null) {
                item { SectionTitle("2. How many came back?") }
                items(parts, key = { it.id }) { it2 ->
                    val remaining = it2.qty - it2.returned
                    AppCard(Modifier.fillMaxWidth()) {
                        Row(Modifier.padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
                            Column(Modifier.weight(1f)) {
                                Text(it2.name, style = MaterialTheme.typography.titleSmall)
                                Text("sold " + qtyText(it2.qty) + ", can return " + qtyText(remaining), style = MaterialTheme.typography.bodySmall, color = Muted)
                                if (q(it2.id) > remaining + 0.0001) Text("More than can be returned", style = MaterialTheme.typography.bodySmall, color = Bad)
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
