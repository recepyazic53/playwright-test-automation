// "Servis ekle > cURL yapıştır" (REST): bir ya da daha çok curl komutu yapıştırılır → önizleme (taban adres, yol, metot, sorgu,
// başlıklar, gövde alanları; gizli değerler maskeli •••; uyarılar) → kullanıcı seçer (hangi istekler, taban adres bağı, hangi gizli
// değerler şifreli kaydedilsin) → "Devam" ile Adım adım > REST sihirbazı bu isteklerle dolu açılır (alan → tablo sütunu bağlama,
// öneriler, özet ve kayıt oradaki akışla). Metin YALNIZ tarayıcıda çözülür (curl-ayristirici.mjs): sunucuya, günlüğe, geçmişe
// gitmez; önizlemede ve kayıtta hiçbir servise istek atılmaz (deneme, İstekler adımındaki "Dene" ile ve onayla olur).
// Gizli değer onaylanmazsa hiç kaydedilmez: tablo sütunu boş açılır, koşudan önce tabloda doldurulur.
import { curlAyristir, curlGizlileri, curlRestTaslagi, MASKE } from './curl-ayristirici.mjs';
import { gizliAdMi } from './gizli-adlar.mjs';
import { ucAdiOner } from './rest-semasi.mjs';
import { yeniUc } from './rest-sihirbazi.js';
import { servisSihirbazi } from './servis-sihirbazi.js';
import { alan, api, h, ikon, mesajKutusu, rozet, yeniKimlik, yerlestir } from './ortak.js';
import { ortamSecenekMetni, riskliOrtamMi } from './kosu-paneli.js';

const temiz = (a) => String(a || '').trim().replace(/\/+$/, '');
const YER_ETIKETI = { baslik: 'Başlık', sorgu: 'Sorgu', govde: 'Gövde' };
const ORNEK = "curl -X POST 'https://example.com/api/v1/giris' \\\n  -H 'Content-Type: application/json' \\\n  -H 'Authorization: Bearer …' \\\n  --data-raw '{\"kullaniciAdi\":\"ornek\"}'";

/** Adres tabanla başlıyor mu (tam eşit ya da taban + "/…"). @param {string} tam @param {string} taban */
const tabanlaBasliyor = (tam, taban) => {
  const t = temiz(taban).toLowerCase();
  const a = tam.toLowerCase();
  return Boolean(t) && (a === t || a.startsWith(`${t}/`));
};

/** Ana makineden servis adı önerisi ("api.example.com" → "Example"). @param {string} koken */
function adOner(koken) {
  let host = '';
  try { host = new URL(koken).hostname; } catch { host = ''; }
  const p = host.split('.').find((x) => x && !/^(?:www|api|rest|ws|gw|gateway|test|dev|staging|uat|preprod|prod|localhost|\d+)$/i.test(x));
  return p ? p.charAt(0).toLocaleUpperCase('tr') + p.slice(1) : 'REST servisi';
}

/**
 * @param {HTMLElement} kap
 * @param {{ id: string; ad: string }} proje
 * @param {Array<{ id: string; ad: string; canli: boolean; varsayilan: boolean; tabanUrl: string; tabanAdresleri?: string[] }>} ortamlar
 */
