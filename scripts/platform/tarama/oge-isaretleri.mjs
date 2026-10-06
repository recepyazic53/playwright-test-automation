// "SAYFADA SEÇ" VE "DÜĞMEYİ VE SONUCU İŞARETLE" (genel, saf fonksiyonlar) — öğe seçmenin (tarama/oge-secme-motoru.ts) sonucu
// ile otomatik taramanın ekran paketini birleştirir. Hiçbir proje / ürün adı içermez.
//
//   secilenOgeleriAyikla  alt süreçten ya da arayüzden gelen seçilen öğeleri doğrular (tür, seçici, metin; DEĞER yoktur).
//   kesifBulgulari        taramanın keşiften bulduğu görünürlük koşulları ve bağımlı listeler (önizlemede onaya sunulur).
//   taramaIsaretleriniUygula  seçilen öğeleri ve onaylanmayan keşif bulgularını tarama paketine uygular:
//     düğme    → "İşlemler" bölümünde aksiyon öğesi + adımın kosu.aksiyonlar'ında tıklama (seçim sırasıyla),
//     sonuç    → "İşlemler" bölümünde çıktı öğesi; başarı göstergesi seçilmediyse sonucun metni (sabit kısmı) ya da boş
//                olmaması başarı sayılır,
//     başarı göstergesi → kosu.basariGostergesi (metnin sabit kısmı; metin yoksa öğe görünür),
//     hata göstergesi   → kosu.hataGostergesi (iş kuralı uyarılarının okunduğu öğe),
//     alan     → formun "Sayfada seçilen alanlar" bölümüne senaryo alanı.
//   Koşu tanımı eklenince model şema sürümü 2 olur; "adım/aksiyon çıkarılamadı" bilinmeyeni kalkar.
// NOT: import.meta KULLANILMAZ (birim testleri bu dosyayı CommonJS'e çevirir). Tipler: oge-isaretleri.d.mts.

import { etiketMetni } from '../tablolar/secime-gore-bag.mjs';
import { AKSIYON_BILINMEYENI, alanDonusturucu, kimlikUret, sabitGostergeMetni, temizMetin } from './paket-olusturucu.mjs';

/** Seçilen öğenin türleri (sırası arayüzdeki sıradır). */
export const OGE_TURLERI = Object.freeze(['dugme', 'sonuc', 'alan', 'basari', 'hata']);
/** Türlerin kullanıcıya görünen adları. */
export const OGE_TUR_ADLARI = Object.freeze({ dugme: 'Düğme (aksiyon)', sonuc: 'Sonuç (çıktı)', alan: 'Alan', basari: 'Başarı göstergesi', hata: 'Hata göstergesi' });
/** Tek işte en fazla seçilen öğe. */
export const OGE_EN_COK = 30;
/** Seçici üretim sırası (önce rol ve metin, sonra kimlik ve etiket, son çare CSS). */
export const SECICI_TURLERI = Object.freeze(['rol', 'metin', 'kimlik', 'etiket', 'css']);
/** Elle (form alanı olmayan öğeden) eklenen alanın türleri (akış diyagramının elle alan türleriyle aynı). */
export const ALAN_TURLERI = Object.freeze(['text', 'number', 'date', 'tel', 'email', 'textarea', 'checkbox']);
const KIRILGANLIKLAR = ['dusuk', 'orta', 'yuksek'];
const SECICI_EN_UZUN = 500;
/** "Sayfada seçilen alanlar" bölümünün başlığı. */
const SECILEN_BOLUM = 'Sayfada seçilen alanlar';

/** @param {unknown} d @returns {d is Record<string, any>} */
const nesneMi = (d) => typeof d === 'object' && d !== null && !Array.isArray(d);
/** @template T @param {T} d @returns {T} */
const kopya = (d) => JSON.parse(JSON.stringify(d));
/** @param {unknown} d @param {number} n */
const metin = (d, n) => (typeof d === 'string' && d.trim() ? d.replace(/\s+/g, ' ').trim().slice(0, n) : null);
/** @param {unknown} c */
const cerceveEki = (c) => (Array.isArray(c) && c.length ? { cerceve: c.map(String) } : {});
/** Kümede olmayan kimlik (çakışırsa 2, 3… eklenir). @param {string} temel @param {Set<string>} kullanilan */
function benzersiz(temel, kullanilan) {
  let aday = temel;
  for (let i = 2; kullanilan.has(aday); i++) aday = `${temel}${i}`;
  kullanilan.add(aday);
  return aday;
}

