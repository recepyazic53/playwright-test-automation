// EKRAN MODELİ FARK MOTORU (genel, saf fonksiyonlar) — iki model sürümünü (ya da mevcut model ile yeni
// ekran paketindeki modeli) karşılaştırıp "bulgu" listesi üretir, kullanıcının KABUL ettiği bulguları
// mevcut modele uygulayarak yeni sürümü kurar ve bulguların senaryolara etkisini hesaplar.
//
// Bulgu türleri (tur):
//   yeniAlan · kaldirilanAlan · yeniSecenek · kaldirilanSecenek · etiketDegisikligi ·
//   zorunlulukDegisikligi · tipDegisikligi · gorunurlukDegisikligi (profil: bağlam profili adı; null =
//   görünürlük KOŞULU değişti) · adimDegisikligi (altTur: yeniAdim | kaldirilanAdim | baslik | gorunurluk |
//   sira | yeniBolum | kaldirilanBolum | alanTasindi | kosuTanimi — sürüm 2 adım koşu tanımı)
// Her bulgunun "imza"sı (tür + hedef + yeni değer) kararlıdır: aynı değişiklik tekrar gelirse aynı imza
// üretilir (reddedilen bulgular bu imzayla hatırlanır; değişiklik farklıysa imza da farklıdır).
//
// Kurallar: HİÇBİR projeye/ürüne özgü ad içermez; import YOK, DOM YOK (sunucu, birim testleri ve
// gerekirse tarayıcı aynı dosyayı kullanır). Alan kimlikleri model genelinde benzersizdir (model
// doğrulayıcısı garanti eder). Tipler: model-farki.d.mts.

export const BULGU_TURLERI = Object.freeze([
  'yeniAlan', 'kaldirilanAlan', 'yeniSecenek', 'kaldirilanSecenek', 'etiketDegisikligi',
  'zorunlulukDegisikligi', 'tipDegisikligi', 'gorunurlukDegisikligi', 'adimDegisikligi'
]);

/** Türlerin kullanıcıya görünen adları. */
export const BULGU_TUR_ETIKETLERI = Object.freeze({
  yeniAlan: 'Yeni alan',
  kaldirilanAlan: 'Kaldırılan alan',
  yeniSecenek: 'Yeni seçenek',
  kaldirilanSecenek: 'Kaldırılan seçenek',
  etiketDegisikligi: 'Etiket değişikliği',
  zorunlulukDegisikligi: 'Zorunluluk değişikliği',
  tipDegisikligi: 'Tip değişikliği',
  gorunurlukDegisikligi: 'Görünürlük değişikliği',
  adimDegisikligi: 'Adım değişikliği'
});

// ---- Yardımcılar ---------------------------------------------------------------------------

function nesneMi(d) {
  return typeof d === 'object' && d !== null && !Array.isArray(d);
}
function kopya(d) {
  return d === undefined ? undefined : JSON.parse(JSON.stringify(d));
}
/** Anahtarları sıralı (kanonik) JSON — imza ve eşitlik için. */
export function kanonikJson(d) {
  if (Array.isArray(d)) return `[${d.map(kanonikJson).join(',')}]`;
  if (nesneMi(d)) return `{${Object.keys(d).sort().filter((k) => d[k] !== undefined).map((k) => `${JSON.stringify(k)}:${kanonikJson(d[k])}`).join(',')}}`;
  return JSON.stringify(d === undefined ? null : d);
}
const esit = (a, b) => kanonikJson(a) === kanonikJson(b);

/** 64 bit FNV-1a (iki 32 bit yarı) → 16 hex; bulgu kimliği için kısa ve kararlı. */
function ozet(metin) {
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193 ^ 0x5bd1e995;
  for (let i = 0; i < metin.length; i++) {
    const c = metin.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ c, 0x5bd1e995) >>> 0;
  }
  return h1.toString(16).padStart(8, '0') + h2.toString(16).padStart(8, '0');
}

function etiketMetni(alan) {
  const e = alan && alan.etiket;
  if (nesneMi(e)) return e.ekran || e.form || null;
  return null;
}
const alanAdi = (alan) => etiketMetni(alan) || (alan && alan.id) || '?';
const secenekKimligi = (s) => String(s.senaryoDegeri !== undefined ? s.senaryoDegeri : s.deger);
/**
 * Alanın tüm seçenekleri: düz liste + bağlı listeler (bagimlilik.secenekHaritasi), tekrarsız. Liste bağlı listeye
 * dönüştüğünde (ör. alternatif kapsama bağlandı) seçenekler "kaldırıldı" sayılmaz.
 */
const tumSecenekler = (a) => {
  const harita = a.bagimlilik && nesneMi(a.bagimlilik.secenekHaritasi) ? Object.values(a.bagimlilik.secenekHaritasi).flat() : [];
  const gorulen = new Set();
  return [...(Array.isArray(a.secenekler) ? a.secenekler : []), ...harita].filter(nesneMi).filter((s) => {
    const k = secenekKimligi(s);
    if (gorulen.has(k)) return false;
    gorulen.add(k);
    return true;
  });
};
const secenekMetni = (s) => String(s.metin || s.formMetni || s.deger);
const zorunluluk = (a) => (a.zorunlu === true ? true : a.zorunlu === false ? false : null);
function senaryoAnahtarlari(alan) {
  const s = alan && alan.eslesme && alan.eslesme.senaryo;
  if (s === undefined || s === null) return [];
  return Array.isArray(s) ? s : [s];
}

/** Tek aksiyonun kısa metni (ör. "tıkla #hesapla (en çok 10 sn)"). @param {any} a */
function aksiyonMetni(a) {
  let m;
  if (a.tur === 'ekranaDon') m = 'ekrana dön';
  else if (a.tur === 'bekle' && a.sureSn !== undefined) m = `bekle ${a.sureSn} sn`;
  else m = `${a.tur === 'bekle' ? 'bekle' : a.kosul === 'gorunurse' ? 'görünürse tıkla' : 'tıkla'} ${a.secici}${a.metin ? ` "${a.metin}"` : ''}${a.tur === 'bekle' && a.durum && a.durum !== 'gorunur' ? ` (${a.durum})` : ''}`;
  if (a.zamanAsimiSn !== undefined) m += ` (en çok ${a.zamanAsimiSn} sn)`;
  return m;
}
/** Başarı göstergesinin kısa metni (veya: seçenekler). @param {any} bg */
function basariMetni(bg) {
  const tek = (/** @type {any} */ g) => `${g.tur} "${g.deger}"${g.secici ? ` (${g.secici})` : ''}`;
  return bg.tur === 'veya' && Array.isArray(bg.secenekler) ? bg.secenekler.filter(nesneMi).map(tek).join(' veya ') : tek(bg);
}
/** @param {any} k */
const aksiyonListesi = (k) => (nesneMi(k) && Array.isArray(k.aksiyonlar) ? k.aksiyonlar.filter(nesneMi) : []);
/** @param {any} k */
const uyariListesi = (k) => (nesneMi(k) && Array.isArray(k.uyarilar) ? k.uyarilar.filter((u) => nesneMi(u) && typeof u.metin === 'string') : []);

