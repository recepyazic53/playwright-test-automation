// Sonuçları KOŞULARA gruplama, koşu özetleri/detayları ve üst kartlar.
import { durumEsle, kosuEtiketi } from './veri-siniflandirma.mjs';
import { adimGurultuMu } from './veri-adimlar.mjs';

// YEDEK gruplama: "kosuKimligi" etiketi OLMAYAN (bu özellikten önce yazılmış) eski
// sonuçlarda, iki sonuç arasında bu kadar boşluk varsa (ms) aralarında yeni bir koşu
// (ayrı bir npm run test... çağrısı) başladığı kabul edilir. Etiketli sonuçlar doğrudan
// kosuKimligi'ne göre gruplanır (bkz. aşağıdaki kosulariGrupla).
const KOSU_BOSLUGU_MS = 10 * 60 * 1000; // 10 dakika

// --- 2) "Son koşu" hızlı bakış için sonuçları KOŞULARA kümele ---
// Öncelik "kosuKimligi" Allure etiketinde (global-setup.ts her "playwright test"
// çağrısına benzersiz bir kimlik verir, fixtures.ts bunu her sonuca yazar): aynı
// kimliği taşıyan sonuçlar — koşu ne kadar uzun sürerse sürsün — tek koşudur. Etiketi
// olmayan ESKİ sonuçlar kendi aralarında eskisi gibi 10 dakikalık boşluk kuralıyla
// gruplanır. Her koşunun bir türü vardır: 'tam' (npm run test / CI) ya da 'tekil'
// (dashboard'daki ▷ ile tetiklenen tek senaryo, kosuTuru etiketi). Etiketsiz eski
// koşular 'tam' kabul edilir (o dönemde tür bilgisi yoktu).
function etiketDegeri(icerik, ad) {
  return (icerik.labels ?? []).find((e) => e.name === ad)?.value ?? null;
}

function kosuyaEkle(kosu, icerik, zaman) {
  kosu.bitis = Math.max(kosu.bitis, zaman);
  const anahtar = icerik.historyId ?? icerik.uuid;
  const mevcut = kosu.testler.get(anahtar);
  if (!mevcut || zaman >= (mevcut._zaman ?? 0)) {
    icerik._zaman = zaman;
    kosu.testler.set(anahtar, icerik);
  }
}

// tumIcerikler: sonuclariOku() dönüşü (zamana göre sıralı). Dönüş: koşular, BİTİŞ
// zamanına göre kronolojik (en eski önce); her birinde etiket hazır.
export function kosulariGrupla(tumIcerikler) {
  const kosular = [];
  const kimlikliKosular = new Map(); // kosuKimligi -> koşu
  let sonEtiketsizKosu = null;
  for (const { icerik, zaman } of tumIcerikler) {
    const kimlik = etiketDegeri(icerik, 'kosuKimligi');
    let kosu;
    if (kimlik) {
      kosu = kimlikliKosular.get(kimlik);
      if (!kosu) {
        kosu = { bitis: zaman, testler: new Map(), kimlik, tur: 'tam', kapsam: 'Genel' };
        kimlikliKosular.set(kimlik, kosu);
        kosular.push(kosu);
      }
      // Koşudaki TEK bir sonuç bile "tam" ise koşu tamdır; hepsi "tekil" ise tekildir.
      if (etiketDegeri(icerik, 'kosuTuru') === 'tekil' && kosu.testler.size === 0) kosu.tur = 'tekil';
      else if (etiketDegeri(icerik, 'kosuTuru') !== 'tekil') {
        kosu.tur = 'tam';
        // Kapsam: dashboard'da bir ürün seçiliyken başlatılan koşu o ürünün adını taşır;
        // etiketsiz (eski) ya da terminal/CI koşuları 'Genel'dir (bkz. fixtures.ts).
        kosu.kapsam = etiketDegeri(icerik, 'kosuKapsami') || kosu.kapsam || 'Genel';
      }
    } else {
      if (!sonEtiketsizKosu || zaman - sonEtiketsizKosu.bitis > KOSU_BOSLUGU_MS) {
        sonEtiketsizKosu = { bitis: zaman, testler: new Map(), kimlik: null, tur: 'tam', kapsam: 'Genel' };
        kosular.push(sonEtiketsizKosu);
      }
      kosu = sonEtiketsizKosu;
    }
    kosuyaEkle(kosu, icerik, zaman);
  }
  // Kronolojik sıra (en eski önce) — koşunun BİTİŞ zamanına göre; "son koşu" en son biten.
  kosular.sort((a, b) => a.bitis - b.bitis);
  for (const kosu of kosular) kosu.etiket = kosuEtiketi(kosu.bitis);
  return kosular;
}

