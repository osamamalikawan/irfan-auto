@file:OptIn(ExperimentalMaterial3Api::class)

package pk.irfanautos.salesman.ui

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.serialization.json.addJsonObject
import kotlinx.serialization.json.put
import kotlinx.serialization.json.putJsonArray
import pk.irfanautos.salesman.data.Api
import pk.irfanautos.salesman.data.Load
import pk.irfanautos.salesman.data.MyCustomer
import pk.irfanautos.salesman.data.Product
import pk.irfanautos.salesman.data.Repo
import pk.irfanautos.salesman.data.Submit
import pk.irfanautos.salesman.data.SubmitResult
import pk.irfanautos.salesman.data.load
import pk.irfanautos.salesman.data.money
import pk.irfanautos.salesman.data.qtyText

private data class CartLine(val p: Product, val qty: String)

/** The result of sending a request, shown once; "OK" leaves the screen unless it failed. */
@Composable
fun SubmitResultDialog(result: SubmitResult?, onClose: (leave: Boolean) -> Unit) {
    if (result == null) return
    val (title, text) = when (result) {
        is SubmitResult.Sent -> "Sent to the office" to "Request ${result.no} is waiting for approval. You can follow it under My requests."
        is SubmitResult.Queued -> "Saved on your phone" to "There is no internet. It will be sent automatically when the connection is back."
        is SubmitResult.Failed -> "Could not send" to result.message
    }
    AlertDialog(
        onDismissRequest = { onClose(result !is SubmitResult.Failed) },
        title = { Text(title) },
        text = { Text(text) },
        confirmButton = { TextButton(onClick = { onClose(result !is SubmitResult.Failed) }) { Text("OK") } },
    )
}

