// ESKİ (platform öncesi) DÜZ METİN koşu çıktıları için saklama (retention) temizliği —
// test-sunucu.mjs kullanır.
//
// Platform sonuç kaydı açıkken koşu videoları/ekran görüntüleri/izleri şifreli medya deposuna
// (veri/medya/) taşınır ve oradaki saklama kuralı scripts/platform/medya.mjs >
// medyaSaklamaTemizligi ile uygulanır. Bu dosya yalnızca GERİYE DÖNÜK olarak, sonuç kaydı
// kapalıyken (proje aktarılmamışken) dashboard'dan tetiklenen koşuların düz metin çıktı
// klasörlerini temizler:
//   test-results/dashboard-kosulari/<Date.now()>-<rastgele>/ — VIDEO_SAKLAMA_GUN'den (varsayılan 30)
//   eski KOŞU KLASÖRLERİNİN tamamı (video, trace, geçici ekran görüntüleri). Yaş önce addaki zaman
//   damgasından, çözülemezse klasörün mtime'ından hesaplanır.
// NOT: Eski allure-results-<ortam>/ klasörlerine ARTIK DOKUNULMAZ — içe aktarıldıktan sonra ne
// yapılacağına kullanıcı karar verecek.
import 'dotenv/config';
import { existsSync, readdirSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';

const VARSAYILAN_SAKLAMA_GUN = 30;
const GUN_MS = 24 * 60 * 60 * 1000;

export function videoSaklamaGunuGetir() {
  const deger = Number(process.env.VIDEO_SAKLAMA_GUN);
  return Number.isFinite(deger) && deger > 0 ? deger : VARSAYILAN_SAKLAMA_GUN;
}

// kokKlasor: test-results/ klasörünü içeren proje kökü.
// Dönüş: silinen klasör yolları (loglama/test için).
export function eskiVideolariTemizle(kokKlasor, logOnEki = '[video-temizligi]') {
  const gun = videoSaklamaGunuGetir();
  const esikMs = Date.now() - gun * GUN_MS;
  const silinenler = [];

  const kosuKlasorleriKoku = join(kokKlasor, 'test-results', 'dashboard-kosulari');
  if (existsSync(kosuKlasorleriKoku)) {
    let girdiler = [];
    try {
      girdiler = readdirSync(kosuKlasorleriKoku, { withFileTypes: true });
    } catch (hata) {
      console.error(`${logOnEki} ${kosuKlasorleriKoku} okunamadı: ${hata.message}`);
    }
    for (const girdi of girdiler) {
      if (!girdi.isDirectory()) continue;
      const yol = join(kosuKlasorleriKoku, girdi.name);
      try {
        const addakiZaman = Number(girdi.name.split('-')[0]);
        // Makul bir Date.now() değeri mi (2020 sonrası)? Değilse klasörün mtime'ı kullanılır.
        const zamanMs = Number.isFinite(addakiZaman) && addakiZaman > 1_577_836_800_000 ? addakiZaman : statSync(yol).mtimeMs;
        if (zamanMs >= esikMs) continue;
        rmSync(yol, { recursive: true, force: true });
        silinenler.push(yol);
      } catch (hata) {
        console.error(`${logOnEki} ${yol} silinemedi: ${hata.message}`);
      }
    }
  }

  if (silinenler.length) {
    console.log(`${logOnEki} ${gun} günden eski ${silinenler.length} koşu klasörü silindi:`);
    for (const yol of silinenler) console.log(`  - ${yol}`);
  }
  return silinenler;
}
