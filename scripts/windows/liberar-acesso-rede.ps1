# Ativos Tech — libera o acesso pela rede local a este computador (servidor).
# Execute no PowerShell COMO ADMINISTRADOR, uma única vez:
#   powershell -ExecutionPolicy Bypass -File .\scripts\windows\liberar-acesso-rede.ps1
# Abre somente a porta do site (3000) e somente em redes "Privadas" (empresa/casa), nunca em redes públicas.
# A porta da API (3001) NÃO é aberta: a API só é acessada pelo próprio site.
param([int]$Porta = 3000)

$nome = "Ativos Tech (porta $Porta)"
if (-not ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
  Write-Host "Abra o PowerShell como Administrador (botão direito > Executar como administrador) e rode de novo." -ForegroundColor Yellow
  exit 1
}
Get-NetFirewallRule -DisplayName $nome -ErrorAction SilentlyContinue | Remove-NetFirewallRule
New-NetFirewallRule -DisplayName $nome -Direction Inbound -Protocol TCP -LocalPort $Porta -Action Allow -Profile Private | Out-Null
Write-Host "Regra criada: $nome (somente redes privadas)." -ForegroundColor Green

$perfil = Get-NetConnectionProfile | Select-Object -First 1
if ($perfil.NetworkCategory -eq 'Public') {
  Write-Host "Atenção: a rede '$($perfil.Name)' está marcada como PÚBLICA. Outros computadores não vão conseguir acessar." -ForegroundColor Yellow
  Write-Host "Se for a rede da empresa ou de casa, mude para Privada em Configurações > Rede e Internet > (sua rede) > Tipo de perfil de rede." -ForegroundColor Yellow
}
Write-Host ""
Write-Host "Endereços deste computador para os outros abrirem o Ativos Tech:" -ForegroundColor Cyan
Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.IPAddress -notlike '127.*' -and $_.IPAddress -notlike '169.254.*' -and $_.InterfaceAlias -notmatch 'vEthernet|WSL|VirtualBox|VMware|Loopback' } |
  ForEach-Object { Write-Host "   http://$($_.IPAddress):$Porta   ($($_.InterfaceAlias))" }
Write-Host "   http://$($env:COMPUTERNAME):$Porta   (pelo nome do computador, se a rede permitir)"
