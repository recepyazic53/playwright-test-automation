// SENARYO HAZIRLIK KONTROLÜ ve "NEDEN ÇALIŞMIYOR?" (saf; import YOK, DOM YOK) — TEK KAYNAK. Platform arayüzü bu dosyayı olduğu gibi
// /arayuz/hazirlik.mjs olarak yükler (senaryo formunun sağ paneli, servis senaryosu formu, koşu diyaloğu); sunucu (hazirlik-servisi.mjs:
// senaryo listesi ve koşu diyaloğu) ve koşucu (model-kosusu.mjs > modelKosuPlani, tests/support/model-kosucu.ts) AYNI metinleri kullanır.
//
//  - Hazırlık maddeleri: alanlar (zorunlu alanlar dolu / geçerli), veri (bağlı tablo satırı var), gonderme (doldurmadan sonra
//    basılacak düğme), beklenen (başarı göstergesi ya da beklenen hata mesajı), ortam (bağlantı; YALNIZ "Denetle"ye basınca);
//    servis senaryosunda parametreler ve kontrol.
//  - Madde: { anahtar, durum: 'tamam' | 'eksik' | 'yok' (bu senaryoda gerekmiyor) | 'bekliyor', baslik, ayrinti, neden?, hedef? }.
//    neden: eksik maddenin tek cümlelik gerekçedeki parçası (küçük harfle başlar); hedef: "Tamamla"nın götüreceği yer.
//  - Gerekçe: calistirilamazCumlesi(nedenler) → "Bu senaryo çalıştırılamıyor çünkü … ." (arayüz ve koşu aynı cümleyi yazar).
// Metinler geneldir: ürün / şirket adı ya da kullanıcı verisi (değer) içermez; model metinleri (adım adı, düğme adı) aynen kullanılır.

/** @param {unknown} d @returns {d is Record<string, any>} */
const nesneMi = (d) => typeof d === 'object' && d !== null && !Array.isArray(d);

/** Madde başlıkları (liste sırası). */
export const HAZIRLIK_BASLIKLARI = Object.freeze({
  alanlar: 'Alanlar hazır',
  parametreler: 'Parametreler hazır',
  veri: 'Test verisi hazır',
  gonderme: 'Gönderme eylemi tanımlı',
  beklenen: 'Beklenen sonuç tanımlı',
  kontrol: 'Kontrol tanımlı',
  ortam: 'Ortam bağlantısı'
});

/** Ortam bağlantısı denetiminin sonucu bu süre saklanır (sunucu ve arayüz). */
export const ORTAM_DENETIMI_GECERLILIK_MS = 10 * 60 * 1000;

/**
 * Gerekçe parçaları (TEK KAYNAK). Her biri "Bu senaryo çalıştırılamıyor çünkü …" cümlesine girer; küçük harfle başlar, noktasızdır.
 */
export const NEDENLER = Object.freeze({
  modelYok: 'ekranın modeli yok',
  kodluSenaryo: 'senaryo kodlu testlerden kalma (ekran modeliyle yeniden oluşturulmalı)',
  ekranSilindi: 'ekranı silinmiş',
  /** @param {string | null} [ortam] */
  ortamdaTanimsiz: (ortam) => `senaryo ${ortam ? `“${ortam}” ortamında` : 'seçilen ortamda'} tanımlı değil`,
  gondermeYok: 'form dolduruluyor ancak gönderilecek düğme tanımlı değil',
  beklenenYok: 'başarılı sonucun nasıl anlaşılacağı (başarı göstergesi) tanımlı değil',
  hataAdimiYok: 'beklenen iş kuralı hatasının adımı seçilmemiş',
  hataMesajiYok: 'beklenen iş kuralı hatasının mesajı yazılmamış',
  /** @param {string} adim */
  hataAdimiModeldeYok: (adim) => `beklenen hata adımı “${adim}” modelde yok`,
  /** @param {string} adim */
  hataAdimiKapsamDisi: (adim) => `beklenen hata “${adim}” adımında ama bu adım senaryonun adım kapsamında değil`,
  /** @param {string} adim @param {string} ad */
  ortakAkisYok: (adim, ad) => `“${adim}” adımının genel senaryosu (“${ad}”) bu projede bulunamadı`,
  /** @param {number} n */
  alanlarEksik: (n) => (n === 1 ? '1 alan düzeltilmeli' : `${n} alan düzeltilmeli`),
  /** @param {string} ayrinti */
  veriEksik: (ayrinti) => `test verisi bulunamadı (${ayrinti})`,
  parametreEksik: 'istekteki bir alanın değer kaynağı (tablo sütunu, akış değeri ya da parametre) seçilmemiş',
  kontrolYok: 'yanıtta neyin denetleneceği (kontrol) tanımlı değil'
});

