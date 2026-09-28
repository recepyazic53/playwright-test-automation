// MODEL TABANLI SENARYO FORMU (genel, saf fonksiyonlar) — ekran modelinden (platformda
// ekran_modelleri.model_json; şema: docs/sayfa-paketi.md) oluşturma/düzenleme formunun ŞEMASINI kurar,
// form değerlerini modelin senaryo biçimine çevirir, tek doğrulayıcının (senaryo-dogrulayici.mjs)
// alan bazlı hatalarını form kontrollerine dağıtır ve beklenen sonuç rozetini üretir.
//
// Kurallar:
//  - HİÇBİR projeye/ürüne özgü ad içermez: adımlar, bölümler, alanlar, seçenekler, görünürlük
//    koşulları, zorunluluk, "adım kapsamı" (isteğe bağlı adımlar) ve beklenen sonuç varyantları
//    yalnızca modelden okunur.
//  - Import YOK, DOM YOK: platform arayüzü bu dosyayı olduğu gibi /arayuz/model-formu.mjs olarak
//    yükler; Node (sunucu, birim testleri) aynı dosyayı kullanır.
//  - Görünürlük hesaplamaz: koşul değerlendirmesi tek doğrulayıcıdadır (gorunurlukleriHesapla);
//    burada yalnızca o sonucun nasıl uygulanacağı vardır.
// Tipler: model-formu.d.mts.

// ---- Küçük yardımcılar --------------------------------------------------------------------

function nesneMi(d) {
  return typeof d === 'object' && d !== null && !Array.isArray(d);
}
function bosMu(d) {
  return d === undefined || d === null || (typeof d === 'string' && d.trim() === '');
}
function kopya(d) {
  return d === undefined ? undefined : JSON.parse(JSON.stringify(d));
}
/** Değerin tamamı test verisi tablosu başvurusu mu ("${Tablo.Sütun}"; tam ayrıştırma senaryo-dogrulayici.mjs'dedir). */
function tabloBasvurusuMu(d) {
  return typeof d === 'string' && /^\s*\$\{[^{}]+\.[^{}]+\}\s*$/u.test(d);
}
function senaryoAnahtarlari(alan) {
  const s = alan && alan.eslesme && alan.eslesme.senaryo;
  if (s === undefined || s === null) return [];
  return Array.isArray(s) ? s : [s];
}
function etiketi(alan) {
  const e = alan.etiket;
  return (e && typeof e === 'object' && e.form) || (alan.form && alan.form.etiket) || (e && typeof e === 'object' && e.ekran) || alan.id;
}
/** Model seçeneği → form seçeneği (değer: senaryoya yazılan değer; metin: formda görünen). */
function secenekCevir(s) {
  const deger = s.senaryoDegeri !== undefined ? s.senaryoDegeri : s.deger;
  return { deger: String(deger), metin: String(s.formMetni || s.metin || deger), ...(typeof s.kosul === 'string' ? { kosul: s.kosul } : {}) };
}
const secenekListesi = (liste) => (Array.isArray(liste) ? liste.map(secenekCevir) : null);

// ---- Akışlar (ekran başına birden çok akış) -------------------------------------------------
// model.akislar: [{ id, ad, varsayilan?: true, adimlar }]. Varsayılan akışın adımları model.adimlar'dır (ikisi aynı tutulur;
// akış bilmeyen okuyucular — kodlu testler, eski modeller — model.adimlar'ı okumaya devam eder). akislar yoksa tek, örtük
// "Ana akış" vardır. Senaryo akışını içeriğinde tutar (icerik.akis); yoksa ya da akış silinmişse varsayılan akış.

/** Örtük (akislar yokken) tek akışın kimliği. */
export const ANA_AKIS_ID = 'ana';

// ---- Ortak akışlar ---------------------------------------------------------------------------
// Ekran akışındaki { ortakAkis: { dosya } } adımı, ortak akışın ("tur": "ortakAkis", ör. ödeme) adımlarıyla yer değiştirir.
// Form, doğrulama ve koşu bu AÇILMIŞ (düz) modeli görür. Açılan adımın kimliği "<başvuru adımı>_<ortak adım>"; başvuru
// adımının görünürlüğü (ör. "ödeme dahil") her açılan adıma eklenir (ortak adımın kendi koşuluyla "ve"). Ortak akışın
// koşulları çakışmasın diye "<ortak akış id>_<ad>" adıyla taşınır. Ortak akış "yalnizTestOrtami" ise açılan adımlar
// "yalnizTest" işaretlenir (koşucu canlı ortamda atlar).

/**
 * @param {any} model ekran modeli (bir akışın) @param {Record<string, any>} ortakAkislar dosya → ortak akış modeli
 * @returns {{ model: any; eksikler: string[] }} açılmış model (girdi değişmez) ve bulunamayan ortak akış dosyaları
 */
