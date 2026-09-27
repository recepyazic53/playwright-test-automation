// REST servisi — "Servis ekle > Adım adım > REST" sihirbazının adımları ve REST servisinin İşlemler sekmesindeki uç düzenleyici.
// Uç (istek): ad (yoldan önerilir), HTTP işlemi, yol (taban adrese eklenir; {id} yol yer tutucusu), sorgu parametreleri, içerik türü,
// başlıklar (gizli adlıların değeri maskeli yazılır, kayıtta kasada şifreli tabloya gider), gövde örneği (POST / PUT / PATCH; JSON),
// "CANLI'da çağrılmasın". Alanlar (yol / sorgu / gövde) SOAP'taki alan tablosuyla test verisi sütunlarına bağlanır.
// "Dene" isteğe bağlıdır: seçilen TEST ortamında ucu GERÇEKTEN çağırır; önce yöntem + tam adres onaya sunulur.
import { alan, alanHatasi, api, h, ikon, rozet, yeniKimlik, yerlestir } from './ortak.js';
import { onayIste } from './kosu-paneli.js';
import { alanSatirlari } from './servis-govdesi.mjs';
import { metotKutulari } from './servis-alanlari.js';
import { gizliAdMi } from './gizli-adlar.mjs';
import { GOVDELI_METOTLAR, ICERIK_TURLERI, REST_METOTLARI, govdeOrnegiCoz, restSemasi, ucAdiOner } from './rest-semasi.mjs';

const GIZLI_BASLIK = /authorization|api[-_]?key|token|secret|cookie/i;
const gizliBaslikMi = (ad) => Boolean(ad) && (gizliAdMi(ad) || GIZLI_BASLIK.test(ad));
const temizTaban = (a) => String(a || '').trim().replace(/\/+$/, '');
let sayac = 0;

/** Yeni uç (istek) taslağı. @param {Partial<ReturnType<typeof yeniUc>>} [o] */
export function yeniUc(o = {}) {
  return {
    kimlik: `uc${++sayac}`, ad: '', adElle: false, eskiAd: undefined, metot: 'POST', yol: '', sorgu: [], icerikTuru: 'application/json',
    basliklar: [], govdeOrnegi: '', yalnizTest: false, gizliAlanlar: null, ...o
  };
}

/** Kayıtlı operasyon → uç taslağı (İşlemler sekmesi). */
export function operasyondanUc(op, yalnizTest) {
  return yeniUc({
    ad: op.ad, adElle: true, eskiAd: op.ad, metot: op.metot || 'GET', yol: op.yol || '', sorgu: (op.sorgu || []).map((x) => ({ ...x })),
    icerikTuru: op.icerikTuru || 'application/json', basliklar: (op.basliklar || []).map((x) => ({ ...x })), govdeOrnegi: op.govdeOrnegi || '',
    yalnizTest, gizliAlanlar: op.gizliAlanlar ? [...op.gizliAlanlar] : null
  });
}

/** Sunucuya gidecek uç. */
export const ucGovdesi = (u) => ({
  ad: u.ad.trim(), ...(u.eskiAd ? { eskiAd: u.eskiAd } : {}), metot: u.metot, yol: u.yol.trim(), sorgu: u.sorgu.filter((x) => x.ad || x.deger),
  icerikTuru: u.icerikTuru, basliklar: u.basliklar.filter((x) => x.ad || x.deger), govdeOrnegi: GOVDELI_METOTLAR.includes(u.metot) ? u.govdeOrnegi : '',
  yalnizTest: u.yalnizTest, gizliAlanlar: u.gizliAlanlar || []
});