/** Adımın koşu tanımının (sürüm 2: aksiyonlar, başarı/hata göstergesi) kısa, insan-okur özeti. */
export function kosuTanimiMetni(k) {
  if (!nesneMi(k)) return 'yok';
  const parcalar = [];
  // Görünen her koşu alanı özette yer alır (yalnız bekleme süresi / uyarı / not değişince eski ve yeni satır aynı görünmesin).
  for (const a of aksiyonListesi(k)) parcalar.push(aksiyonMetni(a));
  if (nesneMi(k.basariGostergesi)) parcalar.push(`başarı: ${basariMetni(k.basariGostergesi)}`);
  if (nesneMi(k.hataGostergesi)) parcalar.push(`hata: ${k.hataGostergesi.secici}`);
  const uyarilar = uyariListesi(k);
  if (uyarilar.length) parcalar.push(`uyarı: ${uyarilar.map((u) => `"${u.metin}"`).join(', ')}`);
  if (k.zamanAsimiSn !== undefined) parcalar.push(`bekleme ${k.zamanAsimiSn} sn`);
  if (k.ekranGoruntusu === true) parcalar.push('ekran görüntüsü');
  if (typeof k.not === 'string' && k.not) parcalar.push(`not: "${k.not}"`);
  return parcalar.join(' · ') || 'boş';
}

/**
 * İki koşu tanımı arasındaki farkların kısa listesi (ör. "bekleme: 60 sn → 90 sn", "2. aksiyon: tıkla #a → tıkla #b",
 * "not: yok → \"kısa\""). Özette görünmeyen alanlar (ör. aksiyonun çerçevesi) "değişen: <alan>" olarak yazılır.
 * @param {unknown} eski @param {unknown} yeni @returns {string[]}
 */
export function kosuTanimiFarki(eski, yeni) {
  if (!nesneMi(eski) && !nesneMi(yeni)) return [];
  if (!nesneMi(eski)) return ['koşu tanımı eklendi'];
  if (!nesneMi(yeni)) return ['koşu tanımı kaldırıldı'];
  const farklar = [];
  const ok = (/** @type {string} */ ad, /** @type {string} */ e, /** @type {string} */ y) => farklar.push(`${ad}: ${e} → ${y}`);
  const ea = aksiyonListesi(eski);
  const ya = aksiyonListesi(yeni);
  if (ea.length !== ya.length) ok('aksiyonlar', ea.map(aksiyonMetni).join(', ') || 'yok', ya.map(aksiyonMetni).join(', ') || 'yok');
  else {
    ea.forEach((a, i) => {
      const b = ya[i];
      if (esit(a, b)) return;
      const am = aksiyonMetni(a);
      const bm = aksiyonMetni(b);
      if (am !== bm) ok(`${i + 1}. aksiyon`, am, bm);
      else farklar.push(`${i + 1}. aksiyon: değişen ${[...new Set([...Object.keys(a), ...Object.keys(b)])].filter((k) => !esit(a[k] ?? null, b[k] ?? null)).join(', ')}`);
    });
  }
  if (!esit(eski.basariGostergesi ?? null, yeni.basariGostergesi ?? null)) {
    ok('başarı', nesneMi(eski.basariGostergesi) ? basariMetni(eski.basariGostergesi) : 'yok', nesneMi(yeni.basariGostergesi) ? basariMetni(yeni.basariGostergesi) : 'yok');
  }
  if (!esit(eski.hataGostergesi ?? null, yeni.hataGostergesi ?? null)) {
    ok('hata', nesneMi(eski.hataGostergesi) ? String(eski.hataGostergesi.secici) : 'yok', nesneMi(yeni.hataGostergesi) ? String(yeni.hataGostergesi.secici) : 'yok');
  }
  if (!esit(eski.uyarilar ?? null, yeni.uyarilar ?? null)) {
    const m = (/** @type {any} */ k) => uyariListesi(k).map((u) => `"${u.metin}"`).join(', ') || 'yok';
    if (m(eski) !== m(yeni)) ok('uyarı', m(eski), m(yeni)); else farklar.push('değişen: uyarilar');
  }
  if (!esit(eski.zamanAsimiSn ?? null, yeni.zamanAsimiSn ?? null)) {
    const m = (/** @type {unknown} */ v) => (v === undefined || v === null ? 'varsayılan' : `${v} sn`);
    ok('bekleme', m(eski.zamanAsimiSn), m(yeni.zamanAsimiSn));
  }
  if ((eski.ekranGoruntusu === true) !== (yeni.ekranGoruntusu === true)) ok('ekran görüntüsü', eski.ekranGoruntusu === true ? 'açık' : 'kapalı', yeni.ekranGoruntusu === true ? 'açık' : 'kapalı');
  if ((eski.not || '') !== (yeni.not || '')) ok('not', eski.not ? `"${eski.not}"` : 'yok', yeni.not ? `"${yeni.not}"` : 'yok');
  const bilinen = new Set(['aksiyonlar', 'basariGostergesi', 'hataGostergesi', 'uyarilar', 'zamanAsimiSn', 'ekranGoruntusu', 'not']);
  const digerleri = [...new Set([...Object.keys(eski), ...Object.keys(yeni)])].filter((k) => !bilinen.has(k) && !esit(eski[k] ?? null, yeni[k] ?? null));
  if (digerleri.length) farklar.push(`değişen: ${digerleri.join(', ')}`);
  return farklar;
}

/**
 * Eski ve yeni koşu tanımı özeti aynı görünüyorsa (özette yer almayan bir alan, ör. çerçeve, değişti) değişen anahtarları
 * yeni satıra ekler. @param {any} eski @param {any} yeni @returns {{ eski: string; yeni: string }}
 */
function kosuTanimiMetinleri(eski, yeni) {
  const e = kosuTanimiMetni(eski);
  const y = kosuTanimiMetni(yeni);
  if (e !== y) return { eski: e, yeni: y };
  const a = nesneMi(eski) ? eski : {};
  const b = nesneMi(yeni) ? yeni : {};
  const degisen = [...new Set([...Object.keys(a), ...Object.keys(b)])].filter((k) => !esit(a[k] ?? null, b[k] ?? null));
  return { eski: e, yeni: degisen.length ? `${y} (değişen: ${degisen.join(', ')})` : y };
}
/** Bulgu başlığına eklenen kısa fark (en çok üç fark, kalanı "+N"): " — bekleme: 60 sn → 90 sn". @param {unknown} eski @param {unknown} yeni */
function kosuFarki(eski, yeni) {
  const f = kosuTanimiFarki(eski, yeni);
  if (!f.length) return '';
  return ` — ${f.slice(0, 3).join('; ')}${f.length > 3 ? `; +${f.length - 3} değişiklik` : ''}`;
}

