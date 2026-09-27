// SENARYO TASARIM YARDIMCISI (genel, saf fonksiyon) — ekran modeli + mevcut senaryolar + bağlı test verisi tablolarından
// senaryo ÖNERİLERİ üretir. Hiçbir şey kaydetmez ve tarayıcıya girmez: öneri yalnızca öneridir; kullanıcı işaretleyip
// "Senaryo olarak ekle" demeden (kayıt yine tek doğrulayıcıdan geçer) senaryo oluşmaz.
//
// Öneri türleri:
//  - zorunlu:      her zorunlu alan için ayrı senaryo — o alan boş (bilerekBos), diğerleri geçerli tabandan. Beklenen sonuç:
//                  modelde o alan / adım için iş kuralı ya da hata göstergesi varsa "iş kuralı hatası (adım)", yoksa belirsiz
//                  ("beklenen sonucu siz seçin"; TAHMİN EDİLMEZ).
//  - sinir:        YALNIZ modeldeki alan kurallarından (alan.sinirlar: sayı / tarih aralığı, metin uzunluğu, desen): alt−1, alt, alt+1,
//                  üst−1, üst, üst+1 (metinde uzunluk n−1 / n / n+1). Geçerliler başarı, geçersizler hata. Kural yoksa önerilmez (not).
//  - kosullu:      görünürlük koşullarını ve bağımlı listeleri yöneten alanların her dalı: "X = v seçilince Y görünür / Z görünmez",
//                  o dalda zorunlu alanlar, bağlı listenin seçenekleri.
//  - kombinasyon:  kullanıcının işaretlediği 2–3 seçim alanının kombinasyonlarından mevcut senaryolarla kapsanmayanlar (üst sınırlı).
// Kişisel / gizli alanlarda (hassas, telefon, kimlik, gizli ad) DEĞER ÜRETİLMEZ: tabandaki (mevcut senaryodaki) değer ya da bağlı
// tablonun başvurusu (${Tablo.Sütun}) kullanılır, gösterimde maskelenir.
// Taban: beklenen sonucu başarı olan, doğrulayıcıdan geçen mevcut bir senaryo (son sonucu başarılı olan önce); yoksa modelin
// varsayılanları (eksik zorunlu değerler öneride "eksik" olarak işaretlenir; üretilmez).
// Aynı öneri tekrar üretilince içeriği mevcut bir senaryoda zaten varsa "mevcut" işaretlenir (imza değil, içerik karşılaştırması).
//
// Import YOK, DOM YOK: arayüz bu dosyayı /arayuz/senaryo-onerileri.mjs olarak yükler; bağımlılıklar (form şeması, görünürlük,
// doğrulama, gizli ad denetimi) parametreyle verilir. Tipler: senaryo-onerileri.d.mts.

/** Kombinasyonda en çok alan (kombinasyon patlamasını önler). */
export const KOMBINASYON_ALAN_SINIRI = 3;
/** Listelenen kombinasyon önerisi üst sınırı. */
export const KOMBINASYON_UST_SINIRI = 60;
/** Hesaplanan kombinasyon üst sınırı (aşılırsa hesaplanmaz; alan azaltılmalı). */
export const KOMBINASYON_HESAP_SINIRI = 5000;
/** Koşulu yöneten bir alanın en çok kaç dalı önerilir. */
export const KOSUL_DAL_SINIRI = 20;
/** Senaryo verisinde bilerek boş bırakılan alanların listesi (senaryo-dogrulayici.mjs > BILEREK_BOS_ANAHTARI ile aynı). */
export const BILEREK_BOS = 'bilerekBos';
export const ONERI_TURLERI = Object.freeze(['zorunlu', 'sinir', 'kosullu', 'kombinasyon']);
export const MASKE = '••••••';

const BASIT_TIPLER = ['secim', 'metin', 'sayi', 'tarih', 'onayKutusu', 'dosya'];

function nesneMi(d) {
  return typeof d === 'object' && d !== null && !Array.isArray(d);
}
function bosMu(d) {
  return d === undefined || d === null || (typeof d === 'string' && d.trim() === '');
}
function kopya(d) {
  return d === undefined ? undefined : JSON.parse(JSON.stringify(d));
}
function tabloBasvurusuMu(d) {
  return typeof d === 'string' && /^\s*\$\{[^{}]+\.[^{}]+\}\s*$/u.test(d);
}
/** Karşılaştırma için tek biçim: { deger } nesnesi → deger; diğerleri metin. */
function duz(d) {
  if (nesneMi(d)) return d.deger === undefined || d.deger === null ? '' : String(d.deger).trim();
  return d === undefined || d === null ? '' : String(d).trim();
}
const benzersiz = (liste) => [...new Set(liste)];

// ---- Tarih yardımcıları (yalnız gün; yerel takvim) ------------------------------------------------