@Composable
fun OrderScreen(customerId: String?, onBack: () -> Unit) {
    val scope = rememberCoroutineScope()
    var customer by remember { mutableStateOf<MyCustomer?>(null) }
    val cart = remember { mutableStateListOf<CartLine>() }
    var query by remember { mutableStateOf("") }
    var results by remember { mutableStateOf<Load<List<Product>>>(Load.Ok(emptyList())) }
    var term by remember { mutableStateOf("credit") }
    var bilti by remember { mutableStateOf("") }
    var remarks by remember { mutableStateOf("") }
    var busy by remember { mutableStateOf(false) }
    var result by remember { mutableStateOf<SubmitResult?>(null) }

    LaunchedEffect(customerId) {
        if (customerId != null) {
            val l = load { Repo.customers() }
            if (l is Load.Ok) customer = l.value.value.firstOrNull { it.id == customerId }
        }
    }
    LaunchedEffect(query) {
        if (query.trim().length < 2) {
            results = Load.Ok(emptyList())
            return@LaunchedEffect
        }
        delay(350) // wait until he stops typing
        results = Load.Loading
        results = load { Api.products(query.trim()) }
    }

    fun qtyOf(l: CartLine) = l.qty.toDoubleOrNull() ?: 0.0
    val total = cart.sumOf { qtyOf(it) * it.p.cp } + (bilti.toDoubleOrNull() ?: 0.0)
    val canSend = customer != null && cart.isNotEmpty() && cart.all { qtyOf(it) > 0 } && !busy

    fun add(p: Product) {
        val i = cart.indexOfFirst { it.p.id == p.id }
        if (i >= 0) cart[i] = cart[i].copy(qty = qtyText(qtyOf(cart[i]) + 1)) else cart.add(CartLine(p, "1"))
        query = ""
    }

    Screen("New order", onBack) {
        LazyColumn(contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            item { CustomerField(customer) { customer = it } }
            item {
                OutlinedTextField(
                    value = query, onValueChange = { query = it }, label = { Text("Search part (name or code)") }, singleLine = true,
                    modifier = Modifier.fillMaxWidth(),
                )
            }
            when (val r = results) {
                is Load.Loading -> item { LoadingBox() }
                is Load.Err -> item { ErrorText(r.message) }
                is Load.Ok -> {
                    if (query.trim().length >= 2 && r.value.isEmpty()) item { Text("No part found.", color = Color.Gray) }
                    items(r.value, key = { it.id }) { p ->
                        Card(Modifier.fillMaxWidth().clickable { add(p) }) {
                            Row(Modifier.padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
                                Column(Modifier.weight(1f)) {
                                    Text(p.name_en, style = MaterialTheme.typography.titleSmall)
                                    val sub = listOfNotNull(p.code_name, p.brand, p.scheme?.let { "scheme $it" }).joinToString(" · ")
                                    if (sub.isNotEmpty()) Text(sub, style = MaterialTheme.typography.bodySmall, color = Color.Gray)
                                }
                                Column(horizontalAlignment = Alignment.End) {
                                    Text(money(p.cp))
                                    Text("stock " + qtyText(p.on_hand), style = MaterialTheme.typography.bodySmall, color = if (p.on_hand > 0) Color.Gray else Bad)
                                }
                            }
                        }
                    }
                }
            }
            if (cart.isNotEmpty()) item { Text("Items in this order", style = MaterialTheme.typography.titleMedium, modifier = Modifier.padding(top = 8.dp)) }
            items(cart.size) { i ->
                val line = cart.getOrNull(i) ?: return@items
                Card(Modifier.fillMaxWidth()) {
                    Row(Modifier.padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
                        Column(Modifier.weight(1f)) {
                            Text(line.p.name_en, style = MaterialTheme.typography.titleSmall)
                            Text(money(line.p.cp) + " each  =  " + money(qtyOf(line) * line.p.cp), style = MaterialTheme.typography.bodySmall, color = Color.Gray)
                        }
                        OutlinedTextField(
                            value = line.qty, onValueChange = { v -> cart[i] = line.copy(qty = v.filter { ch -> ch.isDigit() || ch == '.' }) },
                            singleLine = true, label = { Text("Qty") }, keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                            modifier = Modifier.width(92.dp),
                        )
                        TextButton(onClick = { cart.removeAt(i) }) { Text("X", color = Bad) }
                    }
                }
            }
            item {
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    FilterChip(selected = term == "credit", onClick = { term = "credit" }, label = { Text("On credit") })
                    FilterChip(selected = term == "cash", onClick = { term = "cash" }, label = { Text("Cash") })
                }
            }
            item {
                OutlinedTextField(
                    value = bilti, onValueChange = { bilti = it.filter(Char::isDigit) }, label = { Text("Bilti / delivery charges (Rs, if any)") }, singleLine = true,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number), modifier = Modifier.fillMaxWidth(),
                )
            }
            item { OutlinedTextField(value = remarks, onValueChange = { remarks = it }, label = { Text("Remarks (optional)") }, modifier = Modifier.fillMaxWidth()) }
            item {
                Text("Estimate: " + money(total), style = MaterialTheme.typography.titleLarge)
                Text("At list price. The office checks stock and applies discounts, then makes the final invoice.", style = MaterialTheme.typography.bodySmall, color = Color.Gray)
            }
            item {
                Button(
                    enabled = canSend,
                    onClick = {
                        customer?.let { c ->
                            scope.launch {
                                busy = true
                                val body = Submit.withKey {
                                    put("customer_id", c.id)
                                    put("term", term)
                                    putJsonArray("lines") { cart.forEach { l -> addJsonObject { put("product_id", l.p.id); put("qty", qtyOf(l)) } } }
                                    bilti.toLongOrNull()?.takeIf { it > 0 }?.let { put("bilti", it) }
                                    if (remarks.isNotBlank()) put("remarks", remarks.trim())
                                }
                                result = Submit.send("orders", body, c.name)
                                busy = false
                            }
                        }
                    },
                    modifier = Modifier.fillMaxWidth().height(52.dp),
                ) { Text(if (busy) "Sending..." else "Send to office for approval") }
            }
        }
    }
    SubmitResultDialog(result) { leave -> result = null; if (leave) onBack() }
}
