// "SAYFADA SEÇ" ve "DÜĞMEYİ VE SONUCU İŞARETLE" arayüzü (genel; kod bilmeyen kullanıcı için seçici yazdırmadan öğe seçimi):
//   ogeSecmeKarti        "Sayfada seç" düğmesi + canlı durum + seçilen öğeler listesi (tür değiştir / çıkar). Düğme görünür bir
//                        tarayıcı açar (POST /platform/tarama/baslat { kip: 'ogeSecme' }; "Akışı kaydet"teki gibi). Kullanıcı orada
//                        "Öğe seç" açıkken sayfadaki öğeye tıklar — tıklama sayfaya GİTMEZ; türünü seçer (düğme / sonuç / alan /
//                        başarı göstergesi / hata göstergesi); seçiciyi Nöbetçi üretir. CANLI ortamda tek tip CANLI onayı sorulur.
//   taramaIsaretlemeAdimi  otomatik tarama bitince önizlemeden ÖNCE: (1) keşfin buldukları (görünürlük koşulları, bağımlı listeler;
//                        onay kutularıyla onaylanır), (2) "Düğmeyi ve sonucu işaretle" (ogeSecmeKarti), (3) "Önizlemeye geç"
//                        (POST /platform/tarama/isaretle → paket güncellenir, ardından yüklenen paketle aynı önizleme).
//   sayfadaSecDiyalogu   akış diyagramında "Listede olmayan alanı / düğmeyi elle ekle"nin yanındaki "Sayfada seç": ortam + sayfa
//                        seçilir, seçilenler diyagrama eklenir (CSS seçici alanı "ileri düzey" olarak kalır).
// Kullanıcı verisi DOM'a yalnızca metin olarak yazılır (h()); satır içi stil yok (CSP).
import { alan, api, bildir, h, ikon, mesgulIken, rozet, yerlestir } from './ortak.js';
import { diyalogAc } from './ekran-ortak.js';
import { canliOnayEki, canliOnayIste, onayIste, ortamSecenekMetni } from './kosu-paneli.js';
import { eylemAdaylariKarti, ogeleriBirlestir } from './eylem-adaylari.js';

const YOKLAMA_MS = 1000;
export const OGE_TUR_ADLARI = { dugme: 'Düğme (aksiyon)', sonuc: 'Sonuç (çıktı)', alan: 'Alan', basari: 'Başarı göstergesi', hata: 'Hata göstergesi' };
const TUM_TURLER = ['dugme', 'sonuc', 'alan', 'basari', 'hata'];
const KIRILGANLIK = { dusuk: ['sağlam', 'basari'], orta: ['orta', 'uyari'], yuksek: ['kırılgan', 'hata'] };
const SECICI_TURU = { rol: 'rol ve ad', metin: 'görünen metin', kimlik: 'kimlik', etiket: 'ad / etiket', css: 'CSS yolu' };

/**
 * @typedef {{ tur: string; secici: string; kirilganlik: string; seciciTuru?: string; metin: string | null; cerceve?: string[]; alan?: Record<string, unknown>; alanTuru?: string; adaySeciciler?: string[] }} SecilenOge
 * @typedef {{ ortam: { id: string; ad: string; canli?: boolean; riskli?: boolean | null }; hedef: string; girissiz: boolean; ekranId?: string | null; ekranAdi?: string; baglamProfili?: string | null }} SecimHedefi
 */

/**
 * "Sayfada seç" kartı. hedef(): seçimin ortamı / sayfası (eksikse null — kart hata gösterir). degisti: liste değişince.
 * @param {{ proje: { id: string }; hedef: () => (SecimHedefi | string); turler?: string[]; ogeler?: SecilenOge[]; degisti?: () => void; dugmeMetni?: string }} s
 */
