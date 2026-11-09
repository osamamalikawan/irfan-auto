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
import androidx.compose.material3.ExperimentalMaterial3Api
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
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import pk.irfanautos.salesman.data.InvoiceDoc
import pk.irfanautos.salesman.data.Offline
import pk.irfanautos.salesman.data.money
import pk.irfanautos.salesman.data.qtyText

/** "Payment with INV-0018" -> "INV-0018" (null when the line is not about an invoice). */
internal fun invoiceNoIn(label: String): String? = Regex("INV-\\d+").find(label)?.value

private fun statusOf(d: InvoiceDoc): Pair<String, Color> = when {
    d.status == "cancelled" -> "Cancelled" to Muted
    d.fulfil_status == "packed" -> "Packed" to Brand
    d.fulfil_status == "delivered" -> "Delivered" to Good
    d.fulfil_status == "completed" -> "Completed" to Muted
    else -> "Active" to Warn
}

@Composable
private fun TotalRow(label: String, value: String, bold: Boolean = false, color: Color = Ink) {
    Row(Modifier.fillMaxWidth().padding(vertical = 4.dp), horizontalArrangement = Arrangement.SpaceBetween) {
        Text(label, style = if (bold) MaterialTheme.typography.titleSmall else MaterialTheme.typography.bodyMedium, color = if (bold) Ink else Muted)
        Text(value, style = if (bold) MaterialTheme.typography.titleMedium else MaterialTheme.typography.bodyMedium, color = color)
    }
}

/** An invoice: lines, totals, payments and what was returned. It is read from the phone (the customer's saved account); an older one is opened
 *  from the website when there is internet, and then kept. */
@Composable
fun InvoiceScreen(key: String, customerId: String?, onBack: () -> Unit, onReturn: (InvoiceDoc) -> Unit) {
    var doc by remember(key) { mutableStateOf(Offline.invoiceDoc(customerId, key)) }
    var loading by remember(key) { mutableStateOf(false) }
    var failed by remember(key) { mutableStateOf(false) }
    LaunchedEffect(key) {
        if (doc == null) {
            loading = true
            doc = Offline.fetchInvoice(key)
            failed = doc == null
            loading = false
        }
    }

    Page(doc?.no ?: key, onBack, actions = { OnlineChip(); Spacer(Modifier.width(12.dp)) }) {
        val d = doc
        if (d == null) {
            if (loading) LoadingBox() else EmptyState("This invoice is not on the phone", if (failed) "Connect to the internet once to open it." else "")
        } else {
            val (statusLabel, statusColor) = statusOf(d)
            val due = d.total - d.paid
            val canReturn = d.status == "confirmed" && (d.fulfil_status == "delivered" || d.fulfil_status == "completed")
            LazyColumn(contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                item {
                    AppCard(Modifier.fillMaxWidth()) {
                        Column(Modifier.padding(18.dp)) {
                            Row(verticalAlignment = androidx.compose.ui.Alignment.CenterVertically) {
                                Text(d.no, style = MaterialTheme.typography.headlineSmall, modifier = Modifier.weight(1f))
                                Pill(statusLabel, statusColor)
                            }
                            Text(d.customer_name, style = MaterialTheme.typography.titleSmall, modifier = Modifier.padding(top = 6.dp))
                            Text(
                                (d.sale_date ?: "") + "  ·  " + (if (d.kind == "counter") "Counter sale" else if (d.term == "cash") "Cash" else "Credit"),
                                style = MaterialTheme.typography.bodySmall, color = Muted,
                            )
                        }
                    }
                }
                item {
                    AppCard(Modifier.fillMaxWidth()) {
                        Column(Modifier.padding(horizontal = 16.dp, vertical = 8.dp)) {
                            d.items.forEachIndexed { i, it ->
                                Column(Modifier.fillMaxWidth().padding(vertical = 10.dp)) {
                                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                                        Text(it.name, style = MaterialTheme.typography.titleSmall, modifier = Modifier.weight(1f).padding(end = 8.dp))
                                        Text(money(it.qty * it.price - it.line_disc), style = MaterialTheme.typography.titleSmall)
                                    }
                                    Text(
                                        qtyText(it.qty) + " × " + money(it.price) + (if (it.disc_pct > 0) "  −" + qtyText(it.disc_pct) + "%" else "") +
                                            (if (it.free > 0) "  ·  +" + qtyText(it.free) + " free" else ""),
                                        style = MaterialTheme.typography.bodySmall, color = Muted,
                                    )
                                    if (it.returned > 0) Text("Returned " + qtyText(it.returned), style = MaterialTheme.typography.bodySmall, color = Warn)
                                }
                                if (i < d.items.size - 1) HorizontalDivider(color = Line)
                            }
                        }
                    }
                }
                item {
                    AppCard(Modifier.fillMaxWidth()) {
                        Column(Modifier.padding(16.dp)) {
                            TotalRow("Items", money(d.subtotal))
                            if (d.discount > 0) TotalRow("Discount", "- " + money(d.discount))
                            if (d.bilti > 0) TotalRow("Bilti", money(d.bilti))
                            if (d.local_charges > 0) TotalRow("Local charges", money(d.local_charges))
                            HorizontalDivider(Modifier.padding(vertical = 6.dp), color = Line)
                            TotalRow("Total", money(d.total), bold = true)
                            TotalRow("Paid", money(d.paid), color = Good)
                            if (d.status == "confirmed") TotalRow("Still to pay", money(due), bold = true, color = if (due > 0) Bad else Good)
                        }
                    }
                }
                if (d.payments.isNotEmpty()) {
                    item {
                        AppCard(Modifier.fillMaxWidth()) {
                            Column(Modifier.padding(16.dp)) {
                                Text("Payments received", style = MaterialTheme.typography.titleSmall)
                                d.payments.forEach { p -> TotalRow((p.date?.let { "$it  ·  " } ?: "") + p.method, money(p.amount), color = Good) }
                            }
                        }
                    }
                }
                if (!d.remarks.isNullOrBlank()) item { InfoBanner(d.remarks, Muted) }
                item {
                    if (canReturn) BigButton("Return / claim from this invoice", onClick = { onReturn(d) })
                    else InfoBanner(
                        if (d.status != "confirmed") "This invoice is cancelled." else "Returns and claims can be made after the order is delivered. This order is " + statusLabel + ".",
                        Warn,
                    )
                }
            }
        }
    }
}
