// Allure ham sonuç dosyalarını okuma + ek (ekran görüntüsü/video) göreli yolları.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

// --- 1) Tüm ham sonuç dosyalarını oku ---
// Dönüş: [{ icerik, zaman }] — zamana göre (en eski önce) sıralı. Zaman bilgisi
// olmayan ya da JSON'u bozuk dosyalar atlanır.
export function sonuclariOku(sonuclarKlasoru, sonuclarKlasoruVar) {
  const dosyalar = (sonuclarKlasoruVar ? readdirSync(sonuclarKlasoru) : []).filter((dosya) => dosya.endsWith('-result.json'));
  const tumIcerikler = [];

  for (const dosya of dosyalar) {
    let icerik;
    try {
      icerik = JSON.parse(readFileSync(join(sonuclarKlasoru, dosya), 'utf-8'));
    } catch {
      continue;
    }
    const zaman = icerik.stop ?? icerik.start;
    if (!zaman) continue; // zaman bilgisi yoksa (bozuk/eksik dosya) atla
    tumIcerikler.push({ icerik, zaman });
  }

  tumIcerikler.sort((a, b) => a.zaman - b.zaman);
  return tumIcerikler;
}

// NOT (dosya boyutu): Ekran görüntüleri eskiden HTML'e base64 "data:" URI olarak
// gömülüyordu (aynı görüntü 3 yere kadar) ve dashboard onlarca MB'a çıkıyordu. Allure
// ekleri zaten dashboard'un yanındaki allure-results-<ortam>/ klasöründe dosya olarak
// durduğu için artık yalnızca GÖRELİ YOL taşınır (ör. "allure-results-test/<uuid>-
// attachment.png"); dashboard file:// olarak aynı klasörden açıldığından tarayıcı
// dosyayı doğrudan bulur. Dosya diskte yoksa (silinmiş/taşınmış) null döner ve
// arayüz "ekran görüntüsü bulunamadı"/video bağlantısı yok davranışına düşer.
//
// Dönüş: { ekranGoruntusuYoluGetir(icerik), videoYoluGetir(icerik) } — verilen sonuç
// klasörüne bağlı iki yardımcı.
export function medyaYollariOlustur(sonuclarKlasoru, sonuclarKlasoruGoreli) {
  function ekGoreliYolu(ek) {
    if (!ek?.source) return null;
    if (!existsSync(join(sonuclarKlasoru, ek.source))) return null;
    return `${sonuclarKlasoruGoreli}/${encodeURIComponent(ek.source)}`;
  }

  function ekranGoruntusuYoluGetir(icerik) {
    // Ekran görüntüsü eki iki farklı yerde olabilir: klasik icerik.attachments dizisinde,
    // ya da (allure-playwright "detail:true" ile) icerik.steps içinde ayrı bir "sözde adım"
    // olarak (o adımın kendi attachments alanında). Playwright'ın kendi "screenshot:
    // only-on-failure" eki tam olarak böyle, "screenshot" adlı bir sözde adımın içinde
    // gelir ve testin hata anına en yakın çekilen görüntüdür — bizim hataYakalayici
    // fixture'ımızın "❌ HATA ANI - Ekran Görüntüsü" eki ise (özellikle test.setTimeout ile
    // sayfa/context zaten kapanmışsa) çoğu zaman hiç oluşmaz; bu yüzden "screenshot" önce
    // denenir, o yoksa bizim eke bakılır.
    const tumEkler = [...(icerik.attachments ?? []), ...(icerik.steps ?? []).flatMap((s) => s.attachments ?? [])];
    const ekBulunan =
      tumEkler.find((ek) => ek.type === 'image/png' && ek.name === 'screenshot') ??
      tumEkler.find((ek) => ek.type === 'image/png' && /Ekran Görüntüsü/i.test(ek.name ?? ''));
    return ekGoreliYolu(ekBulunan);
  }

  // Playwright'ın koşu videosu (allure-playwright bunu "video/webm" türünde ek olarak
  // kopyalar; ek, sözde adımların içinde de olabildiği için adımlar derinlemesine gezilir).
  // VIDEO_SAKLAMA_GUN'den eski videolar silindiğinden dosya yoksa null döner — arayüz o
  // zaman "▶ Videoyu izle" bağlantısını hiç göstermez.
  function videoYoluGetir(icerik) {
    const yigin = [icerik];
    while (yigin.length) {
      const dugum = yigin.pop();
      const ek = (dugum.attachments ?? []).find((e) => e.type === 'video/webm');
      if (ek) return ekGoreliYolu(ek);
      for (const adim of dugum.steps ?? []) yigin.push(adim);
    }
    return null;
  }

  return { ekranGoruntusuYoluGetir, videoYoluGetir };
}