function kosuOzetiCikar(testMap) {
  let basarili = 0;
  let basarisiz = 0;
  let atlanan = 0;
  let durduruldu = 0;
  const urunToplamlari = {};
  for (const icerik of testMap.values()) {
    const epicEtiketi = (icerik.labels ?? []).find((e) => e.name === 'epic');
    const urun = epicEtiketi?.value ?? 'Bilinmiyor';
    urunToplamlari[urun] ??= { basarili: 0, basarisiz: 0, atlanan: 0, durduruldu: 0 };
    const durum = durumEsle(icerik);
    if (durum === 'basarili') basarili += 1;
    else if (durum === 'basarisiz') basarisiz += 1;
    else if (durum === 'atlanan') atlanan += 1;
    else durduruldu += 1;
    urunToplamlari[urun][durum] += 1;
  }
  return { basarili, basarisiz, atlanan, durduruldu, urunToplamlari };
}

// Bir koşudaki her testin (senaryonun) adım adım (test.step) başarı/başarısız listesini,
// ürün bazında gruplayarak çıkarır — "Koşu geçmişi" satırına tıklayınca açılan
// Koşu > Ürün > Senaryo > Adım detay penceresinin veri kaynağıdır. Sadece BAŞARISIZ
// adımlarda mesaj/ekran görüntüsü taşınır (dosya boyutu büyümesin diye) — başarılı
// adımlarda zaten gösterilecek bir "açıklama" yok.
// medya: medyaYollariOlustur() dönüşü (bkz. veri-okuma.mjs).
function kosuSenaryolariCikar(testMap, medya) {
  const urunSenaryolari = {}; // urun -> [ { senaryoAdi, durum, genelMesaj, adimlar: [...] } ]
  for (const icerik of testMap.values()) {
    const epicEtiketi = (icerik.labels ?? []).find((e) => e.name === 'epic');
    const urun = epicEtiketi?.value ?? 'Bilinmiyor';
    const durum = durumEsle(icerik);

    const adimlar = [];
    for (const adim of icerik.steps ?? []) {
      const ad = adim.name ?? 'İsimsiz adım';
      if (adimGurultuMu(ad)) continue;
      if (adim.status !== 'passed' && adim.status !== 'failed' && adim.status !== 'broken') continue;
      // Durdurulan testte yarıda kesilen adım "başarısız" gösterilmez (yalnızca geçenler listelenir).
      if (durum === 'durduruldu' && adim.status !== 'passed') continue;
      const adimBasarisizMi = adim.status === 'failed' || adim.status === 'broken';
      adimlar.push({
        ad,
        basarili: !adimBasarisizMi,
        m: adimBasarisizMi ? adim.statusDetails?.message || icerik.statusDetails?.message || '' : '',
        g: adimBasarisizMi ? medya.ekranGoruntusuYoluGetir(icerik) : null,
        v: adimBasarisizMi ? medya.videoYoluGetir(icerik) : null
      });
    }

    urunSenaryolari[urun] ??= [];
    urunSenaryolari[urun].push({
      ad: icerik.name ?? icerik.fullName ?? 'İsimsiz test',
      durum,
      genelMesaj: durum === 'basarisiz' ? (icerik.statusDetails?.message ?? '') : '',
      adimlar
    });
  }
  // Her ürün içinde başarısız senaryolar üstte (araması gereken kişi önce onları görsün),
  // aralarında isim sırasına göre (tutarlı/tekrarlanabilir bir sıralama için).
  for (const urun of Object.keys(urunSenaryolari)) {
    urunSenaryolari[urun].sort((a, b) => {
      if (a.durum === 'basarisiz' && b.durum !== 'basarisiz') return -1;
      if (a.durum !== 'basarisiz' && b.durum === 'basarisiz') return 1;
      return a.ad.localeCompare(b.ad, 'tr');
    });
  }
  return urunSenaryolari;
}

