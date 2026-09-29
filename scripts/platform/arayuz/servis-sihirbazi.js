// "Servis ekle" sihirbazı (Servisler > Servis ekle > Adım adım). Adımlar:
//   1 · Adresler   — servis adı; her ortam için taban adres (ortamın listesinden seç ya da yeni yaz; CANLI boş bırakılabilir).
//                    Tam adres yapıştırılırsa taban + yol kendiliğinden ayrılır.
//   2 · Metotlar   — yol + "Denetle" (seçilen ortama — varsayılan TEST — WSDL isteği, onayla; CANLI'da tek tip CANLI onayı) → metotlar; seçim + "CANLI'da çağrılmasın" işareti.
//   3 · Alanlar    — seçilen metotların alanları; her alan bir test verisi tablosunun sütununa bağlanır (öneriler: başka
//                    serviste aynı adlı alanın bağlantısı, yoksa adı aynı sütun). Giriş bilgisi de bir tablodur (Servis girişi).
//   4 · Özet → Kaydet. Yeni yazılan taban adresler ortamlara kaydedilir (sonraki servislerde listede hazır olur).
// REST türünde (en başta seçilir) 2. adım "İstekler": uçlar (ad, HTTP işlemi, yol, sorgu, içerik türü, başlıklar, gövde örneği);
// 3. adım uçların alanları (yol / sorgu / gövde); 4. adımda uç başına başlangıç senaryosu seçilir (rest-sihirbazi.js). WSDL yok;
// "Dene" isteğe bağlı ve onaylıdır. Tam adres yapıştırılırsa köken taban adres, kalanı ilk isteğin yolu / sorgusu olur.
// Hiçbir ağ isteği kullanıcı onayı olmadan atılmaz; kaydetmeden önce hiçbir şey veritabanına yazılmaz.
// "cURL yapıştır" (curl-aktarimi.js) sihirbazı REST türünde, isteklerle dolu açar (baslangic): gizli değerlerin yalnız onaylananları
// gelir (başlıkta değer, sorgu / gövdede gizliDegerler); onaysızların sütunu kayıtta boş açılır. Adlandırılmış taban adresine bağlıysa
// ortam adresleri ondan gelir (bağ kaldırılabilir).
import { adaGore, restAlanlari, restUclariFormu, ucGovdesi, uclarEksik, yeniUc } from './rest-sihirbazi.js';
import { adresAyir, ucAdiOner } from './rest-semasi.mjs';
import { alan, api, bildir, dosyaSecimi, h, ikon, mesajKutusu, mesgulIken, rozet, yeniKimlik, yerlestir } from './ortak.js';
import { canliOnayEki, canliOnayIste, onayIste, ortamRiskRozeti, ortamSecenekMetni, riskliOrtamMi } from './kosu-paneli.js';
import { aktarimEtkisiBolumu, guncellemeMetni, onizlemeyleAktar } from './tablolar.js';
import { benzerTabloNotu } from './veri-sagligi.js';
import { alanSatirlari } from './servis-govdesi.mjs';
import { metotKutulari } from './servis-alanlari.js';

const ADIMLAR = ['Adresler', 'Metotlar', 'Alanlar', 'Özet'];
const REST_ADIMLARI = ['Adresler', 'İstekler', 'Alanlar', 'Özet'];
/** Kayıt oluşturan / belge üreten metot adları: "CANLI'da çağrılmasın" işaretli gelir (kullanıcı değiştirebilir). */
const YALNIZ_TEST_DESENI = /approve|onay|print|basim|cancel|iptal|delete|sil|create|kaydet|save|pay|odeme|purchase|issue/i;
/** WSDL "date" tipinin zorunlu biçimi; tarih-saat alanlarında biçim yazılmaz → kullanıcının varsayılanı (Ayarlar > Koşu). */
const XSD_TARIH_BICIMI = 'yyyy-MM-dd';

const temizTaban = (a) => a.trim().replace(/\/+$/, '');
const birlestir = (taban, yol) => `${temizTaban(taban)}/${yol.replace(/^\/+/, '')}`;

function anahtarUret(ad) {
  return ad.trim().replace(/(?:Soap12|Soap)$/, '').replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLocaleLowerCase('tr')
    .replace(/ı/g, 'i').replace(/ğ/g, 'g').replace(/ü/g, 'u').replace(/ş/g, 's').replace(/ö/g, 'o').replace(/ç/g, 'c')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);
}

/**
 * @param {HTMLElement} kap
 * @param {{ id: string; ad: string }} proje
 * @param {Array<{ id: string; ad: string; canli: boolean; varsayilan: boolean; tabanUrl: string; tabanAdresleri?: string[] }>} ortamlar
 * @param {{ ad: string; tabanlar: Record<string, string>; tabanGrubu: string | null; uclar: ReturnType<typeof yeniUc>[];
 *   gizliDegerler: Record<string, Record<string, string | null>>; gizliOzeti: { onayli: number; onaysiz: number } } | null} [baslangic]
 *   cURL'den: REST türünde, isteklerle dolu açılır. gizliDegerler uç kimliğine göre (alan yolu → onaylı değer | null).
 */
