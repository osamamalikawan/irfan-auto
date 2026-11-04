@file:OptIn(ExperimentalMaterial3Api::class)

package pk.irfanautos.salesman.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.launch
import kotlinx.serialization.json.put
import pk.irfanautos.salesman.data.Cached
import pk.irfanautos.salesman.data.Load
import pk.irfanautos.salesman.data.Method
import pk.irfanautos.salesman.data.MyCustomer
import pk.irfanautos.salesman.data.Repo
import pk.irfanautos.salesman.data.Submit
import pk.irfanautos.salesman.data.SubmitResult
import pk.irfanautos.salesman.data.load
import pk.irfanautos.salesman.data.money

@OptIn(ExperimentalLayoutApi::class)
@Composable
fun PaymentScreen(customerId: String?, onBack: () -> Unit) {
    val scope = rememberCoroutineScope()
    var customer by remember { mutableStateOf<MyCustomer?>(null) }
    var methods by remember { mutableStateOf<Load<Cached<List<Method>>>>(Load.Loading) }
    var methodId by remember { mutableStateOf("") }
    var amount by remember { mutableStateOf("") }
    var note by remember { mutableStateOf("") }
    var busy by remember { mutableStateOf(false) }
    var result by remember { mutableStateOf<SubmitResult?>(null) }

    LaunchedEffect(customerId) {
        if (customerId != null) {
            val l = load { Repo.customers() }
            if (l is Load.Ok) customer = l.value.value.firstOrNull { it.id == customerId }
        }
    }
    LaunchedEffect(Unit) { methods = load { Repo.methods() } }

    val amt = amount.toDoubleOrNull() ?: 0.0
    val canSend = customer != null && amt > 0 && methodId.isNotEmpty() && !busy

    Screen("Collect payment", onBack) {
        Column(Modifier.fillMaxWidth().verticalScroll(rememberScrollState()).padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            CustomerField(customer) { customer = it }
            customer?.let { c ->
                if (c.balance > 0) Text("Owes " + money(c.balance), color = Bad, style = MaterialTheme.typography.titleMedium)
                else Text("This customer owes nothing right now.", color = Color.Gray)
            }
            OutlinedTextField(
                value = amount, onValueChange = { amount = it.filter { ch -> ch.isDigit() || ch == '.' } }, label = { Text("Amount received (Rs)") }, singleLine = true,
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number), modifier = Modifier.fillMaxWidth(),
            )
            Text("Received by", style = MaterialTheme.typography.titleSmall)
            when (val m = methods) {
                is Load.Loading -> LoadingBox()
                is Load.Err -> ErrorText(m.message)
                is Load.Ok -> FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    m.value.value.forEach { x -> FilterChip(selected = methodId == x.id, onClick = { methodId = x.id }, label = { Text(x.name) }) }
                }
            }
            OutlinedTextField(value = note, onValueChange = { note = it }, label = { Text("Note (optional)") }, modifier = Modifier.fillMaxWidth())
            Text("The office confirms this payment, then it appears in the customer's account.", style = MaterialTheme.typography.bodySmall, color = Color.Gray)
            Button(
                enabled = canSend,
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
                modifier = Modifier.fillMaxWidth().height(52.dp),
            ) { Text(if (busy) "Sending..." else "Send to office for approval") }
        }
    }
    SubmitResultDialog(result) { leave -> result = null; if (leave) onBack() }
}