/** Seçici geçerli mi (boş olmayan, tek satır, sınırlı; tam adres değil). @param {unknown} s */
function seciciGecerli(s) {
  return typeof s === 'string' && s.trim() !== '' && s.length <= SECICI_EN_UZUN && !/[\r\n]/.test(s) && !/^[a-z][a-z0-9+.-]*:\/\//i.test(s.trim());
}

/**
 * Ham alan (sayfa envanteri biçimi) — seçilen form alanının yapısı. Değer alanı yoktur; bilinmeyen anahtarlar atılır.
 * @param {unknown} a @returns {import('./paket-olusturucu.d.mts').HamAlan | null}
 */
function hamAlanAyikla(a) {
  if (!nesneMi(a) || typeof a.anahtar !== 'string' || typeof a.tur !== 'string' || !seciciGecerli(a.secici) || !nesneMi(a.bolum)) return null;
  const secenek = (/** @type {unknown} */ x) => (nesneMi(x) && typeof x.deger === 'string' ? { deger: x.deger.slice(0, 200), metin: metin(x.metin, 200) ?? x.deger.slice(0, 200) } : null);
  /** @type {import('./paket-olusturucu.d.mts').HamAlan} */
  const h = {
    anahtar: a.anahtar.slice(0, 300), tur: a.tur.slice(0, 30), etiket: metin(a.etiket, 160), etiketKaynagi: null,
    kimlik: metin(a.kimlik, 200), ad: metin(a.ad, 200), secici: String(a.secici).trim(), kirilganlik: KIRILGANLIKLAR.includes(a.kirilganlik) ? a.kirilganlik : 'orta',
    adaySeciciler: (Array.isArray(a.adaySeciciler) ? a.adaySeciciler : []).filter(seciciGecerli).slice(0, 12).map(String),
    zorunlu: a.zorunlu === true, devreDisi: a.devreDisi === true, saltOkunur: a.saltOkunur === true, coklu: a.coklu === true,
    bolum: { anahtar: 'secilen', baslik: SECILEN_BOLUM }
  };
  if (Array.isArray(a.secenekler)) h.secenekler = a.secenekler.slice(0, 300).map(secenek).filter((x) => x !== null);
  if (Array.isArray(a.radyolar)) {
    h.radyolar = a.radyolar.slice(0, 100).filter((r) => nesneMi(r) && typeof r.deger === 'string')
      .map((r) => ({ deger: String(r.deger).slice(0, 200), metin: metin(r.metin, 200), secici: seciciGecerli(r.secici) ? String(r.secici) : null }));
  }
  if (typeof a.kabul === 'string') h.kabul = a.kabul.slice(0, 200);
  if (typeof a.grup === 'string') h.grup = a.grup.slice(0, 200);
  if (Array.isArray(a.cerceve) && a.cerceve.length && a.cerceve.length <= 2 && a.cerceve.every((c) => typeof c === 'string' && c)) h.cerceve = a.cerceve.map(String);
  if (a.ozelBilesen === true) { h.ozelBilesen = true; h.bilesen = seciciGecerli(a.bilesen) ? String(a.bilesen) : null; }
  return h;
}

/**
 * Seçilen öğeleri doğrular. izinliTurler verilirse (ör. akış diyagramında düğme / alan / başarı göstergesi) diğer türler reddedilir.
 * @param {unknown} ham @param {readonly string[]} [izinliTurler]
 * @returns {{ ogeler: import('./oge-isaretleri.d.mts').SecilenOge[]; hatalar: string[] }}
 */
/** Seçilen öğenin ekran görüntüsünün en çok uzunluğu (data adresi, karakter). */
export const GORUNTU_EN_COK = 550_000;