/**
 * Tek cümlelik gerekçe. Boş listede null.
 * @param {ReadonlyArray<string>} nedenler
 */
export function calistirilamazCumlesi(nedenler) {
  const l = [...new Set((nedenler || []).filter((x) => typeof x === 'string' && x.trim()).map((x) => x.trim().replace(/\.$/, '')))];
  if (!l.length) return null;
  const birlesik = l.length === 1 ? l[0] : `${l.slice(0, -1).join(', ')} ve ${l[l.length - 1]}`;
  return `Bu senaryo çalıştırılamıyor çünkü ${birlesik}.`;
}

/**
 * Uçtan uca / servis akışında önceki adım başarısız olduğu için koşmayan adımın sade gerekçesi.
 * @param {number} no önceki (başarısız) adımın numarası @param {string} ad adımın adı @param {string} [durum] 'hata' | 'basarisiz' | 'durduruldu'
 */
export function zincirNedeni(no, ad, durum = 'basarisiz') {
  const ne = durum === 'hata' ? 'çalıştırılamadığı' : durum === 'durduruldu' ? 'durdurulduğu' : 'başarısız olduğu';
  return `${no}. adım (“${ad}”) ${ne} için bu adım çalıştırılmadı.`;
}

// ---------------------------------------------------------------------------------------
// Ekran modeli: gönderme eylemi ve beklenen sonuç
// ---------------------------------------------------------------------------------------

/** @param {unknown} model @returns {Array<Record<string, any>>} */
function siraliAdimlar(model) {
  const adimlar = nesneMi(model) && Array.isArray(model.adimlar) ? model.adimlar.filter(nesneMi) : [];
  return adimlar.slice().sort((a, b) => (Number(a.sira) || 0) - (Number(b.sira) || 0));
}
/** @param {Record<string, any>} a */
const adimAdi = (a) => String(a.baslik || a.id || '?');
/** Adımda koşuda doldurulan alan var mı (senaryo alanı ya da sabit değer). @param {Record<string, any>} a */
function alanDoldurulur(a) {
  return (Array.isArray(a.bolumler) ? a.bolumler : []).some((b) => nesneMi(b) && Array.isArray(b.alanlar)
    && b.alanlar.some((x) => nesneMi(x) && (x.yapilandirma === 'senaryo' || x.sabitDeger !== undefined)));
}
/** Adımdaki tıklama (düğme) aksiyonu ya da indirmeyi başlatan düğme. @param {Record<string, any>} a */
function tiklama(a) {
  const k = nesneMi(a.kosu) ? a.kosu : null;
  const t = k && Array.isArray(k.aksiyonlar) ? k.aksiyonlar.find((x) => nesneMi(x) && x.tur === 'tikla') : null;
  if (t) return /** @type {Record<string, any>} */ (t);
  return nesneMi(a.dosyaKontrolu) && nesneMi(a.dosyaKontrolu.tetikleyici) ? /** @type {Record<string, any>} */ (a.dosyaKontrolu.tetikleyici) : null;
}
/** Adımdaki "şu adrese git" aksiyonu (kayıtta adres çubuğuyla gidilen sayfa): alan doldurulduktan sonra sayfa değişimi de gönderme sayılır. @param {Record<string, any>} a */
function adreseGit(a) {
  const k = nesneMi(a.kosu) ? a.kosu : null;
  const g = k && Array.isArray(k.aksiyonlar) ? k.aksiyonlar.find((x) => nesneMi(x) && x.tur === 'git') : null;
  return g ? /** @type {Record<string, any>} */ (g) : null;
}
/** Düğmesiz adımın denetlenen mesajları (başarı / hata göstergesi, kabul edilen uyarılar). @param {Record<string, any>} a */
function mesajDenetimiVar(a) {
  const k = nesneMi(a.kosu) ? a.kosu : null;
  return Boolean(k && (nesneMi(k.basariGostergesi) || nesneMi(k.hataGostergesi) || (Array.isArray(k.uyarilar) && k.uyarilar.length)));
}
/** Adım sonucu doğrulanıyor mu (başarı göstergesi, SQL sorgusu ya da indirilen dosya kontrolü)? @param {Record<string, any>} a */
function sonucDogrulanir(a) {
  return (nesneMi(a.kosu) && nesneMi(a.kosu.basariGostergesi)) || nesneMi(a.sqlKontrolu) || nesneMi(a.servisKontrolu) || nesneMi(a.dosyaKontrolu);
}
/** Başarı göstergesinin kısa okunuşu. @param {Record<string, any>} g */
function gostergeMetni(g) {
  if (g.tur === 'metin') return `“${String(g.deger ?? '')}” metni görünür`;
  if (g.tur === 'eleman') return 'belirlenen öğe görünür';
  if (g.tur === 'url') return 'sayfa adresi beklenen adrese geçer';
  if (g.tur === 'desen') return 'metin beklenen kalıba uyar';
  if (g.tur === 'veya') return `${Array.isArray(g.secenekler) ? g.secenekler.length : 'birkaç'} göstergeden biri görünür`;
  return 'başarı göstergesi görünür';
}

