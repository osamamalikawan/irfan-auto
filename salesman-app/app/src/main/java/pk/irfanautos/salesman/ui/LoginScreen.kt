@file:OptIn(ExperimentalMaterial3Api::class)

package pk.irfanautos.salesman.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.KeyboardArrowDown
import androidx.compose.material.icons.filled.Person
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Surface
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
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.launch
import pk.irfanautos.salesman.App
import pk.irfanautos.salesman.data.Api
import pk.irfanautos.salesman.data.ApiException
import pk.irfanautos.salesman.data.Offline
import pk.irfanautos.salesman.data.Session
import pk.irfanautos.salesman.data.UserItem

private const val PIN_MAX = 8

/** The filled / empty dots that show how many digits are typed. */
@Composable
fun PinDots(count: Int) {
    Row(horizontalArrangement = Arrangement.spacedBy(14.dp), modifier = Modifier.height(24.dp), verticalAlignment = Alignment.CenterVertically) {
        repeat(maxOf(4, count)) { i ->
            Box(Modifier.size(16.dp).clip(CircleShape).background(if (i < count) Brand else Line))
        }
    }
}

/** A phone-style number pad. */
@Composable
fun PinPad(onDigit: (String) -> Unit, onDelete: () -> Unit) {
    val rows = listOf(listOf("1", "2", "3"), listOf("4", "5", "6"), listOf("7", "8", "9"), listOf("", "0", "<"))
    Column(verticalArrangement = Arrangement.spacedBy(12.dp), horizontalAlignment = Alignment.CenterHorizontally) {
        rows.forEach { r ->
            Row(horizontalArrangement = Arrangement.spacedBy(22.dp)) {
                r.forEach { k ->
                    if (k.isEmpty()) {
                        Spacer(Modifier.size(70.dp))
                    } else {
                        Box(
                            Modifier.size(70.dp).clip(CircleShape).background(Bg).clickable { if (k == "<") onDelete() else onDigit(k) },
                            contentAlignment = Alignment.Center,
                        ) {
                            if (k == "<") Text("Delete", fontSize = 14.sp, fontWeight = FontWeight.SemiBold, color = Muted)
                            else Text(k, fontSize = 28.sp, fontWeight = FontWeight.Medium, color = Ink)
                        }
                    }
                }
            }
        }
    }
}

@Composable
fun LoginScreen(onDone: (mustChangePin: Boolean) -> Unit) {
    val scope = rememberCoroutineScope()
    var users by remember { mutableStateOf<List<UserItem>>(emptyList()) }
    var picked by remember { mutableStateOf<UserItem?>(null) }
    var pin by remember { mutableStateOf("") }
    var busy by remember { mutableStateOf(false) }
    var loadingNames by remember { mutableStateOf(true) }
    var error by remember { mutableStateOf("") }
    var menu by remember { mutableStateOf(false) }

    suspend fun loadUsers() {
        loadingNames = true
        error = ""
        try {
            users = Api.users()
            if (users.isEmpty()) error = "No users found."
        } catch (e: ApiException) {
            error = e.message ?: "Could not load the names."
        } finally {
            loadingNames = false
        }
    }
    LaunchedEffect(Unit) { loadUsers() }

    fun signIn() {
        picked?.let { u ->
            scope.launch {
                busy = true; error = ""
                try {
                    val r = Api.login(u.id, pin)
                    val token = r.token ?: throw ApiException(0, "The server did not send a sign-in token. Make sure the website has the latest update.")
                    val p = App.prefs
                    if (p.queueOwner != u.id) { // never send or show one person's data to another person
                        p.outbox = "[]"; p.pings = "[]"; p.events = "[]"
                        Offline.clear()
                    }
                    p.queueOwner = u.id; p.userId = u.id; p.userName = u.name; p.token = token
                    Session.refresh()
                    onDone(r.mustChangePin)
                } catch (e: ApiException) {
                    error = e.message ?: "Could not sign in."
                    pin = ""
                } catch (e: Exception) {
                    error = "Could not read the answer from the website. Please try again."
                } finally {
                    busy = false
                }
            }
        }
    }

    Column(Modifier.fillMaxSize().background(Brush.verticalGradient(listOf(Navy, Brand)))) {
        Column(Modifier.fillMaxWidth().padding(top = 32.dp, bottom = 22.dp), horizontalAlignment = Alignment.CenterHorizontally) {
            Box(Modifier.size(68.dp).clip(CircleShape).background(Color.White.copy(alpha = 0.16f)), contentAlignment = Alignment.Center) {
                Icon(Icons.Filled.Person, contentDescription = null, tint = Color.White, modifier = Modifier.size(38.dp))
            }
            Text("Irfan Autos", style = MaterialTheme.typography.headlineMedium, color = Color.White, modifier = Modifier.padding(top = 10.dp))
            Text("Salesman", style = MaterialTheme.typography.bodyMedium, color = Color.White.copy(alpha = 0.75f))
        }
        Surface(Modifier.fillMaxWidth().weight(1f), shape = RoundedCornerShape(topStart = 30.dp, topEnd = 30.dp), color = Color.White) {
            Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(horizontal = 24.dp, vertical = 20.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                Box(Modifier.fillMaxWidth()) {
                    Surface(
                        shape = RoundedCornerShape(16.dp), color = Bg,
                        modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp)).clickable(enabled = users.isNotEmpty()) { menu = true },
                    ) {
                        Row(Modifier.padding(horizontal = 14.dp, vertical = 12.dp), verticalAlignment = Alignment.CenterVertically) {
                            Avatar(picked?.name ?: "?", 40.dp)
                            Text(
                                picked?.name ?: if (loadingNames) "Loading names..." else "Choose your name",
                                style = MaterialTheme.typography.titleSmall, color = if (picked != null) Ink else Muted,
                                modifier = Modifier.weight(1f).padding(horizontal = 12.dp),
                            )
                            Icon(Icons.Filled.KeyboardArrowDown, contentDescription = null, tint = Muted)
                        }
                    }
                    DropdownMenu(expanded = menu, onDismissRequest = { menu = false }) {
                        users.forEach { u -> DropdownMenuItem(text = { Text(u.name) }, onClick = { picked = u; menu = false }) }
                    }
                }
                if (!loadingNames && users.isEmpty()) {
                    OutlinedButton(onClick = { scope.launch { loadUsers() } }, modifier = Modifier.fillMaxWidth().padding(top = 8.dp)) { Text("Try again") }
                }

                Text("Enter your PIN", style = MaterialTheme.typography.titleSmall, color = Muted, modifier = Modifier.padding(top = 20.dp, bottom = 12.dp))
                PinDots(pin.length)
                Box(Modifier.height(30.dp).fillMaxWidth(), contentAlignment = Alignment.Center) {
                    if (error.isNotEmpty()) Text(error, color = Bad, style = MaterialTheme.typography.bodySmall)
                }
                PinPad(onDigit = { if (pin.length < PIN_MAX && !busy) pin += it }, onDelete = { pin = pin.dropLast(1) })
                Spacer(Modifier.height(18.dp))
                BigButton(
                    text = if (busy) "Signing in..." else "Sign in", onClick = { signIn() },
                    enabled = !busy && picked != null && pin.length >= 4,
                )
            }
        }
    }
}