/** Görünürlüğün kısa, insan-okur açıklaması. */
export function gorunurlukMetni(g) {
  if (!g) return 'her zaman';
  if (typeof g.kosul === 'string') return `koşul: ${g.kosul}`;
  return `ifade: ${kanonikJson(g.ifade)}`;
}

// ---- Envanter ------------------------------------------------------------------------------

/**
 * Modelin adım/bölüm/alan envanteri. Alanlar iç içe (altAlanlar / ekranAlanlari) dahil; alt model
 * adımlarının alanları (başka modelde) dahil DEĞİL.
 */
export function modelEnvanteri(model) {
  const adimlar = new Map();
  const bolumler = new Map();
  const alanlar = new Map();
  const adimListesi = Array.isArray(model && model.adimlar) ? model.adimlar : [];
  adimListesi.forEach((adim, ai) => {
    if (!nesneMi(adim) || typeof adim.id !== 'string') return;
    adimlar.set(adim.id, { adim, sira: ai });
    (Array.isArray(adim.bolumler) ? adim.bolumler : []).forEach((bolum, bi) => {
      if (!nesneMi(bolum) || typeof bolum.id !== 'string') return;
      bolumler.set(bolum.id, { bolum, adimId: adim.id, sira: bi });
      const gez = (liste, ebeveynId, listeAdi) => {
        (Array.isArray(liste) ? liste : []).forEach((alan, i) => {
          if (!nesneMi(alan) || typeof alan.id !== 'string') return;
          alanlar.set(alan.id, { alan, adimId: adim.id, bolumId: bolum.id, ebeveynId, liste: listeAdi, sira: i });
          gez(alan.altAlanlar, alan.id, 'altAlanlar');
          gez(alan.ekranAlanlari, alan.id, 'ekranAlanlari');
        });
      };
      gez(bolum.alanlar, null, 'alanlar');
    });
  });
  return { adimlar, bolumler, alanlar };
}

function konumMetni(env, alanId) {
  const k = env.alanlar.get(alanId);
  if (!k) return '';
  const adim = env.adimlar.get(k.adimId);
  const bolum = env.bolumler.get(k.bolumId);
  const ebeveyn = k.ebeveynId ? env.alanlar.get(k.ebeveynId) : null;
  return [adim ? `${adim.sira + 1}. ${adim.adim.baslik || adim.adim.id}` : null, bolum ? bolum.bolum.baslik || bolum.bolum.id : null,
    ebeveyn ? alanAdi(ebeveyn.alan) : null].filter(Boolean).join(' › ');
}

/** Bir alanın (ve altlarının) kimlikleri. */
function altKimlikler(alan) {
  const liste = [];
  const gez = (a) => { liste.push(a.id); for (const x of [...(a.altAlanlar || []), ...(a.ekranAlanlari || [])]) if (nesneMi(x)) gez(x); };
  gez(alan);
  return liste;
}

function baglamHaritasi(model) {
  const bg = model && nesneMi(model.baglamGorunurlugu) ? model.baglamGorunurlugu : null;
  return {
    profiller: bg && Array.isArray(bg.profiller) ? bg.profiller.filter((p) => typeof p === 'string') : [],
    alanlar: bg && nesneMi(bg.alanlar) ? bg.alanlar : {}
  };
}

// ---- Fark ----------------------------------------------------------------------------------

function bulguYap(t) {
  const imza = [t.tur, t.altTur || '', t.hedef, t.profil || '', t.secenekKimligi || '', kanonikJson(t.imzaDegeri === undefined ? t.yeni : t.imzaDegeri)].join('|');
  const { hedef: _h, imzaDegeri: _i, secenekKimligi: _s, ...geri } = t;
  return { id: ozet(imza), imza, ...geri };
}

/**
 * İki model arasındaki bulgular (eski → yeni). Sıra: adım değişiklikleri, sonra alanlar (yeni modelin
 * akış sırasıyla), sonra kaldırılanlar.
 * @returns {Array<object>} bulgular
 */
