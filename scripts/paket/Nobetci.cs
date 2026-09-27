// Nöbetçi.exe — taşınabilir paketin başlatıcısı (scripts/paketle.mjs derler; Windows'un kendi .NET Framework derleyicisiyle).
// Paketteki Node'u (runtime\node.exe) ve tarayıcıları (tarayicilar\) kullanarak Nöbetçi'yi başlatır; arayüz kullanıcının
// seçimine göre (Ayarlar > Arayüz) kendi penceresinde ya da varsayılan tarayıcıda açılır. Bu pencere açık kaldığı sürece Nöbetçi çalışır; pencere kapanınca sunucu da kapanır. Veriler
// uygulama\veri klasöründe, şifreli kasada durur. İnternete hiçbir şey göndermez; sunucu yalnızca 127.0.0.1'e bağlanır.
//
// --arka-plan (Ayarlar > Koşu > "Bilgisayar açılınca Nöbetçi arka planda başlasın" görevi): HİÇBİR pencere açılmaz; Node
// CREATE_NO_WINDOW ile (CreateNoWindow) "baslat.mjs --arka-plan" olarak başlatılır (sunucu zaten çalışıyorsa hiçbir şey yapmaz).
// Gizli başlatma için başlatıcı GUI alt sistemiyle derlenir (/target:winexe): böylece Görev Zamanlayıcı başlatınca konsol hiç
// oluşmaz (konsol uygulamasının penceresini sonradan gizlemek hem bir an görünür hem de Windows Terminal varsayılan konsolken
// çalışmaz; VBScript/wscript gibi yollar kullanımdan kalkıyor). Normal açılışta konsol AllocConsole ile açılır — kullanıcı bugünkü
// gibi bir konsol penceresi görür; o pencere kapanınca Nöbetçi de kapanır.
using System;
using System.Diagnostics;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;

internal static class Nobetci
{
    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool AllocConsole();

    private static int Main(string[] args)
    {
        bool arkaPlan = Array.IndexOf(args, "--arka-plan") >= 0;
        string kok = AppDomain.CurrentDomain.BaseDirectory;
        string node = Path.Combine(kok, "runtime", "node.exe");
        string uygulama = Path.Combine(kok, "uygulama");
        string baslat = Path.Combine(uygulama, "scripts", "baslat.mjs");
        if (arkaPlan)
        {
            if (!File.Exists(node) || !File.Exists(baslat)) return 1;
            var gizli = new ProcessStartInfo(node, "\"" + baslat + "\" --arka-plan")
            {
                UseShellExecute = false,
                CreateNoWindow = true,
                WorkingDirectory = uygulama
            };
            gizli.EnvironmentVariables["PLAYWRIGHT_BROWSERS_PATH"] = Path.Combine(kok, "tarayicilar");
            gizli.EnvironmentVariables["NOBETCI_ARKA_PLAN_GIZLI"] = "1";
            using (Process surec = Process.Start(gizli))
            {
                surec.WaitForExit();
                return surec.ExitCode;
            }
        }

        AllocConsole();
        Console.OutputEncoding = Encoding.UTF8;
        Console.Title = "Nöbetçi";
        if (!File.Exists(node) || !File.Exists(baslat))
        {
            Console.WriteLine("Nöbetçi dosyaları eksik: paketi yeniden çıkarın (runtime\\node.exe ve uygulama\\scripts\\baslat.mjs gerekli).");
            Console.WriteLine("Kapatmak için bir tuşa basın.");
            Console.ReadKey(true);
            return 1;
        }
        Console.WriteLine("Nöbetçi başlatılıyor…");
        Console.WriteLine("Bu pencere açık kaldığı sürece Nöbetçi çalışır. Nöbetçi penceresini ya da bu pencereyi kapatınca Nöbetçi kapanır.");
        Console.WriteLine();
        var bilgi = new ProcessStartInfo(node, "\"" + baslat + "\"")
        {
            UseShellExecute = false,
            WorkingDirectory = uygulama
        };
        bilgi.EnvironmentVariables["PLAYWRIGHT_BROWSERS_PATH"] = Path.Combine(kok, "tarayicilar");
        using (Process surec = Process.Start(bilgi))
        {
            surec.WaitForExit();
            return surec.ExitCode;
        }
    }
}