export async function servisSihirbazi(kap, proje, tumOrtamlar, baslangic = null) {
  // TEST ortamları önce (denetleme ve ilk adres oradan), CANLI sonra.
  const ortamlar = [...tumOrtamlar].sort((a, b) => Number(a.canli) - Number(b.canli));
  const [{ servisler }, { tablolar }] = await Promise.all([
    api(`/platform/servisler?projeId=${encodeURIComponent(proje.id)}`),
    api(`/platform/tablolar?projeId=${encodeURIComponent(proje.id)}`)
  ]);
  const testOrtamlari = ortamlar.filter((o) => !riskliOrtamMi(o));
  /** Sihirbaz durumu (kaydedene kadar yalnız tarayıcıda). varsayilanlar: yalnız tarih kuralı önerileri (BEGIN_DATE / END_DATE). */
  const d = {
    adim: 0, ad: '', anahtar: '', anahtarElle: false, soapSurumu: '1.1', tls: true,
    tabanlar: Object.fromEntries(ortamlar.map((o) => [o.id, o.canli ? '' : o.tabanUrl])),
    yol: '', kontrolOrtami: (testOrtamlari.find((o) => o.varsayilan) || testOrtamlari[0] || ortamlar[0])?.id ?? '',
    erisim: null, secilen: new Set(), yalnizTest: new Set(), varsayilanlar: {}, baglar: {}, zorunlu: {}, ekAlanlar: {},
    // REST: tür, uçlar, uç kimliğine göre alan bağları / zorunluluklar, başlangıç senaryosu istenen uçlar (kimlik).
    tur: 'soap', uclar: [yeniUc()], restBaglar: {}, restZorunlu: {}, senaryoIstenen: null, kapsam: 'test',
    // Hesaplama kuralları (alan bağlamada "+ Yeni kural…" ile eklenenler; tarih önerileri kayıtta birleşir).
    kurallar: {},
    // cURL'den: adlandırılmış taban adres bağı ve başlangıç verisi (gizli alan değerleri uç kimliğine göre).
    tabanGrubu: null, curl: null
  };
  if (baslangic) {
    Object.assign(d, { tur: 'rest', ad: baslangic.ad, anahtar: anahtarUret(baslangic.ad), uclar: baslangic.uclar, tabanGrubu: baslangic.tabanGrubu, curl: baslangic });
    Object.assign(d.tabanlar, baslangic.tabanlar);
  }
  const rest = () => d.tur === 'rest';
  const adimAdlari = () => (rest() ? REST_ADIMLARI : ADIMLAR);

  // Öneriler (3. adım): başka serviste aynı adlı alanın tablo bağlantısı; yoksa adı aynı (gizli olmayan) sütun.
  const kucuk = (x) => String(x ?? '').toLocaleLowerCase('tr');
  /** @type {Record<string, { tablo: string; sutun: string; etiket?: string }>} */
  const ogrenilen = {};
  for (const s of servisler) {
    for (const alanlar of Object.values(s.ayarlar.alanBaglari || {})) {
      for (const [yol, b] of Object.entries(alanlar)) if (b && tablolar.some((x) => x.id === b.tablo)) ogrenilen[kucuk(yol.split('/').pop())] ??= b;
    }
  }
  const bagOnerisi = (alanT, yer) => {
    // cURL'den gelen gizli alan önerilmez: kayıtta kendi gizli sütununa bağlanır (değer onaylıysa oraya yazılır).
    if (yer && d.curl && d.curl.gizliDegerler[yer.uc.kimlik] && yer.yol in d.curl.gizliDegerler[yer.uc.kimlik]) return null;
    const b = ogrenilen[kucuk(alanT.ad)];
    if (b) return { ...b };
    for (const tb of tablolar) {
      const c = tb.sutunlar.find((x) => kucuk(x.ad) === kucuk(alanT.ad));
      if (c) return { tablo: tb.id, sutun: c.ad };
    }
    return null;
  };
  /** Tarih alanı önerisi: başlangıç / bitiş tarihi → tarih kuralı (bugün / bugün + 1 yıl). */
  const tarihOnerisi = (alanT) => {
    if (alanT.tip !== 'tarih' && alanT.tip !== 'tarihSaat') return '';
    const ad = alanT.ad.toLowerCase().replace(/[^a-z]/g, '');
    return /begin|start|baslangic/.test(ad) ? 'BEGIN_DATE' : /end|bitis/.test(ad) ? 'END_DATE' : '';
  };

  const mesaj = mesajKutusu();
  const govde = h('div', {});
  const adimCubugu = h('ol', { class: 'sihirbaz-adimlari', 'aria-label': 'Adımlar' });
  const geri = h('button', { type: 'button' }, 'Geri');
  const ileri = h('button', { type: 'button', class: 'birincil' }, 'İleri');
  const nedenMetni = h('span', { class: 'soluk kucuk', 'aria-live': 'polite' });
  geri.addEventListener('click', () => { if (d.adim > 0) { d.adim--; ciz(); } });

  const ortamSatiri = (o) => {
    const liste = [...new Set((o.tabanAdresleri && o.tabanAdresleri.length ? o.tabanAdresleri : [o.tabanUrl]).map(temizTaban))];
    const sec = h('select', { 'aria-label': `${o.ad} taban adresi`, disabled: Boolean(d.tabanGrubu) },
      ...liste.map((a) => h('option', { value: a, selected: temizTaban(d.tabanlar[o.id] || '') === a }, a)),
      h('option', { value: '__yeni', selected: Boolean(d.tabanlar[o.id]) && !liste.includes(temizTaban(d.tabanlar[o.id])) }, 'Yeni adres yaz…'),
      o.canli || d.tabanlar[o.id] === '' ? h('option', { value: '', selected: d.tabanlar[o.id] === '' }, '— Bu ortamda yok —') : null);
    const yeni = h('input', { type: 'url', autocomplete: 'off', spellcheck: 'false', placeholder: 'https://ornek.com/', 'aria-label': `${o.ad} yeni taban adresi`,
      value: sec.value === '__yeni' ? d.tabanlar[o.id] : '', hidden: sec.value !== '__yeni', disabled: Boolean(d.tabanGrubu) });
    sec.addEventListener('change', () => {
      yeni.hidden = sec.value !== '__yeni';
      d.tabanlar[o.id] = sec.value === '__yeni' ? yeni.value.trim() : sec.value;
      if (!yeni.hidden) yeni.focus();
      d.erisim = null;
      durumGuncelle();
    });
    yeni.addEventListener('input', () => { d.tabanlar[o.id] = yeni.value.trim(); d.erisim = null; durumGuncelle(); });
    return h('div', { class: 'taban-satiri' }, h('span', { class: 'taban-ortam' }, o.ad, ortamRiskRozeti(o) ? [' ', ortamRiskRozeti(o)] : null), sec, yeni);
  };

  // --- Adım çizimleri --------------------------------------------------------------------------------------------------
  const turSecimi = () => {
    const secim = h('div', { class: 'segment tur-secimi', role: 'radiogroup', 'aria-label': 'Servis türü' },
      [['soap', 'SOAP (WSDL)'], ['rest', 'REST (JSON)']].map(([t, m]) => h('button', {
        type: 'button', role: 'radio', 'aria-checked': d.tur === t ? 'true' : 'false',
        onclick: () => { if (d.tur === t) return; d.tur = t; ciz(); }
      }, m)));
    return h('div', { class: 'alan' }, h('div', { class: 'alan-etiketi' }, 'Servis türü'), secim,
      rest() ? h('p', { class: 'soluk kucuk' }, 'Yalnız adresiniz varsa buradan ilerleyin: taban adres kaydedilir, sonraki adımda yolun devamı ve HTTP işlemi (GET / POST / PUT…) sorulur. Postman koleksiyonunuz varsa "Postman koleksiyonu" sekmesini kullanın.') : null);
  };
  /** REST tam adres: köken TEST ortamının taban adresi, kalan yol / sorgu ilk (boşsa) ya da yeni isteğe gider. */
  const restYapistir = (deger) => {
    let a;
    try { a = adresAyir(deger); } catch (e) { d.yapistirNotu = e.message; ciz(); return; }
    const test = ortamlar.find((o) => o.id === d.kontrolOrtami) || testOrtamlari[0];
    if (test) d.tabanlar[test.id] = a.koken;
    const bos = d.uclar.find((u) => !u.yol && !u.sorgu.length);
    const u = bos || yeniUc();
    if (!bos) d.uclar.push(u);
    Object.assign(u, { yol: a.yol, sorgu: a.sorgu, ...(u.adElle ? {} : { ad: ucAdiOner(a.yol) }) });
    d.yapistirNotu = `Taban: ${a.koken}${a.semaEklendi ? ' (şema yazılmadığı için https:// varsayıldı)' : ''} · İstek yolu: ${a.yol || '/'}${a.sorgu.length ? ` · ${a.sorgu.length} sorgu parametresi` : ''} (sonraki adımda HTTP işlemini seçin)`;
    ciz();
  };
  const adim1 = () => {
    const ad = h('input', { type: 'text', autocomplete: 'off', value: d.ad, placeholder: 'ör. SiparisServisi' });
    const anahtar = h('input', { type: 'text', autocomplete: 'off', spellcheck: 'false', value: d.anahtar, placeholder: 'ör. siparis-servisi' });
    ad.addEventListener('input', () => { d.ad = ad.value; if (!d.anahtarElle) { d.anahtar = anahtarUret(ad.value); anahtar.value = d.anahtar; } durumGuncelle(); });
    anahtar.addEventListener('input', () => { d.anahtar = anahtar.value.trim(); d.anahtarElle = Boolean(anahtar.value); durumGuncelle(); });
    // Tam adres yapıştır: bilinen bir taban adresiyle başlıyorsa taban + yol ayrılır, değilse adresin kökü yeni taban olur.
    const yapistir = h('input', { type: 'url', autocomplete: 'off', spellcheck: 'false', placeholder: 'https://ornek.com/servisler/ornek.asmx', 'aria-label': 'Servisin tam adresi (TEST)' });
    const yapistirNotu = h('span', { class: 'soluk kucuk', 'aria-live': 'polite' }, rest() ? d.yapistirNotu || '' : '');
    if (rest()) yapistir.placeholder = 'xxx.com/api/rest/v1/authenticate';
    yapistir.addEventListener('change', () => {
      if (rest()) { restYapistir(yapistir.value); return; }
      let u;
      try { u = new URL(yapistir.value.trim().replace(/\?wsdl$/i, '')); } catch { yapistirNotu.textContent = 'Adres anlaşılamadı (http:// ya da https:// ile başlamalı).'; return; }
      const tam = u.href.replace(/\/$/, '');
      const test = ortamlar.find((o) => o.id === d.kontrolOrtami) || testOrtamlari[0];
      const adaylar = test ? [...new Set((test.tabanAdresleri || [test.tabanUrl]).map(temizTaban))] : [];
      const taban = adaylar.filter((a) => tam.toLowerCase().startsWith(a.toLowerCase() + '/')).sort((a, b) => b.length - a.length)[0] || u.origin;
      if (test) d.tabanlar[test.id] = taban;
      d.yol = tam.slice(taban.length) || '/';
      d.erisim = null;
      yapistirNotu.textContent = `Taban: ${taban} · Yol: ${d.yol} (${adaylar.includes(taban) ? 'kayıtlı taban adres' : 'yeni taban adres; kaydedilince ortama eklenir'})`;
      ciz();
    });
    const surum = h('select', { 'aria-label': 'SOAP sürümü' }, ['1.1', '1.2'].map((v) => h('option', { value: v, selected: d.soapSurumu === v }, `SOAP ${v}`)));
    surum.addEventListener('change', () => { d.soapSurumu = surum.value; });
    const tls = h('input', { type: 'checkbox', id: yeniKimlik('tls'), checked: d.tls });
    tls.addEventListener('change', () => { d.tls = tls.checked; d.erisim = null; });
    const bagNotu = d.tabanGrubu ? h('div', { class: 'not-kutusu basari', role: 'status' }, `"${d.tabanGrubu}" taban adresine bağlı: adresler ondan gelir ve birlikte güncellenir. `,
      h('button', { type: 'button', class: 'kucuk-dugme', onclick: () => { d.tabanGrubu = null; ciz(); } }, 'Bağı kaldır')) : null;
    return [
      d.curl ? h('div', { class: 'not-kutusu', role: 'status' }, `cURL komutlarından ${d.uclar.length} istek hazır (REST). Servis adını ve adresleri gözden geçirin; istekler sonraki adımda.`) : turSecimi(),
      alan('Servis adı', ad, { zorunlu: true }), alan('Anahtar', anahtar, { yardim: 'Küçük harf, rakam ve "-". Addan önerilir.' }),
      h('fieldset', {}, h('legend', {}, 'Taban adresler (adresin başı)'),
        h('p', { class: 'soluk kucuk' }, 'Her ortam için servisin adresinin başını seçin ya da yazın. Yeni yazılan adres ortama kaydedilir; sonraki servislerde listede hazır olur. Yol bir sonraki adımda.'),
        bagNotu, ...ortamlar.map(ortamSatiri),
        h('details', { class: 'yapistir', open: rest() && Boolean(d.yapistirNotu) }, h('summary', {}, 'Tam adresi biliyorum (yapıştır, ayrılsın)'), alan('Servisin TEST adresi', yapistir), yapistirNotu)),
      h('div', { class: 'satir-duzen' }, rest() ? null : alan('SOAP sürümü', surum), h('label', { class: 'secenek', for: tls.id }, tls, 'TLS sertifikasını doğrula (iç ortam sertifikası tanınmıyorsa kapatın)'))
    ];
  };

  const adim2 = () => {
    const yol = h('input', { type: 'text', autocomplete: 'off', spellcheck: 'false', value: d.yol, placeholder: '/AppService/siparis.asmx', 'aria-label': 'Yol' });
    const onizleme = h('ul', { class: 'adres-onizleme' });
    const onizle = () => yerlestir(onizleme, ...ortamlar.map((o) => h('li', {}, h('b', {}, `${o.ad}: `),
      d.tabanlar[o.id] ? h('code', { class: 'duz' }, birlestir(d.tabanlar[o.id], d.yol || '/…')) : h('span', { class: 'soluk' }, 'bu ortamda yok'))));
    yol.addEventListener('input', () => { d.yol = yol.value.trim(); d.erisim = null; onizle(); metotAlani(); durumGuncelle(); });
    onizle();
    const kontrolSec = h('select', { 'aria-label': 'Denetleme ortamı' }, ortamlar.map((o) => h('option', { value: o.id, selected: d.kontrolOrtami === o.id }, ortamSecenekMetni(o))));
    kontrolSec.addEventListener('change', () => { d.kontrolOrtami = kontrolSec.value; d.erisim = null; metotAlani(); durumGuncelle(); });
    const denetle = h('button', { type: 'button' }, ikon('ag'), 'Denetle');
    const sonuc = h('div', { 'aria-live': 'polite' });
    const metotAlani = () => {
      if (!d.erisim) { yerlestir(sonuc); return; }
      const hepsi = h('input', { type: 'checkbox', id: yeniKimlik('hepsi'), checked: d.erisim.operasyonlar.every((o) => d.secilen.has(o.ad)) });
      hepsi.addEventListener('change', () => { for (const o of d.erisim.operasyonlar) hepsi.checked ? d.secilen.add(o.ad) : d.secilen.delete(o.ad); metotAlani(); durumGuncelle(); });
      yerlestir(sonuc,
        h('div', { class: 'not-kutusu basari', role: 'status' }, `Erişildi (${d.erisim.durumKodu}, ${d.erisim.sureMs} ms): ${d.erisim.operasyonlar.length} metot.`),
        h('div', { class: 'metot-listesi', role: 'table', 'aria-label': 'Metotlar' },
          h('div', { class: 'metot-satiri baslik', role: 'row' }, h('label', { class: 'secenek', for: hepsi.id }, hepsi, 'Hepsini seç'), h('span', { role: 'columnheader' }, 'Alan'), h('span', { role: 'columnheader' }, 'CANLI\'da çağrılmasın')),
          ...d.erisim.operasyonlar.map((o) => {
            const sec = h('input', { type: 'checkbox', id: yeniKimlik('op'), checked: d.secilen.has(o.ad) });
            const yt = h('input', { type: 'checkbox', id: yeniKimlik('yt'), checked: d.yalnizTest.has(o.ad), 'aria-label': `${o.ad} CANLI'da çağrılmasın` });
            sec.addEventListener('change', () => { sec.checked ? d.secilen.add(o.ad) : d.secilen.delete(o.ad); hepsi.checked = d.erisim.operasyonlar.every((x) => d.secilen.has(x.ad)); durumGuncelle(); });
            yt.addEventListener('change', () => { yt.checked ? d.yalnizTest.add(o.ad) : d.yalnizTest.delete(o.ad); });
            const sema = d.erisim.semalar?.[o.ad];
            return h('div', { class: 'metot-satiri', role: 'row' }, h('label', { class: 'secenek', for: sec.id }, sec, h('code', { class: 'duz' }, o.ad)),
              h('span', { class: 'soluk kucuk' }, sema ? `${alanSatirlari(sema.alanlar).filter((x) => !x.grup).length} alan` : 'alan listesi yok'), yt);
          })));
    };
    denetle.addEventListener('click', async () => {
      mesaj.temizle();
      if (!/^\/\S*$/.test(d.yol)) { mesaj.goster('Yol "/" ile başlamalı (ör. /AppService/siparis.asmx).'); return; }
      const o = ortamlar.find((x) => x.id === d.kontrolOrtami);
      if (!o || !d.tabanlar[o.id]) { mesaj.goster(`Denetleme için ${o ? `${o.ad} ortamının` : 'ortamın'} taban adresi gerekli (1. adım).`); return; }
      const adres = `${birlestir(d.tabanlar[o.id], d.yol)}?wsdl`;
      // CANLI ortamda yalnız tek tip CANLI onayı (çift onay yok); TEST ortamında istek onayı.
      const tamam = riskliOrtamMi(o) ? await canliOnayIste(o) : await onayIste({ baslik: 'TEST ortamına istek atılsın mı?', metin: `Servisin WSDL'i istenecek (yalnız okuma): ${adres}. WSDL ayrı şema dosyalarını içe aktarıyorsa onlar da aynı sunucudan istenir.`, dugme: 'İstek at', ikonAd: 'ag' });
      if (!tamam) return;
      const canliEki = canliOnayEki(o.id);
      await mesgulIken(denetle, 'Denetleniyor…', async () => {
        try {
          const e = await api('/platform/servis/erisim', { govde: { projeId: proje.id, ortamId: o.id, ...canliEki, yol: d.yol, tabanlar: { [o.id]: d.tabanlar[o.id] }, ...(d.tls ? {} : { tlsDogrulama: false }) } });
          if (!e.erisilebilir) { d.erisim = null; yerlestir(sonuc, h('div', { class: 'not-kutusu hata', role: 'alert' }, `Erişilemedi: ${e.mesaj}`, h('br', {}), h('code', { class: 'duz' }, e.adres))); durumGuncelle(); return; }
          d.erisim = e;
          d.secilen = new Set(e.operasyonlar.map((x) => x.ad));
          d.yalnizTest = new Set(e.operasyonlar.filter((x) => YALNIZ_TEST_DESENI.test(x.ad)).map((x) => x.ad));
          d.varsayilanlar = {};
          d.baglar = {};
          d.zorunlu = {};
          d.ekAlanlar = {};
          metotAlani();
        } catch (hata) { yerlestir(sonuc, h('div', { class: 'not-kutusu hata', role: 'alert' }, hata.message)); }
        durumGuncelle();
      });
    });
    metotAlani();
    return [
      alan('Yol', yol, { zorunlu: true, yardim: 'Taban adresin arkasına eklenir; tüm ortamlarda aynıdır.' }),
      h('div', {}, h('div', { class: 'alan-etiketi' }, 'Gidilecek adresler'), onizleme),
      h('div', { class: 'satir-duzen' }, alan('Denetleme ortamı', kontrolSec, { yardim: 'Varsayılan TEST ortamı; CANLI ortamda istekten önce onay sorulur.' }), denetle),
      sonuc
    ];
  };

  const adim3 = () => {
    const bolumler = [];
    const metotTanimlari = [];
    for (const ad of d.secilen) {
      const sema = d.erisim.semalar?.[ad];
      if (!sema || !sema.alanlar.length) { bolumler.push(h('p', { class: 'soluk' }, h('code', { class: 'duz' }, ad), ': alan listesi yok (senaryoları XML olarak düzenlenir).')); continue; }
      const alanlar = alanSatirlari(sema.alanlar).filter((x) => !x.grup);
      d.varsayilanlar[ad] ??= Object.fromEntries(alanlar.map((x) => [x.yol, tarihOnerisi(x.alan)]).filter(([, p]) => p));
      const baglar = (d.baglar[ad] ??= Object.fromEntries(alanlar.filter((x) => !d.varsayilanlar[ad][x.yol]).map((x) => [x.yol, bagOnerisi(x.alan)]).filter(([, b]) => b)));
      // Zorunluluk: WSDL'e göre işaretli gelir (şemada zorunlu), kullanıcı iş kuralına göre düzeltir.
      const z = (d.zorunlu[ad] ??= new Set(alanlar.filter((x) => x.alan.zorunlu).map((x) => x.yol)));
      const ekler = (d.ekAlanlar[ad] ??= []);
      metotTanimlari.push({ ad, sema, zorunlu: z, ekler, baglar, tablolar, kurallar: Object.assign(d.kurallar, { ...tarihKuraliOnerileri(), ...d.kurallar }), kuralEkle: (a, k) => { d.kurallar[a] = k; } });
    }
    if (metotTanimlari.length) bolumler.unshift(metotKutulari(metotTanimlari, { anahtar: 'sihirbaz' }));
    return [
      h('p', { class: 'soluk' }, 'Seçilen metotların alanları. Her alanı bir test verisi tablosunun sütununa bağlayın (ör. Channel → Servis girişi → kanal); senaryoda değer o sütundan seçilir, aynı tablodaki alanlar birbirini süzer. Öneriler hazır geldi: başka serviste aynı adlı alanın bağlantısı ya da adı aynı sütun. Bağlanmayan alanlar senaryoda elle yazılır ya da gönderilmez.'),
      h('p', { class: 'soluk kucuk' }, '"Zorunlu" işareti WSDL\'e göre gelir; iş kuralına göre düzeltin. WSDL\'de olmayan bir alanı "+ Alan ekle" ile ekleyebilirsiniz. Başlangıç / bitiş tarihleri tarih kuralıyla (bugün, bugün + 1 yıl) dolar. Bunlar sonra servisin Parametreler sekmesinden de değiştirilir.'),
      tablolar.length ? null : h('div', { class: 'not-kutusu uyari' }, 'Henüz test verisi tablosu yok; alanları sonra Parametreler sekmesinden bağlayabilirsiniz (Veri > Tablolar).'),
      ...bolumler
    ];
  };

  const adim4 = () => {
    const tarihKurallari = tarihKuraliOnerileri();
    const bagli = Object.values(d.baglar).reduce((n, v) => n + Object.keys(v).length, 0);
    return [h('dl', { class: 'ozet-listesi' },
      h('dt', {}, 'Servis'), h('dd', {}, `${d.ad} (${d.anahtar})`),
      h('dt', {}, 'Adresler'), h('dd', {}, h('ul', {}, ortamlar.map((o) => h('li', {}, `${o.ad}: `, d.tabanlar[o.id] ? h('code', { class: 'duz' }, birlestir(d.tabanlar[o.id], d.yol)) : h('span', { class: 'soluk' }, 'yok (bu ortamda koşmaz)'))))),
      h('dt', {}, 'Metotlar'), h('dd', {}, [...d.secilen].map((m) => `${m}${d.yalnizTest.has(m) ? ' (CANLI\'da çağrılmaz)' : ''}`).join(', ')),
      h('dt', {}, 'Tabloya bağlı alanlar'), h('dd', {}, `${bagli} alan`),
      h('dt', {}, 'Zorunlu alanlar'), h('dd', {}, [...d.secilen].filter((m) => d.zorunlu[m]).map((m) => `${m}: ${d.zorunlu[m].size}`).join(' · ') || '—'),
      h('dt', {}, 'Tarih kuralları'), h('dd', {}, Object.entries(tarihKurallari).map(([a, k]) => `${a} = ${k}`).join(' · ') || 'yok'))];
  };

  // --- REST adımları ------------------------------------------------------------------------------------------------
  const restAdim2 = () => [
    h('p', { class: 'soluk' }, 'Her istek (uç) için adını, HTTP işlemini ve yolunu yazın; yol taban adrese eklenir. POST / PUT / PATCH için gövde örneği yapıştırabilirsiniz. "Dene" isteğe bağlıdır: seçilen TEST ortamında ucu gerçekten çağırır (önce onay sorulur); denemeden de kaydedebilirsiniz.'),
    restUclariFormu(d.uclar, { proje, ortamlar, tabanlar: () => d.tabanlar, tls: () => d.tls, degisti: () => durumGuncelle() })
  ];
  const restAdim3 = () => [
    h('p', { class: 'soluk' }, 'İsteklerin alanları: yol yer tutucuları ({id}), sorgu parametreleri ve gövde örneğindeki alanlar. Her alanı bir test verisi tablosunun sütununa bağlayın; senaryoda değer o sütundan gelir. Öneriler hazır geldi (başka serviste aynı adlı alanın bağlantısı ya da adı aynı sütun).'),
    tablolar.length ? null : h('div', { class: 'not-kutusu uyari' }, 'Henüz test verisi tablosu yok; alanları sonra Parametreler sekmesinden bağlayabilirsiniz.'),
    ...restAlanlari(d.uclar, { baglar: d.restBaglar, zorunlu: d.restZorunlu, tablolar, bagOnerisi, kurallar: d.kurallar, kuralEkle: (a, k) => { d.kurallar[a] = k; } })
  ];
  const restAdim4 = () => {
    d.senaryoIstenen ??= new Set(d.uclar.map((u) => u.kimlik));
    const bagli = d.uclar.reduce((n, u) => n + Object.keys(d.restBaglar[u.kimlik] || {}).length, 0);
    const kapsam = h('select', {}, [['test', 'TEST'], ['canli', 'CANLI'], ['ikisi', 'TEST + CANLI']].map(([k, m]) => h('option', { value: k, selected: d.kapsam === k }, m)));
    kapsam.addEventListener('change', () => { d.kapsam = kapsam.value; });
    return [h('dl', { class: 'ozet-listesi' },
      h('dt', {}, 'Servis'), h('dd', {}, `${d.ad} (${d.anahtar}) `, rozet('REST', 'vurgu')),
      h('dt', {}, 'Taban adresler'), h('dd', {}, h('ul', {}, ortamlar.map((o) => h('li', {}, `${o.ad}: `, d.tabanlar[o.id] ? h('code', { class: 'duz' }, temizTaban(d.tabanlar[o.id])) : h('span', { class: 'soluk' }, 'yok (bu ortamda koşmaz)'))))),
      h('dt', {}, 'İstekler'), h('dd', {}, h('ul', {}, d.uclar.map((u) => h('li', {}, rozet(u.metot, 'vurgu'), ' ', h('b', {}, u.ad), ' ', h('code', { class: 'duz' }, u.yol || '/'), u.yalnizTest ? ' (CANLI\'da çağrılmaz)' : '')))),
      h('dt', {}, 'Tabloya bağlı alanlar'), h('dd', {}, `${bagli} alan`),
      d.tabanGrubu ? [h('dt', {}, 'Taban adresi'), h('dd', {}, `"${d.tabanGrubu}" (bağlı)`)] : null,
      d.curl && d.curl.gizliOzeti.onayli + d.curl.gizliOzeti.onaysiz ? [h('dt', {}, 'Gizli değerler'),
        h('dd', {}, `${d.curl.gizliOzeti.onayli} değer şifreli kaydedilecek; ${d.curl.gizliOzeti.onaysiz} değer kaydedilmeyecek (sütunu boş açılır, tabloda doldurun).`)] : null),
      h('fieldset', {}, h('legend', {}, 'Başlangıç senaryoları'),
        h('p', { class: 'soluk kucuk' }, 'İşaretli her istek için bir senaryo oluşturulur: gövde / yol / sorgu şablonu bağlı alanlarda tablo sütununa başvurur, diğer alanlarda örnek değer durur (gizli alanlarınki yazılmaz). Kontrol: HTTP 200-299.'),
        d.uclar.map((u) => {
          const c = h('input', { type: 'checkbox', id: yeniKimlik('sn'), checked: d.senaryoIstenen.has(u.kimlik) });
          c.addEventListener('change', () => { if (c.checked) d.senaryoIstenen.add(u.kimlik); else d.senaryoIstenen.delete(u.kimlik); });
          return h('label', { class: 'secenek', for: c.id }, c, `${u.ad} (${u.metot})`);
        }),
        alan('Senaryoların kapsamı', kapsam))];
  };

  /** 3. adımda seçilen BEGIN_DATE / END_DATE için tarih kuralı (alan tipine göre biçim). */
  function tarihKuraliOnerileri() {
    const k = {};
    for (const [op, v] of Object.entries(d.varsayilanlar)) {
      const sema = d.erisim?.semalar?.[op];
      if (!sema) continue;
      for (const s of alanSatirlari(sema.alanlar)) {
        const p = v[s.yol];
        if (p !== 'BEGIN_DATE' && p !== 'END_DATE') continue;
        const bicim = s.alan.tip === 'tarih' ? `|${XSD_TARIH_BICIMI}` : '';
        k[p] ??= p === 'BEGIN_DATE' ? `bugun${bicim}` : `bugun+1y${bicim}`;
      }
    }
    return k;
  }

  /** cURL'den: onaysız gizli başlığın sütunu boş açılır; gizli alan değerleri uç adına göre; taban adresi bağı. */
  const curlKayitEki = () => ({
    gizliBosSutun: true,
    gizliAlanDegerleri: Object.fromEntries(d.uclar.filter((u) => d.curl.gizliDegerler[u.kimlik]).map((u) => [u.ad.trim(), d.curl.gizliDegerler[u.kimlik]])),
    ...(d.tabanGrubu ? { tabanGrubu: d.tabanGrubu } : {})
  });

  /** Adımdan ileri geçilemiyorsa nedeni (null = geçilebilir). */
  const eksik = () => {
    if (d.adim === 0) {
      if (!d.ad.trim()) return 'Servis adını yazın.';
      if (!/^[a-z0-9][a-z0-9-]{0,79}$/.test(d.anahtar)) return 'Anahtar yalnız küçük harf, rakam ve "-" içerebilir.';
      if (!ortamlar.some((o) => d.tabanlar[o.id])) return 'En az bir ortam için taban adres gerekli.';
      for (const o of ortamlar) { const a = d.tabanlar[o.id]; if (a && !/^https?:\/\/\S+$/.test(a)) return `${o.ad} taban adresi http:// ya da https:// ile başlamalı.`; }
      if (servisler.some((s) => s.anahtar === d.anahtar)) return `"${d.anahtar}" anahtarlı servis zaten var.`;
    }
    if (d.adim >= 1 && rest()) return uclarEksik(d.uclar);
    if (d.adim === 1) {
      if (!d.erisim) return 'Yolu yazıp "Denetle" ile erişimi kontrol edin.';
      if (!d.secilen.size) return 'En az bir metot seçin.';
    }
    return null;
  };
  const durumGuncelle = () => {
    const n = eksik();
    ileri.disabled = Boolean(n);
    nedenMetni.textContent = n || '';
  };

  ileri.addEventListener('click', async () => {
    if (eksik()) return;
    if (d.adim < adimAdlari().length - 1) { d.adim++; mesaj.temizle(); ciz(); return; }
    mesaj.temizle();
    if (rest()) {
      try {
        await mesgulIken(ileri, 'Kaydediliyor…', async () => {
          const r = await api('/platform/servis/rest/kaydet', { govde: {
            projeId: proje.id, anahtar: d.anahtar, ad: d.ad.trim(), tabanlar: d.tabanlar, tlsDogrulama: d.tls, uclar: d.uclar.map(ucGovdesi),
            ...adaGore(d.uclar, { baglar: d.restBaglar, zorunlu: d.restZorunlu }), ...(Object.keys(d.kurallar).length ? { tarihKurallari: d.kurallar } : {}),
            ...(d.curl ? curlKayitEki() : {}),
            senaryolar: d.uclar.filter((u) => (d.senaryoIstenen ?? new Set(d.uclar.map((x) => x.kimlik))).has(u.kimlik)).map((u) => u.ad.trim()), kapsam: d.kapsam
          } });
          bildir(`REST servisi eklendi${r.eklenenSenaryolar.length ? `; ${r.eklenenSenaryolar.length} başlangıç senaryosu oluşturuldu` : ''}.`);
          location.hash = `#/servisler/s/${encodeURIComponent(r.id)}`;
        });
      } catch (e) { mesaj.goster(e.message); }
      return;
    }
    try {
      await mesgulIken(ileri, 'Kaydediliyor…', async () => {
        const alanVarsayilanlari = Object.fromEntries(Object.entries(d.varsayilanlar)
          .map(([op, v]) => [op, Object.fromEntries(Object.entries(v).filter(([, p]) => p).map(([yol, p]) => [yol, { kaynak: 'parametre', deger: p }]))])
          .filter(([op, v]) => d.secilen.has(op) && Object.keys(v).length));
        const secilenler = (kaynak) => Object.fromEntries([...d.secilen].filter((m) => kaynak[m] && Object.keys(kaynak[m]).length).map((m) => [m, kaynak[m]]));
        const r = await api('/platform/servis/kaydet', { govde: {
          projeId: proje.id, anahtar: d.anahtar, ad: d.ad.trim(), yol: d.yol, soapSurumu: d.soapSurumu, tlsDogrulama: d.tls,
          tabanlar: d.tabanlar, secilenOperasyonlar: [...d.secilen], yalnizTestOperasyonlari: [...d.yalnizTest].filter((x) => d.secilen.has(x)),
          alanVarsayilanlari, alanBaglari: secilenler(d.baglar), ekAlanlar: Object.fromEntries([...d.secilen].filter((m) => d.ekAlanlar[m]?.length).map((m) => [m, d.ekAlanlar[m]])),
          alanZorunluluklari: Object.fromEntries([...d.secilen].filter((m) => d.zorunlu[m]).map((m) => [m, [...d.zorunlu[m]]])),
          tarihKurallari: { ...tarihKuraliOnerileri(), ...d.kurallar }, erisimKimligi: d.erisim.erisimKimligi
        } });
        bildir('Servis eklendi.');
        location.hash = `#/servisler/s/${encodeURIComponent(r.id)}`;
      });
    } catch (e) { mesaj.goster(e.message); }
  });

  const ciz = () => {
    yerlestir(adimCubugu, ...adimAdlari().map((a, i) => h('li', { class: i === d.adim ? 'simdiki' : i < d.adim ? 'bitti' : '', 'aria-current': i === d.adim ? 'step' : null }, h('span', { class: 'adim-no' }, String(i + 1)), a)));
    yerlestir(govde, ...(rest() ? [adim1, restAdim2, restAdim3, restAdim4] : [adim1, adim2, adim3, adim4])[d.adim]());
    geri.disabled = d.adim === 0;
    ileri.textContent = d.adim === adimAdlari().length - 1 ? 'Kaydet' : 'İleri';
    durumGuncelle();
  };
  yerlestir(kap, h('div', { class: 'kart form-paneli sihirbaz' }, adimCubugu, mesaj.kutu, govde,
    h('div', { class: 'dugmeler' }, geri, ileri, nedenMetni)));
  ciz();
}