const iki = (n) => String(n).padStart(2, '0');
function gunEkle(t, gun) {
  const y = new Date(t.getFullYear(), t.getMonth(), t.getDate());
  y.setDate(y.getDate() + gun);
  return y;
}
function tarihYaz(t, bicim) {
  return bicim === 'yyyy-aa-gg' ? `${t.getFullYear()}-${iki(t.getMonth() + 1)}-${iki(t.getDate())}` : `${iki(t.getDate())}.${iki(t.getMonth() + 1)}.${t.getFullYear()}`;
}
/** "bugun", "bugun+7", gg.aa.yyyy ya da yyyy-aa-gg → { tarih, goreli } | null. */
function tarihCoz(d, simdi) {
  if (typeof d !== 'string') return null;
  const m = d.trim();
  const g = /^bugun(?:\s*([+-])\s*(\d{1,5}))?$/.exec(m);
  if (g) return { tarih: gunEkle(simdi, g[1] ? (g[1] === '-' ? -1 : 1) * Number(g[2]) : 0), goreli: true };
  const tr = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(m);
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(m);
  const [yil, ay, gun] = tr ? [Number(tr[3]), Number(tr[2]), Number(tr[1])] : iso ? [Number(iso[1]), Number(iso[2]), Number(iso[3])] : [0, 0, 0];
  if (!yil) return null;
  const t = new Date(yil, ay - 1, gun);
  return t.getFullYear() === yil && t.getMonth() === ay - 1 && t.getDate() === gun ? { tarih: t, goreli: false } : null;
}
const gunSayisi = (t) => Math.round(new Date(t.getFullYear(), t.getMonth(), t.getDate()).getTime() / 86_400_000);

// ---- Koşul ifadeleri ------------------------------------------------------------------------------

/** İfadenin başvurduğu alan kimlikleri ve senaryo ayarları. */
function ifadeBasvurulari(ifade, alanlar, ayarlar) {
  if (!nesneMi(ifade)) return;
  if (typeof ifade.alan === 'string') alanlar.add(ifade.alan);
  if (typeof ifade.senaryoAyari === 'string') ayarlar.add(ifade.senaryoAyari);
  for (const ad of ['ve', 'veya']) if (Array.isArray(ifade[ad])) ifade[ad].forEach((x) => ifadeBasvurulari(x, alanlar, ayarlar));
  if (ifade.degil) ifadeBasvurulari(ifade.degil, alanlar, ayarlar);
}

/**
 * Senaryo önerileri.
 * @param {import('./senaryo-onerileri.d.mts').OneriGirdisi} g
 * @returns {import('./senaryo-onerileri.d.mts').OneriSonucu}
 */