export function ortakAkislariAc(model, ortakAkislar) {
  const adimlar = nesneMi(model) && Array.isArray(model.adimlar) ? model.adimlar : [];
  if (!adimlar.some((a) => nesneMi(a) && nesneMi(a.ortakAkis))) return { model, eksikler: [] };
  const yeni = kopya(model);
  yeni.kosullar = nesneMi(yeni.kosullar) ? yeni.kosullar : {};
  const sdAlanlar = nesneMi(yeni.senaryoDuzeyi) && Array.isArray(yeni.senaryoDuzeyi.alanlar) ? yeni.senaryoDuzeyi.alanlar : [];
  /** @type {string[]} */
  const eksikler = [];
  /** @type {any[]} */
  const sonuc = [];
  /** Görünürlüğün ifadesi (adlandırılmış koşul çözülür). @param {any} g @param {Record<string, any>} kosullar */
  const ifadesi = (g, kosullar) => (!nesneMi(g) ? null : typeof g.kosul === 'string' ? (nesneMi(kosullar[g.kosul]) ? kosullar[g.kosul].ifade : null) : g.ifade ?? null);
  for (const adim of yeni.adimlar) {
    if (!nesneMi(adim) || !nesneMi(adim.ortakAkis)) { sonuc.push(adim); continue; }
    const ortak = ortakAkislar ? ortakAkislar[adim.ortakAkis.dosya] : undefined;
    if (!nesneMi(ortak) || ortak.tur !== 'ortakAkis' || !Array.isArray(ortak.adimlar)) {
      // Bulunamayan ortak akış: yer tutucu adım kalır (koşu planı açık hatayla durur; sessizce atlanmaz).
      eksikler.push(String(adim.ortakAkis.dosya));
      sonuc.push({ id: adim.id, sira: 0, baslik: adim.baslik || 'Ortak akış', eksikOrtakAkis: String(adim.ortakAkis.dosya), ...(adim.gorunurluk ? { gorunurluk: adim.gorunurluk } : {}), bolumler: [] });
      continue;
    }
    const on = String(ortak.id || 'ortak');
    // Ortak akışın koşulları ön ekle taşınır; açılan adım/alanlardaki "kosul" başvuruları yeniden adlandırılır.
    const adlar = new Map(Object.keys(nesneMi(ortak.kosullar) ? ortak.kosullar : {}).map((ad) => [ad, `${on}_${ad}`]));
    for (const [ad, yeniAd] of adlar) yeni.kosullar[yeniAd] = kopya(ortak.kosullar[ad]);
    const yenidenAdlandir = (/** @type {any} */ d) => {
      if (Array.isArray(d)) { d.forEach(yenidenAdlandir); return; }
      if (!nesneMi(d)) return;
      for (const [k, v] of Object.entries(d)) {
        if (k === 'kosul' && typeof v === 'string' && adlar.has(v)) d[k] = adlar.get(v);
        else yenidenAdlandir(v);
      }
    };
    const basvuruIfadesi = ifadesi(adim.gorunurluk, yeni.kosullar);
    for (const a of ortak.adimlar) {
      if (!nesneMi(a)) continue;
      const kopyaAdim = kopya(a);
      yenidenAdlandir(kopyaAdim);
      kopyaAdim.id = `${adim.id}_${a.id}`;
      if (basvuruIfadesi) {
        const kendi = ifadesi(kopyaAdim.gorunurluk, yeni.kosullar);
        kopyaAdim.gorunurluk = { ifade: kendi ? { ve: [kopya(basvuruIfadesi), kendi] } : kopya(basvuruIfadesi) };
      }
      if (ortak.yalnizTestOrtami === true) kopyaAdim.yalnizTest = true;
      kopyaAdim.ortakAkisAdi = String(ortak.ad || on);
      sonuc.push(kopyaAdim);
    }
    // Ortak akışın senaryo düzeyi alanları (ör. kart profili) eklenir (aynı kimlikli alan varsa ekranınki geçerli).
    const sd = nesneMi(ortak.senaryoDuzeyi) && Array.isArray(ortak.senaryoDuzeyi.alanlar) ? ortak.senaryoDuzeyi.alanlar : [];
    for (const alan of sd) {
      if (!nesneMi(alan) || sdAlanlar.some((x) => nesneMi(x) && x.id === alan.id)) continue;
      const k = kopya(alan);
      yenidenAdlandir(k);
      sdAlanlar.push(k);
    }
  }
  sonuc.forEach((a, i) => { if (nesneMi(a)) a.sira = i + 1; });
  yeni.adimlar = sonuc;
  // Ortak akışın kabul edilen uyarıları olan adımları, ekranın "Beklenen sonuç" alanında hata adımı olarak seçilebilir.
  const bsAlani = sdAlanlar.find((a) => nesneMi(a) && a.tip === 'birlesim' && a.yapilandirma === 'senaryo');
  const uyarili = sonuc.filter((a) => nesneMi(a) && typeof a.ortakAkisAdi === 'string' && nesneMi(a.kosu) && Array.isArray(a.kosu.uyarilar) && a.kosu.uyarilar.length);
  if (bsAlani && uyarili.length) {
    for (const v of Array.isArray(bsAlani.varyantlar) ? bsAlani.varyantlar : []) {
      if (!nesneMi(v) || !nesneMi(v.alanlar)) continue;
      const adimAdi = Object.keys(v.alanlar).find((ad) => nesneMi(v.alanlar[ad]) && Array.isArray(v.alanlar[ad].secenekler));
      if (!adimAdi) continue;
      const liste = v.alanlar[adimAdi].secenekler;
      for (const a of uyarili) if (!liste.some((s) => nesneMi(s) && s.deger === a.id)) liste.push({ deger: a.id, metin: `${a.ortakAkisAdi}: ${a.baslik || a.id}` });
    }
  }
  yeni.senaryoDuzeyi = { ...(nesneMi(yeni.senaryoDuzeyi) ? yeni.senaryoDuzeyi : {}), alanlar: sdAlanlar };
  return { model: yeni, eksikler };
}

/** Ekranın akışları: [{ id, ad, varsayilan, adimSayisi }] (varsayılan önce). */
export function akisListesi(model) {
  if (!nesneMi(model)) return [];
  if (!Array.isArray(model.akislar) || !model.akislar.length) {
    return [{ id: ANA_AKIS_ID, ad: 'Ana akış', varsayilan: true, adimSayisi: Array.isArray(model.adimlar) ? model.adimlar.length : 0 }];
  }
  const liste = model.akislar.filter(nesneMi).map((a) => ({
    id: String(a.id), ad: String(a.ad || a.id), varsayilan: a.varsayilan === true, adimSayisi: Array.isArray(a.adimlar) ? a.adimlar.length : 0
  }));
  return [...liste.filter((a) => a.varsayilan), ...liste.filter((a) => !a.varsayilan)];
}

/** Varsayılan akışın kimliği. */
export function varsayilanAkisId(model) {
  const liste = akisListesi(model);
  return liste.length ? liste[0].id : ANA_AKIS_ID;
}

/**
 * Seçilen akışın modeli: model, adımları o akışın adımlarıyla (akislar alanı olmadan). O akışta olmayan adımlara bağlı iş
 * kuralları ve olmayan alanlara bağlı bağlam görünürlükleri çıkarılır. Bilinmeyen / boş akış kimliği: varsayılan akış.
 * Akış bilmeyen okuyucular (form şeması, doğrulayıcı, koşu planı, diyagram) bu modelle aynen çalışır.
 */
export function akisModeli(model, akisId) {
  if (!nesneMi(model) || !Array.isArray(model.akislar) || !model.akislar.length) return model;
  const akislar = model.akislar.filter(nesneMi);
  const akis = (akisId && akislar.find((a) => a.id === akisId)) || akislar.find((a) => a.varsayilan === true) || akislar[0];
  const kopyaModel = { ...model };
  delete kopyaModel.akislar;
  const adimlar = Array.isArray(akis && akis.adimlar) ? akis.adimlar : [];
  const adimIdleri = new Set(adimlar.map((a) => nesneMi(a) ? a.id : null));
  const alanIdleri = new Set();
  const topla = (liste) => { for (const a of Array.isArray(liste) ? liste : []) if (nesneMi(a) && typeof a.id === 'string') alanIdleri.add(a.id); };
  for (const adim of adimlar) for (const b of nesneMi(adim) && Array.isArray(adim.bolumler) ? adim.bolumler : []) topla(nesneMi(b) ? b.alanlar : null);
  topla(nesneMi(model.senaryoDuzeyi) ? model.senaryoDuzeyi.alanlar : null);
  const sonuc = { ...kopyaModel, adimlar };
  if (Array.isArray(model.isKurallari)) sonuc.isKurallari = model.isKurallari.filter((k) => !nesneMi(k) || typeof k.adim !== 'string' || adimIdleri.has(k.adim));
  if (nesneMi(model.baglamGorunurlugu) && nesneMi(model.baglamGorunurlugu.alanlar)) {
    sonuc.baglamGorunurlugu = {
      ...model.baglamGorunurlugu,
      alanlar: Object.fromEntries(Object.entries(model.baglamGorunurlugu.alanlar).filter(([id]) => alanIdleri.has(id)))
    };
  }
  if (nesneMi(model.urunDuzeyi)) {
    sonuc.urunDuzeyi = Object.fromEntries(Object.entries(model.urunDuzeyi).map(([ad, d]) => (
      nesneMi(d) && typeof d.kullanan === 'string' && !alanIdleri.has(d.kullanan) ? [ad, Object.fromEntries(Object.entries(d).filter(([k]) => k !== 'kullanan'))] : [ad, d]
    )));
  }
  // Başka akışların adım kapsamı ayarları (senaryoAyari) bu akışın senaryo düzeyinde görünmez.
  const kosulIfadesi = (g) => (nesneMi(g) ? (typeof g.kosul === 'string' ? (nesneMi(model.kosullar) && nesneMi(model.kosullar[g.kosul]) ? model.kosullar[g.kosul].ifade : null) : g.ifade) : null);
  const ayarlar = (ifade, kume) => {
    if (!nesneMi(ifade)) return kume;
    if (typeof ifade.senaryoAyari === 'string') kume.add(ifade.senaryoAyari);
    for (const alt of [...(Array.isArray(ifade.ve) ? ifade.ve : []), ...(Array.isArray(ifade.veya) ? ifade.veya : []), ...(ifade.degil ? [ifade.degil] : [])]) ayarlar(alt, kume);
    return kume;
  };
  const tumAyarlar = new Set();
  for (const k of nesneMi(model.kosullar) ? Object.values(model.kosullar) : []) ayarlar(nesneMi(k) ? k.ifade : null, tumAyarlar);
  const buAkis = new Set();
  for (const adim of adimlar) {
    if (!nesneMi(adim)) continue;
    ayarlar(kosulIfadesi(adim.gorunurluk), buAkis);
    for (const b of Array.isArray(adim.bolumler) ? adim.bolumler : []) {
      if (!nesneMi(b)) continue;
      ayarlar(kosulIfadesi(b.gorunurluk), buAkis);
      for (const a of Array.isArray(b.alanlar) ? b.alanlar : []) if (nesneMi(a)) ayarlar(kosulIfadesi(a.gorunurluk), buAkis);
    }
  }
  if (nesneMi(model.senaryoDuzeyi) && Array.isArray(model.senaryoDuzeyi.alanlar)) {
    sonuc.senaryoDuzeyi = { ...model.senaryoDuzeyi, alanlar: model.senaryoDuzeyi.alanlar.filter((a) => !nesneMi(a) || !tumAyarlar.has(a.id) || buAkis.has(a.id)) };
  }
  // Bu akışta olmayan ayarlara bağlı koşullar (başka akışın isteğe bağlı adımları) da çıkarılır.
  if (nesneMi(model.kosullar)) {
    sonuc.kosullar = Object.fromEntries(Object.entries(model.kosullar).filter(([, k]) => ![...ayarlar(nesneMi(k) ? k.ifade : null, new Set())].some((a) => !buAkis.has(a))));
  }
  return sonuc;
}

