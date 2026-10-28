plugins {
    alias(libs.plugins.android.application) apply false
    alias(libs.plugins.kotlin.compose) apply false
}

// Automatically ensure the web preview server (port 3000) is running when container boots
try {
    val serverScript = file("${rootDir}/server.js")
    if (serverScript.exists()) {
        ProcessBuilder(
            "bash",
            "-c",
            "if ! (echo > /dev/tcp/127.0.0.1/3000) >/dev/null 2>&1; then nohup node \"${serverScript.absolutePath}\" >/tmp/dwr-server.log 2>&1 </dev/null & fi"
        ).directory(rootDir).start()
    }
} catch (_: Exception) {
}