// ---------------------------------------------------------------------------------------------------------------------------
// Postman koleksiyonu (REST) — Servisler > Servis ekle > "Postman koleksiyonu". Akış: dosya(lar) seç → önizleme (klasör = servis,
// istekler, değişkenler; gizli değerler arayüze GELMEZ) → kullanıcı seçer (klasörler, gizli / şifreli kaydet, tablo / akış değeri,
// değerlerin ortamı, taban adres) → "İçe aktar". Hiçbir servise istek atılmaz; onaydan önce veritabanına bir şey yazılmaz.
// ---------------------------------------------------------------------------------------------------------------------------

const KAPSAMLAR = { test: 'TEST', canli: 'CANLI', ikisi: 'TEST + CANLI' };
const KAYNAK_ETIKETI = { koleksiyon: 'koleksiyon', ortam: 'ortam dosyası', istek: 'istekte düz yazılı', tanimsiz: 'tanımsız' };

/**
 * @param {HTMLElement} kap
 * @param {{ id: string; ad: string }} proje
 * @param {Array<{ id: string; ad: string; canli: boolean; varsayilan: boolean }>} ortamlar
 */
export function postmanAktarimi(kap, proje, ortamlar) {
  const koleksiyonDosyasi = h('input', { type: 'file', accept: '.json,application/json' });
  const ortamDosyasi = h('input', { type: 'file', accept: '.json,application/json' });
  const mesaj = mesajKutusu();
  const sonuc = h('div', { 'aria-live': 'polite' });
  /** Dosya metinleri tarayıcıda kalır; yalnız önizleme / aktarım isteğinde sunucuya gider (diske yazılmaz). */
  const dosyalar = { koleksiyon: '', ortam: '' };
  // Her seçimden sonra girdiler sıfırlanır (aynı adlı dosya yeniden seçilince yeniden okunur); seçilen dosyalar saklanır.
  const koleksiyonSecimi = dosyaSecimi(koleksiyonDosyasi, () => onizle());
  const ortamSecimi = dosyaSecimi(ortamDosyasi, () => { if (koleksiyonSecimi.dosyalar().length) onizle(); });
  const oku = async (secim) => {
    const [f] = secim.dosyalar();
    if (!f) return '';
    if (f.size > 15 * 1024 * 1024) throw new Error('Dosya en fazla 15 MB olabilir.');
    return f.text();
  };
  const onizle = async () => {
    mesaj.temizle();
    yerlestir(sonuc);
    try {
      dosyalar.koleksiyon = await oku(koleksiyonSecimi);
      dosyalar.ortam = await oku(ortamSecimi);
      if (!dosyalar.koleksiyon) return;
      const { onizleme } = await api('/platform/servis/postman/onizle', { govde: { projeId: proje.id, koleksiyon: dosyalar.koleksiyon, ...(dosyalar.ortam ? { ortam: dosyalar.ortam } : {}) } });
      if (!onizleme.klasorler.length) { yerlestir(sonuc, h('div', { class: 'not-kutusu uyari', role: 'status' }, 'Koleksiyonda istek yok.')); return; }
      postmanOnizlemesi(sonuc, proje, ortamlar, onizleme, dosyalar);
    } catch (e) { mesaj.goster(e.message); }
  };
  yerlestir(kap, h('div', { class: 'kart form-paneli' }, h('h3', {}, 'Postman koleksiyonu (REST)'), mesaj.kutu,
    h('p', { class: 'soluk kucuk' }, 'Postman\'den "Collection v2.1" (ya da v2.0) olarak dışa aktarılan JSON. Koleksiyonunuz yoksa, yalnız adresiniz varsa "Adım adım" sekmesinde "REST (JSON)" türünü seçin. Dosyalar yalnızca okunur; hiçbir servise istek atılmaz. Her klasör ayrı bir servis, klasördeki istekler o servisin senaryoları olur; klasörsüz istekler koleksiyon adıyla tek serviste toplanır. {{değişken}} değerleri bir test verisi tablosuna gider; gizli değerler yalnız siz onaylarsanız şifreli sütuna yazılır.'),
    alan('Koleksiyon dosyası', koleksiyonDosyasi, { zorunlu: true, icerik: h('div', {}, koleksiyonDosyasi, koleksiyonSecimi.not) }),
    alan('Ortam dosyası (isteğe bağlı)', ortamDosyasi, { icerik: h('div', {}, ortamDosyasi, ortamSecimi.not), yardim: 'Postman environment JSON: {{değişken}} değerleri buradan çözülür (koleksiyon değişkenlerini ezer).' })), sonuc);
}