/**
 * Varsayılan akışın adımlarını model.adimlar ile eşitler (model.adimlar'ı değiştiren eski yazıcılar — tekrar analiz,
 * bulgular, adres değişikliği — sonrasında; kaynak model.adimlar'dır). Modeli yerinde değiştirir ve döner.
 */
export function akislariEsitle(model) {
  if (nesneMi(model) && Array.isArray(model.akislar)) {
    model.akislar = model.akislar.map((a) => (nesneMi(a) && a.varsayilan === true ? { ...a, adimlar: model.adimlar } : a));
  }
  return model;
}

/** Türkçe duyarsız arama için sadeleştirme ("İLK ATEŞ" = "ilk ates"). */
export function aramaIcinSadelestir(metin) {
  return String(metin == null ? '' : metin)
    .toLocaleLowerCase('tr-TR')
    .replace(/ı/g, 'i').replace(/ş/g, 's').replace(/ğ/g, 'g').replace(/ü/g, 'u').replace(/ö/g, 'o').replace(/ç/g, 'c')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

/** Tüm arama sözcükleri metinde geçiyor mu? (Türkçe duyarsız) */
export function aramaEslesiyorMu(arama, ...metinler) {
  const sozcukler = aramaIcinSadelestir(arama).split(/\s+/).filter(Boolean);
  if (!sozcukler.length) return true;
  const hedef = aramaIcinSadelestir(metinler.filter((m) => m != null).join(' '));
  return sozcukler.every((s) => hedef.includes(s));
}

// ---- Şema ------------------------------------------------------------------------------

/**
 * Adlandırılmış koşul "senaryo ayarı X true" mu? (ör. { senaryoAyari: "odemeAdimiDahil", esit: true })
 * Öyleyse ayarın alan kimliğini döner: o koşula bağlı adımlar isteğe bağlıdır ("adım kapsamı").
 */
function ayarKosulu(model, gorunurluk) {
  if (!gorunurluk) return null;
  const ifade = typeof gorunurluk.kosul === 'string'
    ? model.kosullar && model.kosullar[gorunurluk.kosul] && model.kosullar[gorunurluk.kosul].ifade
    : gorunurluk.ifade;
  return nesneMi(ifade) && typeof ifade.senaryoAyari === 'string' && ifade.esit === true ? ifade.senaryoAyari : null;
}

/** Görünürlüğün ifadesi (adlandırılmış koşul çözülür). @param {any} model @param {any} gorunurluk */
function gorunurlukIfadesi(model, gorunurluk) {
  if (!nesneMi(gorunurluk)) return null;
  if (typeof gorunurluk.kosul === 'string') return model.kosullar && model.kosullar[gorunurluk.kosul] ? model.kosullar[gorunurluk.kosul].ifade : null;
  return gorunurluk.ifade ?? null;
}

/** İfadede geçen senaryo ayarları (ve / veya / değil içinde de). @param {any} ifade @returns {Set<string>} */
function ayarlariTopla(ifade, sonuc = new Set()) {
  if (!nesneMi(ifade)) return sonuc;
  if (typeof ifade.senaryoAyari === 'string') sonuc.add(ifade.senaryoAyari);
  for (const alt of [...(Array.isArray(ifade.ve) ? ifade.ve : []), ...(Array.isArray(ifade.veya) ? ifade.veya : []), ...(ifade.degil ? [ifade.degil] : [])]) ayarlariTopla(alt, sonuc);
  return sonuc;
}

/** Kimlik parçasının (altAlan) senaryodaki alt anahtarı; kimlik türüne göre değişebilir. */
function kimlikAlaniAdi(alt, tur) {
  const k = alt.eslesme && alt.eslesme.kimlikAlani;
  if (typeof k === 'string') return k;
  if (nesneMi(k) && tur && typeof k[tur] === 'string') return k[tur];
  return null;
}

function altModelBolumu(altModeller, basvuru) {
  const alt = basvuru && altModeller ? altModeller[basvuru.dosya] : null;
  return alt && Array.isArray(alt.bolumler) ? alt.bolumler.find((b) => b.id === basvuru.bolum) || null : null;
}

/**
 * Model alanını form alanına çevirir; formda yer almayan (buton, çıktı, ürün düzeyi...) alanlar için null.
 * @returns {object | null}
 */
function alanCevir(alan, konum, altModeller) {
  if (alan.yapilandirma !== 'senaryo') return null;
  const ortak = {
    id: alan.id, etiket: etiketi(alan), zorunlu: alan.zorunlu === true ? true : alan.zorunlu === false ? false : null,
    adimId: konum.adimId, bolumId: konum.bolumId, gorunurlukVar: Boolean(alan.gorunurluk),
    ...(alan.mutlakaGorunmeli === true ? { akistaZorunlu: true } : {}),
    ...(alan.hassas === true ? { hassas: true } : {})
  };
  const anahtarlar = senaryoAnahtarlari(alan);
  switch (alan.tip) {
    case 'kimlikProfili': {
      const profilAnahtari = anahtarlar.find((a) => /Profili$/.test(a)) || null;
      const kimlikAnahtarlari = anahtarlar.filter((a) => a !== profilAnahtari);
      const kimlikTuru = alan.kimlikTuru;
      const bagli = alan.bagimlilik && typeof alan.bagimlilik.alan === 'string' ? alan.bagimlilik.alan : null;
      return {
        ...ortak, tip: 'kimlik', anahtar: profilAnahtari || kimlikAnahtarlari[0] || alan.id, profilAnahtari, kimlikAnahtarlari,
        kimlikTuru: typeof kimlikTuru === 'string' ? kimlikTuru : nesneMi(kimlikTuru) ? { ...kimlikTuru } : null,
        bagliAlan: bagli, profilHavuzu: alan.eslesme && alan.eslesme.profilHavuzu !== undefined ? kopya(alan.eslesme.profilHavuzu) : null,
        altAlanlar: (alan.altAlanlar || []).filter((a) => a.eslesme && a.eslesme.kimlikAlani).map((a) => ({
          id: a.id, etiket: etiketi(a), tip: a.tip === 'tarih' ? 'tarih' : 'metin', bicim: a.bicim || null,
          kimlikAlani: kopya(a.eslesme.kimlikAlani), gorunurlukVar: Boolean(a.gorunurluk)
        }))
      };
    }
    case 'altModelGecersizKilma': {
      const bolum = altModelBolumu(altModeller, alan.altModel);
      // Kayıt alanının adı: eslesme.kayitAlani.
      const kayitAdi = (a) => (a.eslesme ? a.eslesme.kayitAlani : undefined);
      const alanlar = bolum ? (bolum.alanlar || []).filter((a) => a.yapilandirma === 'senaryo' && typeof kayitAdi(a) === 'string')
        .map((a) => ({
          id: a.id, anahtar: kayitAdi(a), etiket: etiketi(a), zorunlu: a.zorunlu === true,
          tip: a.tip === 'secim' ? 'secim' : 'metin', secenekler: secenekListesi(a.secenekler), hassas: a.hassas === true
        })) : [];
      return { ...ortak, tip: 'altModel', anahtar: anahtarlar[0] || alan.id, altModel: alan.altModel ? { ...alan.altModel } : null, alanlar };
    }
    case 'secim':
    case 'okluSecim':
    case 'radyo': {
      if (anahtarlar.length !== 1) return null;
      const havuz = alan.eslesme && typeof alan.eslesme.profilHavuzu === 'string' ? alan.eslesme.profilHavuzu : null;
      if (havuz) {
        const varsayilan = alan.varsayilan && typeof alan.varsayilan.deger === 'string' ? alan.varsayilan.deger : null;
        return { ...ortak, tip: 'profil', anahtar: anahtarlar[0], profilHavuzu: havuz, varsayilanProfil: varsayilan };
      }
      const bag = alan.bagimlilik && typeof alan.bagimlilik.alan === 'string' && nesneMi(alan.bagimlilik.secenekHaritasi)
        ? { alan: alan.bagimlilik.alan, harita: Object.fromEntries(Object.entries(alan.bagimlilik.secenekHaritasi).map(([k, v]) => [k, secenekListesi(v) || []])) }
        : null;
      return {
        ...ortak, tip: 'secim', anahtar: anahtarlar[0], gorunum: alan.tip === 'radyo' ? 'radyo' : 'liste',
        secenekler: secenekListesi(alan.secenekler), bagimlilik: bag,
        seceneklerKismi: alan.seceneklerDurumu === 'kismi' || alan.seceneklerDurumu === 'bilinmiyor'
      };
    }
    case 'metin':
    case 'telefon':
    case 'sayi':
    case 'tarih':
    case 'onayKutusu':
    case 'dosya': {
      if (anahtarlar.length !== 1) return null;
      const tip = alan.tip === 'telefon' ? 'metin' : alan.tip;
      return {
        ...ortak, tip, anahtar: anahtarlar[0],
        ...(alan.bicim ? { bicim: alan.bicim } : {}), ...(alan.kabul ? { kabul: alan.kabul } : {}),
        ...(alan.varsayilan && alan.varsayilan.deger !== undefined && alan.varsayilan.deger !== null ? { varsayilan: kopya(alan.varsayilan.deger) } : {})
      };
    }
    default:
      return null;
  }
}

/**
 * Ekran modelinden form şeması. altModeller: alt model dosya adı → alt model.
 * Dönen yapı:
 *  - adimlar: akış sırasıyla adımlar ({ id, baslik, sira, ayar: isteğe bağlıysa kapsam ayarının alan kimliği,
 *    bolumler: [{ id, baslik, alanlar }] }) — senaryoda ayarlanabilen alanı olmayan adımlar da (akış
 *    bütünlüğü için) boş bölümlerle yer alır.
 *  - senaryoAlanlari: ekrana ait olmayan senaryo ayarları (bağlam profili vb.).
 *  - adimKapsami: [{ ayar, etiket, adimlar: [adım kimlikleri] }] — isteğe bağlı adım grupları.
 *  - beklenenSonuc: { anahtar, etiket, varyantlar: [tip], adimlar: [{ deger, metin, kosul? }], mesaj: { etiket, zorunlu } } | null
 *  - baslik: başlık alanının senaryo anahtarı.
 */
export function formSemasiOlustur(model, altModeller = {}) {
  if (!nesneMi(model) || !Array.isArray(model.adimlar)) throw new Error('Geçersiz ekran modeli (adimlar yok).');
  const senaryoDuzeyi = (model.senaryoDuzeyi && Array.isArray(model.senaryoDuzeyi.alanlar)) ? model.senaryoDuzeyi.alanlar : [];
  const sdAlani = (id) => senaryoDuzeyi.find((a) => a.id === id);
  const adimlarSirali = model.adimlar.slice().sort((a, b) => (a.sira || 0) - (b.sira || 0));

  // Adım kapsamı: isteğe bağlı adımlar ve onları açan senaryo ayarı.
  /** @type {Map<string, string[]>} */
  const kapsam = new Map();
  for (const adim of adimlarSirali) {
    const ayar = ayarKosulu(model, adim.gorunurluk);
    if (ayar && sdAlani(ayar) && sdAlani(ayar).tip === 'onayKutusu') {
      if (!kapsam.has(ayar)) kapsam.set(ayar, []);
      kapsam.get(ayar).push(adim.id);
    }
  }
  const kapsamAyarlari = new Set(kapsam.keys());

  // Adım + bölüm + alanlar
  const yerlesen = new Set();
  const adimlar = adimlarSirali.map((adim) => {
    const ayar = ayarKosulu(model, adim.gorunurluk);
    let bolumler;
    if (Array.isArray(adim.bolumler)) {
      bolumler = adim.bolumler.map((bolum) => ({
        id: bolum.id, baslik: bolum.baslik || bolum.id, gorunurlukVar: Boolean(bolum.gorunurluk),
        alanlar: (bolum.alanlar || []).map((a) => alanCevir(a, { adimId: adim.id, bolumId: bolum.id }, altModeller)).filter(Boolean)
      }));
    } else if (adim.altModel) {
      // Alt model adımı: senaryo düzeyindeki "alt model değerini ezme" alanı (ör. senaryoya özel
      // kart) aynı alt model bölümüne başvuruyorsa akıştaki yerinde, bu adımda gösterilir.
      const ezme = senaryoDuzeyi.find((a) => a.tip === 'altModelGecersizKilma' && a.altModel &&
        a.altModel.dosya === adim.altModel.dosya && a.altModel.bolum === adim.altModel.bolum);
      const alan = ezme ? alanCevir(ezme, { adimId: adim.id, bolumId: `${adim.id}-alt` }, altModeller) : null;
      if (alan) yerlesen.add(ezme.id);
      bolumler = alan ? [{ id: `${adim.id}-alt`, baslik: adim.baslik || adim.id, gorunurlukVar: false, alanlar: [alan] }] : [];
    } else {
      bolumler = [];
    }
    // kosul: adımın çözülmüş görünürlük ifadesi (ör. ortak akış adımı: "ödeme dahil" ve "ödeme şekli = kart"); beklenen
    // sonuç rozeti, senaryoda sağlanmayan koşullu adımı saymaz.
    const kosul = gorunurlukIfadesi(model, adim.gorunurluk);
    return { id: adim.id, baslik: adim.baslik || adim.id, sira: adim.sira || 0, ayar: ayar && kapsamAyarlari.has(ayar) ? ayar : null, ...(nesneMi(kosul) ? { kosul: kopya(kosul) } : {}), bolumler };
  });

  // Koşullardaki model alan kimliği → senaryo anahtarı (+ varsayılan değer): adım koşullarını senaryo verisiyle değerlendirmek için.
  /** @type {Record<string, { anahtar: string; varsayilan?: unknown }>} */
  const alanAnahtarlari = {};
  const anahtarEkle = (/** @type {any} */ alan) => {
    if (!nesneMi(alan) || typeof alan.id !== 'string') return;
    const anahtar = senaryoAnahtarlari(alan)[0];
    if (!anahtar || alanAnahtarlari[alan.id]) return;
    const v = nesneMi(alan.varsayilan) && alan.varsayilan.deger !== undefined && alan.varsayilan.deger !== null ? { varsayilan: kopya(alan.varsayilan.deger) } : {};
    alanAnahtarlari[alan.id] = { anahtar, ...v };
  };
  for (const adim of adimlarSirali) for (const b of Array.isArray(adim.bolumler) ? adim.bolumler : []) for (const a of nesneMi(b) && Array.isArray(b.alanlar) ? b.alanlar : []) anahtarEkle(a);
  for (const a of senaryoDuzeyi) anahtarEkle(a);

  // Adımları seçen senaryo ayarı (ör. "Ödeme şekli: kart / açık hesap"): formun başı yerine, o ayara bağlı İLK adımdan hemen
  // önceki ve ayara bağlı OLMAYAN adımın başında gösterilir (seçim, kendi gizlediği adımın içinde kalmaz). Uygun adım yoksa
  // senaryo kartında kalır. Kapsam anahtarları (Dahil) ve beklenen sonuç bunun dışındadır.
  for (const alan of senaryoDuzeyi) {
    if (!nesneMi(alan) || alan.yapilandirma !== 'senaryo' || kapsamAyarlari.has(alan.id) || alan.tip === 'birlesim' || yerlesen.has(alan.id)) continue;
    const anahtar = senaryoAnahtarlari(alan)[0];
    if (!anahtar) continue;
    const bagli = (/** @type {any} */ adim) => ayarlariTopla(gorunurlukIfadesi(model, adim.gorunurluk)).has(anahtar);
    const ilk = adimlarSirali.findIndex(bagli);
    if (ilk <= 0 || bagli(adimlarSirali[ilk - 1])) continue;
    const hedef = adimlar[ilk - 1];
    const formAlani = alanCevir(alan, { adimId: hedef.id, bolumId: `${hedef.id}-ayar` }, altModeller);
    if (!formAlani) continue;
    hedef.bolumler = [{ id: `${hedef.id}-ayar`, baslik: hedef.baslik, gorunurlukVar: false, alanlar: [formAlani] }, ...hedef.bolumler];
    yerlesen.add(alan.id);
  }

  // Beklenen sonuç (birleşim) ve başlık
  const bsAlani = senaryoDuzeyi.find((a) => a.tip === 'birlesim' && a.yapilandirma === 'senaryo');
  let beklenenSonuc = null;
  if (bsAlani) {
    const varyantlar = Array.isArray(bsAlani.varyantlar) ? bsAlani.varyantlar : [];
    const hataVaryanti = varyantlar.find((v) => nesneMi(v.alanlar) && Object.keys(v.alanlar).length);
    const adimTanimi = hataVaryanti ? Object.entries(hataVaryanti.alanlar).find(([, t]) => Array.isArray(t.secenekler)) : null;
    const mesajTanimi = hataVaryanti ? Object.entries(hataVaryanti.alanlar).find(([, t]) => !Array.isArray(t.secenekler)) : null;
    beklenenSonuc = {
      anahtar: senaryoAnahtarlari(bsAlani)[0] || bsAlani.id,
      etiket: etiketi(bsAlani),
      varyantlar: varyantlar.map((v) => v.tip),
      basariTipi: (varyantlar.find((v) => !nesneMi(v.alanlar) || !Object.keys(v.alanlar).length) || { tip: 'basarili' }).tip,
      hataTipi: hataVaryanti ? hataVaryanti.tip : null,
      adimAnahtari: adimTanimi ? adimTanimi[0] : null,
      adimEtiketi: adimTanimi ? adimTanimi[1].etiket || adimTanimi[0] : null,
      adimlar: adimTanimi ? secenekListesi(adimTanimi[1].secenekler) : [],
      mesajAnahtari: mesajTanimi ? mesajTanimi[0] : null,
      mesajEtiketi: mesajTanimi ? mesajTanimi[1].etiket || mesajTanimi[0] : null,
      ...akisMesajlari(model)
    };
  }
  const baslikAlani = senaryoDuzeyi.find((a) => a.id === 'baslik') || senaryoDuzeyi.find((a) => senaryoAnahtarlari(a)[0] === 'baslik');
  const senaryoAlanlari = senaryoDuzeyi
    .filter((a) => a !== bsAlani && a !== baslikAlani && !kapsamAyarlari.has(a.id) && !yerlesen.has(a.id))
    .map((a) => alanCevir(a, { adimId: null, bolumId: null }, altModeller)).filter(Boolean);
  const adimKapsami = [...kapsam].map(([ayar, liste]) => {
    const a = sdAlani(ayar);
    return { ayar: senaryoAnahtarlari(a)[0] || ayar, alanId: ayar, etiket: etiketi(a), adimlar: liste, zorunlu: a.zorunlu === true };
  });
  return {
    modelId: model.id || null, modelAdi: model.ad || null,
    baslik: baslikAlani ? senaryoAnahtarlari(baslikAlani)[0] || 'baslik' : 'baslik',
    adimlar, senaryoAlanlari, adimKapsami, beklenenSonuc, alanAnahtarlari
  };
}

/**
 * Adım koşulunun senaryodaki durumu (üç değerli: true / false / null = bilinmiyor; ör. çalışma anında belli olan koşul).
 * @param {any} ifade @param {Record<string, unknown>} veri @param {Record<string, { anahtar: string; varsayilan?: unknown }>} alanAnahtarlari
 * @returns {boolean | null}
 */
function adimKosuluSaglaniyorMu(ifade, veri, alanAnahtarlari) {
  if (!nesneMi(ifade)) return null;
  if (Array.isArray(ifade.ve)) {
    const s = ifade.ve.map((/** @type {any} */ alt) => adimKosuluSaglaniyorMu(alt, veri, alanAnahtarlari));
    return s.includes(false) ? false : s.every((x) => x === true) ? true : null;
  }
  if (Array.isArray(ifade.veya)) {
    const s = ifade.veya.map((/** @type {any} */ alt) => adimKosuluSaglaniyorMu(alt, veri, alanAnahtarlari));
    return s.includes(true) ? true : s.every((x) => x === false) ? false : null;
  }
  if ('degil' in ifade) {
    const s = adimKosuluSaglaniyorMu(ifade.degil, veri, alanAnahtarlari);
    return s === null ? null : !s;
  }
  const deger = (/** @type {string} */ id) => {
    const t = alanAnahtarlari[id];
    const anahtar = t ? t.anahtar : id;
    const v = veri[anahtar];
    return v === undefined && t && 'varsayilan' in t ? t.varsayilan : v;
  };
  if (typeof ifade.alan === 'string') {
    const d = deger(ifade.alan);
    if (typeof d === 'string' && /\$\{[^}]+\}/.test(d)) return null; // tablodan gelen değer: koşuda belli olur
    if (Array.isArray(ifade.icinde)) return ifade.icinde.includes(d);
    return d === ifade.esit;
  }
  if (typeof ifade.senaryoAyari === 'string') return (deger(ifade.senaryoAyari) === true) === (ifade.esit === true);
  return null;
}