export function ogeSecmeKarti(s) {
  const turler = s.turler && s.turler.length ? s.turler : TUM_TURLER;
  /** @type {SecilenOge[]} */
  let ogeler = [...(s.ogeler || [])];
  let isId = null;
  const durumAlani = h('div', { class: 'oge-secme-durumu', 'aria-live': 'polite' });
  const liste = h('div', { class: 'secilen-ogeler' });
  const baslat = h('button', { type: 'button', class: 'birincil' }, ikon('hedef'), s.dugmeMetni || 'Sayfada seç');
  const kart = h('div', { class: 'oge-secme-karti' }, h('div', { class: 'oge-secme-ust' }, baslat, durumAlani), liste);

  const listeyiCiz = () => {
    yerlestir(liste, ogeler.length ? h('ul', { class: 'secilen-oge-listesi', 'aria-label': 'Seçilen öğeler' }, ogeler.map((o, i) => {
      const tur = h('select', { 'aria-label': `${o.metin || o.secici}: türü` }, turler.map((t) => h('option', { value: t, selected: t === o.tur }, OGE_TUR_ADLARI[t] || t)));
      tur.addEventListener('change', () => {
        o.tur = tur.value;
        // Form alanı olmayan öğe "alan" yapıldıysa türü metin sayılır (etiketi görünen yazısı).
        if (o.tur === 'alan' && !o.alan && !o.alanTuru) o.alanTuru = 'text';
        s.degisti?.();
      });
      const [kMetin, kTur] = KIRILGANLIK[o.kirilganlik] || ['?', ''];
      return h('li', { class: 'secilen-oge' },
        h('div', { class: 'secilen-oge-metni' },
          h('span', { class: 'ad' }, o.metin ? `“${o.metin}”` : '(yazısız öğe)'),
          h('small', { class: 'soluk' }, h('code', { class: 'duz' }, o.secici), ' ', SECICI_TURU[o.seciciTuru] ? `· ${SECICI_TURU[o.seciciTuru]}` : '')),
        rozet(kMetin, kTur, { title: 'Seçicinin sağlamlığı (rol ve kimlik sağlam; CSS yolu kırılgan)' }),
        tur,
        h('button', { type: 'button', class: 'kucuk-dugme hayalet tehlike', 'aria-label': `${o.metin || o.secici}: listeden çıkar`, onclick: () => { ogeler.splice(i, 1); listeyiCiz(); s.degisti?.(); } }, ikon('carpi')));
    })) : h('p', { class: 'soluk kucuk' }, 'Henüz öğe seçilmedi.'));
  };

  const durumCiz = (d) => {
    if (!d) { yerlestir(durumAlani); return; }
    const secim = (d.adimlar || []).find((a) => a.anahtar === 'secim');
    const giris = (d.adimlar || []).find((a) => a.anahtar === 'giris');
    const iptal = h('button', { type: 'button', class: 'kucuk-dugme hayalet tehlike' }, ikon('carpi'), 'İptal');
    iptal.addEventListener('click', async () => {
      try { await mesgulIken(iptal, 'İptal ediliyor…', () => api('/platform/tarama/iptal', { govde: { id: isId } })); } catch (e) { if (e.durum !== 423) bildir(e.message, 'hata'); }
    });
    const mesaj = secim && secim.durum === 'suruyor' && secim.mesaj ? secim.mesaj : giris && giris.durum === 'suruyor' ? 'Giriş yapılıyor…' : 'Tarayıcı hazırlanıyor…';
    yerlestir(durumAlani, h('div', { class: 'not-kutusu bilgi kucuk oge-secme-canli' },
      h('span', { class: 'donen-kucuk', 'aria-hidden': 'true' }),
      h('span', {}, mesaj, (d.ogeler || []).length ? ` (${d.ogeler.length} öğe seçildi)` : ''), iptal));
  };

  baslat.addEventListener('click', async () => {
    const hedef = s.hedef();
    if (typeof hedef === 'string') { bildir(hedef, 'hata'); return; }
    const tamam = await onayIste({
      baslik: 'Sayfa görünür bir tarayıcıda açılsın mı?', ikonAd: 'hedef', dugme: 'Tarayıcıyı aç', tehlikeli: false,
      metin: `“${hedef.ortam.ad}” ortamına bağlanılır${hedef.girissiz ? '' : ' (gerekirse ortamın giriş tarifiyle giriş yapılır)'} ve ${hedef.hedef} sayfası açılır.`,
      liste: [
        '“Öğe seç” açıkken sayfada tıkladığınız öğe seçilir; tıklama sayfaya GİTMEZ: düğmeye basılmaz, form gönderilmez.',
        'Seçtiğiniz öğenin ne olduğunu (düğme, sonuç, alan…) sorulur; seçiciyi Nöbetçi üretir, kod yazmanız gerekmez.',
        '“Öğe seç” kapalıyken sayfayı kullanabilirsiniz: alan doldurup düğmelere basarak ilgili sayfaya gidin (istekler gerçekten gider).',
        'Alanlara girdiğiniz değerler okunmaz; bitince paneldeki “Bitir”e basın.'
      ]
    });
    if (!tamam) return;
    if (!(await canliOnayIste(hedef.ortam, 'Öğe seçme'))) return;
    const govde = {
      kip: 'ogeSecme', projeId: s.proje.id, ortamId: hedef.ortam.id, hedef: hedef.hedef, girissiz: hedef.girissiz, onay: true,
      ...(hedef.ekranId ? { ekranId: hedef.ekranId } : { ekranAdi: hedef.ekranAdi || 'Sayfa' }),
      baglamProfilleri: hedef.baglamProfili ? [hedef.baglamProfili] : [], ogeTurleri: turler, ...canliOnayEki(hedef.ortam.id)
    };
    let r;
    try {
      r = await mesgulIken(baslat, 'Açılıyor…', () => api('/platform/tarama/baslat', { govde }));
    } catch (e) {
      if (e.durum !== 423) yerlestir(durumAlani, h('div', { class: 'not-kutusu hata kucuk', role: 'alert' }, e.message));
      return;
    }
    isId = r.isId;
    baslat.disabled = true;
    const yokla = async () => {
      if (!kart.isConnected) return;
      let d;
      try {
        d = (await api(`/platform/tarama/durum?id=${encodeURIComponent(isId)}`)).is;
      } catch (e) {
        if (e.durum === 423) { setTimeout(yokla, YOKLAMA_MS); return; }
        baslat.disabled = false;
        yerlestir(durumAlani, h('div', { class: 'not-kutusu hata kucuk', role: 'alert' }, e.message));
        return;
      }
      if (d.durum === 'suruyor') { durumCiz(d); setTimeout(yokla, YOKLAMA_MS); return; }
      baslat.disabled = false;
      if (d.durum === 'tamam') {
        const yeni = (d.ogeler || []).filter((o) => !ogeler.some((x) => x.secici === o.secici && x.tur === o.tur && JSON.stringify(x.cerceve || []) === JSON.stringify(o.cerceve || [])));
        ogeler = [...ogeler, ...yeni];
        yerlestir(durumAlani, h('p', { class: 'kucuk basari-metni', role: 'status' }, ikon('onay'), `${yeni.length} öğe eklendi.`));
        listeyiCiz();
        s.degisti?.();
        return;
      }
      yerlestir(durumAlani, h('div', { class: `not-kutusu ${d.durum === 'iptal' ? 'bilgi' : 'hata'} kucuk`, role: 'alert' }, d.hata ? d.hata.mesaj : 'Öğe seçme tamamlanmadı.'));
    };
    yokla();
  });
  listeyiCiz();
  return { kart, ogeler: () => ogeler.map((o) => ({ ...o })) };
}

