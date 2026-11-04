@file:OptIn(ExperimentalMaterial3Api::class)

package pk.irfanautos.salesman.ui

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
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
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.launch
import pk.irfanautos.salesman.App
import pk.irfanautos.salesman.data.Api
import pk.irfanautos.salesman.data.ApiException
import pk.irfanautos.salesman.data.Session
import pk.irfanautos.salesman.data.UserItem

@Composable
fun LoginScreen(onDone: (mustChangePin: Boolean) -> Unit) {
    val scope = rememberCoroutineScope()
    var loadingNames by remember { mutableStateOf(true) }
    var users by remember { mutableStateOf<List<UserItem>>(emptyList()) }
    var picked by remember { mutableStateOf<UserItem?>(null) }
    var pin by remember { mutableStateOf("") }
    var busy by remember { mutableStateOf(false) }
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

    Column(Modifier.fillMaxWidth().verticalScroll(rememberScrollState()).padding(24.dp)) {
        Spacer(Modifier.height(32.dp))
        Text("Irfan Autos", style = MaterialTheme.typography.headlineMedium)
        Text("Salesman app", style = MaterialTheme.typography.titleMedium, modifier = Modifier.padding(bottom = 24.dp))

        Box(Modifier.fillMaxWidth()) {
            OutlinedTextField(
                value = picked?.name ?: "", onValueChange = {}, readOnly = true, enabled = false, label = { Text("Your name") },
                modifier = Modifier.fillMaxWidth(),
            )
            Box(Modifier.matchParentSize().clickable(enabled = users.isNotEmpty()) { menu = true })
            DropdownMenu(expanded = menu, onDismissRequest = { menu = false }) {
                users.forEach { u -> DropdownMenuItem(text = { Text(u.name) }, onClick = { picked = u; menu = false }) }
            }
        }

        if (loadingNames) {
            Text("Loading names...", modifier = Modifier.padding(top = 8.dp))
        } else if (users.isEmpty()) {
            OutlinedButton(onClick = { scope.launch { loadUsers() } }, modifier = Modifier.fillMaxWidth().padding(top = 8.dp)) { Text("Try again") }
        }

        OutlinedTextField(
            value = pin, onValueChange = { pin = it.filter(Char::isDigit).take(8) }, label = { Text("PIN") }, singleLine = true,
            visualTransformation = PasswordVisualTransformation(), keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.NumberPassword),
            modifier = Modifier.fillMaxWidth().padding(top = 16.dp),
        )
        if (error.isNotEmpty()) ErrorText(error)

        Button(
            enabled = !busy && picked != null && pin.length >= 4,
            onClick = {
                picked?.let { u -> scope.launch {
                    busy = true; error = ""
                    try {
                        val r = Api.login(u.id, pin)
                        val token = r.token ?: throw ApiException(0, "The server did not send a sign-in token. Make sure the website has the latest update.")
                        val p = App.prefs
                        if (p.queueOwner != u.id) { p.outbox = "[]"; p.pings = "[]" } // never send one person's waiting items as another person
                        p.queueOwner = u.id; p.userId = u.id; p.userName = u.name; p.token = token
                        Session.refresh()
                        onDone(r.mustChangePin)
                    } catch (e: ApiException) {
                        error = e.message ?: "Could not sign in."
                    } catch (e: Exception) {
                        error = "Could not read the answer from the website. Please try again."
                    } finally {
                        busy = false
                    }
                } }
            },
            modifier = Modifier.fillMaxWidth().padding(top = 16.dp).height(52.dp),
        ) { Text(if (busy) "Signing in..." else "Sign in") }
    }
}

/** First sign-in with a PIN the office gave: choose your own. */
@Composable
fun PinScreen(onDone: () -> Unit) {
    val scope = rememberCoroutineScope()
    var current by remember { mutableStateOf("") }
    var next by remember { mutableStateOf("") }
    var again by remember { mutableStateOf("") }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf("") }
    val numeric = KeyboardOptions(keyboardType = KeyboardType.NumberPassword)

    Column(Modifier.fillMaxWidth().verticalScroll(rememberScrollState()).padding(24.dp)) {
        Spacer(Modifier.height(32.dp))
        Text("Choose your own PIN", style = MaterialTheme.typography.headlineSmall)
        Text("4 to 8 digits that others cannot guess.", modifier = Modifier.padding(bottom = 16.dp))
        OutlinedTextField(current, { current = it.filter(Char::isDigit).take(8) }, label = { Text("Current PIN") }, singleLine = true,
            visualTransformation = PasswordVisualTransformation(), keyboardOptions = numeric, modifier = Modifier.fillMaxWidth())
        OutlinedTextField(next, { next = it.filter(Char::isDigit).take(8) }, label = { Text("New PIN") }, singleLine = true,
            visualTransformation = PasswordVisualTransformation(), keyboardOptions = numeric, modifier = Modifier.fillMaxWidth().padding(top = 12.dp))
        OutlinedTextField(again, { again = it.filter(Char::isDigit).take(8) }, label = { Text("New PIN again") }, singleLine = true,
            visualTransformation = PasswordVisualTransformation(), keyboardOptions = numeric, modifier = Modifier.fillMaxWidth().padding(top = 12.dp))
        if (again.isNotEmpty() && next != again) ErrorText("The two new PINs are different.")
        if (error.isNotEmpty()) ErrorText(error)
        Button(
            enabled = !busy && current.length >= 4 && next.length >= 4 && next == again,
            onClick = {
                scope.launch {
                    busy = true; error = ""
                    try {
                        Api.changePin(current, next)
                        onDone()
                    } catch (e: ApiException) {
                        error = e.message ?: "Could not change the PIN."
                    } finally {
                        busy = false
                    }
                }
            },
            modifier = Modifier.fillMaxWidth().padding(top = 16.dp).height(52.dp),
        ) { Text(if (busy) "Saving..." else "Save PIN") }
    }
}