/** Şemadaki tüm form alanları (adım sırasıyla, sonra senaryo düzeyi). */
export function tumFormAlanlari(sema) {
  return [...sema.adimlar.flatMap((a) => a.bolumler.flatMap((b) => b.alanlar)), ...sema.senaryoAlanlari];
}

/** Formun yönettiği senaryo anahtarları (kayıtta yeniden yazılır; diğerleri korunur). */
export function yonetilenAnahtarlar(sema) {
  const set = new Set([sema.baslik]);
  for (const a of tumFormAlanlari(sema)) {
    if (a.tip === 'kimlik') { if (a.profilAnahtari) set.add(a.profilAnahtari); a.kimlikAnahtarlari.forEach((k) => set.add(k)); }
    else set.add(a.anahtar);
  }
  for (const k of sema.adimKapsami) set.add(k.ayar);
  if (sema.beklenenSonuc) set.add(sema.beklenenSonuc.anahtar);
  return [...set];
}

/** Kimlik alanının şu anki kimlik türü (sabit ya da bağlı alanın değerine göre). */
export function kimlikTuruBul(alan, degerler, sema) {
  if (typeof alan.kimlikTuru === 'string') return alan.kimlikTuru;
  if (nesneMi(alan.kimlikTuru) && alan.bagliAlan) {
    const bagli = tumFormAlanlari(sema).find((a) => a.id === alan.bagliAlan);
    const deger = bagli ? degerler[bagli.anahtar] : undefined;
    return typeof deger === 'string' && typeof alan.kimlikTuru[deger] === 'string' ? alan.kimlikTuru[deger] : null;
  }
  return null;
}