/**
 * Otomatik tarama bittikten sonra, önizlemeden önce: keşfin buldukları + "Düğmeyi ve sonucu işaretle".
 * @param {HTMLElement} icerik
 * @param {{ proje: { id: string; ad: string }; isId: string; devam: () => Promise<void> }} s
 */
export async function taramaIsaretlemeAdimi(icerik, s) {
  const v = await api(`/platform/tarama/isaretler?id=${encodeURIComponent(s.isId)}`);
  const reddedilen = new Set(v.reddedilenler || []);
  const ekranAdresi = v.ekran.id ? `#/ekranlar/e/${encodeURIComponent(v.ekran.id)}` : null;
  const bulguSatiri = (b) => {
    const k = h('input', { type: 'checkbox', checked: !reddedilen.has(b.anahtar), 'aria-label': `${b.etiket}: ${b.tur === 'gorunurluk' ? 'görünürlük koşulu' : 'bağımlı liste'} modele yazılsın` });
    k.addEventListener('change', () => { if (k.checked) reddedilen.delete(b.anahtar); else reddedilen.add(b.anahtar); ozetCiz(); });
    return h('li', { class: 'kesif-bulgusu' }, h('label', { class: 'onay-satiri' }, k,
      h('span', {}, rozet(b.tur === 'gorunurluk' ? 'koşullu alan' : 'bağımlı liste', b.tur === 'gorunurluk' ? 'vurgu' : 'durdu'), ' ', h('b', {}, b.etiket), ' — ', b.aciklama)));
  };
  // Nöbetçi'nin basmadan bulduğu adaylar (en olası işaretli); seçilen aday "Sayfada seç"le birleşir (aynı türde Sayfada seçilen önce gelir).
  const adaylar = eylemAdaylariKarti(v.eylemAdaylari, { eylemSecimi: v.eylemSecimi, isaretlendi: v.isaretlendi, kosuVar: v.kosuVar, degisti: () => ozetCiz() });
  const tumOgeler = () => ogeleriBirlestir(adaylar.secilenler(), secme.ogeler());
  const secme = ogeSecmeKarti({
    proje: s.proje, ogeler: v.sayfadaSecilenler ?? v.ogeler, degisti: () => ozetCiz(), dugmeMetni: 'Sayfada seç',
    hedef: () => ({ ortam: v.ortam, hedef: v.hedefYol, girissiz: v.girissiz, ekranId: v.ekran.id, ekranAdi: v.ekran.ad, baglamProfili: v.baglamProfili })
  });
  const ozetAlani = h('div', { class: 'isaret-ozeti' });
  const devam = h('button', { type: 'button', class: 'birincil' }, ikon('ok'), 'Önizlemeye geç');
  const hataAlani = h('div', {});
  function ozetCiz() {
    const o = tumOgeler();
    const say = (t) => o.filter((x) => x.tur === t).length;
    yerlestir(ozetAlani, h('ul', { class: 'duz-liste kucuk' },
      h('li', {}, ikon('simsek'), `${say('dugme')} düğme`), h('li', {}, ikon('hedef'), `${say('sonuc')} sonuç, ${say('basari')} başarı, ${say('hata')} hata göstergesi`),
      h('li', {}, ikon('liste'), `${say('alan')} ek alan`),
      v.bulgular.length ? h('li', {}, ikon('onay'), `${v.bulgular.length - reddedilen.size} / ${v.bulgular.length} keşif bulgusu modele yazılacak`) : null),
      v.kosuVar && !o.length
        ? h('p', { class: 'kucuk soluk' }, 'Modelde düğme / sonuç tanımı zaten var; yeni öğe seçmezseniz olduğu gibi korunur.')
        : !say('dugme') || !(say('sonuc') + say('basari'))
          ? h('p', { class: 'kucuk uyari-metni' }, ikon('uyari'), 'Düğme ve sonuç işaretlenmezse test yalnız formu doldurur; sonucu doğrulamaz.') : null);
  }
  devam.addEventListener('click', async () => {
    yerlestir(hataAlani);
    try {
      await mesgulIken(devam, 'Uygulanıyor…', () => api('/platform/tarama/isaretle', { govde: { id: s.isId, ogeler: tumOgeler(), reddedilenler: [...reddedilen], sayfadaSecilenler: secme.ogeler(), eylemSecimi: adaylar.secim() } }));
      await s.devam();
    } catch (e) {
      if (e.durum === 423) return;
      const hatalar = e.govde && Array.isArray(e.govde.hatalar) ? e.govde.hatalar : [];
      yerlestir(hataAlani, h('div', { class: 'not-kutusu hata', role: 'alert' }, h('p', {}, e.message), hatalar.length ? h('ul', {}, hatalar.map((x) => h('li', {}, `${x.yer}: ${x.mesaj}`))) : null));
    }
  });
  const o = v.ozet || {};
  yerlestir(icerik,
    h('div', { class: 'sayfa-basligi' },
      h('div', {},
        h('div', { class: 'kirinti' }, h('span', {}, s.proje.ad), h('span', { 'aria-hidden': 'true' }, '/'), h('a', { href: '#/ekranlar' }, 'Ekranlar'),
          ekranAdresi ? [h('span', { 'aria-hidden': 'true' }, '/'), h('a', { href: ekranAdresi }, v.ekran.ad)] : null,
          h('span', { 'aria-hidden': 'true' }, '/'), h('span', { class: 'simdiki' }, 'Otomatik tarama')),
        h('div', { class: 'baslik-satiri' }, h('h2', { tabindex: '-1' }, `Düğmeyi ve sonucu işaretle: ${v.ekran.ad}`), rozet(v.mod === 'analiz' ? 'tekrar analiz' : 'yeni ekran', v.mod === 'analiz' ? 'durdu' : '')))),
    h('div', { class: 'bilgi-seridi tarama-ozeti' }, ikon('onay'),
      h('span', {}, `Tarama tamamlandı: ${o.alanSayisi ?? '?'} alan, ${o.kosulSayisi ?? 0} görünürlük koşulu, ${o.bagimlilikSayisi ?? 0} bağımlı liste. Son adım: testin basacağı düğmeyi ve kontrol edeceği sonucu sayfada seçin; sonra önizleyip kabul edin.`)),
    h('div', { class: 'form-duzeni isaretleme-duzeni' },
      h('div', { class: 'form-sutunu' },
        h('section', { class: 'kart', 'aria-labelledby': 'isaret-kesif' },
          h('div', { class: 'kart-basligi' }, h('h3', { id: 'isaret-kesif' }, ikon('pusula'), '1. Keşfin buldukları')),
          h('p', { class: 'soluk kucuk' }, 'Tarama açılır listeleri, radyoları ve onay kutularını tek tek denedi (hiçbir düğmeye basmadı, form göndermedi). Bulduğu koşullu alanlar ve bağımlı listeler aşağıda; modele yazılmasını istemediklerinizin işaretini kaldırın.'),
          v.bulgular.length ? h('ul', { class: 'kesif-bulgulari' }, v.bulgular.map(bulguSatiri))
            : h('p', { class: 'bos-liste' }, 'Keşif koşullu alan ya da bağımlı liste bulmadı.')),
        h('section', { class: 'kart', 'aria-labelledby': 'isaret-dugme' },
          h('div', { class: 'kart-basligi' }, h('h3', { id: 'isaret-dugme' }, ikon('hedef'), '2. Düğmeyi ve sonucu işaretle')),
          h('p', { class: 'soluk kucuk' }, 'Tarama düğmelere basmadığı için testin hangi düğmeye basacağını (ör. “Hesapla”) ve hangi sonucu kontrol edeceğini bilmez. “Sayfada seç” ile sayfayı açın, düğmeye ve sonuç yazısına tıklayarak seçin; seçiciyi Nöbetçi üretir.'),
          adaylar.kart, secme.kart)),
      h('aside', { class: 'ozet-sutunu', 'aria-label': 'Devam' },
        h('section', { class: 'kart form-paneli' }, h('h3', {}, 'Özet'), ozetAlani, hataAlani, devam,
          h('p', { class: 'soluk kucuk' }, 'Önizlemede modeli inceleyip kabul edene kadar hiçbir şey kaydedilmez.')))));
  ozetCiz();
  icerik.querySelector('h2')?.focus();
}