export function modelFarki(eski, yeni) {
  const e = modelEnvanteri(eski);
  const y = modelEnvanteri(yeni);
  const bulgular = [];
  const eBg = baglamHaritasi(eski);
  const yBg = baglamHaritasi(yeni);

  // Adımlar
  const yeniAdimlar = new Set();
  const kaldirilanAdimlar = new Set();
  for (const [id, { adim, sira }] of y.adimlar) {
    if (e.adimlar.has(id)) continue;
    yeniAdimlar.add(id);
    const alanSayisi = [...y.alanlar.values()].filter((k) => k.adimId === id).length;
    bulgular.push(bulguYap({
      tur: 'adimDegisikligi', altTur: 'yeniAdim', hedef: id, adimId: id,
      baslik: `Yeni adım: ${adim.baslik || id}`, konum: `${sira + 1}. adım`,
      eski: null, yeni: { baslik: adim.baslik || id, sira: sira + 1, alanSayisi, gorunurluk: gorunurlukMetni(adim.gorunurluk) },
      imzaDegeri: adim
    }));
  }
  for (const [id, { adim, sira }] of e.adimlar) {
    if (y.adimlar.has(id)) continue;
    kaldirilanAdimlar.add(id);
    bulgular.push(bulguYap({
      tur: 'adimDegisikligi', altTur: 'kaldirilanAdim', hedef: id, adimId: id,
      baslik: `Kaldırılan adım: ${adim.baslik || id}`, konum: `${sira + 1}. adım`,
      eski: { baslik: adim.baslik || id, sira: sira + 1 }, yeni: null
    }));
  }
  for (const [id, { adim: ya }] of y.adimlar) {
    const ek = e.adimlar.get(id);
    if (!ek) continue;
    const ea = ek.adim;
    if ((ea.baslik || '') !== (ya.baslik || '')) {
      bulgular.push(bulguYap({ tur: 'adimDegisikligi', altTur: 'baslik', hedef: id, adimId: id, baslik: `Adım başlığı: ${ya.baslik || id}`, konum: `${ek.sira + 1}. adım`, eski: ea.baslik || '', yeni: ya.baslik || '' }));
    }
    if (!esit(ea.gorunurluk || null, ya.gorunurluk || null)) {
      bulgular.push(bulguYap({
        tur: 'adimDegisikligi', altTur: 'gorunurluk', hedef: id, adimId: id, baslik: `Adım görünürlüğü: ${ya.baslik || id}`, konum: `${ek.sira + 1}. adım`,
        eski: gorunurlukMetni(ea.gorunurluk), yeni: gorunurlukMetni(ya.gorunurluk), imzaDegeri: ya.gorunurluk || null
      }));
    }
  }
  for (const [id, { adim: ya }] of y.adimlar) {
    const ek = e.adimlar.get(id);
    if (!ek || esit(ek.adim.kosu || null, ya.kosu || null)) continue;
    bulgular.push(bulguYap({
      tur: 'adimDegisikligi', altTur: 'kosuTanimi', hedef: id, adimId: id, baslik: `Adım koşu tanımı: ${ya.baslik || id}${kosuFarki(ek.adim.kosu, ya.kosu)}`, konum: `${ek.sira + 1}. adım`,
      ...kosuTanimiMetinleri(ek.adim.kosu, ya.kosu), imzaDegeri: ya.kosu || null
    }));
  }
  const ortakEski = [...e.adimlar.keys()].filter((id) => y.adimlar.has(id));
  const ortakYeni = [...y.adimlar.keys()].filter((id) => e.adimlar.has(id));
  if (!esit(ortakEski, ortakYeni)) {
    const ad = (env, id) => env.adimlar.get(id).adim.baslik || id;
    bulgular.push(bulguYap({
      tur: 'adimDegisikligi', altTur: 'sira', hedef: '*', baslik: 'Adım sırası değişti', konum: 'Akış',
      eski: ortakEski.map((id) => ad(e, id)), yeni: ortakYeni.map((id) => ad(y, id)), imzaDegeri: ortakYeni
    }));
  }

  // Bölümler (var olan adımlarda)
  const yeniBolumler = new Set();
  const kaldirilanBolumler = new Set();
  for (const [id, { bolum, adimId }] of y.bolumler) {
    if (e.bolumler.has(id) || yeniAdimlar.has(adimId)) continue;
    yeniBolumler.add(id);
    const alanSayisi = [...y.alanlar.values()].filter((k) => k.bolumId === id).length;
    bulgular.push(bulguYap({
      tur: 'adimDegisikligi', altTur: 'yeniBolum', hedef: id, adimId, bolumId: id,
      baslik: `Yeni bölüm: ${bolum.baslik || id}`, konum: `${y.adimlar.get(adimId).sira + 1}. ${y.adimlar.get(adimId).adim.baslik || adimId}`,
      eski: null, yeni: { baslik: bolum.baslik || id, alanSayisi }, imzaDegeri: bolum
    }));
  }
  for (const [id, { bolum, adimId }] of e.bolumler) {
    if (y.bolumler.has(id) || kaldirilanAdimlar.has(adimId)) continue;
    kaldirilanBolumler.add(id);
    bulgular.push(bulguYap({
      tur: 'adimDegisikligi', altTur: 'kaldirilanBolum', hedef: id, adimId, bolumId: id,
      baslik: `Kaldırılan bölüm: ${bolum.baslik || id}`, konum: `${e.adimlar.get(adimId).sira + 1}. ${e.adimlar.get(adimId).adim.baslik || adimId}`,
      eski: { baslik: bolum.baslik || id }, yeni: null
    }));
  }

  // Alanlar: yeni / taşınan / özellik değişiklikleri
  for (const [id, yk] of y.alanlar) {
    const ek = e.alanlar.get(id);
    const ya = yk.alan;
    if (!ek) {
      // Yeni adım/bölüm ya da yeni üst alanın içindeyse ayrı bulgu değildir (üst bulguya dahildir).
      if (yeniAdimlar.has(yk.adimId) || yeniBolumler.has(yk.bolumId) || (yk.ebeveynId && !e.alanlar.has(yk.ebeveynId))) continue;
      bulgular.push(bulguYap({
        tur: 'yeniAlan', hedef: id, alanId: id, adimId: yk.adimId, bolumId: yk.bolumId, baslik: `Yeni alan: ${alanAdi(ya)}`, konum: konumMetni(y, id),
        eski: null,
        yeni: {
          etiket: etiketMetni(ya), tip: ya.tip, zorunlu: zorunluluk(ya), secenekSayisi: Array.isArray(ya.secenekler) ? ya.secenekler.length : 0,
          senaryoAnahtari: senaryoAnahtarlari(ya)[0] || null, gorunurluk: gorunurlukMetni(ya.gorunurluk),
          baglamGorunurlugu: nesneMi(yBg.alanlar[id]) ? kopya(yBg.alanlar[id]) : null
        },
        imzaDegeri: ya
      }));
      continue;
    }
    const ea = ek.alan;
    const konum = konumMetni(y, id);
    if (ek.bolumId !== yk.bolumId || ek.ebeveynId !== yk.ebeveynId || ek.liste !== yk.liste) {
      bulgular.push(bulguYap({
        tur: 'adimDegisikligi', altTur: 'alanTasindi', hedef: id, alanId: id, adimId: yk.adimId, bolumId: yk.bolumId,
        baslik: `Alan taşındı: ${alanAdi(ya)}`, konum, eski: konumMetni(e, id), yeni: konum,
        imzaDegeri: { bolumId: yk.bolumId, ebeveynId: yk.ebeveynId, liste: yk.liste }
      }));
    }
    if (ea.tip !== ya.tip) {
      bulgular.push(bulguYap({ tur: 'tipDegisikligi', hedef: id, alanId: id, baslik: `Tip değişti: ${alanAdi(ya)}`, konum, eski: ea.tip, yeni: ya.tip }));
    }
    if (!esit(ea.etiket || null, ya.etiket || null) && etiketMetni(ea) !== etiketMetni(ya)) {
      bulgular.push(bulguYap({
        tur: 'etiketDegisikligi', hedef: id, alanId: id, baslik: `Etiket değişti: ${alanAdi(ya)}`, konum,
        eski: etiketMetni(ea), yeni: etiketMetni(ya), imzaDegeri: ya.etiket || null
      }));
    }
    if (zorunluluk(ea) !== zorunluluk(ya)) {
      bulgular.push(bulguYap({ tur: 'zorunlulukDegisikligi', hedef: id, alanId: id, baslik: `Zorunluluk: ${alanAdi(ya)}`, konum, eski: zorunluluk(ea), yeni: zorunluluk(ya) }));
    }
    const es = tumSecenekler(ea);
    const ys = tumSecenekler(ya);
    const esK = new Set(es.map(secenekKimligi));
    const ysK = new Set(ys.map(secenekKimligi));
    for (const s of ys) {
      if (esK.has(secenekKimligi(s))) continue;
      bulgular.push(bulguYap({
        tur: 'yeniSecenek', hedef: id, alanId: id, secenekKimligi: secenekKimligi(s), baslik: `Yeni seçenek: ${secenekMetni(s)}`, konum: `${konum} › ${alanAdi(ya)}`,
        eski: null, yeni: { deger: secenekKimligi(s), metin: secenekMetni(s) }, secenek: { deger: secenekKimligi(s), metin: secenekMetni(s) }, imzaDegeri: s
      }));
    }
    for (const s of es) {
      if (ysK.has(secenekKimligi(s))) continue;
      bulgular.push(bulguYap({
        tur: 'kaldirilanSecenek', hedef: id, alanId: id, secenekKimligi: secenekKimligi(s), baslik: `Kaldırılan seçenek: ${secenekMetni(s)}`, konum: `${konum} › ${alanAdi(ya)}`,
        eski: { deger: secenekKimligi(s), metin: secenekMetni(s) }, yeni: null, secenek: { deger: secenekKimligi(s), metin: secenekMetni(s) }
      }));
    }
    if (!esit(ea.gorunurluk || null, ya.gorunurluk || null)) {
      bulgular.push(bulguYap({
        tur: 'gorunurlukDegisikligi', hedef: id, alanId: id, profil: null, baslik: `Görünürlük koşulu: ${alanAdi(ya)}`, konum,
        eski: gorunurlukMetni(ea.gorunurluk), yeni: gorunurlukMetni(ya.gorunurluk), imzaDegeri: ya.gorunurluk || null
      }));
    }
    // Bağlam profiline göre görünürlük: yalnızca YENİ pakette incelenen profiller ve bilinen (true/false) değerler.
    const yHarita = nesneMi(yBg.alanlar[id]) ? yBg.alanlar[id] : {};
    const eHarita = nesneMi(eBg.alanlar[id]) ? eBg.alanlar[id] : {};
    for (const profil of yBg.profiller) {
      const yd = yHarita[profil];
      if (yd !== true && yd !== false) continue;
      const ed = eHarita[profil];
      if (ed === yd) continue;
      bulgular.push(bulguYap({
        tur: 'gorunurlukDegisikligi', hedef: id, alanId: id, profil, baslik: `${alanAdi(ya)} — ${profil} profilinde ${yd ? 'görünüyor' : 'görünmüyor'}`, konum,
        eski: ed === true || ed === false ? ed : null, yeni: yd
      }));
    }
  }
  // Kaldırılan alanlar (kaldırılan adım/bölüm/üst alanın içindekiler ayrı bulgu değildir)
  for (const [id, ek] of e.alanlar) {
    if (y.alanlar.has(id)) continue;
    if (kaldirilanAdimlar.has(ek.adimId) || kaldirilanBolumler.has(ek.bolumId) || (ek.ebeveynId && !y.alanlar.has(ek.ebeveynId))) continue;
    bulgular.push(bulguYap({
      tur: 'kaldirilanAlan', hedef: id, alanId: id, adimId: ek.adimId, bolumId: ek.bolumId, baslik: `Kaldırılan alan: ${alanAdi(ek.alan)}`, konum: konumMetni(e, id),
      eski: { etiket: etiketMetni(ek.alan), tip: ek.alan.tip, senaryoAnahtari: senaryoAnahtarlari(ek.alan)[0] || null }, yeni: null
    }));
  }
  return bulgular;
}

