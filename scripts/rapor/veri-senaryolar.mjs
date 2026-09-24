// "Senaryolar" tablosu ve "Senaryo Oluştur" için projedeki senaryo/veri dosyaları.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tumSenaryolariGetir } from '../test-sunucu.mjs';
import { haricTutulanlariOku, kosuListesiAnahtari } from '../kosu-listesi.mjs';

// "Senaryolar" tablosu için: koşu geçmişinden bağımsız, projede o an GERÇEKTEN var
// olan tüm senaryoların listesi. "npx playwright test --list" çalıştırır — ağ/tarayıcı
// gerektirmez, sadece spec dosyalarını (ve varsa matris JSON verilerini) statik olarak
// değerlendirir. Başarısız olursa (ör. npx bulunamadı) rapor üretimini DURDURMAZ,
// tablo boş bir uyarıyla gösterilir.
// urunler: koşu sonuçlarındaki ürünler. Dönüş: { tumSenaryolar, tumUrunler }
export async function senaryolariHazirla(ortam, urunler) {
  const tumSenaryolarHam = await tumSenaryolariGetir(ortam).catch((hata) => {
    console.warn(
      `[urun-hata-raporu] Senaryo listesi alınamadı, "Senaryolar" tablosu boş kalacak: ${hata.message}`
    );
    return [];
  });
  // Koşu listesi (tests/data/kosu-listesi.json): her senaryo için "dahil" bayrağı —
  // "Senaryolar" tablosundaki "Koşuda" anahtarları ve "Koşuyu başlat" bunu kullanır.
  // Dosya bozuksa rapor durmaz, tüm senaryolar dahil görünür (uyarı yazılır).
  let haricTutulanAnahtarlar = new Set();
  try {
    haricTutulanAnahtarlar = new Set(haricTutulanlariOku());
  } catch (hata) {
    console.warn(`[urun-hata-raporu] tests/data/kosu-listesi.json okunamadı, tüm senaryolar koşuya dahil gösterilecek: ${hata.message}`);
  }
  const tumSenaryolar = tumSenaryolarHam
    .map((s) => ({
      ad: s.ad,
      urun: s.urun,
      dosya: s.dosya,
      dahil: !haricTutulanAnahtarlar.has(kosuListesiAnahtari(s.dosya, s.ad)),
      // Spec'in "beklenenSonuc" annotation'ı (ör. "Ödeme", "Teklif", "Hata: Prim") — yalnızca
      // bunu tanımlayan senaryolarda (şu an JetSeyahat) dolu; tabloda rozet olarak gösterilir.
      ...(s.beklenenSonuc ? { beklenenSonuc: s.beklenenSonuc } : {})
    }))
    .sort((a, b) => a.urun.localeCompare(b.urun, 'tr') || a.ad.localeCompare(b.ad, 'tr'));

  // Ürün listesi yalnızca koşu sonuçlarından değil, projede tanımlı senaryolardan da
  // beslenir — böylece hiç koşulmamış (veya sonuç klasörü boş olan) ürünler de
  // kenar çubuğunda görünür.
  const tumUrunler = [...new Set([...urunler, ...tumSenaryolar.map((s) => s.urun)])].sort((a, b) =>
    a.localeCompare(b, 'tr')
  );
  return { tumSenaryolar, tumUrunler };
}

// "Senaryo Oluştur" > "Beklenen Sonuç > Başarılı akış" açıklaması, ödeme sonrası başarı
// sayılan mesajları (jet-seyahat.json > kabulEdilenOdemeSonuclari) gösterir. Popup
// açılınca /jetseyahat-yardimci-veri daha güncel listeyi getirir; bu değer, sunucu
// kapalıyken de açıklamanın boş kalmaması içindir. Dosya okunamazsa rapor durmaz.
export function jetSeyahatKabulEdilenOdemeSonuclariniOku(ortam) {
  let jetSeyahatKabulEdilenOdemeSonuclari = [];
  try {
    const jetSeyahatVerisi = JSON.parse(
      readFileSync(join(process.cwd(), 'tests', 'data', ortam, 'jet-seyahat.json'), 'utf-8')
    );
    jetSeyahatKabulEdilenOdemeSonuclari = jetSeyahatVerisi.jetSeyahat?.kabulEdilenOdemeSonuclari || [];
  } catch (hata) {
    console.warn(`[urun-hata-raporu] jet-seyahat.json okunamadı, kabul edilen ödeme sonuçları gösterilmeyecek: ${hata.message}`);
  }
  return jetSeyahatKabulEdilenOdemeSonuclari;
}
