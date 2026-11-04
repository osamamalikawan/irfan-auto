@file:OptIn(ExperimentalMaterial3Api::class)

package pk.irfanautos.salesman.ui

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
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
import pk.irfanautos.salesman.data.Api
import pk.irfanautos.salesman.data.Load
import pk.irfanautos.salesman.data.MyCustomer
import pk.irfanautos.salesman.data.Repo
import pk.irfanautos.salesman.data.RetItem
import pk.irfanautos.salesman.data.SaleSummary
import pk.irfanautos.salesman.data.Submit
import pk.irfanautos.salesman.data.SubmitResult
import pk.irfanautos.salesman.data.load
import pk.irfanautos.salesman.data.money
import pk.irfanautos.salesman.data.qtyText

/** Goods taken back from a customer: choose the invoice they were sold on, then how many of each came back. */
@Composable
fun ReturnScreen(customerId: String?, onBack: () -> Unit) {
    val scope = rememberCoroutineScope()
    var customer by remember { mutableStateOf<MyCustomer?>(null) }
    var sales by remember { mutableStateOf<Load<List<SaleSummary>>>(Load.Ok(emptyList())) }
    var sale by remember { mutableStateOf<SaleSummary?>(null) }
    var parts by remember { mutableStateOf<Load<List<RetItem>>>(Load.Ok(emptyList())) }
    val qtys = remember { mutableStateMapOf<String, String>() }
    var kind by remember { mutableStateOf("return") }
    var damaged by remember { mutableStateOf(false) }
    var reason by remember { mutableStateOf("") }
    var busy by remember { mutableStateOf(false) }
    var result by remember { mutableStateOf<SubmitResult?>(null) }

    LaunchedEffect(customerId) {
        if (customerId != null) {
            val l = load { Repo.customers() }
            if (l is Load.Ok) customer = l.value.value.firstOrNull { it.id == customerId }
        }
    }
    LaunchedEffect(customer?.id) {
        sale = null
        val c = customer
        if (c == null) {
            sales = Load.Ok(emptyList())
        } else {
            sales = Load.Loading
            sales = load { Api.sales(c.id).filter { it.status == "confirmed" } }
        }
    }
    LaunchedEffect(sale?.id) {
        qtys.clear()
        val s = sale
        if (s == null) {
            parts = Load.Ok(emptyList())
        } else {
            parts = Load.Loading
            parts = load { Api.returnable(s.id).filter { it.remaining > 0 } }
        }
    }

    fun q(id: String) = qtys[id]?.toDoubleOrNull() ?: 0.0
    val list = (parts as? Load.Ok)?.value ?: emptyList()
    val chosen = list.filter { q(it.id) > 0 }
    val tooMany = list.any { q(it.id) > it.remaining + 0.0001 }
    val canSend = sale != null && chosen.isNotEmpty() && !tooMany && !busy

    Screen("Return / claim", onBack) {
        LazyColumn(contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            item { CustomerField(customer) { customer = it } }

            if (customer != null) {
                item { Text("1. Choose the invoice", style = MaterialTheme.typography.titleMedium) }
                when (val s = sales) {
                    is Load.Loading -> item { LoadingBox() }
                    is Load.Err -> item { ErrorText(s.message) }
                    is Load.Ok -> {
                        if (s.value.isEmpty()) item { Text("This customer has no invoices.", color = Color.Gray) }
                        items(s.value, key = { it.id }) { inv ->
                            val on = sale?.id == inv.id
                            Card(
                                Modifier.fillMaxWidth().clickable { sale = inv },
                                colors = CardDefaults.cardColors(containerColor = if (on) MaterialTheme.colorScheme.primaryContainer else MaterialTheme.colorScheme.surfaceVariant),
                            ) {
                                Row(Modifier.padding(12.dp).fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                                    Text(inv.no + (inv.sale_date?.let { "  ($it)" } ?: ""), style = MaterialTheme.typography.titleSmall)
                                    Text(money(inv.total))
                                }
                            }
                        }
                    }
                }
            }

            if (sale != null) {
                item { Text("2. How many came back?", style = MaterialTheme.typography.titleMedium, modifier = Modifier.padding(top = 8.dp)) }
                when (val s = parts) {
                    is Load.Loading -> item { LoadingBox() }
                    is Load.Err -> item { ErrorText(s.message) }
                    is Load.Ok -> {
                        if (s.value.isEmpty()) item { Text("Everything on this invoice has already been returned.", color = Color.Gray) }
                        items(s.value, key = { it.id }) { it2 ->
                            Card(Modifier.fillMaxWidth()) {
                                Row(Modifier.padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
                                    androidx.compose.foundation.layout.Column(Modifier.weight(1f)) {
                                        Text(it2.name, style = MaterialTheme.typography.titleSmall)
                                        Text("sold " + qtyText(it2.sold) + ", can return " + qtyText(it2.remaining), style = MaterialTheme.typography.bodySmall, color = Color.Gray)
                                        if (q(it2.id) > it2.remaining + 0.0001) Text("More than can be returned", style = MaterialTheme.typography.bodySmall, color = Bad)
                                    }
                                    OutlinedTextField(
                                        value = qtys[it2.id] ?: "", onValueChange = { v -> qtys[it2.id] = v.filter { ch -> ch.isDigit() || ch == '.' } },
                                        singleLine = true, label = { Text("Qty") }, keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                                        modifier = Modifier.width(92.dp),
                                    )
                                }
                            }
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
                item { OutlinedTextField(value = reason, onValueChange = { reason = it }, label = { Text("Reason (optional)") }, modifier = Modifier.fillMaxWidth()) }
                item {
                    Text("The office checks the goods, then the customer is credited and the stock is updated.", style = MaterialTheme.typography.bodySmall, color = Color.Gray)
                }
                item {
                    Button(
                        enabled = canSend,
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
                        modifier = Modifier.fillMaxWidth().height(52.dp),
                    ) { Text(if (busy) "Sending..." else "Send to office for approval") }
                }
            }
        }
    }
    SubmitResultDialog(result) { leave -> result = null; if (leave) onBack() }
}
