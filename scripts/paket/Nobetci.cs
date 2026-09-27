// Nöbetçi.exe — taşınabilir paketin başlatıcısı (scripts/paketle.mjs derler; Windows'un kendi .NET Framework derleyicisiyle).
// Paketteki Node'u (runtime\node.exe) ve tarayıcıları (tarayicilar\) kullanarak Nöbetçi'yi başlatır ve arayüzü varsayılan
// tarayıcıda açar. Bu pencere açık kaldığı sürece Nöbetçi çalışır; pencere kapanınca sunucu da kapanır. Veriler
// uygulama\veri klasöründe, şifreli kasada durur. İnternete hiçbir şey göndermez; sunucu yalnızca 127.0.0.1'e bağlanır.
using System;
using System.Diagnostics;
using System.IO;
using System.Text;

internal static class Nobetci
{
    private static int Main()
    {
        Console.OutputEncoding = Encoding.UTF8;
        Console.Title = "Nöbetçi";
        string kok = AppDomain.CurrentDomain.BaseDirectory;
        string node = Path.Combine(kok, "runtime", "node.exe");
        string uygulama = Path.Combine(kok, "uygulama");
        string baslat = Path.Combine(uygulama, "scripts", "baslat.mjs");
        if (!File.Exists(node) || !File.Exists(baslat))
        {
            Console.WriteLine("Nöbetçi dosyaları eksik: paketi yeniden çıkarın (runtime\\node.exe ve uygulama\\scripts\\baslat.mjs gerekli).");
            Console.WriteLine("Kapatmak için bir tuşa basın.");
            Console.ReadKey(true);
            return 1;
        }
        Console.WriteLine("Nöbetçi başlatılıyor…");
        Console.WriteLine("Bu pencere açık kaldığı sürece Nöbetçi çalışır. Kapatmak için pencereyi kapatın.");
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