/** Türe göre sayılar ({ toplam, turler: { tur: n } }). */
export function bulguOzeti(bulgular) {
  const turler = {};
  for (const b of bulgular) turler[b.tur] = (turler[b.tur] || 0) + 1;
  return { toplam: bulgular.length, turler };
}

// ---- Uygulama (kabul edilen bulgular → yeni model) -------------------------------------------

function alanKonumuBul(model, id) {
  let bulunan = null;
  const gez = (liste, bolum, adim, ebeveyn, listeAdi) => {
    if (!Array.isArray(liste) || bulunan) return;
    liste.forEach((a, i) => {
      if (bulunan || !nesneMi(a)) return;
      if (a.id === id) { bulunan = { alan: a, liste, index: i, bolum, adim, ebeveyn, listeAdi }; return; }
      gez(a.altAlanlar, bolum, adim, a, 'altAlanlar');
      gez(a.ekranAlanlari, bolum, adim, a, 'ekranAlanlari');
    });
  };
  for (const adim of model.adimlar || []) for (const bolum of adim.bolumler || []) gez(bolum.alanlar, bolum, adim, null, 'alanlar');
  return bulunan;
}

/** Hedef dizide, kaynak dizideki sırayı koruyarak (önceki/sonraki kardeşe göre) yerleştirir. */
function sirayaGoreEkle(hedef, oge, kaynak, kimlik = (x) => x.id) {
  const k = kaynak.findIndex((x) => kimlik(x) === kimlik(oge));
  for (let i = k - 1; i >= 0; i--) {
    const j = hedef.findIndex((x) => kimlik(x) === kimlik(kaynak[i]));
    if (j >= 0) { hedef.splice(j + 1, 0, oge); return; }
  }
  for (let i = k + 1; i < kaynak.length; i++) {
    const j = hedef.findIndex((x) => kimlik(x) === kimlik(kaynak[i]));
    if (j >= 0) { hedef.splice(j, 0, oge); return; }
  }
  if (k === 0) hedef.unshift(oge);
  else hedef.push(oge);
}

function baglamGorunurluguHazirla(model) {
  if (!nesneMi(model.baglamGorunurlugu)) model.baglamGorunurlugu = { profiller: [], alanlar: {} };
  const bg = model.baglamGorunurlugu;
  if (!Array.isArray(bg.profiller)) bg.profiller = [];
  if (!nesneMi(bg.alanlar)) bg.alanlar = {};
  return bg;
}

/** Model içindeki adlandırılmış başvurular: gorunurluk/seçenek "kosul" adları ve "senaryoAyari" adları. */
function basvurulariTopla(d, kosullar, ayarlar) {
  if (Array.isArray(d)) { for (const x of d) basvurulariTopla(x, kosullar, ayarlar); return; }
  if (!nesneMi(d)) return;
  for (const [k, v] of Object.entries(d)) {
    if (k === 'kosul' && typeof v === 'string') kosullar.add(v);
    else if (k === 'senaryoAyari' && typeof v === 'string') ayarlar.add(v);
    else basvurulariTopla(v, kosullar, ayarlar);
  }
}

/**
 * Kabul edilen bulguları ESKİ modele uygular (yalnızca onlar). Kabul edilen değişikliklerin başvurduğu
 * adlandırılmış koşullar ve senaryo ayarları eski modelde yoksa yeni modelden kopyalanır. Adım sıraları
 * 1..n yeniden numaralandırılır. Uygulanamayan bulgular (ör. üst adımı kabul edilmemiş yeni alan)
 * "atlananlar"da nedeniyle döner. Sonuç, çağıran tarafından model doğrulayıcısından geçirilmelidir.
 * @param {object} eski @param {object} yeni @param {Iterable<string>} kabulIdleri
 * @returns {{ model: object; uygulananlar: string[]; atlananlar: Array<{ id: string; neden: string }> }}
 */