function postmanOnizlemesi(kap, proje, ortamlar, o, dosyalar) {
  // Kullanıcı seçimleri (varsayılanlar önizlemeden; karar kullanıcının).
  const secili = new Set(o.klasorler.filter((k) => !k.mevcutServis || k.mevcutServis.tur === 'rest').map((k) => k.anahtar));
  const gizli = new Set(o.degiskenler.filter((v) => v.gizli).map((v) => v.ad));
  const sifreli = new Set();
  const akis = new Set(o.degiskenler.filter((v) => v.betikle).map((v) => v.ad));
  const mesaj = mesajKutusu();

  const klasorSatiri = (k) => {
    const soapVar = k.mevcutServis && k.mevcutServis.tur !== 'rest';
    const c = h('input', { type: 'checkbox', checked: secili.has(k.anahtar), disabled: soapVar, 'aria-label': `${k.ad} klasörünü içe al` });
    c.addEventListener('change', () => { if (c.checked) secili.add(k.anahtar); else secili.delete(k.anahtar); etkiBolumu.yenile(); });
    const uyariSayisi = k.istekler.reduce((n, i) => n + i.uyarilar.length, 0);
    return h('tr', {},
      h('td', {}, c),
      h('td', {}, h('b', {}, k.ad), ' ', h('code', { class: 'duz' }, k.anahtar),
        h('details', {}, h('summary', { class: 'kucuk' }, `${k.istekler.length} istek`),
          h('ul', { class: 'onay-listesi' }, k.istekler.map((i) => h('li', {}, rozet(i.metot, 'vurgu'), ' ', i.baslik, ' ',
            h('span', { class: 'soluk kucuk' }, `(${i.operasyon}; ${i.kontrolSayisi} kontrol)`),
            i.uyarilar.length ? h('div', { class: 'soluk kucuk' }, ikon('uyari'), ' ', i.uyarilar.join(' ')) : null))))),
      h('td', {}, k.kokenler.length ? k.kokenler.map((x) => h('div', {}, h('code', { class: 'duz' }, x))) : h('span', { class: 'soluk' }, '—')),
      h('td', {}, soapVar ? rozet('Aynı anahtarlı SOAP servisi var', 'hata')
        : k.mevcutServis ? rozet('Var: senaryolar eklenir', '') : rozet('Yeni servis', 'basari'),
        uyariSayisi ? h('div', {}, rozet(`${uyariSayisi} uyarı`, 'durdu')) : null));
  };

  const degiskenSatiri = (v) => {
    const g = h('input', { type: 'checkbox', checked: gizli.has(v.ad), 'aria-label': `${v.ad} gizli` });
    const s = h('input', { type: 'checkbox', checked: false, disabled: !gizli.has(v.ad) || !v.tanimli || akis.has(v.ad), 'aria-label': `${v.ad} değerini şifreli kaydet` });
    const kaynak = h('select', { 'aria-label': `${v.ad} nereden dolsun` },
      h('option', { value: 'tablo', selected: !akis.has(v.ad) }, 'Tablo sütunu'), h('option', { value: 'akis', selected: akis.has(v.ad) }, 'Akış değeri (${akis:…})'));
    const guncelle = () => {
      s.disabled = !gizli.has(v.ad) || !v.tanimli || akis.has(v.ad);
      if (s.disabled) { s.checked = false; sifreli.delete(v.ad); }
    };
    g.addEventListener('change', () => { if (g.checked) gizli.add(v.ad); else gizli.delete(v.ad); guncelle(); etkiBolumu.yenile(); });
    s.addEventListener('change', () => { if (s.checked) sifreli.add(v.ad); else sifreli.delete(v.ad); etkiBolumu.yenile(); });
    kaynak.addEventListener('change', () => { if (kaynak.value === 'akis') akis.add(v.ad); else akis.delete(v.ad); guncelle(); etkiBolumu.yenile(); });
    return h('tr', {},
      h('td', {}, h('code', { class: 'duz' }, v.ad), v.betikle ? h('div', { class: 'soluk kucuk' }, 'betikle atanıyor') : null),
      h('td', {}, v.gizli ? h('span', { class: 'soluk' }, v.tanimli ? 'gizli (gösterilmez)' : 'değer yok')
        : v.deger ? h('code', { class: 'duz' }, v.deger) : h('span', { class: 'soluk' }, 'değer yok')),
      h('td', {}, KAYNAK_ETIKETI[v.kaynak] || v.kaynak),
      h('td', { class: 'sayi' }, String(v.kullanim)),
      h('td', {}, g), h('td', {}, s), h('td', {}, kaynak));
  };

  const tabloAdi = h('input', { type: 'text', autocomplete: 'off', value: o.varsayilanTabloAdi, maxlength: '60' });
  const degerOrtami = h('select', {}, h('option', { value: '' }, 'Tüm ortamlar'), ortamlar.map((x) => h('option', { value: x.id }, ortamSecenekMetni(x))));
  const kokenler = [...new Set(o.klasorler.flatMap((k) => k.kokenler))];
  const tabanOrtami = h('select', {}, h('option', { value: '' }, 'Hiçbiri (taban adresi sonra verilir)'), ortamlar.map((x) => h('option', { value: x.id }, x.ad)));
  const kapsam = h('select', {}, Object.entries(KAPSAMLAR).map(([k, m]) => h('option', { value: k }, m)));
  const aktar = h('button', { type: 'button', class: 'birincil' }, ikon('yukle'), 'İçe aktar');
  /** Aktarım gövdesi (önizlemedeki seçimler): etki önizlemesi ve İçe aktar aynı gövdeyi gönderir. */
  const govdeYap = () => ({
    projeId: proje.id, koleksiyon: dosyalar.koleksiyon, ...(dosyalar.ortam ? { ortam: dosyalar.ortam } : {}),
    klasorler: [...secili], tabloAdi: tabloAdi.value.trim(), gizliler: [...gizli], sifreliKaydet: [...sifreli], akisDegiskenleri: [...akis],
    degerOrtami: degerOrtami.value || null, tabanOrtami: tabanOrtami.value || null, kapsam: kapsam.value
  });
  // Tabloda değişecek değerler ve etkilenen senaryolar: seçimler değiştikçe sunucuda 'onizle' ile yeniden hesaplanır (yazılmaz).
  const etkiBolumu = aktarimEtkisiBolumu(async (koru) => (!secili.size ? { degisiklikler: [], etkilenenler: [], karsiliklar: [] }
    : (await api('/platform/servis/postman/aktar', { govde: { ...govdeYap(), etki: 'onizle', ...(koru ? { mevcutDegerleriKoru: true } : {}) } })).etki));
  for (const g of [tabloAdi, degerOrtami, tabanOrtami, kapsam]) g.addEventListener(g === tabloAdi ? 'input' : 'change', () => etkiBolumu.yenile());
  // Önleme: değişken tablosu yeni oluşturulacaksa ve başlıkları aynı tablo varsa "onu kullan / yine de yeni oluştur".
  const benzer = benzerTabloNotu(proje, {
    sutunlar: () => o.degiskenler.filter((v) => !akis.has(v.ad)).map((v) => v.ad), ad: () => tabloAdi.value.trim(),
    kullan: (ad) => { tabloAdi.value = ad; etkiBolumu.yenile(); }
  });
  tabloAdi.addEventListener('input', () => benzer.yenile());
  aktar.addEventListener('click', async () => {
    mesaj.temizle();
    if (!secili.size) { mesaj.goster('En az bir klasör seçin.'); return; }
    try {
      // Önizlemede işaretli senaryolarla tek işlemde; arada veri değiştiyse yazılmaz, güncel etki gösterilip yeniden onay istenir.
      const r = await onizlemeyleAktar(aktar, '/platform/servis/postman/aktar', govdeYap(), etkiBolumu,
        { yalniz: 'Yalnız aktar', guncelle: 'Aktar ve seçili senaryoları güncelle' });
      if (!r) return;
      if (guncellemeMetni(r)) bildir(guncellemeMetni(r), r.guncelleme.atlananlar.length ? 'hata' : undefined);
      const eklenen = r.servisler.reduce((n, s) => n + s.eklenen, 0);
      bildir(`${r.servisler.length} servis, ${eklenen} senaryo aktarıldı${r.tablo ? `; değişkenler "${r.tablo.ad}" tablosunda` : ''}.`);
      if (r.tablo && r.tablo.bosBirakilan.length) bildir(`Gizli değeri boş bırakılanlar (tabloda doldurun): ${r.tablo.bosBirakilan.join(', ')}`, 'hata');
      if (r.akisDegerleri.length) bildir(`Akış değerleri (oturum akışı ya da servis akışında okunmalı): ${r.akisDegerleri.join(', ')}`);
      if (r.servisler[0]) location.hash = `#/servisler/s/${encodeURIComponent(r.servisler[0].servisId)}`;
    } catch (e) { mesaj.goster(e.message); }
  });

  yerlestir(kap, h('div', { class: 'kart form-paneli' },
    h('h3', {}, ikon('liste'), ` ${o.koleksiyon} `, rozet(`Postman v${o.surum}`, 'vurgu')), mesaj.kutu,
    o.uyarilar.length ? h('div', { class: 'not-kutusu uyari' }, o.uyarilar.map((u) => h('div', {}, u))) : null,
    h('fieldset', {}, h('legend', {}, `Klasörler → servisler (${o.klasorler.length})`),
      h('div', { class: 'tablo-kaydirma' }, h('table', { class: 'ozet-tablosu', 'aria-label': 'Klasörler' },
        h('thead', {}, h('tr', {}, ['İçe al', 'Klasör (servis anahtarı)', 'Adres', 'Durum'].map((x) => h('th', { scope: 'col' }, x)))),
        h('tbody', {}, o.klasorler.map(klasorSatiri))))),
    h('fieldset', {}, h('legend', {}, `Değişkenler (${o.degiskenler.length})`),
      o.tabanDegiskenleri.length ? h('p', { class: 'soluk kucuk' }, `Adresin başı (ana makine): ${o.tabanDegiskenleri.map((x) => `{{${x}}}`).join(', ')} — tabloya girmez; aşağıdan bir ortamın taban adresi yapılabilir.`) : null,
      o.degiskenler.length ? h('div', { class: 'tablo-kaydirma' }, h('table', { class: 'ozet-tablosu', 'aria-label': 'Değişkenler' },
        h('thead', {}, h('tr', {}, ['Ad', 'Değer', 'Kaynak', 'Kullanım', 'Gizli', 'Şifreli kaydet', 'Nereden dolsun'].map((x) => h('th', { scope: 'col' }, x)))),
        h('tbody', {}, o.degiskenler.map(degiskenSatiri)))) : h('p', { class: 'soluk' }, 'İsteklerde değişken yok.'),
      h('p', { class: 'soluk kucuk' }, '"Gizli" sütun şifreli saklanır ve raporlarda maskelenir. Gizli değer yalnız "Şifreli kaydet" işaretliyse yazılır; değilse boş kalır, koşudan önce tabloda doldurulur. "Akış değeri": değer tabloya değil, oturum akışı ya da servis akışında yanıttan okunan değere (${akis:ad}) bağlanır.')),
    h('div', { class: 'satir-duzen' },
      alan('Değişken tablosu', tabloAdi, { yardim: 'Değişkenler bu test verisi tablosunun sütunları olur (varsa eksik sütunlar eklenir).' }),
      alan('Değerler hangi ortam için', degerOrtami)),
    benzer.kok,
    h('div', { class: 'satir-duzen' },
      kokenler.length ? alan(`Koleksiyondaki adres (${kokenler.join(', ')}) taban adresi olsun`, tabanOrtami, { yardim: 'Seçilen ortamda servislerin taban adresi yapılır (ortamın adres listesine de eklenir).' }) : null,
      alan('Senaryoların kapsamı', kapsam)),
    etkiBolumu.kok,
    h('div', { class: 'dugmeler' }, aktar)));
  etkiBolumu.yenile(0);
  benzer.yenile(0);
}