export function curlAktarimi(kap, proje, ortamlar) {
  const metin = h('textarea', { class: 'kod-alani', rows: 9, spellcheck: 'false', autocomplete: 'off', placeholder: ORNEK });
  const onizle = h('button', { type: 'button', class: 'birincil' }, ikon('goz'), 'Önizle');
  const mesaj = mesajKutusu();
  const sonuc = h('div', { 'aria-live': 'polite' });
  onizle.addEventListener('click', async () => {
    mesaj.temizle();
    yerlestir(sonuc);
    let ekAdlar;
    let tabanAdlari;
    try {
      // Yalnız Nöbetçi'nin kendi sunucusu: kullanıcının maskeli ad listesi ve adlandırılmış taban adresleri (metin gönderilmez).
      const [m, t] = await Promise.all([api('/platform/maskeleme'), api(`/platform/servis-tabanlari?projeId=${encodeURIComponent(proje.id)}`)]);
      ekAdlar = m.ekAdlar || [];
      tabanAdlari = t.tabanAdlari || [];
    } catch (e) { mesaj.goster(e.message); return; }
    let cozum;
    try { cozum = curlAyristir(metin.value, { gizliMi: (ad) => gizliAdMi(ad, ekAdlar) }); } catch (e) { mesaj.goster(e.message); return; }
    curlOnizlemesi(sonuc, { kap, proje, ortamlar, cozum, tabanAdlari });
  });
  yerlestir(kap, h('div', { class: 'kart form-paneli' }, h('h3', {}, 'cURL komutundan (REST)'), mesaj.kutu,
    h('p', { class: 'soluk kucuk' }, 'Bir ya da daha çok curl komutu yapıştırın; her komut servisin bir isteği olur. bash / sh, Windows cmd ve PowerShell\'deki curl.exe biçimleri okunur (tarayıcıdaki "Copy as cURL" dahil). Metin yalnız bu tarayıcıda okunur: hiçbir yere gönderilmez ve hiçbir servise istek atılmaz. Authorization, Cookie, -u ve API anahtarı gibi gizli değerler önizlemede maskeli görünür; yalnız siz onaylarsanız şifreli tablo sütununa yazılır.'),
    alan('cURL komutları', metin, { zorunlu: true, yardim: 'Birden çok komutu alt alta yapıştırabilirsiniz. Dosyadan veri (@dosya) ve -F / --form (multipart) desteklenmez.' }),
    h('div', { class: 'dugmeler' }, onizle)), sonuc);
}

/**
 * @param {HTMLElement} kap
 * @param {{ kap: HTMLElement; proje: { id: string; ad: string }; ortamlar: any[]; cozum: import('./curl-ayristirici.mjs').CurlCozumu;
 *   tabanAdlari: Array<{ ad: string; adresler: Record<string, string> }> }} s
 */
