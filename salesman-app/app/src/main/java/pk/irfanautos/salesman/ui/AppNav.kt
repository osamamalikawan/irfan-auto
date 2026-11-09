package pk.irfanautos.salesman.ui

import android.net.Uri
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AccountCircle
import androidx.compose.material.icons.filled.DateRange
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.List
import androidx.compose.material.icons.filled.Person
import androidx.compose.material3.Badge
import androidx.compose.material3.BadgedBox
import androidx.compose.material3.Icon
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.unit.sp
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument
import kotlinx.coroutines.delay
import pk.irfanautos.salesman.data.Outbox
import pk.irfanautos.salesman.data.Session

private val customerArg = listOf(
    navArgument("customerId") { type = NavType.StringType; nullable = true; defaultValue = null },
)
private val returnArgs = listOf(
    navArgument("customerId") { type = NavType.StringType; nullable = true; defaultValue = null },
    navArgument("saleId") { type = NavType.StringType; nullable = true; defaultValue = null },
)
private val invoiceArgs = listOf(
    navArgument("key") { type = NavType.StringType },
    navArgument("customerId") { type = NavType.StringType; nullable = true; defaultValue = null },
)

private class TabItem(val route: String, val label: String, val icon: ImageVector)

private val TABS = listOf(
    TabItem("home", "Home", Icons.Filled.Home),
    TabItem("plan", "Plan", Icons.Filled.DateRange),
    TabItem("customers", "Customers", Icons.Filled.Person),
    TabItem("requests", "Requests", Icons.Filled.List),
    TabItem("account", "Account", Icons.Filled.AccountCircle),
)

@Composable
fun AppNav() {
    val nav = rememberNavController()
    val start = if (Session.loggedIn) "home" else "login"

    // signing out (or the server saying the sign-in expired) always lands on the sign-in screen
    LaunchedEffect(Session.loggedIn) {
        if (!Session.loggedIn && nav.currentDestination?.route != "login") {
            nav.navigate("login") { popUpTo(nav.graph.id) { inclusive = true } }
        }
    }

    val entry by nav.currentBackStackEntryAsState()
    val route = entry?.destination?.route
    var waiting by remember { mutableStateOf(0) }
    LaunchedEffect(Unit) {
        while (true) {
            waiting = Outbox.waiting()
            delay(2000)
        }
    }
    fun openInvoice(key: String, customerId: String?) {
        nav.navigate("invoice/" + Uri.encode(key) + (if (customerId != null) "?customerId=$customerId" else ""))
    }

    Scaffold(
        containerColor = Bg,
        bottomBar = {
            if (TABS.any { it.route == route }) {
                NavigationBar(containerColor = Color.White) {
                    TABS.forEach { t ->
                        NavigationBarItem(
                            selected = route == t.route,
                            onClick = {
                                nav.navigate(t.route) {
                                    popUpTo("home") { saveState = true }
                                    launchSingleTop = true
                                    restoreState = true
                                }
                            },
                            icon = {
                                if (t.route == "requests" && waiting > 0) {
                                    BadgedBox(badge = { Badge { Text(waiting.toString()) } }) { Icon(t.icon, contentDescription = t.label) }
                                } else {
                                    Icon(t.icon, contentDescription = t.label)
                                }
                            },
                            label = { Text(t.label, maxLines = 1, softWrap = false, fontSize = 11.sp) },
                        )
                    }
                }
            }
        },
    ) { pad ->
        NavHost(navController = nav, startDestination = start, modifier = Modifier.padding(pad)) {
            composable("login") {
                LoginScreen(onDone = { mustChangePin ->
                    nav.navigate(if (mustChangePin) "pin" else "home") { popUpTo("login") { inclusive = true } }
                })
            }
            composable("pin") {
                val leave = {
                    // from the Account screen: go back to it; right after signing in: go to home
                    if (!nav.popBackStack("account", false)) nav.navigate("home") { popUpTo("pin") { inclusive = true } }
                    Unit
                }
                PinScreen(onDone = leave, onSkip = leave)
            }
            composable("home") { HomeScreen(onNav = { nav.navigate(it) }) }
            composable("plan") { PlanScreen(onOpenCustomer = { nav.navigate("customer/$it") }) }
            composable("customers") { CustomersScreen(onOpen = { nav.navigate("customer/$it") }) }
            composable("customer/{id}") { e ->
                val id = e.arguments?.getString("id").orEmpty()
                CustomerScreen(
                    id, onBack = { nav.popBackStack() },
                    onAction = { r -> nav.navigate("$r?customerId=$id") },
                    onInvoice = { openInvoice(it, id) },
                    onLedger = { nav.navigate("ledger/$id") },
                )
            }
            composable("ledger/{customerId}") { e ->
                val id = e.arguments?.getString("customerId").orEmpty()
                LedgerScreen(id, onBack = { nav.popBackStack() }, onInvoice = { openInvoice(it, id) })
            }
            composable("invoice/{key}?customerId={customerId}", arguments = invoiceArgs) { e ->
                val key = e.arguments?.getString("key").orEmpty()
                val cid = e.arguments?.getString("customerId")
                InvoiceScreen(
                    key, cid, onBack = { nav.popBackStack() },
                    onReturn = { d -> nav.navigate("return?customerId=" + d.customer_id + "&saleId=" + d.id) },
                )
            }
            composable("order?customerId={customerId}", arguments = customerArg) { e ->
                OrderScreen(e.arguments?.getString("customerId"), onBack = { nav.popBackStack() })
            }
            composable("payment?customerId={customerId}", arguments = customerArg) { e ->
                PaymentScreen(e.arguments?.getString("customerId"), onBack = { nav.popBackStack() })
            }
            composable("return?customerId={customerId}&saleId={saleId}", arguments = returnArgs) { e ->
                ReturnScreen(e.arguments?.getString("customerId"), e.arguments?.getString("saleId"), onBack = { nav.popBackStack() })
            }
            composable("tasks") {
                TasksScreen(
                    onBack = { nav.popBackStack() },
                    onInvoice = { key, cid -> openInvoice(key, cid) },
                    onCustomer = { nav.navigate("customer/$it") },
                )
            }
            composable("myledger") { MyLedgerScreen(onBack = { nav.popBackStack() }) }
            composable("requests") { RequestsScreen() }
            composable("account") { AccountScreen(onChangePin = { nav.navigate("pin") }, onLedger = { nav.navigate("myledger") }) }
        }
    }
}