export function secilenOgeleriAyikla(ham, izinliTurler = OGE_TURLERI) {
  /** @type {string[]} */
  const hatalar = [];
  if (!Array.isArray(ham)) return { ogeler: [], hatalar: ['Seçilen öğeler okunamadı.'] };
  if (ham.length > OGE_EN_COK) return { ogeler: [], hatalar: [`En fazla ${OGE_EN_COK} öğe seçilebilir.`] };
  /** @type {import('./oge-isaretleri.d.mts').SecilenOge[]} */
  const ogeler = [];
  ham.forEach((o, i) => {
    const ad = `${i + 1}. öğe`;
    if (!nesneMi(o)) { hatalar.push(`${ad} okunamadı.`); return; }
    if (!OGE_TURLERI.includes(o.tur) || !izinliTurler.includes(o.tur)) { hatalar.push(`${ad}: türü ${izinliTurler.map((t) => /** @type {Record<string, string>} */ (OGE_TUR_ADLARI)[t]).join(', ')} olmalı.`); return; }
    if (!seciciGecerli(o.secici)) { hatalar.push(`${ad}: seçicisi geçersiz.`); return; }
    /** @type {import('./oge-isaretleri.d.mts').SecilenOge} */
    const s = {
      tur: o.tur, secici: String(o.secici).trim(), kirilganlik: KIRILGANLIKLAR.includes(o.kirilganlik) ? o.kirilganlik : 'orta',
      seciciTuru: SECICI_TURLERI.includes(o.seciciTuru) ? o.seciciTuru : 'css', metin: metin(o.metin, 200),
      ...cerceveEki(Array.isArray(o.cerceve) && o.cerceve.length <= 2 && o.cerceve.every((c) => typeof c === 'string' && c) ? o.cerceve : null),
      adaySeciciler: (Array.isArray(o.adaySeciciler) ? o.adaySeciciler : []).filter(seciciGecerli).slice(0, 12).map(String),
      // Hata penceresi gibi görsel tanımlanan öğenin küçük ekran görüntüsü (PNG data adresi; yalnız listede gösterilir, eşleştirmede kullanılmaz).
      ...(typeof o.goruntu === 'string' && /^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(o.goruntu) && o.goruntu.length <= GORUNTU_EN_COK ? { goruntu: o.goruntu } : {})
    };
    if (o.tur === 'alan') {
      const h = o.alan === undefined || o.alan === null ? null : hamAlanAyikla(o.alan);
      if (o.alan !== undefined && o.alan !== null && !h) { hatalar.push(`${ad}: alanın yapısı okunamadı.`); return; }
      if (h) s.alan = h;
      else if (typeof o.alanTuru === 'string' && ALAN_TURLERI.includes(o.alanTuru)) s.alanTuru = o.alanTuru;
      else { hatalar.push(`${ad}: alanın türünü seçin.`); return; }
      if (!h && !s.metin) { hatalar.push(`${ad}: alanın etiketini yazın.`); return; }
    }
    ogeler.push(s);
  });
  return { ogeler, hatalar };
}

/**
 * Keşfin modele yazdığı görünürlük koşulları ve bağımlı listeler (önizlemede onaya sunulur). anahtar: "gorunurluk:<alan>" ya
 * da "bagimlilik:<alan>" (reddedilenler bu anahtarlarla gönderilir).
 * @param {Record<string, any>} model
 * @returns {import('./oge-isaretleri.d.mts').KesifBulgusu[]}
 */