/**
 * @typedef {{ anahtar: string; durum: 'tamam' | 'eksik' | 'yok' | 'bekliyor'; baslik: string; ayrinti: string; neden?: string;
 *   sayi?: string; hedef?: { tur: string; adimId?: string; alan?: string } }} HazirlikMaddesi
 */

/**
 * Ekran modelinden "Gönderme eylemi tanımlı" ve "Beklenen sonuç tanımlı" maddeleri + koşuyu kesin engelleyen model sorunları.
 * Kural koşucuyla aynıdır: koşu son adımda durur (iş kuralı hatası bekleniyorsa o adımda, değilse kapsamdaki son adımda).
 *  - Gönderme: kapsamda alan dolduran SON adımdan (o dahil) sonra bir düğmeye basılıyor olmalı; düğmesiz adımda mesaj denetimi
 *    (başarı / hata göstergesi ya da kabul edilen uyarılar) varsa alanlardan çıkınca denetlenir (tanımlı sayılır).
 *  - Beklenen: hata bekleniyorsa adım + mesaj; başarı bekleniyorsa kapsamda en az bir başarı göstergesi (ya da SQL / dosya kontrolü).
 * @param {unknown} model akışın (ortak akışları açılmış) modeli
 * @param {{ adimDahil?: Record<string, boolean | null | undefined>; beklenen?: { tur: 'basari' } | { tur: 'hata'; adim?: string; mesaj?: string } | null }} [g]
 *   adimDahil: adımın görünürlüğü (false: koşulmaz); beklenen: senaryonun beklenen sonucu (verilmezse başarı)
 * @returns {{ gonderme: HazirlikMaddesi; beklenen: HazirlikMaddesi; engeller: string[] }}
 */
