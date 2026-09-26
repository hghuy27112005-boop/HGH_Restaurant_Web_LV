Option Explicit

Dim shell
Set shell = CreateObject("WScript.Shell")
shell.CurrentDirectory = "E:\DHCT\University\Chia_ra_cac_nam\Nam_4\CT550E_LuanVan\HGHRestaurantWeb\backend"
shell.Run """C:\xampp\php\php.exe"" artisan deliveries:auto-start", 0, True
Set shell = Nothing
