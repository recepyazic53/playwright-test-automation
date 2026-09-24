// Koşu VİDEOLARI için saklama (retention) temizliği — urun-hata-raporu.mjs ve
// test-sunucu.mjs'in PAYLAŞTIĞI küçük yardımcı.
//
// Kural (kullanıcı kararı): videolar diskte en çok VIDEO_SAKLAMA_GUN gün (varsayılan 30)
// tutulur; ekran görüntüleri (png) ve sonuç JSON'ları HİÇ silinmez (dashboard'daki hata
// geçmişi/ekran görüntüleri kalıcı kalsın diye). Silinenler:
//   1) allure-results-<ortam>/ içindeki, değiştirilme zamanı (mtime) eşikten eski .webm
//      dosyaları (Allure'un kopyaladığı Playwright videoları). Dashboard bu dosyalara
//      göreli yolla "▶ Videoyu izle" bağlantısı verir; dosya silinmişse bağlantı hiç
//      gösterilmez (rapor üretilirken varlığı kontrol edilir).
//   2) test-results/dashboard-kosulari/ altındaki, eşikten eski KOŞU KLASÖRLERİNİN
//      tamamı (dashboard'dan tetiklenen her koşunun kendi Playwright çıktısı: video,
//      trace, geçici ekran görüntüleri — bkz. test-sunucu.mjs > gercektenCalistir).
//      Klasör adı "<Date.now()>-<rastgele>" biçimindedir; yaş önce addaki zaman
//      damgasından, çözülemezse klasörün mtime'ından hesaplanır.
// Süre .env'deki VIDEO_SAKLAMA_GUN ile değiştirilebilir (pozitif sayı değilse 30 kullanılır).
import 'dotenv/config';
import { existsSync, readdirSync, rmSync, statSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';

const VARSAYILAN_SAKLAMA_GUN = 30;
const GUN_MS = 24 * 60 * 60 * 1000;

export function videoSaklamaGunuGetir() {
  const deger = Number(process.env.VIDEO_SAKLAMA_GUN);
  return Number.isFinite(deger) && deger > 0 ? deger : VARSAYILAN_SAKLAMA_GUN;
}

// kokKlasor: allure-results-<ortam>/ ve test-results/ klasörlerini içeren proje kökü
// (rapor betiği için process.cwd(), test sunucusu için projeKoku).
// ortamlar: hangi allure-results-<ortam>/ klasörlerine bakılacağı.
// Dönüş: silinen dosya/klasör yolları (loglama/test için).
export function eskiVideolariTemizle(kokKlasor, ortamlar = ['test', 'canli'], logOnEki = '[video-temizligi]') {
  const gun = videoSaklamaGunuGetir();
  const esikMs = Date.now() - gun * GUN_MS;
  const silinenler = [];

  for (const ortam of ortamlar) {
    const klasor = join(kokKlasor, `allure-results-${ortam}`);
    if (!existsSync(klasor)) continue;
    let dosyalar = [];
    try {
      dosyalar = readdirSync(klasor);
    } catch (hata) {
      console.error(`${logOnEki} ${klasor} okunamadı: ${hata.message}`);
      continue;
    }
    for (const ad of dosyalar) {
      if (!ad.toLowerCase().endsWith('.webm')) continue;
      const yol = join(klasor, ad);
      try {
        const bilgi = statSync(yol);
        if (!bilgi.isFile() || bilgi.mtimeMs >= esikMs) continue;
        unlinkSync(yol);
        silinenler.push(yol);
      } catch (hata) {
        console.error(`${logOnEki} ${yol} silinemedi: ${hata.message}`);
      }
    }
  }

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
    console.log(`${logOnEki} ${gun} günden eski ${silinenler.length} video/koşu klasörü silindi:`);
    for (const yol of silinenler) console.log(`  - ${yol}`);
  }
  return silinenler;
}