export function kesifBulgulari(model) {
  /** @type {import('./oge-isaretleri.d.mts').KesifBulgusu[]} */
  const sonuc = [];
  const kosullar = nesneMi(model.kosullar) ? model.kosullar : {};
  const alanlar = (Array.isArray(model.adimlar) ? model.adimlar : []).filter(nesneMi)
    .flatMap((a) => (Array.isArray(a.bolumler) ? a.bolumler : []).filter(nesneMi).flatMap((b) => (Array.isArray(b.alanlar) ? b.alanlar : []).filter(nesneMi)));
  const etiketi = (/** @type {Record<string, any>} */ a) => etiketMetni(a.etiket, a.id);
  const adi = (/** @type {string} */ id) => { const a = alanlar.find((x) => x.id === id); return a ? etiketi(a) : id; };
  for (const a of alanlar) {
    const k = nesneMi(a.gorunurluk) && typeof a.gorunurluk.kosul === 'string' ? kosullar[a.gorunurluk.kosul] : null;
    if (nesneMi(k) && typeof k.aciklama === 'string' && k.aciklama.includes('(otomatik tarama keşfi)')) {
      sonuc.push({ anahtar: `gorunurluk:${a.id}`, tur: 'gorunurluk', alanId: String(a.id), etiket: etiketi(a), aciklama: k.aciklama.replace(/ \(otomatik tarama keşfi\)\.$/, '.') });
    }
    if (nesneMi(a.bagimlilik) && a.seceneklerKaynagi === 'otomatik tarama keşfi (bağımlı liste)' && typeof a.bagimlilik.alan === 'string') {
      const h = nesneMi(a.bagimlilik.secenekHaritasi) ? a.bagimlilik.secenekHaritasi : {};
      const ornek = Object.entries(h).slice(0, 2).map(([d, l]) => `${d} → ${(Array.isArray(l) ? l : []).slice(0, 3).map((x) => (nesneMi(x) ? x.metin ?? x.deger : '')).join(', ')}`);
      sonuc.push({
        anahtar: `bagimlilik:${a.id}`, tur: 'bagimlilik', alanId: String(a.id), etiket: etiketi(a),
        aciklama: `Seçenekleri "${adi(a.bagimlilik.alan)}" seçimine bağlı (${Object.keys(h).length} değer${a.seceneklerDurumu === 'kismi' ? ', kısmi' : ''}; ör. ${ornek.join(' · ')}).`
      });
    }
  }
  return sonuc;
}

/**
 * Seçilen öğeleri ve onaylanmayan keşif bulgularını tarama paketine uygular (paketin KOPYASI döner; paket doğrulayıcıdan geçmelidir).
 * Öğeler modelin ekran adımlarından SONUNCUSUNA yazılır (tarama tek adımlı taslak üretir; adım yoksa oluşturulur).
 * @param {Record<string, any>} paket @param {{ ogeler: import('./oge-isaretleri.d.mts').SecilenOge[]; reddedilenler?: string[] }} g
 * @returns {{ paket: Record<string, any>; ozet: import('./oge-isaretleri.d.mts').IsaretOzeti }}
 */