/**
 * Akış diyagramında "Sayfada seç": ortam + sayfa seçilir, seçilen öğeler ekle() ile diyagrama verilir.
 * @param {{ proje: { id: string }; ekranId: string; turler: string[]; ekle: (ogeler: SecilenOge[]) => string | null }} s
 */
export async function sayfadaSecDiyalogu(s) {
  let v;
  try {
    v = await api(`/platform/tarama/secenekler?projeId=${encodeURIComponent(s.proje.id)}&ekranId=${encodeURIComponent(s.ekranId)}`);
  } catch (e) {
    if (e.durum !== 423) bildir(e.message, 'hata');
    return;
  }
  if (!v.ortamlar.length) { bildir('Projede ortam yok (Ayarlar > Ortamlar).', 'hata'); return; }
  const ilk = v.ortamlar.find((o) => o.id === (v.son && v.son.ortamId)) || v.ortamlar.find((o) => o.varsayilan) || v.ortamlar.find((o) => !o.canli) || v.ortamlar[0];
  const ortamSecimi = h('select', {}, v.ortamlar.map((o) => h('option', { value: o.id, selected: o.id === ilk.id }, ortamSecenekMetni(o))));
  const hedef = h('input', { type: 'text', value: (v.son && v.son.hedef) || (v.ekran && v.ekran.urlYolu) || '', placeholder: '/satis/odeme/', spellcheck: 'false', autocomplete: 'off' });
  const girissiz = h('input', { type: 'checkbox', id: 'sayfada-sec-girissiz' });
  const ekleDugmesi = h('button', { type: 'button', class: 'birincil', disabled: true }, ikon('artiYalin'), 'Diyagrama ekle');
  const hata = h('p', { class: 'hata-metni kucuk', role: 'alert', hidden: true });
  const secme = ogeSecmeKarti({
    proje: s.proje, turler: s.turler, degisti: () => { ekleDugmesi.disabled = !secme.ogeler().length; },
    hedef: () => {
      const o = v.ortamlar.find((x) => x.id === ortamSecimi.value);
      if (!o) return 'Ortamı seçin.';
      if (!hedef.value.trim()) return 'Açılacak sayfanın yolunu yazın (ör. /satis/odeme/).';
      return { ortam: o, hedef: hedef.value.trim(), girissiz: girissiz.checked, ekranId: s.ekranId };
    }
  });
  const govde = h('div', { class: 'tarama-diyalogu' },
    h('div', { class: 'tarama-ikili' }, alan('Ortam', ortamSecimi), alan('Açılacak sayfa', hedef, { yardim: 'Ortam adresine göre yol.' })),
    h('label', { class: 'onay-satiri', for: 'sayfada-sec-girissiz' }, girissiz, h('span', {}, 'Giriş yapmadan aç')),
    secme.kart, hata,
    h('div', { class: 'diyalog-alt' }, h('span', { class: 'bosluk' }), h('button', { type: 'button', class: 'hayalet', onclick: () => diyalog.close() }, 'Vazgeç'), ekleDugmesi));
  const diyalog = diyalogAc('Sayfada seç', 'Listede olmayan düğmeyi ya da alanı sayfada tıklayarak seçin; seçiciyi Nöbetçi üretir. Seçim sırasında tıklamalar sayfaya gitmez.', govde, 'hedef');
  ekleDugmesi.addEventListener('click', () => {
    const m = s.ekle(secme.ogeler());
    if (m) { hata.textContent = m; hata.hidden = false; return; }
    diyalog.close();
  });
}