export function eylemDenetimi(model, g = {}) {
  const adimlar = siraliAdimlar(model);
  const dahil = (/** @type {Record<string, any>} */ a) => (g.adimDahil ? g.adimDahil[a.id] : undefined) !== false;
  const beklenen = g.beklenen && g.beklenen.tur === 'hata' ? g.beklenen : { tur: /** @type {const} */ ('basari') };
  /** @type {string[]} */
  const engeller = [];
  const hataAdimi = beklenen.tur === 'hata' ? String(/** @type {any} */ (beklenen).adim || '') : '';
  const son = beklenen.tur === 'hata' ? adimlar.find((a) => a.id === hataAdimi) : adimlar.filter(dahil).pop();
  const sonIndeks = son ? adimlar.indexOf(son) : -1;
  const kapsam = adimlar.filter((a, i) => dahil(a) && i <= sonIndeks);
  for (const a of kapsam) if (typeof a.eksikOrtakAkis === 'string') engeller.push(NEDENLER.ortakAkisYok(adimAdi(a), a.eksikOrtakAkis));

  // --- Gönderme eylemi ---
  /** @type {HazirlikMaddesi} */
  let gonderme;
  const dolduranlar = kapsam.filter(alanDoldurulur);
  const baslikG = HAZIRLIK_BASLIKLARI.gonderme;
  if (!dolduranlar.length) {
    gonderme = { anahtar: 'gonderme', durum: 'yok', baslik: baslikG, ayrinti: 'Bu senaryoda doldurulan alan yok.' };
  } else {
    const l = dolduranlar[dolduranlar.length - 1];
    const sonraki = kapsam.slice(kapsam.indexOf(l)).find((a) => tiklama(a) || adreseGit(a));
    if (sonraki && tiklama(sonraki)) {
      const t = /** @type {Record<string, any>} */ (tiklama(sonraki));
      const ad = String(t.aciklama || t.metin || '').trim();
      gonderme = { anahtar: 'gonderme', durum: 'tamam', baslik: baslikG, ayrinti: `${ad ? `“${ad}” düğmesine` : 'Düğmeye'} “${adimAdi(sonraki)}” adımında basılır.` };
    } else if (sonraki) {
      // Alanlardan sonra sayfa değişiyor (adres çubuğuyla gidilen sayfa): düğmesiz gönderme olarak kabul edilir.
      gonderme = { anahtar: 'gonderme', durum: 'tamam', baslik: baslikG, ayrinti: `“${adimAdi(sonraki)}” adımında ${String(/** @type {Record<string, any>} */ (adreseGit(sonraki)).yol)} adresine gidilir.` };
    } else if (mesajDenetimiVar(l)) {
      gonderme = { anahtar: 'gonderme', durum: 'tamam', baslik: baslikG, ayrinti: `Düğmesiz adım: “${adimAdi(l)}” mesajı alanlardan çıkınca denetlenir.` };
    } else {
      gonderme = {
        anahtar: 'gonderme', durum: 'eksik', baslik: baslikG, neden: NEDENLER.gondermeYok, hedef: { tur: 'akis', adimId: String(l.id) },
        ayrinti: `“${adimAdi(l)}” adımında alanlar dolduruluyor ama ardından basılacak düğme yok (akış diyagramına düğme ekleyin).`
      };
    }
  }

  // --- Beklenen sonuç ---
  /** @type {HazirlikMaddesi} */
  let bek;
  const baslikB = HAZIRLIK_BASLIKLARI.beklenen;
  if (beklenen.tur === 'hata') {
    const mesaj = String(/** @type {any} */ (beklenen).mesaj || '').trim();
    const eksik = (/** @type {string} */ neden, /** @type {string} */ ayrinti) => ({ anahtar: 'beklenen', durum: /** @type {const} */ ('eksik'), baslik: baslikB, neden, ayrinti, hedef: { tur: 'beklenen' } });
    if (!hataAdimi) bek = eksik(NEDENLER.hataAdimiYok, 'Hatanın beklendiği adımı seçin.');
    else if (!son) bek = eksik(NEDENLER.hataAdimiModeldeYok(hataAdimi), 'Seçilen adım ekranın akışında yok; başka bir adım seçin.');
    else if (!dahil(son)) bek = eksik(NEDENLER.hataAdimiKapsamDisi(adimAdi(son)), 'Adımı senaryoya dahil edin ya da başka bir adım seçin.');
    else if (!mesaj) bek = eksik(NEDENLER.hataMesajiYok, 'Ekranda beklenen uyarı metnini yazın ya da akıştaki uyarılardan seçin.');
    else bek = { anahtar: 'beklenen', durum: 'tamam', baslik: baslikB, ayrinti: `“${adimAdi(son)}” adımında “${mesaj}” uyarısı beklenir.` };
  } else if (!kapsam.length) {
    bek = { anahtar: 'beklenen', durum: 'eksik', baslik: baslikB, neden: NEDENLER.beklenenYok, ayrinti: 'Senaryoda koşulan adım yok.', hedef: { tur: 'akis' } };
  } else {
    const sonAdim = kapsam[kapsam.length - 1];
    const dogrulayan = [...kapsam].reverse().find(sonucDogrulanir);
    if (dogrulayan) {
      const gs = nesneMi(dogrulayan.kosu) && nesneMi(dogrulayan.kosu.basariGostergesi) ? dogrulayan.kosu.basariGostergesi : null;
      const ne = gs ? gostergeMetni(gs) : nesneMi(dogrulayan.sqlKontrolu) ? 'SQL sorgusu beklenenle karşılaştırılır' : nesneMi(dogrulayan.servisKontrolu) ? 'servis isteğinin kontrolleri tutar' : 'indirilen dosya doğrulanır';
      bek = { anahtar: 'beklenen', durum: 'tamam', baslik: baslikB, ayrinti: `Başarılı: “${adimAdi(dogrulayan)}” adımında ${ne}.` };
    } else {
      bek = {
        anahtar: 'beklenen', durum: 'eksik', baslik: baslikB, neden: NEDENLER.beklenenYok, hedef: { tur: 'akis', adimId: String(sonAdim.id) },
        ayrinti: `“${adimAdi(sonAdim)}” adımından sonra başarının görüneceği mesaj ya da öğe yok (akış diyagramında beklenen mesaj ekleyin).`
      };
    }
  }
  return { gonderme, beklenen: bek, engeller };
}

