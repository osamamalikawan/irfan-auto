@file:OptIn(ExperimentalMaterial3Api::class)

package pk.irfanautos.salesman.ui

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.Card
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import pk.irfanautos.salesman.data.Cached
import pk.irfanautos.salesman.data.Load
import pk.irfanautos.salesman.data.MyCustomer
import pk.irfanautos.salesman.data.Repo
import pk.irfanautos.salesman.data.load
import pk.irfanautos.salesman.data.money

/** A page with the blue title bar (and a back arrow when `onBack` is given). */
@Composable
fun Screen(
    title: String,
    onBack: (() -> Unit)? = null,
    actions: @Composable RowScope.() -> Unit = {},
    content: @Composable ColumnScope.() -> Unit,
) {
    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(title) },
                navigationIcon = {
                    if (onBack != null) {
                        IconButton(onClick = onBack) { Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back") }
                    }
                },
                actions = actions,
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = Brand, titleContentColor = Color.White, navigationIconContentColor = Color.White, actionIconContentColor = Color.White,
                ),
            )
        },
    ) { pad ->
        Column(Modifier.padding(pad).fillMaxSize()) { content() }
    }
}

@Composable
fun LoadingBox() {
    Box(Modifier.fillMaxWidth().padding(24.dp), contentAlignment = Alignment.Center) { CircularProgressIndicator() }
}

@Composable
fun ErrorText(message: String, modifier: Modifier = Modifier) {
    Text(message, color = Bad, modifier = modifier.padding(vertical = 8.dp))
}

@Composable
fun InfoBanner(message: String, color: Color = Warn, modifier: Modifier = Modifier) {
    Card(modifier = modifier.fillMaxWidth()) {
        Text(message, color = color, modifier = Modifier.padding(12.dp), style = MaterialTheme.typography.bodyMedium)
    }
}

@Composable
fun StatusPill(status: String) {
    val (label, color) = when (status) {
        "approved" -> "Approved" to Good
        "rejected" -> "Rejected" to Bad
        "cancelled" -> "Withdrawn" to Color.Gray
        else -> "Waiting for office" to Warn
    }
    Text(label, color = color, style = MaterialTheme.typography.labelLarge)
}

fun List<MyCustomer>.matching(q: String): List<MyCustomer> {
    val words = q.trim().lowercase().split(Regex("\\s+")).filter { it.isNotEmpty() }
    if (words.isEmpty()) return this
    return filter { c ->
        val hay = listOfNotNull(c.name, c.name_ur, c.phone, c.code, c.area, c.route).joinToString(" ").lowercase()
        words.all { hay.contains(it) }
    }
}

/** A button showing the chosen customer (with what he owes); tapping it opens the customer list. */
@Composable
fun CustomerField(selected: MyCustomer?, onPick: (MyCustomer) -> Unit) {
    var open by remember { mutableStateOf(false) }
    OutlinedButton(onClick = { open = true }, modifier = Modifier.fillMaxWidth()) {
        Text(if (selected != null) selected.name + "  -  owes " + money(selected.balance) else "Choose customer")
    }
    if (open) CustomerDialog(onDismiss = { open = false }, onPick = { open = false; onPick(it) })
}

@Composable
fun CustomerDialog(onDismiss: () -> Unit, onPick: (MyCustomer) -> Unit) {
    var state by remember { mutableStateOf<Load<Cached<List<MyCustomer>>>>(Load.Loading) }
    var q by remember { mutableStateOf("") }
    LaunchedEffect(Unit) { state = load { Repo.customers() } }
    Dialog(onDismissRequest = onDismiss, properties = DialogProperties(usePlatformDefaultWidth = false)) {
        Surface(shape = RoundedCornerShape(16.dp), modifier = Modifier.fillMaxWidth(0.94f).fillMaxHeight(0.85f)) {
            Column(Modifier.padding(12.dp)) {
                OutlinedTextField(
                    value = q, onValueChange = { q = it }, label = { Text("Search customer") }, singleLine = true, modifier = Modifier.fillMaxWidth(),
                )
                when (val s = state) {
                    is Load.Loading -> LoadingBox()
                    is Load.Err -> ErrorText(s.message)
                    is Load.Ok -> {
                        val list = s.value.value.matching(q)
                        if (s.value.fromCache) Text("No internet: showing the saved list.", color = Warn, modifier = Modifier.padding(top = 6.dp))
                        if (list.isEmpty()) Text("No customer found.", modifier = Modifier.padding(top = 12.dp))
                        LazyColumn(Modifier.fillMaxWidth()) {
                            items(list, key = { it.id }) { c ->
                                Column(Modifier.fillMaxWidth().clickable { onPick(c) }.padding(vertical = 10.dp)) {
                                    Row(horizontalArrangement = Arrangement.SpaceBetween, modifier = Modifier.fillMaxWidth()) {
                                        Text(c.name, style = MaterialTheme.typography.titleMedium, modifier = Modifier.weight(1f))
                                        Text(money(c.balance), color = if (c.balance > 0) Bad else Color.Gray)
                                    }
                                    val sub = listOfNotNull(c.area, c.phone).joinToString(" · ")
                                    if (sub.isNotEmpty()) Text(sub, style = MaterialTheme.typography.bodySmall, color = Color.Gray)
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}