export function taramaIsaretleriniUygula(paket, g) {
  const p = kopya(paket);
  const model = /** @type {Record<string, any>} */ (p.model);
  const reddedilen = new Set((g.reddedilenler ?? []).filter((x) => typeof x === 'string'));
  const sayac = { gizlenen: 0 };
  /** @type {import('./oge-isaretleri.d.mts').IsaretOzeti} */
  const ozet = { dugme: 0, sonuc: 0, alan: 0, basari: 0, hata: 0, reddedilen: 0 };

  // 1) Onaylanmayan keşif bulguları: görünürlük koşulu (koşul adı başka yerde kullanılmıyorsa silinir) ve bağımlı liste kaldırılır.
  const tumAlanlar = () => (Array.isArray(model.adimlar) ? model.adimlar : []).filter(nesneMi)
    .flatMap((a) => (Array.isArray(a.bolumler) ? a.bolumler : []).filter(nesneMi).flatMap((b) => (Array.isArray(b.alanlar) ? b.alanlar : []).filter(nesneMi)));
  for (const a of tumAlanlar()) {
    if (reddedilen.has(`gorunurluk:${a.id}`) && nesneMi(a.gorunurluk)) {
      const ad = a.gorunurluk.kosul;
      delete a.gorunurluk;
      if (typeof ad === 'string' && nesneMi(model.kosullar) && !JSON.stringify(model.adimlar).includes(`"kosul":${JSON.stringify(ad)}`)) delete model.kosullar[ad];
      ozet.reddedilen++;
    }
    if (reddedilen.has(`bagimlilik:${a.id}`) && nesneMi(a.bagimlilik)) {
      delete a.bagimlilik;
      if (Array.isArray(a.notlar)) a.notlar = a.notlar.filter((/** @type {unknown} */ n) => !(typeof n === 'string' && n.startsWith('Seçenekleri "')));
      ozet.reddedilen++;
    }
  }

  // 2) Seçilen öğeler: son ekran adımına.
  const ogeler = g.ogeler;
  if (ogeler.length) {
    if (!Array.isArray(model.adimlar)) model.adimlar = [];
    let adim = [...model.adimlar].reverse().find((a) => nesneMi(a) && Array.isArray(a.bolumler) && !a.altModel && !a.ortakAkis && !a.sqlKontrolu && !a.dosyaKontrolu && !a.yenidenGiris);
    if (!adim) {
      adim = { id: 'form', sira: model.adimlar.length + 1, baslik: `${String(model.ad || 'Ekran')} formu doldurulur`, bolumler: [] };
      model.adimlar.push(adim);
    }
    const kullanilan = new Set(tumAlanlar().map((a) => String(a.id)));
    if (nesneMi(model.senaryoDuzeyi) && Array.isArray(model.senaryoDuzeyi.alanlar)) for (const a of model.senaryoDuzeyi.alanlar) if (nesneMi(a)) kullanilan.add(String(a.id));
    const bolumIdleri = new Set(model.adimlar.filter(nesneMi).flatMap((a) => (Array.isArray(a.bolumler) ? a.bolumler : []).map((/** @type {any} */ b) => String(b.id))));
    /** @param {string} baslik */
    const bolum = (baslik) => {
      let b = adim.bolumler.find((/** @type {any} */ x) => nesneMi(x) && x.baslik === baslik);
      if (!b) {
        b = { id: benzersiz(kimlikUret(baslik, 'bolum'), bolumIdleri), baslik, alanlar: [] };
        // "İşlemler" en sonda; seçilen alanlar ondan önce.
        const islem = adim.bolumler.findIndex((/** @type {any} */ x) => nesneMi(x) && x.baslik === 'İşlemler');
        if (baslik !== 'İşlemler' && islem >= 0) adim.bolumler.splice(islem, 0, b); else adim.bolumler.push(b);
      }
      return b;
    };
    const { taslakAlan } = alanDonusturucu(sayac);
    const kosu = nesneMi(adim.kosu) ? adim.kosu : {};
    /** @type {Array<Record<string, unknown>>} */
    const aksiyonlar = Array.isArray(kosu.aksiyonlar) ? kosu.aksiyonlar : [];
    /** @type {Record<string, unknown> | null} */
    let sonucGostergesi = null;
    for (const o of ogeler) {
      const m = temizMetin(o.metin, sayac, 120);
      const konum = { secici: o.secici, kirilganlik: o.kirilganlik, ...cerceveEki(o.cerceve) };
      if (o.tur === 'dugme') {
        bolum('İşlemler').alanlar.push({ id: benzersiz(kimlikUret(m ?? '', 'dugme'), kullanilan), tip: 'buton', yapilandirma: 'aksiyon', etiket: { ekran: m }, konum });
        aksiyonlar.push({ tur: 'tikla', secici: o.secici, ...(m ? { aciklama: m } : {}), ...cerceveEki(o.cerceve) });
        ozet.dugme++;
      } else if (o.tur === 'sonuc') {
        const sabit = sabitGostergeMetni(m);
        bolum('İşlemler').alanlar.push({ id: benzersiz(kimlikUret(sabit ?? 'sonuc', 'sonuc'), kullanilan), tip: 'cikti', yapilandirma: 'cikti', etiket: { ekran: sabit ?? 'Sonuç' }, konum });
        // Başarı: sonucun metninin sabit kısmı görünür; yoksa öğede boş olmayan bir metin (sonuç yazıldı).
        if (!sonucGostergesi) sonucGostergesi = sabit ? { tur: 'metin', deger: sabit, secici: o.secici, ...cerceveEki(o.cerceve) } : { tur: 'desen', deger: '\\S', secici: o.secici, ...cerceveEki(o.cerceve) };
        ozet.sonuc++;
      } else if (o.tur === 'basari') {
        const sabit = sabitGostergeMetni(m);
        kosu.basariGostergesi = sabit ? { tur: 'metin', deger: sabit, secici: o.secici, ...cerceveEki(o.cerceve) } : { tur: 'eleman', deger: o.secici, ...cerceveEki(o.cerceve) };
        ozet.basari++;
      } else if (o.tur === 'hata') {
        kosu.hataGostergesi = { secici: o.secici, ...cerceveEki(o.cerceve) };
        ozet.hata++;
      } else {
        /** @type {import('./paket-olusturucu.d.mts').HamAlan} */
        const h = o.alan ? { ...o.alan, bolum: { anahtar: 'secilen', baslik: SECILEN_BOLUM } } : {
          anahtar: `secilen:${o.secici}`, tur: o.alanTuru ?? 'text', etiket: m, etiketKaynagi: null, kimlik: null, ad: null, secici: o.secici,
          kirilganlik: o.kirilganlik, adaySeciciler: o.adaySeciciler ?? [o.secici], zorunlu: false, devreDisi: false, saltOkunur: false, coklu: false,
          bolum: { anahtar: 'secilen', baslik: SECILEN_BOLUM }, ...cerceveEki(o.cerceve)
        };
        const id = benzersiz(kimlikUret(h.kimlik || h.ad || h.etiket || h.tur, h.tur === 'radio' ? 'secenek' : 'alan'), kullanilan);
        const alan = taslakAlan(h, id);
        alan.notlar = [...(Array.isArray(alan.notlar) ? alan.notlar : []), 'Sayfada seçildi.'];
        bolum(SECILEN_BOLUM).alanlar.push(alan);
        ozet.alan++;
      }
    }
    if (!kosu.basariGostergesi && sonucGostergesi) kosu.basariGostergesi = sonucGostergesi;
    if (aksiyonlar.length) kosu.aksiyonlar = aksiyonlar;
    if (Object.keys(kosu).length) {
      adim.kosu = kosu;
      model.semaSurumu = 2;
    }
    // Aksiyon ya da gösterge tanımlandı: "adım/aksiyon çıkarılamadı" bilinmeyeni kalkar.
    if (kosu.aksiyonlar || kosu.basariGostergesi) {
      if (Array.isArray(model.bilinmeyenler)) model.bilinmeyenler = model.bilinmeyenler.filter((/** @type {unknown} */ b) => b !== AKSIYON_BILINMEYENI);
      if (Array.isArray(p.bilinmeyenler)) p.bilinmeyenler = p.bilinmeyenler.filter((/** @type {unknown} */ b) => b !== AKSIYON_BILINMEYENI);
    }
    if (!kosu.basariGostergesi && Array.isArray(p.bilinmeyenler)) p.bilinmeyenler.push('Sonuç ya da başarı göstergesi işaretlenmedi: düğmeye basıldıktan sonraki sonuç doğrulanmaz.');
    if (typeof model.aciklama === 'string' && ozet.dugme + ozet.sonuc + ozet.basari) {
      model.aciklama = model.aciklama.replace(/ Adım\/aksiyon tanımları ve iş kuralları yapay zekâ aracınızla ya da akış kaydıyla tamamlanmalı\.$/, ' Düğme ve sonuç sayfada seçilerek işaretlendi.');
    }
  }
  if (sayac.gizlenen && Array.isArray(p.bilinmeyenler)) p.bilinmeyenler.push(`${sayac.gizlenen} metin gizli/kişisel veri kalıbına benzediği için yazılmadı.`);
  if (nesneMi(p.meta)) p.meta.not = `${String(p.meta.not ?? '')}${ogeler.length ? ` Düğme / sonuç / alan kullanıcı tarafından sayfada seçildi (${ogeler.length} öğe; seçim sırasında sayfaya tıklama iletilmedi).` : ''}`.trim();
  // Çoklu akış: varsayılan akışın kopyası eşitlenir.
  if (Array.isArray(model.akislar)) model.akislar = model.akislar.map((/** @type {unknown} */ a) => (nesneMi(a) && a.varsayilan === true ? { ...a, adimlar: model.adimlar } : a));
  return { paket: p, ozet };
}
