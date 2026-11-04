package pk.irfanautos.salesman

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import pk.irfanautos.salesman.ui.AppNav
import pk.irfanautos.salesman.ui.AppTheme

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            AppTheme {
                AppNav()
            }
        }
    }
}