export function bulgulariUygula(eski, yeni, kabulIdleri) {
  const kabul = new Set(kabulIdleri);
  const bulgular = modelFarki(eski, yeni).filter((b) => kabul.has(b.id));
  const r = kopya(eski);
  if (!Array.isArray(r.adimlar)) r.adimlar = [];
  const y = modelEnvanteri(yeni);
  const uygulananlar = [];
  const atlananlar = [];
  const atla = (b, neden) => atlananlar.push({ id: b.id, neden });
  const adimBul = (id) => r.adimlar.find((a) => a.id === id);
  const bolumBul = (id) => {
    for (const a of r.adimlar) for (const b of a.bolumler || []) if (b.id === id) return { adim: a, bolum: b };
    return null;
  };
  const oncelik = { yeniAdim: 0, kaldirilanAdim: 1, yeniBolum: 2, kaldirilanBolum: 3 };
  const sira = (b) => (b.tur === 'adimDegisikligi' && b.altTur in oncelik ? oncelik[b.altTur]
    : b.tur === 'kaldirilanAlan' ? 4 : b.tur === 'yeniAlan' ? 5 : b.altTur === 'alanTasindi' ? 6 : b.altTur === 'sira' ? 9 : 7);
  const kaldirilanAlanlar = new Set();

  /** Yeni modeldeki yerine göre alanı (kopyasını) r'ye yerleştirir; gerekirse bölümü oluşturur. */
  const alaniYerlestir = (b, id) => {
    const yk = y.alanlar.get(id);
    if (!yk) return 'yeni modelde alan yok';
    const oge = kopya(yk.alan);
    if (yk.ebeveynId) {
      const ust = alanKonumuBul(r, yk.ebeveynId);
      if (!ust) return 'üst alan mevcut modelde yok';
      const kaynak = y.alanlar.get(yk.ebeveynId).alan[yk.liste] || [];
      if (!Array.isArray(ust.alan[yk.liste])) ust.alan[yk.liste] = [];
      sirayaGoreEkle(ust.alan[yk.liste], oge, kaynak);
      return null;
    }
    let bulunan = bolumBul(yk.bolumId);
    if (!bulunan) {
      const adim = adimBul(yk.adimId);
      if (!adim || !Array.isArray(adim.bolumler)) return 'adım mevcut modelde yok (önce adım değişikliğini kabul edin)';
      const yBolum = y.bolumler.get(yk.bolumId).bolum;
      const bolum = { ...kopya(yBolum), alanlar: [] };
      sirayaGoreEkle(adim.bolumler, bolum, y.adimlar.get(yk.adimId).adim.bolumler || []);
      bulunan = { adim, bolum };
    }
    sirayaGoreEkle(bulunan.bolum.alanlar, oge, y.bolumler.get(yk.bolumId).bolum.alanlar || []);
    return null;
  };
  const alaniCikar = (id) => {
    const k = alanKonumuBul(r, id);
    if (!k) return false;
    k.liste.splice(k.index, 1);
    if (k.listeAdi !== 'alanlar' && k.ebeveyn && !k.liste.length) delete k.ebeveyn[k.listeAdi];
    if (k.listeAdi === 'alanlar' && !k.bolum.alanlar.length) k.adim.bolumler = k.adim.bolumler.filter((x) => x !== k.bolum);
    for (const alt of altKimlikler(k.alan)) kaldirilanAlanlar.add(alt);
    return true;
  };

  for (const b of bulgular.slice().sort((a, c) => sira(a) - sira(c))) {
    const yeniAlan = b.alanId ? (y.alanlar.get(b.alanId) || {}).alan : null;
    let neden = null;
    switch (b.tur) {
      case 'adimDegisikligi': {
        if (b.altTur === 'yeniAdim') {
          sirayaGoreEkle(r.adimlar, kopya(y.adimlar.get(b.adimId).adim), yeni.adimlar);
        } else if (b.altTur === 'kaldirilanAdim') {
          const adim = adimBul(b.adimId);
          if (!adim) { neden = 'adım zaten yok'; break; }
          for (const bolum of adim.bolumler || []) for (const a of bolum.alanlar || []) for (const alt of altKimlikler(a)) kaldirilanAlanlar.add(alt);
          r.adimlar = r.adimlar.filter((a) => a !== adim);
          if (Array.isArray(r.isKurallari)) r.isKurallari = r.isKurallari.filter((k) => !(nesneMi(k) && k.adim === b.adimId));
        } else if (b.altTur === 'baslik') {
          const adim = adimBul(b.adimId);
          if (!adim) { neden = 'adım mevcut modelde yok'; break; }
          adim.baslik = y.adimlar.get(b.adimId).adim.baslik;
        } else if (b.altTur === 'gorunurluk') {
          const adim = adimBul(b.adimId);
          if (!adim) { neden = 'adım mevcut modelde yok'; break; }
          const g = y.adimlar.get(b.adimId).adim.gorunurluk;
          if (g) adim.gorunurluk = kopya(g); else delete adim.gorunurluk;
        } else if (b.altTur === 'kosuTanimi') {
          const adim = adimBul(b.adimId);
          if (!adim) { neden = 'adım mevcut modelde yok'; break; }
          const k = y.adimlar.get(b.adimId).adim.kosu;
          if (k) adim.kosu = kopya(k); else delete adim.kosu;
        } else if (b.altTur === 'sira') {
          const hedefSira = yeni.adimlar.map((a) => a.id);
          const konum = (id) => { const i = hedefSira.indexOf(id); return i < 0 ? Number.MAX_SAFE_INTEGER : i; };
          const ortak = r.adimlar.filter((a) => hedefSira.includes(a.id)).sort((a, c) => konum(a.id) - konum(c.id));
          let i = 0;
          r.adimlar = r.adimlar.map((a) => (hedefSira.includes(a.id) ? ortak[i++] : a));
        } else if (b.altTur === 'yeniBolum') {
          const adim = adimBul(b.adimId);
          if (!adim || !Array.isArray(adim.bolumler)) { neden = 'adım mevcut modelde yok'; break; }
          sirayaGoreEkle(adim.bolumler, kopya(y.bolumler.get(b.bolumId).bolum), y.adimlar.get(b.adimId).adim.bolumler || []);
        } else if (b.altTur === 'kaldirilanBolum') {
          const bulunan = bolumBul(b.bolumId);
          if (!bulunan) { neden = 'bölüm zaten yok'; break; }
          for (const a of bulunan.bolum.alanlar || []) for (const alt of altKimlikler(a)) kaldirilanAlanlar.add(alt);
          bulunan.adim.bolumler = bulunan.adim.bolumler.filter((x) => x !== bulunan.bolum);
        } else if (b.altTur === 'alanTasindi') {
          const eskiYer = alanKonumuBul(r, b.alanId);
          if (!eskiYer) { neden = 'alan mevcut modelde yok'; break; }
          const korunan = eskiYer.alan;
          eskiYer.liste.splice(eskiYer.index, 1);
          if (eskiYer.listeAdi === 'alanlar' && !eskiYer.bolum.alanlar.length) eskiYer.adim.bolumler = eskiYer.adim.bolumler.filter((x) => x !== eskiYer.bolum);
          neden = alaniYerlestir(b, b.alanId);
          if (!neden) {
            // Taşınan alanın içeriği mevcut modeldeki gibi kalır (yalnızca yeri değişir).
            const yeniYer = alanKonumuBul(r, b.alanId);
            if (yeniYer) yeniYer.liste[yeniYer.index] = korunan;
          }
        }
        break;
      }
      case 'yeniAlan':
        if (alanKonumuBul(r, b.alanId)) { neden = 'alan zaten var'; break; }
        neden = alaniYerlestir(b, b.alanId);
        if (!neden) {
          const yh = baglamHaritasi(yeni).alanlar[b.alanId];
          if (nesneMi(yh)) {
            const bg = baglamGorunurluguHazirla(r);
            for (const p of Object.keys(yh)) if (!bg.profiller.includes(p)) bg.profiller.push(p);
            bg.alanlar[b.alanId] = kopya(yh);
          }
        }
        break;
      case 'kaldirilanAlan':
        if (!alaniCikar(b.alanId)) neden = 'alan zaten yok';
        break;
      default: {
        const k = alanKonumuBul(r, b.alanId);
        if (!k || !yeniAlan) { neden = 'alan mevcut modelde yok'; break; }
        const a = k.alan;
        if (b.tur === 'tipDegisikligi') a.tip = yeniAlan.tip;
        else if (b.tur === 'etiketDegisikligi') { if (yeniAlan.etiket) a.etiket = kopya(yeniAlan.etiket); else delete a.etiket; }
        else if (b.tur === 'zorunlulukDegisikligi') { if (yeniAlan.zorunlu === undefined) delete a.zorunlu; else a.zorunlu = yeniAlan.zorunlu; }
        else if (b.tur === 'yeniSecenek') {
          const s = (yeniAlan.secenekler || []).find((x) => nesneMi(x) && secenekKimligi(x) === b.secenek.deger);
          if (!s) { neden = 'seçenek yeni modelde yok'; break; }
          if (!Array.isArray(a.secenekler)) a.secenekler = [];
          if (a.secenekler.some((x) => nesneMi(x) && secenekKimligi(x) === b.secenek.deger)) { neden = 'seçenek zaten var'; break; }
          sirayaGoreEkle(a.secenekler, kopya(s), yeniAlan.secenekler, secenekKimligi);
        } else if (b.tur === 'kaldirilanSecenek') {
          if (!Array.isArray(a.secenekler)) { neden = 'seçenek zaten yok'; break; }
          const once = a.secenekler.length;
          a.secenekler = a.secenekler.filter((x) => !(nesneMi(x) && secenekKimligi(x) === b.secenek.deger));
          if (a.secenekler.length === once) neden = 'seçenek zaten yok';
        } else if (b.tur === 'gorunurlukDegisikligi' && b.profil === null) {
          if (yeniAlan.gorunurluk) a.gorunurluk = kopya(yeniAlan.gorunurluk); else delete a.gorunurluk;
        } else if (b.tur === 'gorunurlukDegisikligi') {
          const bg = baglamGorunurluguHazirla(r);
          if (!bg.profiller.includes(b.profil)) bg.profiller.push(b.profil);
          if (!nesneMi(bg.alanlar[b.alanId])) bg.alanlar[b.alanId] = {};
          bg.alanlar[b.alanId][b.profil] = b.yeni;
        }
      }
    }
    if (neden) atla(b, neden);
    else uygulananlar.push(b.id);
  }

  // Sıra numaraları, eksik başvurular (koşul/senaryo ayarı), bağlam görünürlüğü temizliği
  r.adimlar.forEach((a, i) => { a.sira = i + 1; });
  // Yeni modelden gelen sürüm 2 içeriği (adım koşu tanımı) şema sürümünü yükseltir (geriye uyumlu).
  if (r.adimlar.some((a) => nesneMi(a) && a.kosu !== undefined) && Number(yeni.semaSurumu) > Number(r.semaSurumu || 1)) r.semaSurumu = yeni.semaSurumu;
  const kosullar = new Set();
  const ayarlar = new Set();
  basvurulariTopla(r.adimlar, kosullar, ayarlar);
  if (!nesneMi(r.kosullar)) r.kosullar = {};
  const yeniKosullar = nesneMi(yeni.kosullar) ? yeni.kosullar : {};
  // Kopyalanan koşullar da başka koşullara/ayarlara başvurabilir: sabitlenene kadar tekrarlanır.
  for (let tur = 0; tur < 5; tur++) {
    let eklendi = false;
    for (const ad of kosullar) {
      if (!(ad in r.kosullar) && ad in yeniKosullar) { r.kosullar[ad] = kopya(yeniKosullar[ad]); basvurulariTopla(r.kosullar[ad], kosullar, ayarlar); eklendi = true; }
    }
    if (!eklendi) break;
  }
  for (const k of Object.values(r.kosullar)) basvurulariTopla(k, kosullar, ayarlar);
  const sd = nesneMi(r.senaryoDuzeyi) && Array.isArray(r.senaryoDuzeyi.alanlar) ? r.senaryoDuzeyi.alanlar : null;
  const ysd = nesneMi(yeni.senaryoDuzeyi) && Array.isArray(yeni.senaryoDuzeyi.alanlar) ? yeni.senaryoDuzeyi.alanlar : [];
  if (sd) {
    for (const ad of ayarlar) {
      if (sd.some((a) => nesneMi(a) && a.id === ad)) continue;
      const kaynak = ysd.find((a) => nesneMi(a) && a.id === ad);
      if (kaynak) sirayaGoreEkle(sd, kopya(kaynak), ysd);
    }
  }
  if (nesneMi(r.baglamGorunurlugu)) {
    const bg = baglamGorunurluguHazirla(r);
    const mevcut = modelEnvanteri(r).alanlar;
    for (const id of Object.keys(bg.alanlar)) if (!mevcut.has(id) || kaldirilanAlanlar.has(id)) delete bg.alanlar[id];
    if (!bg.profiller.length && !Object.keys(bg.alanlar).length) delete r.baglamGorunurlugu;
  }
  return { model: r, uygulananlar, atlananlar };
}