/** Kimlik alanının şu anki serbest kimlik anahtarı (ör. türe göre ...OzelKimligi / ...TuzelKimligi). */
export function kimlikAnahtariBul(alan, tur) {
  if (alan.kimlikAnahtarlari.length <= 1) return alan.kimlikAnahtarlari[0] || null;
  return alan.kimlikAnahtarlari.find((a) => tur && a.toLowerCase().includes(String(tur).toLowerCase())) || alan.kimlikAnahtarlari[0];
}

/** Kimlik alanının profil havuzu yolu (sabit ya da bağlı alanın değerine göre). */
export function profilHavuzuBul(alan, degerler, sema) {
  if (typeof alan.profilHavuzu === 'string') return alan.profilHavuzu;
  if (nesneMi(alan.profilHavuzu) && alan.bagliAlan) {
    const bagli = tumFormAlanlari(sema).find((a) => a.id === alan.bagliAlan);
    const deger = bagli ? degerler[bagli.anahtar] : undefined;
    return typeof deger === 'string' && typeof alan.profilHavuzu[deger] === 'string' ? alan.profilHavuzu[deger] : null;
  }
  return null;
}

/** Seçim alanının şu anki seçenekleri (bağımlıysa bağlı alanın değerine göre). */
export function secenekleriBul(alan, degerler, sema) {
  if (alan.bagimlilik) {
    const bagli = tumFormAlanlari(sema).find((a) => a.id === alan.bagimlilik.alan);
    const deger = bagli ? degerler[bagli.anahtar] : undefined;
    return typeof deger === 'string' && alan.bagimlilik.harita[deger] ? alan.bagimlilik.harita[deger] : [];
  }
  return alan.secenekler || [];
}

