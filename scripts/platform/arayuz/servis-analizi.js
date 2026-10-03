// SERVİS ANALİZİ (A aşaması) — arayüz. Çıkarım saf modülde (servis-analizi.mjs; sunucu testleriyle ORTAK); burada:
//  - analizBagla: metot alan tablosunun (servis-alanlari.js) ÜSTÜNE "Örnek istekler (gövde XML / JSON)" bölümü — "+ Gövde XML ekle" ile
//    adlı örnekler (düzenle / sil; gizli adlı alanların değeri önizlemede maskeli), örnekler değişince analiz anında yeniden çalışır;
//    öneriler alan tablosunda satır başına (güç rozeti +
//    kanıt + Uygula / Yoksay), önerilen tablo sütunu seçim kutusunun yanında rozetle; "Tablo önerileri" bölümü (mevcut tablolara bağ /
//    yeni tablolar önizlemesiyle); "Güçlü önerileri uygula" yalnız güçlüleri kapsar (zayıflar tek tek, çelişki notları hiç).
//    Sihirbazda güçlü tablo eşleşmesi önseçili gelir (Uygula onaylar, Yoksay kaldırır).
//  - tabloIslemSecimi: yeni tablonun aynı adlı tabloya Birleştir / Yeni ad / Atla seçimi (sihirbaz Özet adımı ve analiz sayfası).
//  - servisAnaliziSayfasi: kayıtlı servis için "Servisi analiz et" (#/servisler/s/<id>/analiz): kayıtlı örnekler, ek kanıt (kayıtlı
//    senaryo gövdeleri / son koşu istekleri — kullanıcı onay kutusuyla dahil eder), uygulanan öneri yeniden sorulmaz, Yoksay hatırlanır;
//    değişiklikler servisin ayarlarına (mevcut kayıt ucu) yazılır.
// Hiçbir servise istek atılmaz; analiz tamamen tarayıcıda çalışır.
import { api, bildir, h, ikon, rozet, yeniKimlik, yerlestir } from './ortak.js';
import { alanAdi, farkKaydi, gucluOneriler, oneriyiUygula, oneriyiYoksay, servisAnalizi } from './servis-analizi.mjs';
import { adaGoreMaskele } from './gizli-adlar.mjs';
import { alanSatirlari, semaBirlestir } from './servis-govdesi.mjs';
import { metotKutulari } from './servis-alanlari.js';
import { kosuOnerileri } from './kosu-ogrenmesi.mjs';