// ---------------------------------------------------------------------------------------
// Diğer maddeler ve özet
// ---------------------------------------------------------------------------------------

/**
 * "Alanlar hazır" maddesi: toplam = görünen zorunlu alanlar (ve hatalı diğer alanlar), hatali = düzeltilmesi gereken alan sayısı.
 * @param {{ toplam: number; hatali: number; ilkHata?: string | null }} g
 * @returns {HazirlikMaddesi}
 */
export function alanMaddesi(g) {
  const toplam = Math.max(g.toplam, g.hatali);
  const sayi = `${toplam - g.hatali}/${toplam}`;
  if (!g.hatali) {
    return { anahtar: 'alanlar', durum: 'tamam', baslik: HAZIRLIK_BASLIKLARI.alanlar, sayi, ayrinti: toplam ? 'Zorunlu alanlar dolu ve kurallara uyuyor.' : 'Bu senaryoda zorunlu alan yok.' };
  }
  return {
    anahtar: 'alanlar', durum: 'eksik', baslik: HAZIRLIK_BASLIKLARI.alanlar, sayi, neden: NEDENLER.alanlarEksik(g.hatali), hedef: { tur: 'alan' },
    // Alanın hata metni burada tekrarlanmaz (alanın altında yazılı); "Tamamla" ilk hatalı alana götürür.
    ayrinti: `${g.hatali} alan düzeltilmeli; “Tamamla” ilk hatalı alana götürür.`
  };
}

/**
 * "Test verisi hazır" maddesi.
 * @param {{ kullaniliyor: boolean; bekliyor?: boolean; satirlar?: string[]; sorun?: string | null; uyarilar?: string[]; hedef?: { tur: string; alan?: string } }} g
 *   satirlar: kullanılacak satırlar ("Tablo: satır adı"); sorun: bulunamayan satır / tablo ya da ZORUNLU alanın boş hücresi (kısa; engel);
 *   uyarilar: zorunlu OLMAYAN alanın boş hücresi ("‹Alan›: ‹Tablo› › ‹Sütun› boş, doldurulmadı"; engel değil, durum 'uyari')
 * @returns {HazirlikMaddesi}
 */
export function veriMaddesi(g) {
  const baslik = HAZIRLIK_BASLIKLARI.veri;
  if (!g.kullaniliyor) return { anahtar: 'veri', durum: 'yok', baslik, ayrinti: 'Senaryo tablodan değer almıyor.' };
  if (g.bekliyor) return { anahtar: 'veri', durum: 'bekliyor', baslik, ayrinti: 'Tablolar denetleniyor…' };
  if (g.sorun) return { anahtar: 'veri', durum: 'eksik', baslik, neden: NEDENLER.veriEksik(g.sorun), ayrinti: g.sorun, hedef: g.hedef ?? { tur: 'tablo' } };
  const l = g.satirlar ?? [];
  const u = g.uyarilar ?? [];
  if (u.length) {
    return {
      anahtar: 'veri', durum: 'uyari', baslik, hedef: g.hedef ?? { tur: 'tablo' },
      ayrinti: `${u.slice(0, 3).join('; ')}${u.length > 3 ? ` (+${u.length - 3})` : ''}. Zorunlu olmadığı için koşu durmaz; alan boş bırakılır.`
    };
  }
  return { anahtar: 'veri', durum: 'tamam', baslik, ayrinti: l.length ? `Kullanılacak satır: ${l.slice(0, 3).join(', ')}${l.length > 3 ? ` (+${l.length - 3})` : ''}.` : 'Bağlı tablo satırı var.' };
}

