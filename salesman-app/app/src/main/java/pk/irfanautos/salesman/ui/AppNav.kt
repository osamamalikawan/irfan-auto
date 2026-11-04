package pk.irfanautos.salesman.ui

import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument
import pk.irfanautos.salesman.data.Session

private val customerArg = listOf(
    navArgument("customerId") { type = NavType.StringType; nullable = true; defaultValue = null },
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

    NavHost(navController = nav, startDestination = start) {
        composable("login") {
            LoginScreen(onDone = { mustChangePin ->
                nav.navigate(if (mustChangePin) "pin" else "home") { popUpTo("login") { inclusive = true } }
            })
        }
        composable("pin") {
            val leave = {
                // from the home menu: go back to it; right after signing in: go to home
                if (!nav.popBackStack("home", false)) nav.navigate("home") { popUpTo("pin") { inclusive = true } }
                Unit
            }
            PinScreen(onDone = leave, onSkip = leave)
        }
        composable("home") { HomeScreen(onNav = { nav.navigate(it) }) }
        composable("customers") { CustomersScreen(onBack = { nav.popBackStack() }, onOpen = { nav.navigate("customer/$it") }) }
        composable("customer/{id}") { entry ->
            val id = entry.arguments?.getString("id").orEmpty()
            CustomerScreen(id, onBack = { nav.popBackStack() }, onAction = { route -> nav.navigate("$route?customerId=$id") })
        }
        composable("order?customerId={customerId}", arguments = customerArg) { entry ->
            OrderScreen(entry.arguments?.getString("customerId"), onBack = { nav.popBackStack() })
        }
        composable("payment?customerId={customerId}", arguments = customerArg) { entry ->
            PaymentScreen(entry.arguments?.getString("customerId"), onBack = { nav.popBackStack() })
        }
        composable("return?customerId={customerId}", arguments = customerArg) { entry ->
            ReturnScreen(entry.arguments?.getString("customerId"), onBack = { nav.popBackStack() })
        }
        composable("requests") { RequestsScreen(onBack = { nav.popBackStack() }) }
        composable("account") { AccountScreen(onBack = { nav.popBackStack() }) }
    }
}