function curlOnizlemesi(kap, s) {
  const { ortamlar, cozum } = s;
  const istekler = cozum.istekler;
  const tam = (i) => `${i.koken}${i.yol}`;
  // Taban adres adayları: adlandırılmış taban adresleri (önce) ve ortamların kayıtlı taban adresleri; en uzun eşleşen seçilir.
  const adaylar = [
    ...s.tabanAdlari.flatMap((t) => Object.entries(t.adresler).filter(([, a]) => a).map(([ortamId, a]) => ({ tur: 'ad', ad: t.ad, ortamId, adres: temiz(a) }))),
    ...ortamlar.flatMap((o) => [...new Set((o.tabanAdresleri && o.tabanAdresleri.length ? o.tabanAdresleri : [o.tabanUrl]).map(temiz))].filter(Boolean)
      .map((a) => ({ tur: 'ortam', ad: '', ortamId: o.id, adres: a })))
  ];
  const riskli = (id) => { const o = ortamlar.find((x) => x.id === id); return o ? riskliOrtamMi(o) : true; };
  const eslesen = adaylar.filter((x) => tabanlaBasliyor(tam(istekler[0]), x.adres))
    .sort((a, b) => b.adres.length - a.adres.length || (a.tur === 'ad' ? -1 : 0) - (b.tur === 'ad' ? -1 : 0) || Number(riskli(a.ortamId)) - Number(riskli(b.ortamId)))[0] || null;
  const testler = ortamlar.filter((o) => !riskliOrtamMi(o));
  const varsayilanOrtam = (testler.find((o) => o.varsayilan) || testler[0] || ortamlar[0])?.id ?? '';
  /** Kullanıcı seçimleri (varsayılanlar önizlemeden; karar kullanıcının). */
  const secim = {
    taban: eslesen ? eslesen.adres : istekler[0].koken,
    ortamId: eslesen ? eslesen.ortamId : varsayilanOrtam,
    grup: eslesen && eslesen.tur === 'ad' ? eslesen.ad : null,
    grupBagla: Boolean(eslesen && eslesen.tur === 'ad'),
    alinacak: new Set(istekler.filter((i) => tabanlaBasliyor(tam(i), eslesen ? eslesen.adres : istekler[0].koken)).map((i) => i.sira)),
    onayli: new Set()
  };
  const mesaj = mesajKutusu();

  // --- Taban adres ---
  const ortamAdi = (id) => ortamlar.find((o) => o.id === id)?.ad ?? '';
  const tabanBolumu = () => {
    const ortamSec = h('select', { 'aria-label': 'Taban adresin ortamı' }, ortamlar.map((o) => h('option', { value: o.id, selected: o.id === secim.ortamId }, ortamSecenekMetni(o))));
    ortamSec.addEventListener('change', () => { secim.ortamId = ortamSec.value; });
    const parcalar = [h('p', {}, 'Taban adres: ', h('code', { class: 'duz' }, secim.taban))];
    if (secim.grup) {
      const bagla = h('input', { type: 'checkbox', id: yeniKimlik('grup'), checked: secim.grupBagla });
      bagla.addEventListener('change', () => { secim.grupBagla = bagla.checked; });
      parcalar.push(h('div', { class: 'not-kutusu basari', role: 'status' }, `Bu adres "${secim.grup}" taban adresiyle eşleşiyor (${ortamAdi(secim.ortamId)}).`),
        h('label', { class: 'secenek', for: bagla.id }, bagla, `"${secim.grup}" taban adresine bağlansın (önerilir: diğer ortamların adresleri de oradan gelir, adres değişince birlikte güncellenir)`));
    } else if (eslesen) {
      parcalar.push(h('div', { class: 'not-kutusu basari', role: 'status' }, `${ortamAdi(secim.ortamId)} ortamının kayıtlı taban adresiyle eşleşiyor; servis bu adrese bağlanır.`));
    } else {
      parcalar.push(h('p', { class: 'soluk kucuk' }, 'Kayıtlı bir taban adresle eşleşmedi: yeni taban adres olur, kaydedilince seçilen ortamın adres listesine eklenir.'),
        alan('Hangi ortamın adresi', ortamSec));
    }
    return h('fieldset', {}, h('legend', {}, 'Taban adres'), ...parcalar);
  };

  // --- İstekler ---
  const degerMetni = (x) => (x.gizli && x.deger ? (/^(Bearer|Basic|Digest|Token)\s+\S/i.exec(x.deger) ? `${x.deger.split(/\s+/)[0]} ${MASKE}` : MASKE) : x.deger);
  const satirlar = (liste) => (liste.length ? h('ul', { class: 'curl-degerleri' }, liste.map((x) => h('li', {}, h('code', { class: 'duz' }, x.ad), ': ',
    h('span', { class: x.gizli ? 'curl-maskeli' : '' }, degerMetni(x) || '—'), x.gizli ? [' ', rozet('gizli', 'durdu')] : null))) : h('span', { class: 'soluk' }, 'yok'));
  const istekKarti = (i) => {
    const uygun = tabanlaBasliyor(tam(i), secim.taban);
    const c = h('input', { type: 'checkbox', id: yeniKimlik('curl'), checked: secim.alinacak.has(i.sira), disabled: !uygun });
    c.addEventListener('change', () => { if (c.checked) secim.alinacak.add(i.sira); else secim.alinacak.delete(i.sira); });
    const yol = tabanlaBasliyor(tam(i), secim.taban) ? tam(i).slice(temiz(secim.taban).length) || '/' : i.yol || '/';
    const govde = i.govdeTuru === 'yok' ? h('span', { class: 'soluk' }, 'yok')
      : i.govdeTuru === 'ham' ? h('pre', { class: 'kod-alani curl-govde' }, i.govdeMaskeli)
        : h('div', {}, h('span', { class: 'soluk kucuk' }, i.govdeTuru === 'json' ? 'JSON alanları' : 'Form alanları'),
          satirlar(i.govdeAlanlari.map((a) => ({ ad: i.govdeTuru === 'json' ? a.yol.replace(/^govde\//, '') : a.ad, deger: a.deger, gizli: a.gizli }))));
    const notlar = [
      i.soap ? h('div', { class: 'not-kutusu uyari', role: 'status' }, ikon('uyari'), ' ', i.uyarilar.find((u) => u.startsWith('SOAP'))) : null,
      i.desteklenmeyenler.length ? h('div', { class: 'not-kutusu hata' }, `Desteklenmiyor (alınmadı): ${i.desteklenmeyenler.join(', ')}`) : null,
      i.taninmayanlar.length ? h('div', { class: 'not-kutusu uyari' }, `Tanınmayan seçenekler (yok sayıldı): ${i.taninmayanlar.join(', ')}`) : null,
      i.yoksayilanlar.length ? h('p', { class: 'soluk kucuk' }, `Yok sayılan seçenekler (Nöbetçi'nin koşusunu etkilemez): ${i.yoksayilanlar.join(', ')}`) : null,
      ...i.uyarilar.filter((u) => !u.startsWith('SOAP')).map((u) => h('p', { class: 'soluk kucuk' }, ikon('uyari'), ' ', u))
    ].filter(Boolean);
    return h('fieldset', { class: 'curl-istegi' },
      h('legend', {}, h('label', { class: 'secenek', for: c.id }, c, `${i.sira}. istek `, rozet(i.metot, 'vurgu'), ' ', ucAdiOner(i.yol) || '/')),
      uygun ? null : h('div', { class: 'not-kutusu uyari', role: 'status' }, `Farklı sunucu (${i.koken}): bu servise alınamaz; ayrı bir servis olarak ekleyin.`),
      h('dl', { class: 'ozet-listesi curl-ozeti' },
        h('dt', {}, 'Metot'), h('dd', {}, i.metot),
        h('dt', {}, 'Taban adres'), h('dd', {}, h('code', { class: 'duz' }, uygun ? temiz(secim.taban) : i.koken)),
        h('dt', {}, 'Yol'), h('dd', {}, h('code', { class: 'duz' }, yol)),
        h('dt', {}, 'Sorgu'), h('dd', {}, satirlar(i.sorgu)),
        h('dt', {}, 'Başlıklar'), h('dd', {}, satirlar(i.basliklar)),
        h('dt', {}, 'İçerik türü'), h('dd', {}, i.icerikTuru || h('span', { class: 'soluk' }, '—')),
        h('dt', {}, 'Gövde'), h('dd', {}, govde)),
      ...notlar);
  };

  // --- Gizli değerler (onay) ---
  const gizliler = istekler.flatMap((i) => curlGizlileri(i).map((g) => ({ ...g, sira: i.sira })));
  const gizliBolumu = () => {
    if (!gizliler.length) return null;
    return h('fieldset', {}, h('legend', {}, `Gizli değerler (${gizliler.length})`),
      h('p', { class: 'soluk kucuk' }, 'Değerler burada gösterilmez. "Şifreli kaydet" işaretlediğiniz değer kasada şifreli bir test verisi sütununa yazılır (başlıklar "<servis> başlıkları", sorgu / gövde alanları "<servis> gizli değerleri" tablosuna); işaretlemediğiniz değer HİÇ kaydedilmez, sütunu boş açılır ve koşudan önce tabloda doldurursunuz.'),
      h('div', { class: 'tablo-kaydirma' }, h('table', { class: 'ozet-tablosu', 'aria-label': 'Gizli değerler' },
        h('thead', {}, h('tr', {}, ['İstek', 'Yer', 'Ad', 'Değer', 'Şifreli kaydet'].map((x) => h('th', { scope: 'col' }, x)))),
        h('tbody', {}, gizliler.map((g) => {
          const anahtar = `${g.sira}|${g.anahtar}`;
          const kaydedilebilir = g.tur === 'baslik' || Boolean(g.alanYolu);
          const c = h('input', { type: 'checkbox', checked: secim.onayli.has(anahtar), disabled: !kaydedilebilir, 'aria-label': `${g.sira}. istek ${g.ad} değerini şifreli kaydet` });
          c.addEventListener('change', () => { if (c.checked) secim.onayli.add(anahtar); else secim.onayli.delete(anahtar); });
          return h('tr', {}, h('td', { class: 'sayi' }, String(g.sira)), h('td', {}, YER_ETIKETI[g.tur]), h('td', {}, h('code', { class: 'duz' }, g.ad)),
            h('td', {}, h('span', { class: 'curl-maskeli' }, degerMetni({ gizli: true, deger: g.deger }))),
            h('td', {}, kaydedilebilir ? c : h('span', { class: 'soluk kucuk' }, 'kaydedilmez (form / ham gövde)')));
        })))));
  };

  const devam = h('button', { type: 'button', class: 'birincil' }, 'Devam: servisi tanımla', ikon('sagCentik'));
  devam.addEventListener('click', () => {
    mesaj.temizle();
    const secilen = istekler.filter((i) => secim.alinacak.has(i.sira) && tabanlaBasliyor(tam(i), secim.taban));
    if (!secilen.length) { mesaj.goster('En az bir istek seçin.'); return; }
    const adlar = new Set();
    /** @type {Record<string, Record<string, string | null>>} */
    const gizliDegerler = {};
    const uclar = secilen.map((i) => {
      const t = curlRestTaslagi(i, { taban: secim.taban, onayli: (a) => secim.onayli.has(`${i.sira}|${a}`) });
      const temel = ucAdiOner(t.yol) || t.metot.toLowerCase();
      let ad = temel;
      for (let n = 2; adlar.has(ad); n++) ad = `${temel}-${n}`;
      adlar.add(ad);
      const u = yeniUc({ ad, adElle: true, metot: t.metot, yol: t.yol, sorgu: t.sorgu, icerikTuru: t.icerikTuru, basliklar: t.basliklar,
        govdeOrnegi: t.govdeOrnegi, gizliAlanlar: t.gizliAlanlar });
      if (Object.keys(t.gizliDegerler).length) gizliDegerler[u.kimlik] = t.gizliDegerler;
      return u;
    });
    const grup = secim.grup && secim.grupBagla ? s.tabanAdlari.find((t) => t.ad === secim.grup) : null;
    const tabanlar = grup ? Object.fromEntries(ortamlar.map((o) => [o.id, grup.adresler[o.id] ? temiz(grup.adresler[o.id]) : ''])) : { [secim.ortamId]: temiz(secim.taban) };
    const onayliSayisi = gizliler.filter((g) => secim.onayli.has(`${g.sira}|${g.anahtar}`) && secilen.some((i) => i.sira === g.sira)).length;
    const toplam = gizliler.filter((g) => secilen.some((i) => i.sira === g.sira)).length;
    servisSihirbazi(s.kap, s.proje, ortamlar, {
      ad: adOner(secilen[0].koken), tabanlar, tabanGrubu: grup ? grup.ad : null, uclar, gizliDegerler,
      gizliOzeti: { onayli: onayliSayisi, onaysiz: toplam - onayliSayisi }
    }).catch((e) => mesaj.goster(e.message));
  });

  yerlestir(kap, h('div', { class: 'kart form-paneli curl-onizleme' },
    h('h3', {}, ikon('liste'), ` ${istekler.length} istek `, rozet(cozum.bicim === 'cmd' ? 'Windows cmd' : cozum.bicim === 'powershell' ? 'PowerShell' : 'bash', 'vurgu')), mesaj.kutu,
    h('p', { class: 'soluk kucuk' }, 'Önizleme: hiçbir şey kaydedilmedi, hiçbir yere istek atılmadı. "Devam" ile adım adım sihirbaz bu isteklerle açılır: servis adını ve adresleri gözden geçirir, alanları test verisi sütunlarına bağlar, özette kaydedersiniz.'),
    tabanBolumu(), ...istekler.map(istekKarti), gizliBolumu(),
    h('div', { class: 'dugmeler' }, devam)));
}
