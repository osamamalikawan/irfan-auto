@file:OptIn(ExperimentalMaterial3Api::class)

package pk.irfanautos.salesman.ui

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import pk.irfanautos.salesman.data.MyCustomer
import pk.irfanautos.salesman.data.Net
import pk.irfanautos.salesman.data.Offline
import pk.irfanautos.salesman.data.money

/** A page with a plain white header (and a back arrow when `onBack` is given). */
@Composable
fun Page(
    title: String,
    onBack: (() -> Unit)? = null,
    actions: @Composable RowScope.() -> Unit = {},
    content: @Composable ColumnScope.() -> Unit,
) {
    Column(Modifier.fillMaxSize().background(Bg)) {
        Row(Modifier.fillMaxWidth().background(Color.White).padding(horizontal = 4.dp, vertical = 8.dp), verticalAlignment = Alignment.CenterVertically) {
            if (onBack != null) {
                IconButton(onClick = onBack) { Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back") }
            } else {
                Spacer(Modifier.width(16.dp))
            }
            Text(title, style = MaterialTheme.typography.titleLarge, modifier = Modifier.weight(1f))
            actions()
        }
        HorizontalDivider(color = Line)
        content()
    }
}

/** The big title at the top of a main screen. */
@Composable
fun TabHeader(title: String, subtitle: String = "", trailing: @Composable () -> Unit = {}) {
    Row(Modifier.fillMaxWidth().padding(start = 20.dp, end = 16.dp, top = 18.dp, bottom = 10.dp), verticalAlignment = Alignment.CenterVertically) {
        Column(Modifier.weight(1f)) {
            Text(title, style = MaterialTheme.typography.headlineMedium)
            if (subtitle.isNotEmpty()) Text(subtitle, style = MaterialTheme.typography.bodyMedium, color = Muted)
        }
        trailing()
    }
}

@Composable
fun AppCard(
    modifier: Modifier = Modifier,
    onClick: (() -> Unit)? = null,
    color: Color = Color.White,
    content: @Composable ColumnScope.() -> Unit,
) {
    val m = if (onClick != null) modifier.clip(RoundedCornerShape(18.dp)).clickable { onClick() } else modifier
    Surface(modifier = m, shape = RoundedCornerShape(18.dp), color = color, shadowElevation = 1.dp, border = BorderStroke(1.dp, Line)) {
        Column(content = content)
    }
}

@Composable
fun Pill(text: String, color: Color, background: Color = color.copy(alpha = 0.12f)) {
    Text(
        text, color = color, style = MaterialTheme.typography.labelMedium,
        modifier = Modifier.clip(RoundedCornerShape(50)).background(background).padding(horizontal = 10.dp, vertical = 4.dp),
    )
}

@Composable
fun BigButton(text: String, onClick: () -> Unit, modifier: Modifier = Modifier, enabled: Boolean = true, color: Color = Brand) {
    Button(
        onClick = onClick, modifier = modifier.fillMaxWidth().height(54.dp), enabled = enabled, shape = RoundedCornerShape(16.dp),
        colors = ButtonDefaults.buttonColors(containerColor = color),
    ) { Text(text, style = MaterialTheme.typography.titleMedium) }
}

fun initialsOf(name: String): String {
    val parts = name.trim().split(Regex("\\s+")).filter { it.isNotEmpty() }
    return when {
        parts.isEmpty() -> "?"
        parts.size == 1 -> parts[0].take(2).uppercase()
        else -> (parts[0].take(1) + parts[1].take(1)).uppercase()
    }
}

@Composable
fun Avatar(name: String, size: Dp = 44.dp) {
    Box(Modifier.size(size).clip(CircleShape).background(BrandSoft), contentAlignment = Alignment.Center) {
        Text(initialsOf(name), color = Brand, fontWeight = FontWeight.Bold, style = MaterialTheme.typography.titleSmall)
    }
}

@Composable
fun SectionTitle(text: String, modifier: Modifier = Modifier) {
    Text(text, style = MaterialTheme.typography.titleMedium, color = Ink, modifier = modifier.padding(top = 6.dp, bottom = 2.dp))
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
fun EmptyState(title: String, message: String, modifier: Modifier = Modifier) {
    Column(modifier.fillMaxWidth().padding(32.dp), horizontalAlignment = Alignment.CenterHorizontally) {
        Text(title, style = MaterialTheme.typography.titleMedium, textAlign = TextAlign.Center)
        Text(message, style = MaterialTheme.typography.bodyMedium, color = Muted, textAlign = TextAlign.Center, modifier = Modifier.padding(top = 6.dp))
    }
}

@Composable
fun InfoBanner(message: String, color: Color = Warn, modifier: Modifier = Modifier) {
    Text(
        message, color = color, style = MaterialTheme.typography.bodyMedium,
        modifier = modifier.fillMaxWidth().clip(RoundedCornerShape(14.dp)).background(color.copy(alpha = 0.10f)).padding(12.dp),
    )
}

/** "Online" or "Offline": the app works the same either way, this only tells him whether things are being sent right now. */
@Composable
fun OnlineChip() {
    if (Net.online) Pill("Online", Good) else Pill("Offline", Warn)
}

@Composable
fun StatusPill(status: String) {
    when (status) {
        "approved" -> Pill("Approved", Good)
        "rejected" -> Pill("Rejected", Bad)
        "cancelled" -> Pill("Withdrawn", Muted)
        else -> Pill("Waiting for office", Warn)
    }
}

fun List<MyCustomer>.matching(q: String): List<MyCustomer> {
    val words = q.trim().lowercase().split(Regex("\\s+")).filter { it.isNotEmpty() }
    if (words.isEmpty()) return this
    return filter { c ->
        val hay = listOfNotNull(c.name, c.name_ur, c.phone, c.code, c.area, c.route).joinToString(" ").lowercase()
        words.all { hay.contains(it) }
    }
}

/** The chosen customer (with what he owes); tapping it opens the customer list. Works without internet. */
@Composable
fun CustomerField(selected: MyCustomer?, onPick: (MyCustomer) -> Unit) {
    var open by remember { mutableStateOf(false) }
    AppCard(Modifier.fillMaxWidth(), onClick = { open = true }) {
        Row(Modifier.padding(14.dp), verticalAlignment = Alignment.CenterVertically) {
            if (selected != null) {
                Avatar(selected.name)
                Column(Modifier.weight(1f).padding(horizontal = 12.dp)) {
                    Text(selected.name, style = MaterialTheme.typography.titleSmall)
                    Text("Owes " + money(selected.balance), style = MaterialTheme.typography.bodySmall, color = if (selected.balance > 0) Bad else Muted)
                }
                Text("Change", color = Brand, style = MaterialTheme.typography.labelLarge)
            } else {
                Text("Choose customer", style = MaterialTheme.typography.titleSmall, color = Brand, modifier = Modifier.weight(1f))
                Text("Select", color = Brand, style = MaterialTheme.typography.labelLarge)
            }
        }
    }
    if (open) CustomerDialog(onDismiss = { open = false }, onPick = { open = false; onPick(it) })
}

@Composable
fun CustomerDialog(onDismiss: () -> Unit, onPick: (MyCustomer) -> Unit) {
    val all = remember(Offline.version) { Offline.customers() }
    var q by remember { mutableStateOf("") }
    Dialog(onDismissRequest = onDismiss, properties = DialogProperties(usePlatformDefaultWidth = false)) {
        Surface(shape = RoundedCornerShape(22.dp), modifier = Modifier.fillMaxWidth(0.94f).fillMaxHeight(0.85f)) {
            Column(Modifier.padding(14.dp)) {
                OutlinedTextField(
                    value = q, onValueChange = { q = it }, label = { Text("Search customer") }, singleLine = true,
                    shape = RoundedCornerShape(14.dp), modifier = Modifier.fillMaxWidth(),
                )
                val list = all.matching(q)
                if (all.isEmpty()) Text("Your customers are not downloaded yet. Connect to the internet once.", color = Warn, modifier = Modifier.padding(top = 10.dp))
                else if (list.isEmpty()) Text("No customer found.", color = Muted, modifier = Modifier.padding(top = 12.dp))
                LazyColumn(Modifier.fillMaxWidth()) {
                    items(list, key = { it.id }) { c ->
                        Row(Modifier.fillMaxWidth().clickable { onPick(c) }.padding(vertical = 10.dp), verticalAlignment = Alignment.CenterVertically) {
                            Avatar(c.name, 40.dp)
                            Column(Modifier.weight(1f).padding(horizontal = 12.dp)) {
                                Text(c.name, style = MaterialTheme.typography.titleSmall)
                                val sub = listOfNotNull(c.area, c.phone).joinToString(" · ")
                                if (sub.isNotEmpty()) Text(sub, style = MaterialTheme.typography.bodySmall, color = Muted)
                            }
                            Text(money(c.balance), color = if (c.balance > 0) Bad else Muted, style = MaterialTheme.typography.labelLarge)
                        }
                        HorizontalDivider(color = Line)
                    }
                }
            }
        }
    }
}