const secimMetni = (d) => (nesneMi(d) ? (d.deger === undefined || d.deger === null ? '' : String(d.deger)) : d === undefined || d === null ? '' : String(d));

/**
 * Kayıtlı senaryodan (modelin senaryo biçimi) form değerleri. Yeni senaryo için veri = {}.
 * Değer anahtarları:
 *  - basit alan / profil: senaryo anahtarı → metin | boolean
 *  - kimlik: "<alanId>#kip" ('yok' | 'profil' | 'yeni'), "<alanId>#profil", "<alanId>.<kimlikAlani>"
 *  - alt model ezme: "<anahtar>#ozel" (boolean), "<anahtar>.<alt anahtar>"
 *  - adım kapsamı: ayar anahtarı → boolean; beklenen sonuç: "<anahtar>.tip|adim|mesaj"; başlık
 */
export function formDegerleriniKur(sema, veri = {}) {
  const v = nesneMi(veri) ? veri : {};
  /** @type {Record<string, unknown>} */
  const d = { [sema.baslik]: typeof v[sema.baslik] === 'string' ? v[sema.baslik] : '' };
  for (const alan of tumFormAlanlari(sema)) {
    if (alan.tip === 'kimlik') {
      const profil = alan.profilAnahtari ? v[alan.profilAnahtari] : undefined;
      const kimlikAnahtari = alan.kimlikAnahtarlari.find((k) => nesneMi(v[k]));
      d[`${alan.id}#kip`] = !bosMu(profil) ? 'profil' : kimlikAnahtari ? 'yeni' : alan.zorunlu === true ? 'profil' : 'yok';
      d[`${alan.id}#profil`] = typeof profil === 'string' ? profil : '';
      const kimlik = kimlikAnahtari ? v[kimlikAnahtari] : {};
      for (const alt of alan.altAlanlar) {
        const adlar = typeof alt.kimlikAlani === 'string' ? [alt.kimlikAlani] : Object.values(alt.kimlikAlani);
        for (const ad of adlar) d[`${alan.id}.${ad}`] = typeof kimlik[ad] === 'string' ? kimlik[ad] : '';
      }
    } else if (alan.tip === 'altModel') {
      const ozel = nesneMi(v[alan.anahtar]);
      d[`${alan.anahtar}#ozel`] = ozel;
      for (const a of alan.alanlar) {
        const ham = ozel ? v[alan.anahtar][a.anahtar] : undefined;
        d[`${alan.anahtar}.${a.anahtar}`] = a.tip === 'secim' ? secimMetni(ham) : typeof ham === 'string' ? ham : '';
      }
    } else if (alan.tip === 'onayKutusu') {
      // Değeri tablodan (${Tablo.Sütun}; koşuda evet / hayır olarak çözülür) gelen onay kutusu başvuruyu korur.
      d[alan.anahtar] = tabloBasvurusuMu(v[alan.anahtar]) ? v[alan.anahtar] : v[alan.anahtar] === true;
    } else if (alan.tip === 'sayi') {
      d[alan.anahtar] = typeof v[alan.anahtar] === 'number' ? String(v[alan.anahtar]) : typeof v[alan.anahtar] === 'string' ? v[alan.anahtar] : '';
    } else {
      d[alan.anahtar] = typeof v[alan.anahtar] === 'string' ? v[alan.anahtar] : secimMetni(v[alan.anahtar]);
    }
  }
  for (const k of sema.adimKapsami) d[k.ayar] = v[k.ayar] === true;
  if (sema.beklenenSonuc) {
    const bs = sema.beklenenSonuc;
    const kayit = nesneMi(v[bs.anahtar]) ? v[bs.anahtar] : {};
    d[`${bs.anahtar}.tip`] = typeof kayit.tip === 'string' ? kayit.tip : bs.basariTipi;
    if (bs.adimAnahtari) d[`${bs.anahtar}.adim`] = typeof kayit[bs.adimAnahtari] === 'string' ? kayit[bs.adimAnahtari] : '';
    if (bs.mesajAnahtari) d[`${bs.anahtar}.mesaj`] = typeof kayit[bs.mesajAnahtari] === 'string' ? kayit[bs.mesajAnahtari] : '';
    // Akıştaki uyarılardan seçilenler (birden çoksa VEYA).
    const liste = Array.isArray(kayit.mesajlar) ? kayit.mesajlar.filter((m) => typeof m === 'string' && m) : [];
    d[`${bs.anahtar}.mesajlar`] = liste.length ? liste : d[`${bs.anahtar}.mesaj`] ? [d[`${bs.anahtar}.mesaj`]] : [];
  }
  return d;
}