/** Choose your own PIN instead of the one the office gave: three steps with the number pad. Optional: he can skip it. */
@Composable
fun PinScreen(onDone: () -> Unit, onSkip: () -> Unit) {
    val scope = rememberCoroutineScope()
    var step by remember { mutableStateOf(0) }
    val entries = remember { mutableStateListOf("", "", "") }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf("") }
    val titles = listOf("Enter your current PIN", "Choose a new PIN", "Enter the new PIN again")
    val value = entries[step]
    val mismatch = step == 2 && value.length >= entries[1].length && value != entries[1]

    Column(Modifier.fillMaxSize().background(Color.White).verticalScroll(rememberScrollState()).padding(horizontal = 24.dp, vertical = 28.dp), horizontalAlignment = Alignment.CenterHorizontally) {
        Text("Change PIN", style = MaterialTheme.typography.headlineSmall)
        Text("4 to 8 digits. You can skip this and do it later from the Account screen.", style = MaterialTheme.typography.bodyMedium, color = Muted, modifier = Modifier.padding(top = 4.dp, bottom = 24.dp))
        Text(titles[step], style = MaterialTheme.typography.titleMedium, modifier = Modifier.padding(bottom = 14.dp))
        PinDots(value.length)
        Box(Modifier.height(30.dp).fillMaxWidth(), contentAlignment = Alignment.Center) {
            val msg = if (error.isNotEmpty()) error else if (mismatch) "The two new PINs are different." else ""
            if (msg.isNotEmpty()) Text(msg, color = Bad, style = MaterialTheme.typography.bodySmall)
        }
        PinPad(onDigit = { if (entries[step].length < PIN_MAX && !busy) entries[step] = entries[step] + it }, onDelete = { entries[step] = entries[step].dropLast(1) })
        Spacer(Modifier.height(18.dp))
        if (step < 2) {
            BigButton("Next", onClick = { error = ""; step++ }, enabled = value.length >= 4)
        } else {
            BigButton(
                text = if (busy) "Saving..." else "Save PIN",
                enabled = !busy && value.length >= 4 && value == entries[1],
                onClick = {
                    scope.launch {
                        busy = true; error = ""
                        try {
                            Api.changePin(entries[0], entries[1])
                            onDone()
                        } catch (e: ApiException) {
                            error = e.message ?: "Could not change the PIN."
                            entries[0] = ""; entries[1] = ""; entries[2] = ""; step = 0
                        } finally {
                            busy = false
                        }
                    }
                },
            )
        }
        Row(Modifier.fillMaxWidth().padding(top = 6.dp), horizontalArrangement = Arrangement.SpaceBetween) {
            TextButton(onClick = { if (step > 0) { entries[step] = ""; step-- } }, enabled = step > 0 && !busy) { Text("Back") }
            TextButton(onClick = onSkip, enabled = !busy) { Text("Skip for now") }
        }
    }
}
