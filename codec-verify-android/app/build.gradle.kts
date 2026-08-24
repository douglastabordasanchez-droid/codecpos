import java.util.Properties

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("org.jetbrains.kotlin.plugin.compose")
    id("org.jetbrains.kotlin.plugin.serialization")
}

// Firma de release — datos en keystore.properties (gitignored, nunca se
// sube). Si el archivo no existe (ej. clonando el repo en otra máquina sin
// la clave), el build de release simplemente no tiene signingConfig en vez
// de fallar — assembleDebug/installDebug siguen funcionando igual.
val keystorePropsFile = rootProject.file("keystore.properties")
val keystoreProps = Properties().apply {
    if (keystorePropsFile.exists()) load(keystorePropsFile.inputStream())
}

android {
    namespace = "com.codecpos.verify"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.codecpos.verify"
        minSdk = 26
        targetSdk = 35
        versionCode = 1
        versionName = "1.0.0"

        // 🔗 Mismo backend que ya usan Electron/PWA (src/app/lib/supabase/config.ts) —
        // URL + anon key son públicos por diseño (protegidos por RLS), no son secretos.
        // El webhook_token (lo único que cambia por negocio) NO va aquí — la PWA,
        // que corre dentro del WebView de esta app, lo pasa vía AndroidNotificationBridge
        // apenas hay sesión activa. No hay ningún login/emparejamiento nativo.
        buildConfigField("String", "SUPABASE_URL", "\"https://ophsckohhjajcsqniqvw.supabase.co\"")
        buildConfigField(
            "String",
            "SUPABASE_ANON_KEY",
            "\"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9waHNja29oaGphamNzcW5pcXZ3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU2NTQ4NjYsImV4cCI6MjA5MTIzMDg2Nn0.i4XIWb9vntgLN4_Lea0wb1-v3XKSrWr665T_S3FVkpM\""
        )
    }

    signingConfigs {
        if (keystorePropsFile.exists()) {
            create("release") {
                storeFile = rootProject.file(keystoreProps.getProperty("storeFile"))
                storePassword = keystoreProps.getProperty("storePassword")
                keyAlias = keystoreProps.getProperty("keyAlias")
                keyPassword = keystoreProps.getProperty("keyPassword")
            }
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
            if (keystorePropsFile.exists()) signingConfig = signingConfigs.getByName("release")
        }
    }

    buildFeatures {
        compose = true
        buildConfig = true
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions {
        jvmTarget = "17"
    }
    packaging {
        resources {
            excludes += "/META-INF/{AL2.0,LGPL2.1}"
        }
    }
}

dependencies {
    implementation("androidx.core:core-ktx:1.13.1")
    implementation("androidx.lifecycle:lifecycle-runtime-ktx:2.8.6")
    implementation("androidx.lifecycle:lifecycle-viewmodel-compose:2.8.6")
    implementation("androidx.lifecycle:lifecycle-runtime-compose:2.8.6")
    implementation("androidx.activity:activity-compose:1.9.2")
    implementation("androidx.activity:activity-ktx:1.9.2")

    // Compose (BOM controla versiones coherentes de todo el set)
    implementation(platform("androidx.compose:compose-bom:2024.09.03"))
    implementation("androidx.compose.ui:ui")
    implementation("androidx.compose.ui:ui-graphics")
    implementation("androidx.compose.ui:ui-tooling-preview")
    implementation("androidx.compose.material3:material3")
    implementation("androidx.compose.material:material-icons-core")
    debugImplementation("androidx.compose.ui:ui-tooling")

    // Red: llamadas directas a PostgREST/Supabase Auth (sin SDK pesado — solo lo
    // que se necesita: POST JSON + headers apikey/Authorization).
    implementation("com.squareup.okhttp3:okhttp:4.12.0")
    implementation("org.jetbrains.kotlinx:kotlinx-serialization-json:1.7.3")

    // Almacenamiento local cifrado del webhook_token / config del negocio.
    implementation("androidx.security:security-crypto:1.1.0-alpha06")

    testImplementation("junit:junit:4.13.2")
    androidTestImplementation("androidx.test.ext:junit:1.2.1")
    androidTestImplementation("androidx.test.espresso:espresso-core:3.6.1")
}