/**
 * Form değerlerinden modelin senaryo biçimi. Görünmeyen (koşulu sağlanmayan) alanlar ve
 * kapsam dışı adımların alanları YAZILMAZ. Formun yönetmediği anahtarlar (onceki) korunur.
 * gorunurlukHesapla: (taslakSenaryo) => gorunurlukleriHesapla(taslak, baglam) — tek doğrulayıcı.
 * @param {object} sema @param {Record<string, unknown>} degerler
 * @param {{ gorunurlukHesapla?: (s: Record<string, unknown>) => { adimlar: Record<string, boolean | null>; alanlar: Record<string, boolean | null>; altAlanlar: Record<string, boolean | null> }; onceki?: Record<string, unknown> }} [secenekler]
 */
export function senaryoNesnesiOlustur(sema, degerler, secenekler = {}) {
  const taslak = taslakOlustur(sema, degerler, secenekler.onceki, null);
  if (!secenekler.gorunurlukHesapla) return taslak;
  return taslakOlustur(sema, degerler, secenekler.onceki, secenekler.gorunurlukHesapla(taslak));
}

function taslakOlustur(sema, d, onceki, gorunurluk) {
  const sonuc = {};
  const yonetilen = new Set(yonetilenAnahtarlar(sema));
  if (nesneMi(onceki)) for (const [k, v] of Object.entries(onceki)) if (!yonetilen.has(k)) sonuc[k] = kopya(v);
  const metin = (x) => (typeof x === 'string' ? x.trim() : x === undefined || x === null ? '' : String(x).trim());
  sonuc[sema.baslik] = metin(d[sema.baslik]);
  const gizli = (alan) => gorunurluk && (gorunurluk.alanlar[alan.id] === false || (alan.adimId && gorunurluk.adimlar[alan.adimId] === false));
  for (const alan of tumFormAlanlari(sema)) {
    if (gizli(alan)) continue;
    switch (alan.tip) {
      case 'kimlik': {
        const kip = d[`${alan.id}#kip`];
        if (kip === 'profil' && alan.profilAnahtari) {
          const p = metin(d[`${alan.id}#profil`]);
          if (p) sonuc[alan.profilAnahtari] = p;
        } else if (kip === 'yeni') {
          const tur = kimlikTuruBul(alan, d, sema);
          const anahtar = kimlikAnahtariBul(alan, tur);
          if (!anahtar) break;
          const kimlik = {};
          for (const alt of alan.altAlanlar) {
            const ad = kimlikAlaniAdi({ eslesme: { kimlikAlani: alt.kimlikAlani } }, tur);
            if (!ad) continue;
            if (gorunurluk && gorunurluk.altAlanlar[`${alan.id}.${alt.id}`] === false) continue;
            kimlik[ad] = metin(d[`${alan.id}.${ad}`]);
          }
          sonuc[anahtar] = kimlik;
        }
        break;
      }
      case 'altModel': {
        if (d[`${alan.anahtar}#ozel`] !== true) break;
        const nesne = {};
        for (const a of alan.alanlar) nesne[a.anahtar] = metin(d[`${alan.anahtar}.${a.anahtar}`]);
        sonuc[alan.anahtar] = nesne;
        break;
      }
      case 'onayKutusu':
        // Onay kutusu: işaretliyse true; işaretsiz + zorunlu ise false; işaretsiz + isteğe bağlı: yazılmaz
        // (ekrandaki mevcut duruma dokunulmaz).
        if (d[alan.anahtar] === true) sonuc[alan.anahtar] = true;
        else if (tabloBasvurusuMu(d[alan.anahtar])) sonuc[alan.anahtar] = String(d[alan.anahtar]).trim();
        else if (alan.zorunlu === true) sonuc[alan.anahtar] = false;
        break;
      case 'sayi': {
        const m = metin(d[alan.anahtar]);
        if (m) sonuc[alan.anahtar] = /^-?\d+(?:[.,]\d+)?$/.test(m) ? Number(m.replace(',', '.')) : m;
        break;
      }
      case 'profil': {
        const p = metin(d[alan.anahtar]);
        if (p) sonuc[alan.anahtar] = p;
        break;
      }
      default: {
        const m = metin(d[alan.anahtar]);
        if (m) sonuc[alan.anahtar] = m;
      }
    }
  }
  for (const k of sema.adimKapsami) sonuc[k.ayar] = d[k.ayar] === true;
  const bs = sema.beklenenSonuc;
  if (bs) {
    const tip = d[`${bs.anahtar}.tip`];
    if (tip && tip !== bs.basariTipi) {
      const nesne = { tip };
      if (bs.adimAnahtari) nesne[bs.adimAnahtari] = metin(d[`${bs.anahtar}.adim`]);
      if (bs.mesajAnahtari) nesne[bs.mesajAnahtari] = metin(d[`${bs.anahtar}.mesaj`]);
      const liste = Array.isArray(d[`${bs.anahtar}.mesajlar`]) ? d[`${bs.anahtar}.mesajlar`].filter((m) => typeof m === 'string' && m) : [];
      if (liste.length > 1) nesne.mesajlar = liste;
      sonuc[bs.anahtar] = nesne;
    }
  }
  if (!nesneMi(onceki)) return sonuc;
  // Anahtar sırası kayıttaki sırayı izler (değişmeyen senaryo, kaydedilince aynı JSON'u üretir).
  const sirali = {};
  for (const k of Object.keys(onceki)) if (k in sonuc) sirali[k] = sonuc[k];
  for (const k of Object.keys(sonuc)) if (!(k in sirali)) sirali[k] = sonuc[k];
  return sirali;
}

/**
 * Doğrulayıcının alan yolu (ör. "kapsam", "odeyenOzelKimligi.tcKimlikNo", "krediKarti.kartNo",
 * "beklenenSonuc.mesaj") → form kontrol anahtarı. Eşleşmezse null (genel hata).
 */
export function hataKontrolu(alanYolu, sema) {
  const yol = String(alanYolu || '');
  if (!yol) return null;
  const [bas, ...geri] = yol.split('.');
  const alt = geri.join('.');
  if (bas === sema.baslik) return sema.baslik;
  if (sema.beklenenSonuc && bas === sema.beklenenSonuc.anahtar) {
    if (alt === sema.beklenenSonuc.adimAnahtari) return `${bas}.adim`;
    if (alt === sema.beklenenSonuc.mesajAnahtari) return `${bas}.mesaj`;
    return `${bas}.tip`;
  }
  const kapsamAyari = sema.adimKapsami.find((k) => k.ayar === bas);
  if (kapsamAyari) return bas;
  for (const alan of tumFormAlanlari(sema)) {
    if (alan.tip === 'kimlik') {
      if (bas === alan.profilAnahtari) return `${alan.id}#profil`;
      if (alan.kimlikAnahtarlari.includes(bas)) return alt ? `${alan.id}.${alt}` : `${alan.id}#kip`;
      continue;
    }
    if (alan.anahtar !== bas) continue;
    if (alan.tip === 'altModel') return alt ? `${bas}.${alt}` : `${bas}#ozel`;
    return bas;
  }
  return null;
}

