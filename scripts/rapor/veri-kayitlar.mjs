// Ürün + tarih aralığı gezgini için düz kayıt listesi, hata kalıbı örnekleri ve
// ürün bazlı adım sayaçları.
import { durumEsle, kategoriBul, kalipCikar, kosuEtiketi } from './veri-siniflandirma.mjs';
import { adimlariGezVeTopla } from './veri-adimlar.mjs';

// --- 3) Ürün + tarih aralığı gezgini için TÜM kayıtları düz listeye çıkar ---
// (retry/tekrar koşu ayrımı yapmadan — geçmişteki her çalıştırma bir "olay"dır,
// tarih aralığı istatistiği bunların tamamını sayar.)
// medya: medyaYollariOlustur() dönüşü (bkz. veri-okuma.mjs).
// Dönüş: { tumKayitlar, ornekler, urunAdimSayaclari, urunler }
export function kayitlariTopla(tumIcerikler, medya) {
  const tumKayitlar = [];
  // ornekler: 'urun|||kategori|||kalip' -> en son görülen örnek (mesaj + ekran görüntüsü)
  const ornekler = new Map();
  // urunAdimSayaclari: urun -> { [adımAdı]: { basarili, basarisiz } }
  const urunAdimSayaclari = {};

  for (const { icerik, zaman } of tumIcerikler) {
    const epicEtiketi = (icerik.labels ?? []).find((e) => e.name === 'epic');
    const featureEtiketi = (icerik.labels ?? []).find((e) => e.name === 'feature');
    const urun = epicEtiketi?.value ?? 'Bilinmiyor';
    const ozellik = featureEtiketi?.value ?? '';
    const durum = durumEsle(icerik);

    urunAdimSayaclari[urun] ??= {};
    // Durdurulan testlerin adımları "Adım bazlı başarı" tablosuna hiç yansımaz —
    // yarıda kesilen adım başarısız sayılmasın.
    if (durum !== 'durduruldu') adimlariGezVeTopla(icerik, zaman, urunAdimSayaclari[urun], medya);

    let kategori = null;
    let kalip = null;

    if (durum === 'basarisiz') {
      const mesajTam = icerik.statusDetails?.message ?? '';
      kategori = kategoriBul(mesajTam);
      kalip = kalipCikar(mesajTam);

      const anahtar = `${urun}|||${kategori}|||${kalip}`;
      const mevcutOrnek = ornekler.get(anahtar);
      const adayEkranGoruntusu = medya.ekranGoruntusuYoluGetir(icerik);
      // Ekran görüntüsü olan bir örneği tercih et; ikisi de var/yoksa en yeniyi tut.
      const adayDahaIyiMi =
        !mevcutOrnek ||
        (!!adayEkranGoruntusu !== !!mevcutOrnek.ekranGoruntusu ? !!adayEkranGoruntusu : zaman >= mevcutOrnek.zaman);
      if (adayDahaIyiMi) {
        ornekler.set(anahtar, {
          zaman,
          baslik: icerik.name ?? icerik.fullName ?? 'İsimsiz test',
          ozellik,
          mesaj: mesajTam,
          ekranGoruntusu: adayEkranGoruntusu,
          video: medya.videoYoluGetir(icerik)
        });
      }
    }

    tumKayitlar.push({ u: urun, z: zaman, d: durum, k: kategori, p: kalip });
  }

  const urunler = [...new Set(tumKayitlar.map((k) => k.u))].sort((a, b) => a.localeCompare(b, 'tr'));
  return { tumKayitlar, ornekler, urunAdimSayaclari, urunler };
}

// VERI.ornekler için: Map -> kısa alan adlı düz nesne.
export function ornekleriDuzlestir(ornekler) {
  return Object.fromEntries(
    [...ornekler.entries()].map(([anahtar, ornek]) => [
      anahtar,
      {
        t: kosuEtiketi(ornek.zaman),
        b: ornek.baslik,
        oz: ornek.ozellik,
        m: ornek.mesaj,
        g: ornek.ekranGoruntusu,
        v: ornek.video
      }
    ])
  );
}