const MASKE = '••••••';
const KAYNAK_ADI = { soapui: 'SoapUI', postman: 'Postman', curl: 'cURL' };
const ornekKimligi = () => `o${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
const kopya = (/** @type {any} */ x) => JSON.parse(JSON.stringify(x));
/**
 * Satır önerisinin önizleme tablosu: satır adı + sütunlar (gizli sütun "••• (yazılmaz)"); satır başına kanıt / gerekçe varsa ayrı sütun.
 * @param {any} v { tablo, satirlar, gizliSutunlar } @param {ReadonlyArray<any>} tablolar
 */
export function satirOnizlemesi(v, tablolar) {
  const t = tablolar.find((x) => x.id === v.tablo);
  const gizliler = v.gizliSutunlar || [];
  const sutunlar = (t ? t.sutunlar.map((/** @type {any} */ c) => c.ad) : [...new Set(v.satirlar.flatMap((/** @type {any} */ r) => Object.keys(r.degerler)))])
    .filter((/** @type {string} */ c) => gizliler.includes(c) || v.satirlar.some((/** @type {any} */ r) => c in r.degerler));
  const notlu = v.satirlar.some((/** @type {any} */ r) => r.kanit || r.gerekce);
  return h('div', { class: 'tablo-kaydirma satir-onizleme' }, h('table', { class: 'veri-tablosu kucuk', 'aria-label': `${t?.ad ?? v.tablo} satır önizlemesi` },
    h('thead', {}, h('tr', {}, h('th', {}, 'Satır'), sutunlar.map((/** @type {string} */ c) => h('th', {}, c)), notlu ? h('th', {}, 'Kanıt') : null)),
    h('tbody', {}, v.satirlar.map((/** @type {any} */ r) => h('tr', r.guclu === undefined ? {} : { 'data-guclu': String(r.guclu) }, h('td', {}, r.ad),
      sutunlar.map((/** @type {string} */ c) => h('td', { class: gizliler.includes(c) ? 'soluk' : '' }, gizliler.includes(c) ? '••• (yazılmaz)' : r.degerler[c] ?? '')),
      notlu ? h('td', { class: 'soluk kucuk' }, [r.gerekce, r.kanit].filter(Boolean).join(' · ')) : null)))));
}

/**
 * Metot başına analiz durumu (örnekler + kararlar + kurallar + boş gönder varsayılanları; yeniTablolar sihirbaz / sayfa genelinde ortak).
 * @param {Record<string, any>} [b]
 */
export function yeniOrnekDurumu(b = {}) {
  return { ornekler: [], kararlar: {}, kurallar: {}, varsayilanlar: {}, yeniTablolar: [], tabloDegerleri: [], onsecili: new Set(), sonuc: null, ...b };
}

/** cURL / gövde örneğinden başlangıç örneği. @param {string} ad @param {string} govde @param {string} kaynak */
export const ornekOlustur = (ad, govde, kaynak) => ({ id: ornekKimligi(), ad, govde, kaynak });

/**
 * Yeni tablonun işlem seçimi (plan.islem / plan.yeniAd DEĞİŞTİRİLİR): aynı adlı tablo varsa Birleştir / Yeni ad / Atla, yoksa
 * Oluştur / Atla. @param {any} plan @param {() => void} [degisti]
 */
export function tabloIslemSecimi(plan, degisti) {
  plan.islem ??= plan.ayniAdli ? 'birlestir' : 'yeni';
  const secenekler = plan.ayniAdli ? [['birlestir', `"${plan.ayniAdli.ad}" ile birleştir`], ['yeniAd', 'Yeni adla oluştur'], ['atla', 'Atla']] : [['yeni', 'Oluştur'], ['atla', 'Atla']];
  const sec = h('select', { 'aria-label': `${plan.ad} tablosu ne yapılsın` }, secenekler.map(([d, m]) => h('option', { value: d, selected: plan.islem === d }, m)));
  const ad = h('input', { type: 'text', maxlength: '60', value: plan.yeniAd || `${plan.ad} 2`, 'aria-label': `${plan.ad} yeni tablo adı`, hidden: plan.islem !== 'yeniAd' });
  const yaz = () => { plan.islem = sec.value; ad.hidden = sec.value !== 'yeniAd'; plan.yeniAd = ad.value.trim(); degisti?.(); };
  sec.addEventListener('change', yaz);
  ad.addEventListener('input', yaz);
  if (plan.islem === 'yeniAd') plan.yeniAd = ad.value.trim();
  return h('span', { class: 'tablo-islem-secimi' }, sec, ad);
}

/** Kayıt gövdesindeki analiz tablosu (sunucu: servis-ornekleri.mjs > analizTablolariniYaz). @param {any} t */
export const analizTablosuGovdesi = (t) => ({ id: t.id, ad: t.ad, islem: t.islem ?? (t.ayniAdli ? 'birlestir' : 'yeni'), ...(t.islem === 'yeniAd' ? { yeniAd: t.yeniAd } : {}), tur: t.tur, sutunlar: t.sutunlar, satirlar: t.satirlar });

/**
 * Bir metot tanımına analiz bağlar: tanim.ust (örnek bölümü, alan tablosunun üstünde) ve tanim.analiz.satir(yol) (satır önerileri).
 * tanim (metotAlanTablosu): { ad, sema, zorunlu, ekler, baglar, tablolar, degisti? } — öneriler bunları DEĞİŞTİRİR.
 * @param {any} tanim
 * @param {{ tur: 'soap' | 'rest'; durum: ReturnType<typeof yeniOrnekDurumu>; ekGizliAdlar?: string[]; ekKanitlar?: () => Array<{ ad: string; govde: string }>; onsecim?: boolean }} a
 * @returns {{ yenile: () => void }}
 */
export function analizBagla(tanim, a) {
  const d = a.durum;
  d.tabloAdlari ??= {};
  const tur = a.tur === 'rest' ? 'JSON' : 'XML';
  const bolum = h('section', { class: 'ornek-istekler', 'aria-label': `${tanim.ad} örnek istekleri` });
  /** @type {null | 'yeni' | string} düzenlenen örnek (yeni ya da kimlik) */
  let duzenlenen = null;
  const maskele = (/** @type {string} */ m) => adaGoreMaskele(m, a.ekGizliAdlar || [], MASKE).metin;
  const durumu = () => ({ zorunlu: tanim.zorunlu, baglar: tanim.baglar, varsayilanlar: d.varsayilanlar, kurallar: d.kurallar, ekler: tanim.ekler, kararlar: d.kararlar, yeniTablolar: d.yeniTablolar, tabloDegerleri: (d.tabloDegerleri ??= []) });
  const hesapla = () => {
    const g = {
      metot: tanim.ad, tur: a.tur, sema: tanim.sema, ekler: tanim.ekler || [], ornekler: d.ornekler, ekKanitlar: a.ekKanitlar ? a.ekKanitlar() : [],
      tablolar: (tanim.tablolar || []).filter((t) => !String(t.id).startsWith('yeni:')), ekGizliAdlar: a.ekGizliAdlar || []
    };
    const mevcut = () => ({ zorunlu: [...tanim.zorunlu], baglar: tanim.baglar, varsayilanlar: d.varsayilanlar, kurallar: d.kurallar, kararlar: d.kararlar, onsecili: [...d.onsecili] });
    d.sonuc = servisAnalizi({ ...g, mevcut: mevcut() });
    // Kullanıcının düzenlediği yeni tablo adları (yeniden analizde korunur).
    for (const o of d.sonuc.oneriler) if (o.tur === 'yeniTablo' && d.tabloAdlari[o.deger.id]) adiDegistir(o.deger, d.tabloAdlari[o.deger.id]);
    if (!a.onsecim) return;
    // Sihirbaz: güçlü tablo eşleşmesi bağ seçimine önseçili yazılır (kullanıcı Uygula ile onaylar, Yoksay ile kaldırır).
    let yazildi = false;
    for (const o of d.sonuc.oneriler) {
      if (o.tur !== 'tabloBagi' || o.guc !== 'guclu' || tanim.baglar[o.yol]) continue;
      tanim.baglar[o.yol] = { ...o.deger };
      d.onsecili.add(o.anahtar);
      yazildi = true;
    }
    if (yazildi) d.sonuc = servisAnalizi({ ...g, mevcut: mevcut() });
  };
  /** Yeni tablo planının adı (aynı adlı tablo kontrolü yeniden). @param {any} plan @param {string} ad */
  const adiDegistir = (plan, ad) => {
    plan.ad = ad;
    const t = (tanim.tablolar || []).find((x) => !String(x.id).startsWith('yeni:') && x.ad.toLocaleLowerCase('tr') === ad.toLocaleLowerCase('tr'));
    plan.ayniAdli = t ? { id: t.id, ad: t.ad } : null;
    if (!plan.ayniAdli && plan.islem && plan.islem !== 'atla') plan.islem = 'yeni';
  };
  const sonra = () => { ciz(); tanim.degisti?.(); };
  /** Yeni tablo planı alan seçiminde görünsün (kayıtta gerçek tabloya çevrilir). @param {any} t */
  const planTablosu = (t) => {
    if (!tanim.tablolar || tanim.tablolar.some((x) => x.id === t.id)) return;
    tanim.tablolar.push({ id: t.id, ad: `${t.ad} (yeni)`, sutunlar: t.sutunlar, satirlar: t.satirlar.map((r) => ({ degerler: r.degerler })) });
  };
  const uygula = (/** @type {any} */ o) => {
    oneriyiUygula(durumu(), o);
    d.onsecili.delete(o.anahtar);
    if (o.tur === 'yeniTablo') planTablosu(d.yeniTablolar.find((x) => x.id === o.deger.id) || o.deger);
  };
  const yoksay = (/** @type {any} */ o) => { oneriyiYoksay(durumu(), o); d.onsecili.delete(o.anahtar); };
  const gucRozeti = (/** @type {any} */ o) => (o.tur === 'celiski' ? rozet('not', 'durdu') : o.guc === 'guclu' ? rozet('güçlü', 'basari') : rozet('zayıf', ''));
  const dugmeler = (/** @type {any} */ o, /** @type {string} */ ad, uygulaMetni = 'Uygula') => h('span', { class: 'analiz-dugmeleri' },
    o.tur === 'celiski' ? null : h('button', { type: 'button', class: `kucuk-dugme ${o.guc === 'guclu' ? 'birincil' : ''}`, 'aria-label': `Uygula: ${ad}`, onclick: () => { uygula(o); sonra(); } }, uygulaMetni),
    // Kopuk bağ tek kartta: önerilen sütuna bağla (yukarıdaki) ya da eski bağı kaldır (güçlü önerileri uygula kapsamaz).
    o.tur === 'kopukBag' && o.deger ? h('button', { type: 'button', class: 'kucuk-dugme', 'aria-label': `Bağı kaldır: ${ad}`, onclick: () => { uygula({ ...o, deger: null }); sonra(); } }, 'Bağı kaldır') : null,
    h('button', { type: 'button', class: 'kucuk-dugme hayalet', 'aria-label': `Yoksay: ${ad}`, onclick: () => { yoksay(o); sonra(); } }, 'Yoksay'));

  /** Öneri satırı: (bölümdeyse alan yolu) + güç + başlık + kanıt + Uygula / Yoksay. @param {any} o @param {boolean} [yolGoster] */
  const oneriSatiri = (o, yolGoster = false) => {
    const ad = `${o.yol ? `${o.yol} — ` : ''}${o.baslik}`;
    return h('div', { class: `analiz-onerisi ${o.tur === 'celiski' ? 'celiski' : o.guc === 'zayif' ? 'zayif' : ''}`, 'data-tur': o.tur, 'data-guc': o.guc },
      h('span', { class: 'analiz-oneri-metni' }, o.tur === 'celiski' ? ikon('uyari') : null, gucRozeti(o), yolGoster && o.yol ? h('code', { class: 'duz' }, o.yol) : null, h('b', {}, o.baslik),
        d.onsecili.has(o.anahtar) ? [' ', rozet('önseçili', 'vurgu')] : null, h('span', { class: 'analiz-kaniti' }, o.kanit)),
      dugmeler(o, ad, o.tur === 'kopukBag' ? (o.deger ? 'Önerilen sütuna bağla' : 'Bağı kaldır') : 'Uygula'));
  };

  /** Örnek sonucu (başarılı / hata verdi / bilinmiyor): zorunluluk kanıtı bundan gelir; hata verenlerin değerleri tablolara girmez. @param {any} x */
  const sonucSecimi = (x) => {
    const s = h('select', { class: 'ornek-sonucu', 'aria-label': `${x.ad} isteği başarılı oldu mu?`, title: 'Başarılı istekte boş alan isteğe bağlıdır (kesin kanıt). Hata veren isteğin değerleri tablolara girmez.' },
      [['bilinmiyor', 'Sonuç: bilinmiyor'], ['basarili', 'Başarılı'], ['hata', 'Hata verdi']].map(([v, m]) => h('option', { value: v, selected: (x.durum || 'bilinmiyor') === v }, m)));
    s.addEventListener('change', () => { if (s.value === 'bilinmiyor') delete x.durum; else x.durum = s.value; sonra(); });
    return s;
  };

  const ornekListesi = () => (d.ornekler.length ? h('ul', { class: 'ornek-listesi' }, d.ornekler.map((x) => {
    // Önizleme: SOAP zarfının içi (Body), boşluklar sadeleşmiş; gizli adlı alanların değeri maskeli.
    const m = maskele(x.govde);
    const onizleme = (/<(?:[\w.-]+:)?Body\b[^>]*>([\s\S]*)<\/(?:[\w.-]+:)?Body>/.exec(m)?.[1] ?? m).replace(/\s+/g, ' ').trim();
    return h('li', {},
      h('span', { class: 'ornek-adi' }, h('b', {}, x.ad), KAYNAK_ADI[x.kaynak] ? [' ', rozet(KAYNAK_ADI[x.kaynak], '')] : null),
      h('code', { class: 'duz ornek-onizleme', title: onizleme.slice(0, 2000) }, onizleme.length > 160 ? `${onizleme.slice(0, 157)}…` : onizleme),
      h('span', { class: 'analiz-dugmeleri' }, sonucSecimi(x),
        h('button', { type: 'button', class: 'kucuk-dugme', 'aria-label': `${x.ad} örneğini düzenle`, onclick: () => { duzenlenen = x.id; ciz(); bolum.querySelector('textarea')?.focus(); } }, 'Düzenle'),
        h('button', { type: 'button', class: 'kucuk-dugme hayalet', 'aria-label': `${x.ad} örneğini sil`, onclick: () => { d.ornekler.splice(d.ornekler.indexOf(x), 1); if (duzenlenen === x.id) duzenlenen = null; sonra(); } }, 'Sil')));
  })) : null);

  const form = () => {
    if (!duzenlenen) {
      return h('button', { type: 'button', class: 'kucuk-dugme ornek-ekle', onclick: () => { duzenlenen = 'yeni'; ciz(); bolum.querySelector('input.ornek-adi-girdisi')?.focus(); } }, ikon('arti'), `Gövde ${tur} ekle`);
    }
    const x = d.ornekler.find((o) => o.id === duzenlenen);
    const ad = h('input', { type: 'text', class: 'ornek-adi-girdisi', maxlength: '80', value: x ? x.ad : '', placeholder: `ör. Bireysel (boşsa "Örnek ${d.ornekler.length + 1}")`, 'aria-label': `${tanim.ad} örnek adı` });
    const govde = h('textarea', { rows: '8', spellcheck: 'false', class: 'ornek-govdesi', 'aria-label': `${tanim.ad} örnek gövdesi`,
      placeholder: tur === 'XML' ? '<soap:Envelope …><soap:Body><Metot>…</Metot></soap:Body></soap:Envelope>' : '{ "alan": "değer" }' });
    govde.value = x ? x.govde : '';
    const sonuc = h('select', { 'aria-label': `${tanim.ad} örnek sonucu` },
      [['bilinmiyor', 'Bu istek başarılı oldu mu? Bilinmiyor'], ['basarili', 'Başarılı'], ['hata', 'Hata verdi']].map(([v, m]) => h('option', { value: v, selected: (x?.durum || 'bilinmiyor') === v }, m)));
    const not = h('span', { class: 'alan-uyarisi', 'aria-live': 'polite' });
    const kaydet = h('button', { type: 'button', class: 'kucuk-dugme birincil' }, x ? 'Kaydet' : 'Ekle');
    kaydet.addEventListener('click', () => {
      if (!govde.value.trim()) { not.textContent = 'Gövde boş.'; return; }
      const adi = ad.value.trim() || x?.ad || `Örnek ${d.ornekler.length + 1}`;
      const durum = sonuc.value === 'bilinmiyor' ? undefined : sonuc.value;
      if (x) { Object.assign(x, { ad: adi, govde: govde.value }); if (durum) x.durum = durum; else delete x.durum; }
      else d.ornekler.push({ id: ornekKimligi(), ad: adi, govde: govde.value, kaynak: 'elle', ...(durum ? { durum } : {}) });
      duzenlenen = null;
      sonra();
    });
    const vazgec = h('button', { type: 'button', class: 'kucuk-dugme hayalet', onclick: () => { duzenlenen = null; ciz(); } }, 'Vazgeç');
    return h('div', { class: 'ornek-formu' }, ad, govde, sonuc, h('div', { class: 'dugmeler' }, kaydet, vazgec, not));
  };

  /** Yeni tablo önizlemesi: sütunlar (kaynak alanlarıyla), satırlar (örnek adlarıyla; gizli değer maskeli), ad ve işlem seçimi. @param {any} o */
  const yeniTabloKarti = (o) => {
    const t = o.deger;
    const ad = h('input', { type: 'text', maxlength: '60', value: t.ad, 'aria-label': `${t.ad} yeni tablo adı düzenle` });
    const secimKabi = h('span', {});
    const secimCiz = () => yerlestir(secimKabi, t.ayniAdli ? tabloIslemSecimi(t) : null);
    ad.addEventListener('change', () => { const v = ad.value.trim(); if (!v) { ad.value = t.ad; return; } d.tabloAdlari[t.id] = v; adiDegistir(t, v); secimCiz(); });
    secimCiz();
    const kaynak = new Map(t.alanlar.map((x) => [x.sutun, x.yol]));
    // Açık / kapalı durumu yeniden çizimde korunur.
    d.acikTablolar ??= new Set();
    const kart = h('details', { class: 'yeni-tablo-karti', 'data-tablo': t.id, open: d.acikTablolar.has(t.id) },
      h('summary', {}, h('b', {}, t.ad), ` ${t.tur === 'liste' ? '(liste)' : '(kayıt)'} — ${t.sutunlar.length} sütun, ${t.satirlar.length} satır `, gucRozeti(o)),
      h('div', { class: 'yeni-tablo-govdesi' },
        h('label', { class: 'yeni-tablo-adi' }, 'Tablo adı ', ad), secimKabi,
        h('div', { class: 'tablo-kaydirma' }, h('table', { class: 'ozet-tablosu', 'aria-label': `${t.ad} önizleme` },
          h('thead', {}, h('tr', {}, h('th', { scope: 'col' }, 'Satır'), t.sutunlar.map((c) => h('th', { scope: 'col', title: kaynak.get(c.ad) || '' }, c.ad, c.gizli ? ' (gizli)' : '', h('div', { class: 'soluk kucuk' }, kaynak.get(c.ad) || ''))))),
          h('tbody', {}, t.satirlar.slice(0, 20).map((r) => h('tr', {}, h('td', {}, r.ad), t.sutunlar.map((c) => h('td', {}, c.gizli ? MASKE : r.degerler[c.ad] ?? '—'))))))),
        h('p', { class: 'soluk kucuk' }, o.kanit),
        dugmeler(o, `${t.ad} yeni tablo`, 'Tabloyu öner')));
    kart.addEventListener('toggle', () => { if (kart.open) d.acikTablolar.add(t.id); else d.acikTablolar.delete(t.id); });
    return kart;
  };

  /** Tablo önerileri: (a) mevcut tablolara bağlanacak alanlar, (b) yeni tablolar; boş durum açıkça. @param {any} r */
  const tabloOnerileri = (r) => {
    const baglar = r.oneriler.filter((o) => o.tur === 'tabloBagi' || o.tur === 'kopukBag' || o.tur === 'tabloyaDeger');
    const yeniler = r.oneriler.filter((o) => o.tur === 'yeniTablo');
    const satirOnerileri = r.oneriler.filter((o) => o.tur === 'tabloyaSatir');
    const yeniAlan = yeniler.reduce((n, o) => n + o.deger.alanlar.length, 0);
    return h('section', { class: 'tablo-onerileri', 'aria-label': `${tanim.ad} tablo önerileri` },
      h('h6', {}, 'Tablo önerileri'),
      h('div', { class: 'tablo-onerileri-a' }, h('div', { class: 'alan-etiketi' }, 'Mevcut tablolara bağlanacak alanlar'),
        baglar.length ? baglar.map((o) => h('div', { class: `analiz-onerisi ${o.guc === 'zayif' ? 'zayif' : ''}`, 'data-tur': o.tur, 'data-guc': o.guc },
          h('span', { class: 'analiz-oneri-metni' }, gucRozeti(o), h('code', { class: 'duz' }, alanAdi(o.yol)), o.eskiBag ? `: eski bağ silinmiş (${o.eskiBag})` : null, ' → ',
            h('b', {}, o.deger ? `${tabloAdi(o.deger.tablo)} › ${o.deger.sutun}${o.tur === 'tabloyaDeger' ? ` (eklenecek: ${o.deger.degerler.join(', ')})` : ''}` : 'bağı kaldır'), d.onsecili.has(o.anahtar) ? [' ', rozet('önseçili', 'vurgu')] : null,
            h('span', { class: 'analiz-kaniti' }, o.kanit)),
          dugmeler(o, `${o.yol} — ${o.baslik}`, o.tur === 'kopukBag' ? (o.deger ? 'Önerilen sütuna bağla' : 'Bağı kaldır') : 'Uygula')))
          : h('p', { class: 'soluk kucuk tablo-onerileri-bos' }, `Mevcut tablolarla eşleşen alan bulunamadı${yeniAlan ? `; ${yeniAlan} alan için yeni tablo önerildi` : ''}.`)),
      satirOnerileri.length ? h('div', { class: 'tablo-onerileri-a' }, h('div', { class: 'alan-etiketi' }, 'Tablolara eklenecek satırlar'), satirOnerileri.map(satirKarti)) : null,
      h('div', { class: 'tablo-onerileri-b' }, h('div', { class: 'alan-etiketi' }, 'Yeni tablolar'),
        yeniler.length ? yeniler.map(yeniTabloKarti) : h('p', { class: 'soluk kucuk' }, 'Yeni tablo önerisi yok.')));
  };
  /**
   * "Tabloya N satır eklensin mi" kartı (tablo başına tek): örnek başına satır önizlemesi; gizli sütunlar maskeli ve yazılmaz.
   * @param {any} o
   */
  const satirKarti = (o) => h('div', { class: 'analiz-onerisi zayif satir-onerisi', 'data-tur': o.tur, 'data-guc': o.guc },
    h('span', { class: 'analiz-oneri-metni' }, gucRozeti(o), h('b', {}, o.baslik), h('span', { class: 'analiz-kaniti' }, o.kanit)),
    satirOnizlemesi(o.deger, tanim.tablolar || []),
    dugmeler(o, o.baslik, 'Satırları ekle'));
  const tabloAdi = (/** @type {string} */ id) => (tanim.tablolar || []).find((t) => t.id === id)?.ad ?? id;

  const sonucBolumu = () => {
    const r = d.sonuc;
    if (!r || (!r.toplam && !r.hatalar.length)) {
      return h('p', { class: 'soluk kucuk' }, tanim.sema.alanlar.length
        ? 'Örnek ekleyince alanlar analiz edilir: zorunluluk, tip / biçim, gizli, izin verilen değerler ve tablo eşleşmesi alan tablosunda öneri olarak görünür.'
        : 'Bu metodun alan listesi yok: örnek ekleyin, alanlar örneklerden çıkarılır ve alan formu açılır.');
    }
    const satirYollari = new Set(alanSatirlari(semaBirlestir(tanim.sema, tanim.ekler || []).alanlar).filter((x) => !x.grup).map((x) => x.yol));
    const tabloTurleri = new Set(['tabloBagi', 'kopukBag', 'yeniTablo', 'tabloyaDeger', 'tabloyaSatir']);
    const genel = r.oneriler.filter((o) => !satirYollari.has(o.yol) && !tabloTurleri.has(o.tur));
    const guclu = gucluOneriler(r.oneriler);
    const zayif = r.oneriler.filter((o) => o.guc === 'zayif').length;
    const tumu = h('button', { type: 'button', class: 'kucuk-dugme birincil', disabled: !guclu.length, 'aria-label': `${tanim.ad} güçlü önerileri uygula` }, `Güçlü önerileri uygula (${guclu.length})`);
    tumu.addEventListener('click', () => {
      // Önce alan ekleme (sonraki öneriler eklenen alanın satırına düşer), sonra kalanlar. Zayıflar ve çelişki notları dahil değil.
      for (const o of [...guclu.filter((x) => x.tur === 'alanEkle'), ...guclu.filter((x) => x.tur !== 'alanEkle')]) uygula(o);
      sonra();
    });
    return h('div', { class: 'analiz-sonucu', 'aria-live': 'polite' },
      h('div', { class: 'analiz-sonucu-ust' },
        h('span', { class: 'soluk kucuk' }, `${r.toplam} örnek analiz edildi${r.toplam - r.adliSayisi ? ` (${r.adliSayisi} adlı + ${r.toplam - r.adliSayisi} ek kanıt)` : ''} · ${r.oneriler.length} öneri: ${guclu.length} güçlü, ${zayif} zayıf (tek tek uygulanır)`),
        tumu),
      r.hatalar.length ? h('div', { class: 'not-kutusu uyari', role: 'status' }, r.hatalar.map((x) => h('div', {}, h('b', {}, `${x.ad}: `), x.mesaj))) : null,
      r.notlar.length ? h('div', { class: 'not-kutusu analiz-notlari', role: 'note' }, r.notlar.map((x) => h('div', {}, x))) : null,
      genel.length ? h('div', { class: 'analiz-genel' }, genel.map((o) => oneriSatiri(o, true))) : null,
      tabloOnerileri(r),
      r.farklar.length ? h('details', { class: 'ornek-farklari' }, h('summary', { class: 'kucuk' }, `Örnekler arası fark (${r.farklar.length})`),
        h('p', { class: 'soluk kucuk' }, 'Yalnız bazı örneklerde dolu alanlar; senaryo önerileri için saklanır.'),
        h('ul', { class: 'onay-listesi' }, r.farklar.map((f) => h('li', {}, f.metin)))) : null);
  };

  const ciz = () => {
    hesapla();
    yerlestir(bolum,
      h('div', { class: 'ornek-istekler-baslik' }, h('h5', {}, `Örnek istekler (gövde ${tur})`), h('span', { class: 'soluk kucuk' }, `${d.ornekler.length} örnek`)),
      h('p', { class: 'soluk kucuk' }, `Servise giden gerçek istek gövdelerini (${tur}) adlarıyla ekleyin (ör. "Bireysel", "Kurumsal") ve sonucunu işaretleyin (Başarılı / Hata verdi). Başarılı istekte boş alan isteğe bağlıdır; her örnekte dolu olması zorunluluğu kanıtlamaz. Analiz yalnız bu metinler üzerinde çalışır; servise istek atılmaz.`),
      h('p', { class: 'soluk kucuk kesin-karar-notu' }, 'Kesin karar için C aşaması (onaylı TEST denemesi) — henüz yapılmıyor.'),
      ornekListesi(), form(), sonucBolumu());
    tanim.tabloyuYenile?.();
  };
  tanim.ust = bolum;
  tanim.oneriVar = (/** @type {string} */ yol) => Boolean(d.sonuc?.oneriler.some((o) => o.yol === yol && o.guc !== 'not'));
  tanim.alanKurallari = d.kurallar;
  tanim.varsayilanlar = d.varsayilanlar;
  tanim.analiz = {
    /** Satır önerileri (alan tablosunda): örnek özeti + öneriler (tablo bağı satırın seçim kutusunun yanında rozetle). @param {string} yol */
    satir: (yol) => {
      const r = d.sonuc;
      if (!r || !r.toplam) return null;
      const al = r.alanlar.find((x) => x.yol === yol);
      const ol = r.oneriler.filter((o) => o.yol === yol && o.tur !== 'tabloBagi');
      if (!(al && (al.dolu + al.bos)) && !ol.length) return null;
      return h('div', { class: 'analiz-satiri' }, al ? h('span', { class: 'soluk kucuk analiz-ozeti' }, al.ozet) : null, ol.map((o) => oneriSatiri(o)));
    },
    /** Önerilen tablo sütunu: seçim kutusunun yanında belirgin rozet ("Öneri: Tablo › Sütun — Uygula"). @param {string} yol */
    bagRozeti: (yol) => {
      const o = d.sonuc?.oneriler.find((x) => x.tur === 'tabloBagi' && x.yol === yol);
      if (!o) return null;
      const hedef = `${tabloAdi(o.deger.tablo)} › ${o.deger.sutun}`;
      return h('span', { class: `bag-onerisi ${o.guc === 'zayif' ? 'zayif' : ''}`, title: o.kanit, 'data-guc': o.guc },
        h('span', { class: 'bag-onerisi-metni' }, `${d.onsecili.has(o.anahtar) ? 'Önseçili' : 'Öneri'}: ${hedef}${o.guc === 'zayif' ? ' (zayıf)' : ''}`),
        h('button', { type: 'button', class: 'kucuk-dugme birincil', 'aria-label': `Öneriyi uygula: ${yol} → ${hedef}`, onclick: () => { uygula(o); sonra(); } }, 'Uygula'),
        h('button', { type: 'button', class: 'kucuk-dugme hayalet', 'aria-label': `Öneriyi yoksay: ${yol} → ${hedef}`, onclick: () => { yoksay(o); sonra(); } }, '×'));
    }
  };
  for (const t of d.yeniTablolar) if (Object.values(tanim.baglar).some((b) => b && b.tablo === t.id)) planTablosu(t);
  ciz();
  return { yenile: ciz };
}

/**
 * Kayıt gövdesine analiz ayarları (metot adına göre). @param {Array<[string, ReturnType<typeof yeniOrnekDurumu>]>} liste [metot adı, durum]
 */
export function analizKaydi(liste) {
  const dolu = (/** @type {Record<string, any>} */ x) => Object.keys(x).length > 0;
  const nesne = (/** @type {(d: any) => any} */ f) => Object.fromEntries(liste.map(([ad, d]) => [ad, f(d)]).filter(([, v]) => (Array.isArray(v) ? v.length : v && dolu(v))));
  return {
    ornekIstekler: nesne((d) => d.ornekler.map((x) => ({ id: x.id, ad: x.ad, govde: x.govde, kaynak: x.kaynak || 'elle', ...(x.durum ? { durum: x.durum } : {}) }))),
    alanKurallari: nesne((d) => d.kurallar),
    analizKararlari: nesne((d) => d.kararlar),
    ornekFarklari: nesne((d) => (d.sonuc ? farkKaydi(d.sonuc) : []))
  };
}

// ---------------------------------------------------------------------------------------
// Kayıtlı servis: "Servisi analiz et"
// ---------------------------------------------------------------------------------------

/**
 * @param {HTMLElement} kap @param {{ id: string; ad: string }} proje @param {any} s servis (GET /platform/servis; örneklerde gizli değerler maskeli)
 * @param {() => void} yenile
 */
export async function servisAnaliziSayfasi(kap, proje, s, yenile) {
  const q = encodeURIComponent;
  const [{ tablolar }, kanit, ekGizliAdlar] = await Promise.all([
    api(`/platform/tablolar?projeId=${q(proje.id)}`),
    api(`/platform/servis/analiz-kanitlari?projeId=${q(proje.id)}&servisId=${q(s.id)}`),
    api('/platform/maskeleme').then((m) => m.ekAdlar || []).catch(() => [])
  ]);
  const a = s.ayarlar;
  const rest = s.tur === 'rest';
  const semalar = a.operasyonSemalari || {};
  const kanitSecimi = { senaryolar: false, kosular: false };
  /** Analizden yazılacak (henüz kaydedilmemiş) yeni tablolar: tüm metotlarda ortak. @type {any[]} */
  const yeniTablolar = [];
  const metotlar = (a.operasyonlar || []).map((op) => {
    const sm = semalar[op.ad] || { ad: op.ad, kok: '', ns: '', alanlar: [] };
    const liste = (a.alanZorunluluklari || {})[op.ad];
    return {
      ad: op.ad, sema: sm, ekler: kopya((a.ekAlanlar || {})[op.ad] || []), baglar: kopya((a.alanBaglari || {})[op.ad] || {}), tablolar,
      zorunlu: new Set(Array.isArray(liste) ? liste : alanSatirlari(sm.alanlar).filter((x) => !x.grup && x.alan.zorunlu).map((x) => x.yol)),
      durum: yeniOrnekDurumu({
        ornekler: kopya((a.ornekIstekler || {})[op.ad] || []), kararlar: kopya((a.analizKararlari || {})[op.ad] || {}),
        kurallar: kopya((a.alanKurallari || {})[op.ad] || {}), varsayilanlar: kopya((a.alanVarsayilanlari || {})[op.ad] || {}), yeniTablolar
      })
    };
  });
  const kayitDurumu = h('span', { class: 'kayit-durumu soluk kucuk', 'aria-live': 'polite' });
  let zamanlayici = null;
  const kaydet = async () => {
    const nesne = (/** @type {(m: any) => any} */ f, /** @type {Record<string, any>} */ eski) => ({ ...(eski || {}), ...Object.fromEntries(metotlar.map((m) => [m.ad, f(m)])) });
    const k = analizKaydi(metotlar.map((m) => [m.ad, m.durum]));
    const bekleyen = yeniTablolar.filter((t) => !t.yazildi);
    const degerler = metotlar.flatMap((m) => m.durum.tabloDegerleri || []);
    const govde = {
      alanZorunluluklari: nesne((m) => [...m.zorunlu], a.alanZorunluluklari), ekAlanlar: nesne((m) => m.ekler, a.ekAlanlar),
      alanBaglari: nesne((m) => m.baglar, a.alanBaglari), alanVarsayilanlari: nesne((m) => m.durum.varsayilanlar, a.alanVarsayilanlari),
      // Bu sayfadaki tüm metotların analiz ayarları (boşalan metot da yazılır: silinen örnek kalmaz).
      ornekIstekler: Object.fromEntries(metotlar.map((m) => [m.ad, k.ornekIstekler[m.ad] || []]).filter(([, l]) => l.length)),
      alanKurallari: nesne((m) => m.durum.kurallar, a.alanKurallari), analizKararlari: nesne((m) => m.durum.kararlar, a.analizKararlari),
      ornekFarklari: nesne((m) => (m.durum.sonuc ? farkKaydi(m.durum.sonuc) : []), a.ornekFarklari),
      ...(rest ? {} : { ornekKokleri: Object.fromEntries(metotlar.filter((m) => !m.sema.alanlar.length && m.durum.sonuc?.kok).map((m) => [m.ad, { kok: m.durum.sonuc.kok, ns: m.durum.sonuc.ns || '' }])) }),
      ...(bekleyen.length ? { analizTablolari: bekleyen.map(analizTablosuGovdesi) } : {}),
      ...(degerler.length ? { tabloDegerleri: degerler } : {})
    };
    kayitDurumu.textContent = 'Kaydediliyor…';
    kayitDurumu.className = 'kayit-durumu soluk kucuk';
    try {
      await api('/platform/servis/kaydet', { govde: { projeId: proje.id, id: s.id, anahtar: s.anahtar, ad: s.ad, yol: a.yol, ...govde } });
      kayitDurumu.textContent = '✓ Kaydedildi';
      if (degerler.length) for (const m of metotlar) m.durum.tabloDegerleri = [];
      if (bekleyen.length || degerler.length) {
        bildir([bekleyen.length ? `${bekleyen.filter((t) => t.islem !== 'atla').length} tablo test verisine yazıldı.` : '', degerler.length ? 'Önerilen satırlar tablolara eklendi.' : ''].filter(Boolean).join(' '));
        yenile();
      }
    } catch (e) {
      kayitDurumu.textContent = `Kaydedilemedi: ${e.message}`;
      kayitDurumu.className = 'kayit-durumu alan-uyarisi';
    }
  };
  const degisti = () => { clearTimeout(zamanlayici); kayitDurumu.textContent = 'Değişti…'; zamanlayici = setTimeout(kaydet, 400); };
  /** @type {Array<{ yenile: () => void }>} */
  const baglilar = [];
  const tanimlar = metotlar.map((m) => {
    const t = { ad: m.ad, sema: m.sema, zorunlu: m.zorunlu, ekler: m.ekler, baglar: m.baglar, tablolar, degisti };
    const ekKanitlar = () => [
      ...(kanitSecimi.senaryolar ? kanit.senaryolar.filter((x) => x.operasyon === m.ad) : []),
      ...(kanitSecimi.kosular ? kanit.kosular.filter((x) => x.operasyon === m.ad) : [])
    ];
    baglilar.push(analizBagla(t, { tur: rest ? 'rest' : 'soap', durum: m.durum, ekGizliAdlar, ekKanitlar }));
    return t;
  });
  // --- Koşulardan gelenler (sürekli öğrenme; kosu-ogrenmesi.mjs): kanıtıyla Uygula / Yoksay; uygulanan yeniden sorulmaz. ---------
  const kosuKarti = h('section', { class: 'kart kosu-ogrenmesi', 'aria-label': 'Koşulardan gelenler' });
  const metotDurumu = (/** @type {any} */ m) => ({ zorunlu: m.zorunlu, baglar: m.baglar, varsayilanlar: m.durum.varsayilanlar, kurallar: m.durum.kurallar, ekler: m.ekler,
    kararlar: m.durum.kararlar, yeniTablolar, tabloDegerleri: (m.durum.tabloDegerleri ??= []) });
  const tabloAdiBul = (/** @type {string} */ id) => tablolar.find((t) => t.id === id)?.ad ?? id;
  const kosuCiz = () => {
    const satirlar = metotlar.flatMap((m) => kosuOnerileri({
      metot: m.ad, sema: m.sema, ekler: m.ekler, gozlemler: (a.kosuOgrenmesi || {})[m.ad] || [], tablolar,
      mevcut: { zorunlu: [...m.zorunlu], baglar: m.baglar, varsayilanlar: m.durum.varsayilanlar, kararlar: m.durum.kararlar }
    }).map((o) => ({ m, o })));
    const gozlemSayisi = Object.values(a.kosuOgrenmesi || {}).reduce((n, l) => n + l.filter((x) => x.kaynak === 'kosu').length, 0);
    const gecmis = a.kosuOgrenmesiGecmisi || [];
    const uygula = (/** @type {any} */ m, /** @type {any} */ o) => { oneriyiUygula(metotDurumu(m), o); kosuCiz(); for (const b of baglilar) b.yenile(); degisti(); };
    const yoksay = (/** @type {any} */ m, /** @type {any} */ o) => { oneriyiYoksay(metotDurumu(m), o); kosuCiz(); degisti(); };
    yerlestir(kosuKarti,
      h('div', { class: 'kart-basligi' }, h('h3', {}, 'Koşulardan gelenler'), h('span', { class: 'sag soluk kucuk' }, `${gozlemSayisi} koşu gözlemi`)),
      h('p', { class: 'soluk kucuk' }, 'Servis koşuları (Dene, tekil, toplu, planlı) bittikten sonra çevrimdışı incelenir: yalnız senaryoda elle yazılmış değerler (tablo, kural ve akış değerleri değil). Başarılı koşunun yeni değerleri, bağlı tabloya koşu başına tek satır olarak önerilir (yalnız o tabloya bağlı alanlar); başarısız koşuda hata metni bir alanı anıyorsa o alan şüpheli sayılır, değeri eklenmez.'),
      satirlar.length ? h('div', { class: 'kosu-onerileri' }, satirlar.map(({ m, o }) => {
        const satirli = o.tur === 'tabloyaSatir';
        const ad = satirli ? `${m.ad} — ${o.baslik}` : `${m.ad} ${o.yol} — ${o.baslik}`;
        const not = o.guc === 'not';
        if (satirli) {
          return h('div', { class: `analiz-onerisi satir-onerisi ${o.guc === 'zayif' ? 'zayif' : ''}`, 'data-tur': o.tur, 'data-guc': o.guc },
            h('span', { class: 'analiz-oneri-metni' }, o.guc === 'guclu' ? rozet('güçlü', 'basari') : rozet('zayıf', ''), h('code', { class: 'duz' }, m.ad), h('b', {}, o.baslik),
              h('span', { class: 'analiz-kaniti' }, o.kanit)),
            satirOnizlemesi(o.deger, tablolar),
            h('span', { class: 'analiz-dugmeleri' },
              h('button', { type: 'button', class: `kucuk-dugme ${o.guc === 'guclu' ? 'birincil' : ''}`, 'aria-label': `Uygula: ${ad}`, onclick: () => uygula(m, o) }, 'Satırları ekle'),
              h('button', { type: 'button', class: 'kucuk-dugme hayalet', 'aria-label': `Yoksay: ${ad}`, onclick: () => yoksay(m, o) }, 'Yoksay')));
        }
        return h('div', { class: `analiz-onerisi ${not ? 'celiski' : o.guc === 'zayif' ? 'zayif' : ''}`, 'data-tur': o.tur, 'data-guc': o.guc },
          h('span', { class: 'analiz-oneri-metni' }, not ? ikon('uyari') : null, not ? rozet('not', 'durdu') : o.guc === 'guclu' ? rozet('güçlü', 'basari') : rozet('zayıf', ''),
            h('code', { class: 'duz' }, `${m.ad} · ${alanAdi(o.yol)}`), h('b', {}, o.tur === 'tabloBagi' ? `Tablo: ${tabloAdiBul(o.deger.tablo)} › ${o.deger.sutun}` : o.baslik),
            h('span', { class: 'analiz-kaniti' }, o.kanit)),
          h('span', { class: 'analiz-dugmeleri' },
            not ? null : h('button', { type: 'button', class: `kucuk-dugme ${o.guc === 'guclu' ? 'birincil' : ''}`, 'aria-label': `Uygula: ${ad}`, onclick: () => uygula(m, o) }, 'Uygula'),
            h('button', { type: 'button', class: 'kucuk-dugme hayalet', 'aria-label': `Yoksay: ${ad}`, onclick: () => yoksay(m, o) }, 'Yoksay')));
      })) : h('p', { class: 'soluk kucuk kosu-onerisi-yok' }, gozlemSayisi ? 'Koşulardan yeni öneri yok.' : 'Henüz koşu gözlemi yok: servis senaryolarını koşturdukça öneriler burada birikir.'),
      gecmis.length ? h('details', { class: 'kosu-ogrenmesi-gecmisi' }, h('summary', { class: 'kucuk' }, `Öğrenme geçmişi (${gecmis.length})`),
        h('ul', { class: 'onay-listesi' }, [...gecmis].reverse().slice(0, 30).map((x) => h('li', {}, `${String(x.zaman).slice(0, 16).replace('T', ' ')} · ${x.operasyon}: ${x.metin}`)))) : null);
  };
  kosuCiz();
  const kanitKutusu = (/** @type {'senaryolar' | 'kosular'} */ k, /** @type {string} */ metin, /** @type {number} */ n) => {
    const c = h('input', { type: 'checkbox', id: yeniKimlik('kanit'), disabled: !n });
    c.addEventListener('change', () => { kanitSecimi[k] = c.checked; for (const b of baglilar) b.yenile(); });
    return h('label', { class: 'secenek', for: c.id }, c, `${metin} (${n})`);
  };
  const adres = `#/servisler/s/${q(s.id)}`;
  yerlestir(kap,
    h('div', { class: 'sayfa-basligi' },
      h('div', {},
        h('div', { class: 'kirinti' }, h('span', {}, proje.ad), h('span', { 'aria-hidden': 'true' }, '/'), h('a', { href: adres }, s.ad), h('span', { 'aria-hidden': 'true' }, '/'), h('span', { class: 'simdiki' }, 'Servisi analiz et')),
        h('div', { class: 'baslik-satiri' }, h('h2', { tabindex: '-1' }, 'Servisi analiz et'), rozet(rest ? 'REST' : 'SOAP', 'vurgu')),
        h('p', { class: 'soluk' }, `${s.ad}: örnek isteklerden alanların zorunluluğu, tipi, gizliliği, izin verilen değerleri ve test verisi tablosu eşleşmesi önerilir. Analiz tarayıcıda çalışır; servise istek atılmaz. Uygulanan öneri yeniden sorulmaz, "Yoksay" denen öneri hatırlanır.`)),
      h('div', { class: 'eylemler' }, kayitDurumu, h('a', { class: 'dugme', href: adres }, ikon('geri'), 'Servise dön'))),
    kosuKarti,
    h('section', { class: 'kart analiz-kaniti-karti', 'aria-label': 'Ek kanıt' },
      h('h3', {}, 'Ek kanıt'),
      h('p', { class: 'soluk kucuk' }, 'İsterseniz kayıtlı senaryoların gövdeleri ve son koşuların istekleri de sayımlara katılır (gizli adlı alanların değeri maskeli; yalnız "dolu" sayılır).'),
      h('div', { class: 'satir-duzen' }, kanitKutusu('senaryolar', 'Kayıtlı senaryoların gövdeleri', kanit.senaryolar.length), kanitKutusu('kosular', 'Son koşuların istekleri', kanit.kosular.length))),
    h('section', { class: 'kart form-paneli', 'aria-label': 'Metotlar' },
      tanimlar.length ? metotKutulari(tanimlar, { anahtar: `analiz:${s.id}` }) : h('p', { class: 'soluk' }, 'Bu servisin metodu yok.')));
}