export function senaryoOnerileri(g) {
  const model = g.model;
  const sema = g.sema;
  const simdi = g.simdi instanceof Date ? g.simdi : new Date();
  const senaryolar = (Array.isArray(g.senaryolar) ? g.senaryolar : []).filter((s) => s && nesneMi(s.veri));
  const tabloBasvurulari = nesneMi(g.tabloBasvurulari) ? g.tabloBasvurulari : {};
  const bs = sema.beklenenSonuc;
  /** @type {Array<{ tur: string; mesaj: string }>} */
  const notlar = [];
  const not = (tur, mesaj) => notlar.push({ tur, mesaj });

  // Form alanları (akış sırasıyla) ve modeldeki ham karşılıkları.
  const formAlanlari = [...sema.adimlar.flatMap((a) => a.bolumler.flatMap((b) => b.alanlar)), ...sema.senaryoAlanlari];
  /** @type {Map<string, any>} */
  const ham = new Map();
  const adimlar = (Array.isArray(model.adimlar) ? model.adimlar : []).filter(nesneMi);
  for (const adim of adimlar) for (const b of Array.isArray(adim.bolumler) ? adim.bolumler : []) for (const a of nesneMi(b) && Array.isArray(b.alanlar) ? b.alanlar : []) if (nesneMi(a)) ham.set(a.id, a);
  for (const a of nesneMi(model.senaryoDuzeyi) && Array.isArray(model.senaryoDuzeyi.alanlar) ? model.senaryoDuzeyi.alanlar : []) if (nesneMi(a) && !ham.has(a.id)) ham.set(a.id, a);
  const hamAlan = (fa) => ham.get(fa.id) || {};
  const adimBasligi = (id) => (bs && bs.adimlar.find((s) => s.deger === id)?.metin) || sema.adimlar.find((a) => a.id === id)?.baslik || String(id || '');

  const gizliMi = (fa) => {
    const h = hamAlan(fa);
    return fa.hassas === true || h.hassas === true || h.tip === 'telefon' || h.tip === 'kimlikProfili' || fa.tip === 'kimlik'
      || Boolean(g.gizliAdMi && (g.gizliAdMi(String(fa.anahtar)) || g.gizliAdMi(String(fa.id))));
  };
  const secenekMetni = (fa, v) => {
    const liste = [...(fa.secenekler || []), ...Object.values((fa.bagimlilik && fa.bagimlilik.harita) || {}).flat()];
    return liste.find((x) => x.deger === duz(v))?.metin ?? duz(v);
  };
  /** Kullanıcıya gösterilen değer (gizli alan maskeli; tablo başvurusu kaynağıyla). */
  const gosterim = (fa, v) => {
    if (fa.tip === 'onayKutusu' && typeof v === 'boolean') return v ? 'işaretli' : 'işaretsiz';
    if (bosMu(v)) return '(boş)';
    if (tabloBasvurusuMu(v)) return `Tablodan: ${String(v).trim().slice(2, -1)}`;
    if (gizliMi(fa)) return MASKE;
    return fa.tip === 'secim' ? secenekMetni(fa, v) : duz(v);
  };
  const gorunurluk = (veri) => g.gorunurlukHesapla(veri);
  const gorunurMu = (gr, fa) => !(gr.alanlar[fa.id] === false || (fa.adimId && gr.adimlar[fa.adimId] === false));
  const basariMi = (veri) => !bs || !nesneMi(veri[bs.anahtar]) || !veri[bs.anahtar].tip || veri[bs.anahtar].tip === bs.basariTipi;
  const bilerekBos = (veri) => (Array.isArray(veri[BILEREK_BOS]) ? veri[BILEREK_BOS] : []);
  const temizle = (veri) => {
    const v = kopya(veri);
    delete v[sema.baslik];
    if (bs) delete v[bs.anahtar];
    delete v[BILEREK_BOS];
    return v;
  };
  const bagimlilar = (fa) => formAlanlari.filter((x) => x.tip === 'secim' && x.bagimlilik && x.bagimlilik.alan === fa.id);
  /** Üst alanın değeri değişince bağımlı seçimler: değer yeni listede yoksa listenin ilk seçeneği (kişisel olmayan listeler). */
  function bagimlilariAyarla(veri, fa, dokunma = new Set()) {
    for (const d of bagimlilar(fa)) {
      if (dokunma.has(d.id)) continue;
      const liste = d.bagimlilik.harita[duz(veri[fa.anahtar])] || [];
      if (!liste.some((x) => x.deger === duz(veri[d.anahtar])) && !tabloBasvurusuMu(veri[d.anahtar])) {
        if (liste.length && !gizliMi(d)) veri[d.anahtar] = liste[0].deger; else delete veri[d.anahtar];
      }
      bagimlilariAyarla(veri, d, dokunma);
    }
  }
  /** Görünmeyen alanların değerleri atılır (form da yazmaz); zorunlu boş alanlar tablo başvurusu / varsayılanla dolar, yoksa eksik. */
  function sonlandir(veri, haric = []) {
    const gr = gorunurluk(veri);
    for (const fa of formAlanlari) if (!gorunurMu(gr, fa) && fa.anahtar !== sema.baslik && fa.anahtar in veri) delete veri[fa.anahtar];
    const eksikler = [];
    for (const fa of formAlanlari) {
      if (fa.zorunlu !== true || fa.anahtar === sema.baslik || haric.includes(fa.anahtar) || !BASIT_TIPLER.includes(fa.tip) || fa.tip === 'onayKutusu') continue;
      if (!gorunurMu(gr, fa) || !bosMu(veri[fa.anahtar])) continue;
      const h = hamAlan(fa);
      if (tabloBasvurulari[fa.id]) veri[fa.anahtar] = tabloBasvurulari[fa.id];
      else if (nesneMi(h.varsayilan) && !bosMu(h.varsayilan.deger) && fa.tip !== 'dosya') veri[fa.anahtar] = kopya(h.varsayilan.deger);
      else eksikler.push(fa.etiket);
    }
    return { gr, eksikler };
  }

  // ---- Taban ----------------------------------------------------------------------------------------
  const siraliAdaylar = senaryolar.map((s, i) => ({ s, i }))
    .filter(({ s }) => basariMi(s.veri) && !bilerekBos(s.veri).length)
    .sort((a, b) => Number(b.s.sonDurum === 'basarili') - Number(a.s.sonDurum === 'basarili') || a.i - b.i)
    .map(({ s }) => s);
  const tabanSenaryo = siraliAdaylar.find((s) => !g.dogrula || !g.dogrula(s.veri).hatalar.length) || null;
  /** @type {Record<string, unknown>} */
  let tabanVeri;
  if (tabanSenaryo) {
    tabanVeri = temizle(tabanSenaryo.veri);
  } else {
    tabanVeri = {};
    for (const fa of formAlanlari) {
      const h = hamAlan(fa);
      if (BASIT_TIPLER.includes(fa.tip) && fa.tip !== 'dosya' && nesneMi(h.varsayilan) && !bosMu(h.varsayilan.deger)) tabanVeri[fa.anahtar] = kopya(h.varsayilan.deger);
    }
  }
  const tabanSonu = sonlandir(tabanVeri);
  const taban = {
    kaynak: tabanSenaryo ? 'senaryo' : 'varsayilan', senaryoId: tabanSenaryo ? tabanSenaryo.id : null, baslik: tabanSenaryo ? tabanSenaryo.baslik : null,
    eksikler: tabanSonu.eksikler
  };
  const tabanMetni = tabanSenaryo ? `"${tabanSenaryo.baslik}" senaryosundaki gibi` : 'modelin varsayılanlarıyla';
  const tabloSecimleri = tabanSenaryo && nesneMi(tabanSenaryo.tabloSecimleri) && Object.keys(tabanSenaryo.tabloSecimleri).length ? kopya(tabanSenaryo.tabloSecimleri) : null;
  if (!tabanSenaryo) {
    not('taban', senaryolar.length
      ? 'Başarı bekleyen ve kurallardan geçen bir senaryo bulunamadı; öneriler modelin varsayılanlarıyla kuruldu.'
      : 'Bu ekranda henüz senaryo yok; öneriler modelin varsayılanlarıyla kuruldu.');
  }
  if (taban.eksikler.length) not('taban', `Değeri olmayan zorunlu alanlar (değer üretilmez; önizlemede doldurun): ${taban.eksikler.join(', ')}.`);

  // ---- Ortak: beklenen sonuç, mevcut senaryo, öneri kurma -------------------------------------------------
  const kosuldaAlanVar = (ifade, id) => { const a = new Set(); ifadeBasvurulari(ifade, a, new Set()); return a.has(id); };
  /**
   * İş kuralı hatası beklentisi (tahmin yok): zorunlu alan önerisinde (bosAlan) modelde bu alanın iş kuralı ya da adımın hata göstergesi
   * şart ve mesaj alanın iş kuralından gelir; sınır önerisinde adım alanın adımıdır, mesajı kullanıcı yazar.
   */
  function hataBeklentisi(fa, bosAlan) {
    const gostergeGerekli = bosAlan;
    if (!bs || !bs.hataTipi) return { tur: 'belirsiz', neden: 'Modelin beklenen sonucunda iş kuralı hatası seçeneği yok; beklenen sonucu siz seçin.' };
    const adimId = fa.adimId;
    if (!adimId) return { tur: 'belirsiz', neden: 'Alan bir adıma bağlı değil; beklenen sonucu siz seçin.' };
    const adim = adimlar.find((a) => a.id === adimId);
    const kural = bosAlan && (Array.isArray(model.isKurallari) ? model.isKurallari : []).find((k) => nesneMi(k) && k.adim === adimId && kosuldaAlanVar(k.kosul, fa.id) && typeof k.mesaj === 'string' && k.mesaj.trim());
    const gosterge = adim && nesneMi(adim.kosu) && nesneMi(adim.kosu.hataGostergesi);
    if (gostergeGerekli && !kural && !gosterge) return { tur: 'belirsiz', neden: 'Modelde bu alan ya da adımı için hata / uyarı göstergesi tanımlı değil; beklenen sonucu siz seçin.' };
    if (bs.adimAnahtari && !bs.adimlar.some((s) => s.deger === adimId)) return { tur: 'belirsiz', neden: 'Alanın adımı beklenen sonuç adımları arasında yok; beklenen sonucu siz seçin.' };
    return { tur: 'hata', adim: adimId, adimBasligi: adimBasligi(adimId), mesaj: kural ? kural.mesaj.trim() : '', mesajEksik: !kural };
  }
  const beklenenMetni = (b) => (b.tur === 'basari' ? 'Başarılı akış'
    : b.tur === 'hata' ? `İş kuralı hatası beklenir (${b.adimBasligi})${b.mesajEksik ? ' — mesajı siz yazın' : ''}` : 'Beklenen sonucu siz seçin');
  const mevcutBul = (kosul) => {
    const s = senaryolar.find((x) => kosul(x.veri));
    return s ? { id: s.id, baslik: s.baslik } : null;
  };
  /** @type {any[]} */
  const oneriler = [];
  const kimlikler = new Set();
  function oneriEkle(o) {
    if (kimlikler.has(o.kimlik)) return;
    kimlikler.add(o.kimlik);
    const veri = { [sema.baslik]: o.baslik, ...o.veri };
    if (o.beklenen.tur === 'hata' && bs) {
      veri[bs.anahtar] = {
        tip: bs.hataTipi, ...(bs.adimAnahtari ? { [bs.adimAnahtari]: o.beklenen.adim } : {}), ...(bs.mesajAnahtari ? { [bs.mesajAnahtari]: o.beklenen.mesaj } : {})
      };
    }
    const eksikler = benzersiz(o.eksikler || []);
    oneriler.push({
      kimlik: o.kimlik, tur: o.tur, baslik: o.baslik, ozet: o.ozet, degisiklikler: o.degisiklikler, beklenen: o.beklenen, beklenenMetni: beklenenMetni(o.beklenen),
      veri, tabloSecimleri: kopya(tabloSecimleri), mevcut: o.mevcut, eksikler,
      eklenebilir: !o.mevcut && o.beklenen.tur !== 'belirsiz' && !eksikler.length
    });
  }

  // ---- 1) Zorunlu alanlar -------------------------------------------------------------------------------
  const bilesikZorunlu = [];
  for (const fa of formAlanlari) {
    if (fa.zorunlu !== true || fa.anahtar === sema.baslik) continue;
    if (!BASIT_TIPLER.includes(fa.tip)) { bilesikZorunlu.push(fa.etiket); continue; }
    if (!gorunurMu(tabanSonu.gr, fa)) continue;
    const veri = kopya(tabanVeri);
    if (fa.tip === 'onayKutusu') veri[fa.anahtar] = false; else delete veri[fa.anahtar];
    veri[BILEREK_BOS] = [fa.anahtar];
    const { eksikler } = sonlandir(veri, [fa.anahtar]);
    oneriEkle({
      tur: 'zorunlu', kimlik: `zorunlu:${fa.anahtar}`, baslik: `Zorunlu alan boş: ${fa.etiket}`,
      ozet: `"${fa.etiket}" ${fa.tip === 'onayKutusu' ? 'işaretsiz' : 'boş'} bırakılır; diğer alanlar ${tabanMetni}.`,
      degisiklikler: [{ etiket: fa.etiket, deger: fa.tip === 'onayKutusu' ? 'işaretsiz' : '(boş)' }],
      beklenen: hataBeklentisi(fa, true), veri, eksikler,
      mevcut: mevcutBul((v) => bilerekBos(v).includes(fa.anahtar))
    });
  }
  if (bilesikZorunlu.length) not('zorunlu', `Bileşik zorunlu alanlar için (${benzersiz(bilesikZorunlu).join(', ')}) boş alan önerisi üretilmez; gerekirse senaryoyu elle yazın.`);

  // ---- 2) Sınır değerleri (yalnız modeldeki kurallardan) ------------------------------------------------
  const kuralsiz = [];
  for (const fa of formAlanlari) {
    const h = hamAlan(fa);
    if (!['sayi', 'tarih', 'metin', 'telefon'].includes(h.tip) || fa.anahtar === sema.baslik || !BASIT_TIPLER.includes(fa.tip)) continue;
    const s = nesneMi(h.sinirlar) ? h.sinirlar : null;
    const kuralVar = s && ['enAz', 'enCok', 'enAzUzunluk', 'enCokUzunluk', 'desen'].some((k) => s[k] !== undefined);
    if (!kuralVar) { if (h.tip !== 'telefon') kuralsiz.push(fa.etiket); continue; }
    if (gizliMi(fa)) { not('sinir', `"${fa.etiket}" kişisel / gizli bir alan: sınır değeri üretilmez (tablodan ya da mevcut senaryodaki değeri kullanın).`); continue; }
    if (!gorunurMu(tabanSonu.gr, fa)) { not('sinir', `"${fa.etiket}" tabanda ekranda görünmüyor; sınır önerisi için önce koşulunu sağlayan bir senaryo gerekir.`); continue; }
    for (const a of sinirAdaylari(fa, h, s, tabanVeri[fa.anahtar])) {
      const veri = kopya(tabanVeri);
      veri[fa.anahtar] = a.deger;
      const { eksikler } = sonlandir(veri);
      const gosterilen = gosterim(fa, a.deger);
      oneriEkle({
        tur: 'sinir', kimlik: `sinir:${fa.anahtar}:${duz(a.deger)}`, baslik: `Sınır: ${fa.etiket} = ${gosterilen.length > 40 ? `${gosterilen.length} karakter` : gosterilen} (${a.etiket})`,
        ozet: `"${fa.etiket}" ${a.aciklama}; kural: ${a.kural}.${a.goreli ? ` Tarih bugüne göre hesaplandı (${tarihYaz(simdi, fa.bicim)}); ileride güncelleyin.` : ''}`,
        degisiklikler: [{ etiket: fa.etiket, deger: gosterilen }],
        beklenen: a.gecerli ? { tur: 'basari' } : hataBeklentisi(fa, false), veri, eksikler,
        mevcut: mevcutBul((v) => !bosMu(v[fa.anahtar]) && duz(v[fa.anahtar]) === duz(a.deger))
      });
    }
  }
  if (kuralsiz.length) {
    not('sinir', `Sınır kuralı tanımlı olmayan alanlar: ${benzersiz(kuralsiz).join(', ')}. Modelde alana kural ("sinirlar": en az / en çok, uzunluk, tarih aralığı, desen) eklenirse sınır değer önerileri üretilir; kural olmadan değer tahmin edilmez.`);
  }

  /** Sınır adayları: { deger, etiket, aciklama, kural, gecerli, goreli? }. */
  function sinirAdaylari(fa, h, s, tabanDeger) {
    /** @type {any[]} */
    const liste = [];
    const ekle = (x) => { if (!liste.some((y) => duz(y.deger) === duz(x.deger))) liste.push(x); };
    if (h.tip === 'sayi') {
      const alt = typeof s.enAz === 'number' ? s.enAz : null;
      const ust = typeof s.enCok === 'number' ? s.enCok : null;
      if (alt === null && ust === null) return liste;
      const artis = typeof s.artis === 'number' && s.artis > 0 ? s.artis : 1;
      const ondalik = Math.max(...[artis, alt ?? 0, ust ?? 0].map((n) => (String(n).split('.')[1] || '').length));
      const yuvarla = (n) => Number(n.toFixed(ondalik));
      const kural = [alt !== null ? `en az ${alt}` : null, ust !== null ? `en çok ${ust}` : null].filter(Boolean).join(', ');
      const gecerli = (n) => (alt === null || n >= alt) && (ust === null || n <= ust);
      const noktalar = [
        ...(alt !== null ? [[alt - artis, 'alt sınır − 1'], [alt, 'alt sınır'], [alt + artis, 'alt sınır + 1']] : []),
        ...(ust !== null ? [[ust - artis, 'üst sınır − 1'], [ust, 'üst sınır'], [ust + artis, 'üst sınır + 1']] : [])
      ];
      for (const [n, etiket] of noktalar) {
        const d = yuvarla(n);
        ekle({ deger: d, etiket, aciklama: `= ${d} (${etiket}; ${gecerli(d) ? 'geçerli' : 'geçersiz'})`, kural, gecerli: gecerli(d) });
      }
      return liste;
    }
    if (h.tip === 'tarih') {
      const alt = s.enAz !== undefined ? tarihCoz(s.enAz, simdi) : null;
      const ust = s.enCok !== undefined ? tarihCoz(s.enCok, simdi) : null;
      if (!alt && !ust) return liste;
      const kural = [alt ? `en erken ${s.enAz}` : null, ust ? `en geç ${s.enCok}` : null].filter(Boolean).join(', ');
      const gecerli = (t) => (!alt || gunSayisi(t) >= gunSayisi(alt.tarih)) && (!ust || gunSayisi(t) <= gunSayisi(ust.tarih));
      const noktalar = [
        ...(alt ? [[gunEkle(alt.tarih, -1), 'en erken − 1 gün', alt.goreli], [alt.tarih, 'en erken', alt.goreli], [gunEkle(alt.tarih, 1), 'en erken + 1 gün', alt.goreli]] : []),
        ...(ust ? [[gunEkle(ust.tarih, -1), 'en geç − 1 gün', ust.goreli], [ust.tarih, 'en geç', ust.goreli], [gunEkle(ust.tarih, 1), 'en geç + 1 gün', ust.goreli]] : [])
      ];
      for (const [t, etiket, goreli] of noktalar) {
        const d = tarihYaz(t, fa.bicim);
        ekle({ deger: d, etiket, aciklama: `= ${d} (${etiket}; ${gecerli(t) ? 'geçerli' : 'geçersiz'})`, kural, gecerli: gecerli(t), goreli });
      }
      return liste;
    }
    // metin: uzunluk (+ desen)
    const n = Number.isInteger(s.enAzUzunluk) ? s.enAzUzunluk : null;
    const m = Number.isInteger(s.enCokUzunluk) ? s.enCokUzunluk : null;
    let desen = null;
    if (typeof s.desen === 'string' && s.desen) { try { desen = new RegExp(`^(?:${s.desen})$`, 'u'); } catch { desen = null; } }
    if (n === null && m === null) {
      if (desen) not('sinir', `"${fa.etiket}" için yalnız desen kuralı var: desene uyan / uymayan değer üretilmez; örnekleri siz yazın.`);
      return liste;
    }
    const kural = [n !== null ? `en az ${n} karakter` : null, m !== null ? `en çok ${m} karakter` : null, desen ? `desen /${s.desen}/` : null].filter(Boolean).join(', ');
    const tohum = typeof tabanDeger === 'string' && tabanDeger.trim() && !tabloBasvurusuMu(tabanDeger) ? tabanDeger.trim() : 'a';
    const dolgu = (uzunluk) => tohum.repeat(Math.ceil(uzunluk / tohum.length)).slice(0, uzunluk);
    const uzunlukGecerli = (u) => (n === null || u >= n) && (m === null || u <= m);
    const noktalar = [
      ...(n !== null ? [[n - 1, 'en kısa − 1'], [n, 'en kısa'], [n + 1, 'en kısa + 1']] : []),
      ...(m !== null ? [[m - 1, 'en uzun − 1'], [m, 'en uzun'], [m + 1, 'en uzun + 1']] : [])
    ];
    let desenSorunu = false;
    for (const [u, etiket] of noktalar) {
      if (u < 1) continue; // 0 karakter = boş: zorunlu alan önerisinin konusu
      const d = dolgu(u);
      const uzunlukOk = uzunlukGecerli(u);
      if (uzunlukOk && desen && !desen.test(d)) { desenSorunu = true; continue; }
      ekle({ deger: d, etiket, aciklama: `${u} karakter (${etiket}; ${uzunlukOk ? 'geçerli' : 'geçersiz'})`, kural, gecerli: uzunlukOk });
    }
    if (desenSorunu) not('sinir', `"${fa.etiket}": geçerli uzunlukta desene uyan örnek üretilemedi; o değerleri siz yazın.`);
    return liste;
  }

  // ---- 3) Koşullu alanlar ve bağımlı listeler -------------------------------------------------------------
  const yonetenAlanlar = new Set();
  const yonetenAyarlar = new Set();
  const gorunurlukIfadesi = (gr) => (!nesneMi(gr) ? null : typeof gr.kosul === 'string' ? model.kosullar && model.kosullar[gr.kosul] && model.kosullar[gr.kosul].ifade : gr.ifade);
  for (const adim of adimlar) {
    ifadeBasvurulari(gorunurlukIfadesi(adim.gorunurluk), yonetenAlanlar, yonetenAyarlar);
    for (const b of Array.isArray(adim.bolumler) ? adim.bolumler : []) {
      if (!nesneMi(b)) continue;
      ifadeBasvurulari(gorunurlukIfadesi(b.gorunurluk), yonetenAlanlar, yonetenAyarlar);
      for (const a of Array.isArray(b.alanlar) ? b.alanlar : []) if (nesneMi(a)) ifadeBasvurulari(gorunurlukIfadesi(a.gorunurluk), yonetenAlanlar, yonetenAyarlar);
    }
  }
  for (const a of nesneMi(model.senaryoDuzeyi) && Array.isArray(model.senaryoDuzeyi.alanlar) ? model.senaryoDuzeyi.alanlar : []) {
    if (nesneMi(a)) ifadeBasvurulari(gorunurlukIfadesi(a.gorunurluk), yonetenAlanlar, yonetenAyarlar);
  }
  for (const fa of formAlanlari) if (fa.tip === 'secim' && fa.bagimlilik) yonetenAlanlar.add(fa.bagimlilik.alan);
  /** Yöneten: { fa (form alanı ya da adım kapsamı ayarı), degerler }. */
  const yonetenler = [];
  for (const id of yonetenAlanlar) {
    const fa = formAlanlari.find((x) => x.id === id) || formAlanlari.find((x) => x.anahtar === id);
    if (!fa || gizliMi(fa)) continue;
    if (fa.tip === 'onayKutusu') yonetenler.push({ fa, degerler: [true, false] });
    else if (fa.tip === 'secim') {
      // Bağımlı seçim: tabandaki üst değerin listesi.
      const ust = fa.bagimlilik ? formAlanlari.find((x) => x.id === fa.bagimlilik.alan) : null;
      const liste = fa.bagimlilik ? (ust && fa.bagimlilik.harita[duz(tabanVeri[ust.anahtar])]) || [] : fa.secenekler || [];
      if (liste.length > KOSUL_DAL_SINIRI) not('kosullu', `"${fa.etiket}" alanının ${liste.length} seçeneği var; ilk ${KOSUL_DAL_SINIRI} dal önerildi.`);
      if (liste.length) yonetenler.push({ fa, degerler: liste.slice(0, KOSUL_DAL_SINIRI).map((x) => x.deger) });
    }
  }
  for (const id of yonetenAyarlar) {
    const k = sema.adimKapsami.find((x) => x.alanId === id || x.ayar === id);
    if (k && !yonetenler.some((y) => y.fa.anahtar === k.ayar)) yonetenler.push({ fa: { id: k.alanId, anahtar: k.ayar, etiket: k.etiket, tip: 'onayKutusu', zorunlu: false, adimId: null }, degerler: [true, false] });
  }
  for (const { fa, degerler } of yonetenler) {
    const dallar = degerler.map((v) => {
      const veri = kopya(tabanVeri);
      veri[fa.anahtar] = v;
      bagimlilariAyarla(veri, fa);
      return { v, veri, gr: gorunurluk(veri) };
    });
    const digerleri = formAlanlari.filter((x) => x.id !== fa.id);
    const etkilenen = digerleri.filter((x) => new Set(dallar.map((d) => gorunurMu(d.gr, x))).size > 1);
    const etkilenenAdimlar = sema.adimlar.filter((a) => new Set(dallar.map((d) => d.gr.adimlar[a.id] !== false)).size > 1);
    const bagliListeler = bagimlilar(fa);
    if (!etkilenen.length && !etkilenenAdimlar.length && !bagliListeler.length) continue;
    const metin = (v) => (fa.tip === 'onayKutusu' ? (v ? 'işaretli' : 'işaretsiz') : secenekMetni(fa, v));
    for (const d of dallar) {
      const gorunen = etkilenen.filter((x) => gorunurMu(d.gr, x));
      const gorunmeyen = etkilenen.filter((x) => !gorunurMu(d.gr, x));
      const zorunlular = gorunen.filter((x) => x.zorunlu === true);
      const { eksikler } = sonlandir(d.veri);
      const parcalar = [
        gorunen.length ? `görünür: ${gorunen.map((x) => x.etiket).join(', ')}` : null,
        gorunmeyen.length ? `görünmez: ${gorunmeyen.map((x) => x.etiket).join(', ')}` : null,
        ...etkilenenAdimlar.map((a) => `"${a.baslik}" adımı ${d.gr.adimlar[a.id] === false ? 'koşulmaz' : 'koşulur'}`),
        zorunlular.length ? `bu dalda zorunlu: ${zorunlular.map((x) => x.etiket).join(', ')}` : null,
        ...bagliListeler.map((b) => {
          const liste = b.bagimlilik.harita[duz(d.v)] || [];
          return `${b.etiket} seçenekleri: ${liste.length ? liste.slice(0, 6).map((x) => x.metin).join(', ') + (liste.length > 6 ? ` (+${liste.length - 6})` : '') : 'yok'}`;
        })
      ].filter(Boolean);
      oneriEkle({
        tur: 'kosullu', kimlik: `kosullu:${fa.anahtar}=${duz(d.v)}`, baslik: `Koşul: ${fa.etiket} = ${metin(d.v)}`,
        ozet: `"${fa.etiket}" ${metin(d.v)} seçilince ${parcalar.join('; ')}.`,
        degisiklikler: [{ etiket: fa.etiket, deger: metin(d.v) }, ...bagliListeler.filter((b) => !bosMu(d.veri[b.anahtar])).map((b) => ({ etiket: b.etiket, deger: gosterim(b, d.veri[b.anahtar]) }))],
        beklenen: { tur: 'basari' }, veri: d.veri, eksikler,
        mevcut: mevcutBul((v) => (fa.tip === 'onayKutusu' ? (v[fa.anahtar] === true) === (d.v === true) : !bosMu(v[fa.anahtar]) && duz(v[fa.anahtar]) === duz(d.v)))
      });
    }
  }

  // ---- 4) Eksik kombinasyonlar --------------------------------------------------------------------------
  const secenekSayisi = (fa) => (fa.bagimlilik ? Math.max(0, ...Object.values(fa.bagimlilik.harita).map((l) => l.length)) : (fa.secenekler || []).length);
  const secilebilir = formAlanlari.filter((fa) => fa.tip === 'secim' && !gizliMi(fa) && secenekSayisi(fa) > 0)
    .map((fa) => ({ id: fa.id, etiket: fa.etiket, secenekSayisi: secenekSayisi(fa) }));
  const istenen = benzersiz(Array.isArray(g.kombinasyonAlanlari) ? g.kombinasyonAlanlari : []).filter((id) => secilebilir.some((x) => x.id === id));
  if (istenen.length > KOMBINASYON_ALAN_SINIRI) not('kombinasyon', `Kombinasyonda en çok ${KOMBINASYON_ALAN_SINIRI} alan kullanılır; ilk ${KOMBINASYON_ALAN_SINIRI} alan alındı.`);
  const seciliAlanlar = formAlanlari.filter((fa) => istenen.slice(0, KOMBINASYON_ALAN_SINIRI).includes(fa.id));
  const kombinasyon = { secilebilir, secili: seciliAlanlar.map((x) => x.id), alanSiniri: KOMBINASYON_ALAN_SINIRI, ustSinir: KOMBINASYON_UST_SINIRI, toplam: 0, mevcut: 0, eksik: 0, gecersiz: 0, listelenen: 0, kesildi: false, cokFazla: false };
  if (seciliAlanlar.length >= 2) {
    const secenekleri = (fa, degerler) => {
      if (!fa.bagimlilik) return fa.secenekler || [];
      const ust = formAlanlari.find((x) => x.id === fa.bagimlilik.alan);
      const ustDeger = ust ? (ust.anahtar in degerler ? degerler[ust.anahtar] : tabanVeri[ust.anahtar]) : undefined;
      return fa.bagimlilik.harita[duz(ustDeger)] || [];
    };
    const sayac = (i, degerler) => {
      if (i === seciliAlanlar.length) return 1;
      let t = 0;
      for (const s of secenekleri(seciliAlanlar[i], degerler)) {
        t += sayac(i + 1, { ...degerler, [seciliAlanlar[i].anahtar]: s.deger });
        if (t > KOMBINASYON_HESAP_SINIRI) return t;
      }
      return t;
    };
    kombinasyon.toplam = sayac(0, {});
    if (kombinasyon.toplam > KOMBINASYON_HESAP_SINIRI) {
      kombinasyon.cokFazla = true;
      not('kombinasyon', `Seçilen alanlarla ${KOMBINASYON_HESAP_SINIRI}'den fazla kombinasyon çıkıyor; hesaplanmadı. Daha az seçenekli alanlar seçin.`);
    } else {
      /** @type {Array<Record<string, string>>} */
      const tumu = [];
      const uret = (i, degerler) => {
        if (i === seciliAlanlar.length) { tumu.push(degerler); return; }
        for (const s of secenekleri(seciliAlanlar[i], degerler)) uret(i + 1, { ...degerler, [seciliAlanlar[i].anahtar]: s.deger });
      };
      uret(0, {});
      const eksikList = [];
      const mevcutList = [];
      for (const k of tumu) {
        const veri = kopya(tabanVeri);
        Object.assign(veri, k);
        for (const fa of seciliAlanlar) bagimlilariAyarla(veri, fa, new Set(seciliAlanlar.map((x) => x.id)));
        const gr = gorunurluk(veri);
        const seciliKeys = seciliAlanlar.map((x) => x.anahtar);
        const gecersiz = seciliAlanlar.some((fa) => !gorunurMu(gr, fa))
          || Boolean(g.dogrula && g.dogrula({ [sema.baslik]: 'x', ...veri }).hatalar.some((h) => seciliKeys.includes(String(h.alan).split('.')[0])));
        if (gecersiz) { kombinasyon.gecersiz++; continue; }
        const mevcut = mevcutBul((v) => seciliAlanlar.every((fa) => duz(v[fa.anahtar]) === duz(k[fa.anahtar])));
        (mevcut ? mevcutList : eksikList).push({ k, veri, mevcut });
      }
      kombinasyon.mevcut = mevcutList.length;
      kombinasyon.eksik = eksikList.length;
      const liste = [...eksikList.slice(0, KOMBINASYON_UST_SINIRI), ...mevcutList].slice(0, KOMBINASYON_UST_SINIRI);
      kombinasyon.listelenen = liste.length;
      kombinasyon.kesildi = eksikList.length + mevcutList.length > liste.length;
      if (kombinasyon.kesildi) not('kombinasyon', `${eksikList.length} eksik kombinasyon var; en çok ${KOMBINASYON_UST_SINIRI} öneri listelenir (üst sınır). Alan ya da seçenek sayısını azaltın.`);
      for (const { k, veri, mevcut } of liste) {
        const parcalar = seciliAlanlar.map((fa) => `${fa.etiket} = ${secenekMetni(fa, k[fa.anahtar])}`);
        const { eksikler } = sonlandir(veri);
        oneriEkle({
          tur: 'kombinasyon', kimlik: `kombinasyon:${seciliAlanlar.map((fa) => `${fa.anahtar}=${k[fa.anahtar]}`).join('|')}`, baslik: `Kombinasyon: ${parcalar.join(', ')}`,
          ozet: `${parcalar.join(', ')}; diğer alanlar ${tabanMetni}.`,
          degisiklikler: seciliAlanlar.map((fa) => ({ etiket: fa.etiket, deger: secenekMetni(fa, k[fa.anahtar]) })),
          beklenen: { tur: 'basari' }, veri, eksikler, mevcut
        });
      }
    }
  }

  return { taban, oneriler, notlar, kombinasyon };
}
