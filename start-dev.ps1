# Mini serveur web de développement local pour WikiM
$port = 8080
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$port/")
$listener.Prefixes.Add("http://127.0.0.1:$port/")

try {
    $listener.Start()
} catch {
    Write-Host "Erreur au démarrage du serveur : $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "Assurez-vous que le port $port n'est pas déjà utilisé." -ForegroundColor Yellow
    pause
    exit
}

Write-Host "==========================================================" -ForegroundColor Green
Write-Host "   Serveur de développement WikiM démarré avec succès !" -ForegroundColor Green
Write-Host "   URL locale : http://localhost:$port/" -ForegroundColor Cyan
Write-Host "   Appuyez sur Ctrl+C ou fermez cette fenêtre pour arrêter." -ForegroundColor Gray
Write-Host "==========================================================" -ForegroundColor Green

$rootDir = $PSScriptRoot

while ($listener.IsListening) {
    try {
        $context = $listener.GetContext()
        $request = $context.Request
        $response = $context.Response

        # En-têtes CORS pour Tampermonkey et le navigateur
        $response.Headers.Add("Access-Control-Allow-Origin", "*")
        $response.Headers.Add("Access-Control-Allow-Methods", "GET, OPTIONS")
        $response.Headers.Add("Access-Control-Allow-Headers", "*")
        $response.Headers.Add("Cache-Control", "no-cache, no-store, must-revalidate")

        if ($request.HttpMethod -eq "OPTIONS") {
            $response.StatusCode = 204
            $response.Close()
            continue
        }

        # Nettoyage du chemin demandé
        $urlPath = $request.Url.LocalPath.TrimStart('/')
        if ([string]::IsNullOrEmpty($urlPath)) { $urlPath = "Tamper.user.js" }
        $filePath = Join-Path $rootDir ($urlPath -replace '/', '\')

        if (Test-Path $filePath -PathType Leaf) {
            $bytes = [System.IO.File]::ReadAllBytes($filePath)
            if ($filePath.EndsWith(".js")) {
                $response.ContentType = "application/javascript; charset=utf-8"
            } elseif ($filePath.EndsWith(".css")) {
                $response.ContentType = "text/css; charset=utf-8"
            } else {
                $response.ContentType = "text/plain; charset=utf-8"
            }
            $response.ContentLength64 = $bytes.Length
            $response.OutputStream.Write($bytes, 0, $bytes.Length)
            $response.StatusCode = 200
            Write-Host "✓ [200] $urlPath" -ForegroundColor DarkGray
        } else {
            $response.StatusCode = 404
            $msg = [System.Text.Encoding]::UTF8.GetBytes("Fichier non trouvé : $urlPath")
            $response.OutputStream.Write($msg, 0, $msg.Length)
            Write-Host "✗ [404] $urlPath" -ForegroundColor Red
        }
        $response.Close()
    } catch {
        # Contexte fermé ou erreur ponctuelle
    }
}