/** Uç listesindeki ilk eksik (null = tamam). */
export function uclarEksik(uclar) {
  if (!uclar.length) return 'En az bir istek ekleyin.';
  const adlar = new Set();
  for (const [i, u] of uclar.entries()) {
    const ad = u.ad.trim();
    const yer = `${i + 1}. istek`;
    if (!ad) return `${yer}: ad yazın.`;
    if (adlar.has(ad)) return `"${ad}" adı iki kez kullanılmış.`;
    adlar.add(ad);
    if (u.yol && (!u.yol.startsWith('/') || /[\s?#]/.test(u.yol))) return `${yer}: yol "/" ile başlamalı; sorgu parametrelerini ayrı satırlara yazın.`;
    if (GOVDELI_METOTLAR.includes(u.metot) && u.govdeOrnegi.trim() && /json/i.test(u.icerikTuru)) {
      try { govdeOrnegiCoz(u.govdeOrnegi); } catch { return `${yer} (${ad}): gövde örneği geçerli JSON değil.`; }
    }
    for (const b of u.basliklar) if (b.deger && !b.ad) return `${yer} (${ad}): başlık adı boş.`;
  }
  return null;
}

const sorguMetni = (u) => u.sorgu.filter((x) => x.ad).map((x) => `${encodeURIComponent(x.ad)}=${encodeURIComponent(x.deger)}`).join('&');
const tamAdres = (taban, u) => `${temizTaban(taban)}${u.yol ? (u.yol.startsWith('/') ? u.yol : `/${u.yol}`) : '/'}${sorguMetni(u) ? `?${sorguMetni(u)}` : ''}`;

/**
 * Anahtar / değer satırları (sorgu parametreleri, başlıklar). gizliMi: değer kutusu maskeli (type=password).
 * @param {Array<{ ad: string; deger: string }>} satirlar @param {{ etiket: string; adYer: string; degerYer: string; gizliMi?: (ad: string) => boolean; degisti: () => void }} s
 */
function anahtarDegerListesi(satirlar, s) {
  const kap = h('div', { class: 'anahtar-deger-listesi' });
  const ciz = () => {
    yerlestir(kap, satirlar.map((x, i) => {
      const ad = h('input', { type: 'text', autocomplete: 'off', spellcheck: 'false', value: x.ad, placeholder: s.adYer, 'aria-label': `${s.etiket} ${i + 1}: ad` });
      const gizli = s.gizliMi ? s.gizliMi(x.ad) : false;
      const deger = h('input', { type: gizli ? 'password' : 'text', autocomplete: 'off', spellcheck: 'false', value: x.deger, placeholder: gizli && x.deger.includes('${') ? '' : s.degerYer, 'aria-label': `${s.etiket} ${i + 1}: değer` });
      ad.addEventListener('input', () => { x.ad = ad.value.trim(); if (s.gizliMi) deger.type = s.gizliMi(x.ad) ? 'password' : 'text'; s.degisti(); });
      deger.addEventListener('input', () => { x.deger = deger.value; s.degisti(); });
      const sil = h('button', { type: 'button', class: 'ikon-dugme hayalet', 'aria-label': `${s.etiket} ${i + 1}: kaldır`, title: 'Kaldır', onclick: () => { satirlar.splice(i, 1); ciz(); s.degisti(); } }, ikon('carpi'));
      return h('div', { class: 'anahtar-deger-satiri' }, ad, deger, sil);
    }), h('button', { type: 'button', class: 'kucuk-dugme', onclick: () => { satirlar.push({ ad: '', deger: '' }); ciz(); s.degisti(); } }, ikon('arti'), `${s.etiket} ekle`));
  };
  ciz();
  return kap;
}

/**
 * Uç düzenleyici (sihirbaz 2. adım ve REST servisinin İşlemler sekmesi).
 * @param {ReturnType<typeof yeniUc>[]} uclar DEĞİŞTİRİLİR
 * @param {{ proje: { id: string }; ortamlar: Array<{ id: string; ad: string; canli: boolean; varsayilan: boolean; tabanUrl: string }>;
 *   tabanlar: () => Record<string, string>; tls?: () => boolean; degisti: () => void }} s
 */
export function restUclariFormu(uclar, s) {
  const kap = h('div', { class: 'rest-uclari' });
  const testler = s.ortamlar.filter((o) => !o.canli);
  const taban = (o) => {
    const t = s.tabanlar()[o.id];
    return t === '' ? '' : temizTaban(t || o.tabanUrl);
  };
  const ucKarti = (u, i) => {
    const onizleme = h('ul', { class: 'adres-onizleme' });
    const onizle = () => yerlestir(onizleme, s.ortamlar.map((o) => h('li', {}, h('b', {}, `${o.ad}: `),
      taban(o) ? h('code', { class: 'duz' }, `${u.metot} ${tamAdres(taban(o), u)}`) : h('span', { class: 'soluk' }, 'bu ortamda yok'))));
    const degisti = () => { onizle(); s.degisti(); };
    const ad = h('input', { type: 'text', autocomplete: 'off', value: u.ad, placeholder: 'ör. authenticate' });
    ad.addEventListener('input', () => { u.ad = ad.value; u.adElle = Boolean(ad.value); baslik.textContent = u.ad || `İstek ${i + 1}`; s.degisti(); });
    const metot = h('select', {}, REST_METOTLARI.map((m) => h('option', { value: m, selected: u.metot === m }, m)));
    const yol = h('input', { type: 'text', autocomplete: 'off', spellcheck: 'false', value: u.yol, placeholder: '/api/rest/v1/authenticate' });
    yol.addEventListener('input', () => {
      u.yol = yol.value.trim();
      if (!u.adElle) { u.ad = ucAdiOner(u.yol); ad.value = u.ad; baslik.textContent = u.ad || `İstek ${i + 1}`; }
      alanHatasi(yol, u.yol && (!u.yol.startsWith('/') || /[\s?#]/.test(u.yol)) ? 'Yol "/" ile başlamalı; sorgu parametrelerini aşağıya yazın.' : '');
      degisti();
    });
    const icerik = h('select', {}, ICERIK_TURLERI.map(([d, m]) => h('option', { value: d, selected: u.icerikTuru === d }, m)));
    icerik.addEventListener('change', () => { u.icerikTuru = icerik.value; govdeDenetle(); degisti(); });
    const govde = h('textarea', { class: 'kod-alani', rows: 8, spellcheck: 'false', autocomplete: 'off', placeholder: '{\n  "kullaniciAdi": "ornek",\n  "parola": "…"\n}' });
    govde.value = u.govdeOrnegi;
    const govdeDenetle = () => {
      let m = '';
      if (u.govdeOrnegi.trim() && /json/i.test(u.icerikTuru)) { try { govdeOrnegiCoz(u.govdeOrnegi); } catch (e) { m = e.message; } }
      alanHatasi(govde, m);
    };
    govde.addEventListener('input', () => { u.govdeOrnegi = govde.value; govdeDenetle(); s.degisti(); });
    const govdeAlani = h('div', { hidden: !GOVDELI_METOTLAR.includes(u.metot) },
      alan('İçerik türü', icerik),
      alan('Gövde örneği (isteğe bağlı)', govde, { yardim: 'Örnek JSON yapıştırın: alanları (iç içe nesneler, dizilerde ilk eleman) Alanlar adımında tablo sütunlarına bağlanır. Gizli adlı alanların örnek değeri senaryoya yazılmaz.' }));
    metot.addEventListener('change', () => { u.metot = metot.value; govdeAlani.hidden = !GOVDELI_METOTLAR.includes(u.metot); degisti(); });
    const yt = h('input', { type: 'checkbox', id: yeniKimlik('yt'), checked: u.yalnizTest });
    yt.addEventListener('change', () => { u.yalnizTest = yt.checked; s.degisti(); });
    const baslik = h('span', {}, u.ad || `İstek ${i + 1}`);
    const kaldir = uclar.length > 1 ? h('button', { type: 'button', class: 'kucuk-dugme hayalet', 'aria-label': `${u.ad || `İstek ${i + 1}`} isteğini kaldır`, onclick: () => { uclar.splice(i, 1); ciz(); s.degisti(); } }, ikon('cop'), 'Kaldır') : null;
    // Dene (isteğe bağlı): TEST ortamında gerçek istek; onay diyaloğu yöntem + tam adresi gösterir.
    const deneOrtami = h('select', { 'aria-label': `${u.ad || `İstek ${i + 1}`} Dene ortamı` }, testler.map((o) => h('option', { value: o.id, selected: o.varsayilan }, o.ad)));
    const dene = h('button', { type: 'button', disabled: !testler.length }, ikon('oynat'), 'Dene (TEST)');
    const deneSonucu = h('div', { 'aria-live': 'polite' });
    dene.addEventListener('click', async () => {
      const o = testler.find((x) => x.id === deneOrtami.value);
      if (!o || !taban(o)) { yerlestir(deneSonucu, h('div', { class: 'not-kutusu hata', role: 'alert' }, 'Bu TEST ortamı için taban adres yok.')); return; }
      const adres = tamAdres(taban(o), u);
      const tamam = await onayIste({
        baslik: `${o.ad} ortamına istek atılsın mı?`, dugme: 'İstek at', ikonAd: 'ag', tehlikeli: u.metot !== 'GET',
        metin: `${u.metot} ${adres}${u.metot !== 'GET' ? ` — ${u.metot} isteği servis tarafında kayıt oluşturabilir ya da değiştirebilir.` : ''}`
      });
      if (!tamam) return;
      dene.disabled = true;
      try {
        const r = await api('/platform/servis/rest/dene', { govde: { projeId: s.proje.id, ortamId: o.id, taban: taban(o), uc: ucGovdesi(u), ...(s.tls && s.tls() === false ? { tlsDogrulama: false } : {}) } });
        yerlestir(deneSonucu, r.basarili
          ? h('div', { class: `not-kutusu ${r.durumKodu < 400 ? 'basari' : 'uyari'}`, role: 'status' }, `${r.metot} ${r.adres} → ${r.durumKodu} (${r.sureMs} ms)`,
            r.atlananBasliklar.length ? h('div', { class: 'kucuk' }, `Gönderilmeyen başlıklar (tablo değerine bağlı): ${r.atlananBasliklar.join(', ')}`) : null,
            r.yanit ? h('pre', { class: 'kod-alani deneme-yaniti' }, r.yanit) : null)
          : h('div', { class: 'not-kutusu hata', role: 'alert' }, `${r.metot} ${r.adres}: ${r.mesaj}`));
      } catch (e) { yerlestir(deneSonucu, h('div', { class: 'not-kutusu hata', role: 'alert' }, e.message)); } finally { dene.disabled = !testler.length; }
    });
    onizle();
    return h('fieldset', { class: 'rest-ucu' }, h('legend', {}, baslik, ' ', rozet(u.metot, 'vurgu')),
      h('div', { class: 'satir-duzen rest-ucu-ust' }, alan('Ad', ad, { zorunlu: true }), alan('HTTP işlemi', metot), alan('Yol', yol, { yardim: 'Taban adrese eklenir. Değişen kısım için {id} yazın.' })),
      h('div', {}, h('div', { class: 'alan-etiketi' }, 'Gidilecek adresler'), onizleme),
      h('div', { class: 'rest-ucu-bolum' }, h('div', { class: 'alan-etiketi' }, 'Sorgu parametreleri'),
        anahtarDegerListesi(u.sorgu, { etiket: 'Parametre', adYer: 'ad', degerYer: 'örnek değer', degisti })),
      h('div', { class: 'rest-ucu-bolum' }, h('div', { class: 'alan-etiketi' }, 'Başlıklar'),
        anahtarDegerListesi(u.basliklar, { etiket: 'Başlık', adYer: 'Authorization', degerYer: 'Bearer …', gizliMi: gizliBaslikMi, degisti: s.degisti }),
        h('p', { class: 'soluk kucuk' }, 'Authorization, token, API anahtarı gibi gizli adlı başlıkların değeri maskeli yazılır; kayıtta kasada şifreli tabloya gider, burada tekrar gösterilmez. Oturum akışından gelen değer için ${akis:Token} yazın.')),
      govdeAlani,
      h('label', { class: 'secenek', for: yt.id }, yt, 'CANLI\'da çağrılmasın (kayıt oluşturan / değiştiren istekler)'),
      h('div', { class: 'satir-duzen' }, testler.length > 1 ? alan('Dene ortamı', deneOrtami) : null, dene, kaldir),
      deneSonucu);
  };
  const ciz = () => yerlestir(kap, uclar.map(ucKarti),
    h('button', { type: 'button', class: 'kucuk-dugme', onclick: () => { uclar.push(yeniUc({ metot: 'GET' })); ciz(); s.degisti(); } }, ikon('arti'), 'İstek ekle'));
  ciz();
  return kap;
}

/**
 * Alanlar adımı: her ucun alanları (yol / sorgu / gövde) tablo sütunlarına bağlanır; zorunlu ve gizli işaretleri.
 * @param {ReturnType<typeof yeniUc>[]} uclar @param {{ baglar: Record<string, any>; zorunlu: Record<string, Set<string>>; tablolar: any[];
 *   bagOnerisi: (alan: { ad: string }) => any }} d baglar / zorunlu uç kimliğine göre; DEĞİŞTİRİLİR
 */
export function restAlanlari(uclar, d) {
  const tanimlar = [];
  const bolumler = [];
  for (const u of uclar) {
    const sema = restSemasi(u);
    const yapraklar = alanSatirlari(sema.alanlar).filter((x) => !x.grup);
    if (!yapraklar.length) { bolumler.push(h('p', { class: 'soluk' }, h('code', { class: 'duz' }, u.ad), ': alan yok (yol yer tutucusu, sorgu parametresi ya da gövde örneği ekleyin).')); continue; }
    const gecerli = new Set(yapraklar.map((x) => x.yol));
    const baglar = (d.baglar[u.kimlik] ??= {});
    for (const y of Object.keys(baglar)) if (!gecerli.has(y)) delete baglar[y];
    for (const x of yapraklar) if (!(x.yol in baglar)) { const b = d.bagOnerisi(x.alan); if (b) baglar[x.yol] = b; }
    const z = (d.zorunlu[u.kimlik] ??= new Set(yapraklar.filter((x) => x.alan.zorunlu).map((x) => x.yol)));
    for (const y of [...z]) if (!gecerli.has(y)) z.delete(y);
    if (!u.gizliAlanlar) u.gizliAlanlar = yapraklar.filter((x) => gizliAdMi(x.alan.ad)).map((x) => x.yol);
    u.gizliAlanlar = u.gizliAlanlar.filter((y) => gecerli.has(y));
    tanimlar.push({ ad: u.ad, sema, zorunlu: z, baglar, tablolar: d.tablolar });
    bolumler.push(h('fieldset', { class: 'gizli-alanlar' }, h('legend', {}, `${u.ad}: gizli alanlar`),
      h('p', { class: 'soluk kucuk' }, 'İşaretli alanların örnek değeri senaryoya yazılmaz (değer tablonun gizli sütunundan gelmeli).'),
      h('div', { class: 'secenek-izgarasi' }, yapraklar.map((x) => {
        const c = h('input', { type: 'checkbox', id: yeniKimlik('gz'), checked: u.gizliAlanlar.includes(x.yol) });
        c.addEventListener('change', () => { u.gizliAlanlar = c.checked ? [...new Set([...u.gizliAlanlar, x.yol])] : u.gizliAlanlar.filter((y) => y !== x.yol); });
        return h('label', { class: 'secenek', for: c.id }, c, h('code', { class: 'duz' }, x.yol));
      }))));
  }
  if (tanimlar.length) bolumler.unshift(metotKutulari(tanimlar, { anahtar: 'rest-sihirbaz' }));
  return bolumler;
}

/** Uç kimliğine göre tutulan bağ / zorunlulukları uç adına çevirir (kayıt). */
export function adaGore(uclar, d) {
  const baglar = {};
  const zorunlu = {};
  for (const u of uclar) {
    const b = d.baglar[u.kimlik];
    if (b && Object.keys(b).length) baglar[u.ad.trim()] = b;
    const z = d.zorunlu[u.kimlik];
    if (z && z.size) zorunlu[u.ad.trim()] = [...z];
  }
  return { alanBaglari: baglar, alanZorunluluklari: zorunlu };
}