// ---- Etki (bulgu → etkilenen senaryolar) -----------------------------------------------------

const bosMu = (d) => d === undefined || d === null || (typeof d === 'string' && d.trim() === '');
const ATANABILIR_TIPLER = new Set(['secim', 'radyo', 'okluSecim', 'metin', 'sayi', 'tarih', 'telefon', 'onayKutusu']);

/**
 * Bulguların senaryolara etkisi. senaryolar: çözülmüş veriyle (sunucuda) —
 *   [{ id, baslik, veri: { senaryoAnahtarı: değer }, mutlakaGorunmeli: [alanId], baglamProfili: ad | null }]
 * Dönen her kayıt: { bulguId, tur, mesaj, anahtar, atanabilir, alanTipi, secenekler, kosullu, senaryolar: [{ id, baslik, deger? }] }
 * Değerler YALNIZCA seçenek alanlarında döner (seçenek değeri gizli bilgi değildir); diğerlerinde verilmez.
 * @param {Array<object>} bulgular @param {object} eskiModel @param {object} yeniModel @param {Array<object>} senaryolar
 */
export function etkiHesapla(bulgular, eskiModel, yeniModel, senaryolar) {
  const e = modelEnvanteri(eskiModel);
  const y = modelEnvanteri(yeniModel);
  const alanTanimi = (id) => (y.alanlar.get(id) || e.alanlar.get(id) || {}).alan || null;
  const sonuc = [];
  for (const b of bulgular) {
    const alan = b.alanId ? alanTanimi(b.alanId) : null;
    const anahtarlar = alan ? senaryoAnahtarlari(alan) : [];
    const anahtar = anahtarlar.length === 1 ? anahtarlar[0] : null;
    const senaryoAlani = alan && alan.yapilandirma === 'senaryo';
    const kayit = { bulguId: b.id, tur: 'yok', mesaj: '', anahtar, atanabilir: false, alanTipi: alan ? alan.tip : null, secenekler: null, kosullu: Boolean(alan && alan.gorunurluk), senaryolar: [] };
    const secenekDegeri = (d) => (nesneMi(d) ? d.deger : d);
    const zorunluYeni = (b.tur === 'yeniAlan' && b.yeni && b.yeni.zorunlu === true) || (b.tur === 'zorunlulukDegisikligi' && b.yeni === true);
    if (zorunluYeni && senaryoAlani && anahtar) {
      kayit.tur = 'eksikDeger';
      kayit.senaryolar = senaryolar.filter((s) => bosMu(s.veri[anahtar])).map((s) => ({ id: s.id, baslik: s.baslik }));
      kayit.atanabilir = ATANABILIR_TIPLER.has(alan.tip);
      kayit.secenekler = Array.isArray(alan.secenekler) ? alan.secenekler.filter(nesneMi).map((s) => ({ deger: secenekKimligi(s), metin: secenekMetni(s) })) : null;
      kayit.mesaj = kayit.senaryolar.length
        ? `Zorunlu alan ${kayit.senaryolar.length} senaryoda boş.${kayit.kosullu ? ' Alan koşullu: yalnızca görünür olduğu akışlarda gerekir.' : ''}`
        : 'Tüm senaryolarda bu alanın değeri var.';
    } else if (b.tur === 'kaldirilanSecenek' && anahtar) {
      kayit.tur = 'kullanilanSecenek';
      kayit.senaryolar = senaryolar.filter((s) => String(secenekDegeri(s.veri[anahtar]) ?? '') === b.secenek.deger).map((s) => ({ id: s.id, baslik: s.baslik, deger: b.secenek.deger }));
      kayit.mesaj = kayit.senaryolar.length ? `Kaldırılan seçenek ${kayit.senaryolar.length} senaryoda kullanılıyor; bu senaryolar düzenlenmeli.` : 'Kaldırılan seçeneği kullanan senaryo yok.';
    } else if (b.tur === 'kaldirilanAlan' || (b.tur === 'adimDegisikligi' && (b.altTur === 'kaldirilanBolum' || b.altTur === 'kaldirilanAdim'))) {
      const kimlikler = new Set();
      const anahtarKumesi = new Set();
      const topla = (a) => { for (const id of altKimlikler(a)) { kimlikler.add(id); const x = (e.alanlar.get(id) || {}).alan; for (const k of senaryoAnahtarlari(x)) anahtarKumesi.add(k); } };
      if (b.tur === 'kaldirilanAlan' && alan) topla(alan);
      else for (const k of e.alanlar.values()) if ((b.altTur === 'kaldirilanAdim' ? k.adimId === b.adimId : k.bolumId === b.bolumId) && !k.ebeveynId) topla(k.alan);
      kayit.tur = 'kaldirilanAlanKullanimi';
      kayit.senaryolar = senaryolar.filter((s) => [...anahtarKumesi].some((k) => !bosMu(s.veri[k])) || (s.mutlakaGorunmeli || []).some((id) => kimlikler.has(id)))
        .map((s) => ({ id: s.id, baslik: s.baslik, mutlakaGorunmeli: (s.mutlakaGorunmeli || []).some((id) => kimlikler.has(id)) }));
      kayit.mesaj = kayit.senaryolar.length
        ? `${kayit.senaryolar.length} senaryo kaldırılan alana değer veriyor ya da onu "mutlaka görünmeli" olarak işaretlemiş.`
        : 'Kaldırılan alana başvuran senaryo yok.';
    } else if (b.tur === 'tipDegisikligi' && anahtar) {
      kayit.tur = 'tipKontrolu';
      kayit.senaryolar = senaryolar.filter((s) => !bosMu(s.veri[anahtar])).map((s) => ({ id: s.id, baslik: s.baslik }));
      kayit.mesaj = kayit.senaryolar.length ? `${kayit.senaryolar.length} senaryodaki değer yeni tipe (${b.yeni}) göre kontrol edilmeli.` : 'Bu alana değer veren senaryo yok.';
    } else if (b.tur === 'gorunurlukDegisikligi' && b.profil && b.yeni === false) {
      kayit.tur = 'gorunmezProfil';
      kayit.senaryolar = senaryolar.filter((s) => s.baglamProfili === b.profil && ((anahtar && !bosMu(s.veri[anahtar])) || (s.mutlakaGorunmeli || []).includes(b.alanId)))
        .map((s) => ({ id: s.id, baslik: s.baslik, mutlakaGorunmeli: (s.mutlakaGorunmeli || []).includes(b.alanId) }));
      kayit.mesaj = kayit.senaryolar.length
        ? `"${b.profil}" profiliyle koşan ${kayit.senaryolar.length} senaryo bu alanı kullanıyor: alan görünmediği için atlanır; "mutlaka görünmeli" işaretliyse test başarısız olur.`
        : `"${b.profil}" profiliyle bu alanı kullanan senaryo yok.`;
    }
    sonuc.push(kayit);
  }
  return sonuc;
}
