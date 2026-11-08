@file:OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)

package pk.irfanautos.salesman.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.launch
import kotlinx.serialization.json.put
import pk.irfanautos.salesman.data.MyCustomer
import pk.irfanautos.salesman.data.Offline
import pk.irfanautos.salesman.data.Submit
import pk.irfanautos.salesman.data.SubmitResult
import pk.irfanautos.salesman.data.money

@Composable
fun PaymentScreen(customerId: String?, onBack: () -> Unit) {
    val scope = rememberCoroutineScope()
    var customer by remember { mutableStateOf<MyCustomer?>(customerId?.let { Offline.customer(it) }) }
    val methods = remember(Offline.version) { Offline.methods() }
    var methodId by remember { mutableStateOf("") }
    var amount by remember { mutableStateOf("") }
    var note by remember { mutableStateOf("") }
    var busy by remember { mutableStateOf(false) }
    var result by remember { mutableStateOf<SubmitResult?>(null) }

    val amt = amount.toDoubleOrNull() ?: 0.0
    val canSend = customer != null && amt > 0 && methodId.isNotEmpty() && !busy

    Page("Collect payment", onBack, actions = { OnlineChip(); Spacer(Modifier.width(12.dp)) }) {
        Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
            CustomerField(customer) { customer = it }
            customer?.let { c ->
                if (c.balance > 0) InfoBanner("Owes " + money(c.balance), Bad) else Text("This customer owes nothing right now.", color = Muted)
            }
            OutlinedTextField(
                value = amount, onValueChange = { amount = it.filter { ch -> ch.isDigit() || ch == '.' } }, label = { Text("Amount received (Rs)") }, singleLine = true,
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number), shape = RoundedCornerShape(16.dp), modifier = Modifier.fillMaxWidth(),
            )
            Text("Received by", style = MaterialTheme.typography.titleSmall)
            if (methods.isEmpty()) {
                InfoBanner("The payment methods are not on this phone yet. Connect to the internet once to download them.")
            } else {
                FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    methods.forEach { x -> FilterChip(selected = methodId == x.id, onClick = { methodId = x.id }, label = { Text(x.name) }) }
                }
            }
            OutlinedTextField(value = note, onValueChange = { note = it }, label = { Text("Note (optional)") }, shape = RoundedCornerShape(16.dp), modifier = Modifier.fillMaxWidth())
            Text("The office confirms this payment, then it appears in the customer's account.", style = MaterialTheme.typography.bodySmall, color = Muted)
            BigButton(
                text = if (busy) "Saving..." else "Send to office for approval", enabled = canSend,
                onClick = {
                    customer?.let { c ->
                        scope.launch {
                            busy = true
                            val body = Submit.withKey {
                                put("customer_id", c.id)
                                put("amount", amt)
                                put("method_id", methodId)
                                if (note.isNotBlank()) put("note", note.trim())
                            }
                            result = Submit.send("payments", body, c.name)
                            busy = false
                        }
                    }
                },
            )
        }
    }
    SubmitResultDialog(result) { leave -> result = null; if (leave) onBack() }
}