// "Koşu geçmişi" satırına tıklayınca açılan detay penceresi için: kosuGecmisiCikar ile
// AYNI SIRADA/UZUNLUKTA, ama ayrı bir dizide tutulur (bu ağır veriyi (mesaj/ekran
// görüntüsü içerir) veri.kosuGecmisi'ne gömseydik gereksiz yere şişerdi).
// İstemci tarafında VERI.kosuDetaylari[i], VERI.kosuGecmisi[i] ile aynı koşuya karşılık gelir.
export function kosuDetaylariCikar(kosular, medya) {
  return kosular.map((kosu) => kosuSenaryolariCikar(kosu.testler, medya));
}

// --- Üst kartlar (ürün bazlı "koşu" mantığı) ---
// Koşu türleri: 'tam' = "koşu" (dashboard'daki aramasız "Koşuyu başlat" ya da her
// terminal/CI koşusu); 'tekil' = diğer her şey (Seçilenleri çalıştır, tek ▷, aramalı
// koşular). Kartlar ve trend YALNIZCA 'tam' koşulara bakar — tekil koşular "Koşu
// geçmişi"nde (rozetle), hata kalıplarında ve ürün/adım tablolarında sayılmaya devam eder.
//
// Ürün sayfası (P): P'nin sonuçlarını İÇEREN en son koşudaki (P kapsamlı ya da Genel)
// yalnızca P'nin sayıları; "önceki" = P'yi içeren bir önceki koşu.
// Genel sayfa: GÜNCEL DURUM = her ürünün kendi son koşusundaki sayıların toplamı (yalnızca
// JetSeyahat koşulursa toplamın yalnızca JetSeyahat kısmı değişir); "önceki" = her ürünün
// bir önceki koşusunun toplamı (önceki koşusu olmayan ürün, değişim üretmesin diye kendi
// son koşusuyla sayılır). Hiçbir ürünün önceki koşusu yoksa fark gösterilmez.
function durumToplami(s) {
  return s ? s.basarili + s.basarisiz + s.atlanan + (s.durduruldu || 0) : 0;
}
function sayilariTopla(liste) {
  const toplam = { basarili: 0, basarisiz: 0, atlanan: 0, durduruldu: 0 };
  for (const s of liste) {
    toplam.basarili += s.basarili;
    toplam.basarisiz += s.basarisiz;
    toplam.atlanan += s.atlanan;
    toplam.durduruldu += s.durduruldu || 0;
  }
  return toplam;
}

function urunKosuOzeti(kosu, urun) {
  const s = kosu.ozet.urunToplamlari[urun];
  return { etiket: kosu.etiket, z: kosu.bitis, kapsam: kosu.kapsam, basarili: s.basarili, basarisiz: s.basarisiz, atlanan: s.atlanan, durduruldu: s.durduruldu };
}