/**
 * Maddeler + kesin engeller → çalıştırılabilir mi ve tek cümlelik gerekçe.
 * @param {ReadonlyArray<HazirlikMaddesi>} maddeler @param {ReadonlyArray<string>} [engeller]
 */
export function hazirlikOzeti(maddeler, engeller = []) {
  const nedenler = [...new Set([...engeller, ...maddeler.filter((m) => m.durum === 'eksik' && m.neden).map((m) => /** @type {string} */ (m.neden))])];
  return {
    calistirilabilir: nedenler.length === 0, nedenler, neden: calistirilamazCumlesi(nedenler),
    eksikler: maddeler.filter((m) => m.durum === 'eksik').map((m) => m.anahtar)
  };
}

/**
 * Sayının (rakamla) 3. tekil iyelik eki: "2'si", "10'u", "3'ü", "6'sı" (okunuşun son sözcüğüne göre).
 * @param {number} n
 */
export function sayiIyelikEki(n) {
  const b = Math.abs(Math.trunc(n));
  const birler = ['ı', 'i', 'si', 'ü', 'ü', 'i', 'sı', 'si', 'i', 'u'];
  const onlar = ['', 'u', 'si', 'u', 'ı', 'si', 'ı', 'i', 'i', 'ı'];
  if (b === 0) return 'ı';
  if (b % 10) return birler[b % 10];
  if (b % 100) return onlar[(b % 100) / 10];
  if (b % 1000) return 'ü';
  if (b % 1_000_000) return 'i';
  return 'u';
}

/**
 * Koşu diyaloğunun sayımı: "12 senaryodan 2'si çalıştırılamaz — 10'u başlatılsın mı?". Çalıştırılamayan yoksa null.
 * @param {number} toplam koşuya girecek (çalıştırılamayanlar dahil) senaryo sayısı @param {number} calistirilamaz
 */
export function kosuSayimMetni(toplam, calistirilamaz) {
  if (!calistirilamaz) return null;
  const kalan = toplam - calistirilamaz;
  const bas = `${toplam} senaryodan ${calistirilamaz}'${sayiIyelikEki(calistirilamaz)} çalıştırılamaz`;
  return kalan > 0 ? `${bas} — ${kalan}'${sayiIyelikEki(kalan)} başlatılsın mı?` : `${bas}; başlatılacak senaryo yok.`;
}

/**
 * Ortam bağlantısı denetiminin okunuşu (arayüz). Sonuç yoksa (hiç denetlenmedi) bilgilendirici metin.
 * @param {{ erisilebilir: boolean; durumKodu?: number | null; sureMs?: number | null; oturum?: string | null; mesaj?: string | null; zaman?: number } | null | undefined} d
 * @param {number} [simdi]
 */
export function ortamDenetimiMetni(d, simdi = Date.now()) {
  if (!d) return 'Denetlenmedi. Kendiliğinden istek atılmaz; “Denetle” seçili ortamın adresine tek bir istek gönderir.';
  const once = typeof d.zaman === 'number' ? Math.max(0, Math.round((simdi - d.zaman) / 60000)) : null;
  const zaman = once === null ? '' : once < 1 ? ' · az önce' : ` · ${once} dk önce`;
  if (!d.erisilebilir) return `Erişilemedi: ${d.mesaj || 'bağlantı kurulamadı'}${zaman}`;
  const oturum = d.oturum === 'gecerli' ? ' · oturum geçerli' : d.oturum === 'gecersiz' ? ' · kayıtlı oturum geçersiz (koşuda yeniden giriş yapılır)'
    : d.oturum === 'yok' ? ' · kayıtlı oturum yok' : d.oturum === 'izinsiz' ? ' · oturum denetlenmedi (giriş bilgisi izni kapalı)' : '';
  return `Erişildi (${d.durumKodu ?? '?'}, ${d.sureMs ?? '?'} ms)${oturum}${zaman}`;
}