/** Hata/uyarı listesini kontrollere dağıtır: { alanlar: { kontrol: [mesaj] }, genel: [mesaj] } */
export function hatalariDagit(bulgular, sema) {
  const alanlar = {};
  const genel = [];
  for (const b of bulgular || []) {
    const k = hataKontrolu(b.alan, sema);
    if (k) (alanlar[k] = alanlar[k] || []).push(b.mesaj);
    else genel.push(b.alan ? `${b.alan}: ${b.mesaj}` : b.mesaj);
  }
  return { alanlar, genel };
}

/**
 * Akışın beklenen mesajları (senaryo formu için): adımlarda kabul edilen uyarılar (kosu.uyarilar; senaryo "uyarı bekleniyor"
 * derken bunlardan seçer) ve son adımın başarı mesajları (bilgi: "Bu akışta başarı: A veya B").
 * @param {any} model @returns {{ uyarilar: Array<{ adim: string; adimBasligi: string; metin: string }>; basariMesajlari: string[] }}
 */
export function akisMesajlari(model) {
  const adimlar = (Array.isArray(model.adimlar) ? model.adimlar : []).filter(nesneMi).slice().sort((a, b) => (a.sira || 0) - (b.sira || 0));
  const uyarilar = adimlar.flatMap((a) => (nesneMi(a.kosu) && Array.isArray(a.kosu.uyarilar) ? a.kosu.uyarilar : [])
    .filter((u) => nesneMi(u) && typeof u.metin === 'string' && u.metin)
    .map((u) => ({ adim: String(a.id), adimBasligi: String(a.baslik || a.id), metin: String(u.metin) })));
  const son = [...adimlar].reverse().find((a) => nesneMi(a.kosu) && nesneMi(a.kosu.basariGostergesi));
  const g = son ? son.kosu.basariGostergesi : null;
  const secenekler = !g ? [] : g.tur === 'veya' && Array.isArray(g.secenekler) ? g.secenekler : [g];
  const basariMesajlari = secenekler.filter((s) => nesneMi(s) && typeof s.deger === 'string' && s.deger)
    .map((s) => (s.tur === 'metin' ? s.deger : s.tur === 'desen' ? `${s.secici || 'sayfa'} /${s.deger}/` : s.tur === 'url' ? `adres /${s.deger}/` : `${s.deger} görünür`));
  return { uyarilar, basariMesajlari };
}

/**
 * Beklenen sonuç rozeti (genel): iş kuralı hatası → "Hata: <adım>"; başarılı akış → akışın son
 * adımı (kapsamdaki isteğe bağlı adımlar dahil), beklenen sonuç adım seçeneklerindeki adıyla.
 * Modelde beklenen sonuç yoksa null.
 * @returns {{ tur: 'basari' | 'hata'; metin: string; aciklama: string } | null}
 */
export function beklenenSonucEtiketi(sema, veri) {
  const bs = sema.beklenenSonuc;
  if (!bs || !nesneMi(veri)) return null;
  const adimAdi = (id) => {
    const secenek = bs.adimlar.find((s) => s.deger === id);
    if (secenek) return secenek.metin;
    const adim = sema.adimlar.find((a) => a.id === id);
    return adim ? adim.baslik : String(id || '?');
  };
  const kayit = veri[bs.anahtar];
  if (nesneMi(kayit) && kayit.tip && kayit.tip !== bs.basariTipi) {
    const adim = bs.adimAnahtari ? kayit[bs.adimAnahtari] : null;
    const mesaj = bs.mesajAnahtari ? kayit[bs.mesajAnahtari] : '';
    return { tur: 'hata', metin: `Hata: ${adimAdi(adim)}`, aciklama: `İş kuralı hatası beklenir (${adimAdi(adim)}): ${mesaj || '—'}` };
  }
  // Kapsam: isteğe bağlı adım senaryoda dahil değilse ya da adımın koşulu (ör. ortak akış "dahil" + "ödeme şekli = kart")
  // bu senaryoda sağlanmıyorsa adım sayılmaz. Bilinmeyen koşul (çalışma anında belli olur) kapsamda sayılır.
  const alanAnahtarlari = sema.alanAnahtarlari || {};
  const kapsamda = (/** @type {any} */ a) => (!a.ayar || veri[a.ayar] === true) && (!a.kosul || adimKosuluSaglaniyorMu(a.kosul, veri, alanAnahtarlari) !== false);
  const kapsamdaki = sema.adimlar.filter(kapsamda);
  const adaylar = kapsamdaki.filter((a) => bs.adimlar.some((s) => s.deger === a.id));
  const son = adaylar.length ? adaylar[adaylar.length - 1] : kapsamdaki[kapsamdaki.length - 1];
  const dahilOlmayan = sema.adimlar.filter((a) => a.ayar && veri[a.ayar] !== true);
  return {
    tur: 'basari', metin: son ? adimAdi(son.id) : 'Başarılı',
    aciklama: `Başarılı akış: ${son ? adimAdi(son.id) : 'son adım'} adımına kadar${dahilOlmayan.length ? ` (${dahilOlmayan.map((a) => a.baslik).join(', ')} adımı koşulmaz)` : ''}.`
  };
}

/**
 * "Bu mesajı beklenen hata olarak kullan": başarısız bir deneme sonucundan beklenen hata önerisi.
 * Mesaj: beklenmeyen pop-up metni ya da "Görülen" kısmı ya da Playwright'ın Received değeri;
 * adım: başarısız test adımının başlığı modeldeki bir adımın başlığıyla başlıyorsa o adım.
 * @param {{ hataMesaji?: string | null; basarisizAdim?: string | null }} sonuc
 * @returns {{ mesaj: string; adim: string | null } | null}
 */
export function beklenenHataOnerisi(sonuc, sema) {
  const hata = String((sonuc && sonuc.hataMesaji) || '').replace(/\x1b\[[0-9;]*m/g, '');
  if (!hata || !sema.beklenenSonuc) return null;
  let mesaj = null;
  const popup = /beklenmeyen bir hata pop-up'ı görüntülendi, senaryo burada durduruldu:\s*([\s\S]*)$/.exec(hata);
  if (popup) mesaj = popup[1].split(/\n\s*(?:Call log:|at )/)[0].replace(/\s*Tamam\s*$/, '').trim();
  if (!mesaj) {
    const gorulen = /Görülen: "([\s\S]*?)"/.exec(hata);
    if (gorulen && !/^(uyarı çıkmadı|servis cevabı:)/.test(gorulen[1])) mesaj = gorulen[1].trim();
  }
  if (!mesaj) {
    const received = /^\s*Received(?: string| value)?:\s*"?(.*?)"?\s*$/m.exec(hata);
    if (received && received[1]) mesaj = received[1].trim();
  }
  if (!mesaj) return null;
  const adimBasligi = aramaIcinSadelestir((sonuc && sonuc.basarisizAdim) || '');
  const secenekler = sema.beklenenSonuc.adimlar;
  let adim = null;
  for (const s of secenekler) {
    const modelAdimi = sema.adimlar.find((a) => a.id === s.deger);
    const basliklar = [modelAdimi && modelAdimi.baslik, s.metin].filter(Boolean).map(aramaIcinSadelestir);
    if (adimBasligi && basliklar.some((b) => b && adimBasligi.startsWith(b))) { adim = s.deger; break; }
  }
  if (!adim) {
    const metin = aramaIcinSadelestir(hata);
    const eslesen = secenekler.find((s) => metin.includes(`${aramaIcinSadelestir(s.metin)} adiminda`));
    adim = eslesen ? eslesen.deger : null;
  }
  return { mesaj, adim };
}