// Her koşuya "ozet" alanını ekler (kosuGecmisiCikar bunu kullanır) ve kartları hesaplar.
// Dönüş: { tamKosular, urunKartlari, genelKart, sonKosuOzet, oncekiKosuOzet, sonKosuEtiketi }
export function kartlariHesapla(kosular) {
  for (const kosu of kosular) kosu.ozet = kosuOzetiCikar(kosu.testler);
  const tamKosular = kosular.filter((kosu) => kosu.tur === 'tam');

  // urun -> o ürünün sonucunu içeren tam koşular (kronolojik, en eski önce).
  const urunTamKosulari = {};
  for (const kosu of tamKosular) {
    for (const [urun, sayilar] of Object.entries(kosu.ozet.urunToplamlari)) {
      if (durumToplami(sayilar) > 0) (urunTamKosulari[urun] ??= []).push(kosu);
    }
  }

  const urunKartlari = {};
  for (const [urun, liste] of Object.entries(urunTamKosulari)) {
    urunKartlari[urun] = {
      son: urunKosuOzeti(liste[liste.length - 1], urun),
      onceki: liste.length > 1 ? urunKosuOzeti(liste[liste.length - 2], urun) : null
    };
  }

  const urunKartListesi = Object.values(urunKartlari);
  const genelOncekiVarMi = urunKartListesi.some((k) => k.onceki);
  const genelKart = urunKartListesi.length
    ? {
        son: sayilariTopla(urunKartListesi.map((k) => k.son)),
        onceki: genelOncekiVarMi ? sayilariTopla(urunKartListesi.map((k) => k.onceki ?? k.son)) : null,
        // Kaynak açıklaması için: ürünlerin son koşularından en yenisi ve en eskisi.
        enYeniZ: Math.max(...urunKartListesi.map((k) => k.son.z)),
        enEskiZ: Math.min(...urunKartListesi.map((k) => k.son.z)),
        urunSayisi: urunKartListesi.length
      }
    : null;
  if (genelKart) {
    genelKart.enYeniEtiket = kosuEtiketi(genelKart.enYeniZ);
    genelKart.enEskiEtiket = kosuEtiketi(genelKart.enEskiZ);
  }

  // Konsol/markdown özeti ve kenar çubuğu donutu Genel GÜNCEL DURUMU gösterir (kartlarla aynı).
  const sonKosuOzet = {
    ...(genelKart?.son ?? { basarili: 0, basarisiz: 0, atlanan: 0, durduruldu: 0 }),
    urunToplamlari: Object.fromEntries(Object.entries(urunKartlari).map(([urun, k]) => [urun, k.son]))
  };
  const oncekiKosuOzet = genelKart?.onceki ?? null;
  const sonKosuEtiketi = !genelKart
    ? 'Henüz koşu yok'
    : genelKart.enYeniZ === genelKart.enEskiZ
      ? genelKart.enYeniEtiket
      : `her ürünün son koşusu (en yenisi ${genelKart.enYeniEtiket})`;

  return { tamKosular, urunKartlari, genelKart, sonKosuOzet, oncekiKosuOzet, sonKosuEtiketi };
}

// "Koşu geçmişi" tablosu + "Koşu trendi" grafiği için: TÜM koşuların başarılı/
// başarısız/atlanan sayıları, hem genel hem de ürün bazında (kronolojik sırayla,
// en eski önce). Her ikisi de istemci tarafında aynı diziden (VERI.kosuGecmisi),
// kendi tarih aralığı filtresine göre süzülür. kartlariHesapla()'dan SONRA çağrılmalı
// (kosu.ozet orada doldurulur).
export function kosuGecmisiCikar(kosular) {
  return kosular.map((kosu) => {
    const ozet = kosu.ozet;
    return {
      etiket: kosu.etiket,
      etiketKisa: new Date(kosu.bitis).toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit' }),
      z: kosu.bitis,
      // 'tam' | 'tekil' — istemci trendi yalnızca 'tam' koşularla çizer, "Koşu geçmişi"nde
      // tekil koşulara küçük bir rozet koyar.
      tur: kosu.tur,
      // 'Genel' ya da ürün adı (yalnızca tam koşularda anlamlı) — Genel trendi yalnızca
      // 'Genel' kapsamlı koşulardan çizilir; ürün kapsamlı koşular geçmişte rozetle görünür.
      kapsam: kosu.tur === 'tam' ? kosu.kapsam : null,
      basarili: ozet.basarili,
      basarisiz: ozet.basarisiz,
      atlanan: ozet.atlanan,
      durduruldu: ozet.durduruldu,
      urunler: ozet.urunToplamlari
    };
  });
}
