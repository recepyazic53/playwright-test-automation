// SERVİS AKIŞLARI (servis sayfası > "Akışlar" sekmesi). Akışlar proje düzeyindedir; bir akış birden çok servisin kayıtlı
// senaryolarını sırayla koşar. Bir adımın yanıtından okunan değer (ör. token) sonraki adımlarda ${akis:Ad} ile kullanılır.
//   #/servisler/s/<id>/akislar              → bu servisin oturum akışı seçimi + projenin akışları
//   #/servisler/s/<id>/akislar/<akisId|yeni> → akış düzenleyici (adımlar, okumalar, Dene, koşu geçmişi)
// Oturum akışı (tür "oturum"): servise atanır; senaryolardaki ${akis:Token} değeri oturumdan gelir (koşular arasında süresi
// dolana kadar paylaşılır, 401'de yenilenir). Dene yalnız TEST; canlı koşu yalnız kullanıcı onayıyla. Açık token arayüze gelmez.
import { alan, api, bildir, bosDurum, h, ikon, mesajKutusu, mesgulIken, rozet, tarihMetni, yerlestir } from './ortak.js';
import { onayIste } from './kosu-paneli.js';

const q = encodeURIComponent;
const DURUM = { basarili: ['Başarılı', 'basari'], basarisiz: ['Başarısız', 'hata'], hata: ['Hata', 'hata'], atlandi: ['Atlandı', 'durdu'], durduruldu: ['Durduruldu', 'durdu'] };
const KAYNAK = { xml: 'XML (XPath)', json: 'JSON yolu', baslik: 'Yanıt başlığı' };
const GIZLI_AD = /token|pass|parola|şifre|sifre|secret|session|cookie|auth/i;
const durumRozeti = (d) => rozet(DURUM[d]?.[0] ?? d, DURUM[d]?.[1] ?? '');

/**
 * @param {HTMLElement} kap @param {{ id: string }} proje @param {any} s servis @param {any[]} ortamlar @param {string | null} altKimlik
 * @param {() => void} yenile
 */
export async function akislarSekmesi(kap, proje, s, ortamlar, altKimlik, yenile) {
  if (altKimlik) { await akisDuzenleyici(kap, proje, s, ortamlar, altKimlik === 'yeni' ? null : altKimlik); return; }
  const { akislar } = await api(`/platform/servis-akislari?projeId=${q(proje.id)}`);
  const adres = `#/servisler/s/${q(s.id)}/akislar`;

  // --- Bu servisin oturum akışı --------------------------------------------------------------------------------------------
  const oturumlar = akislar.filter((a) => a.tur === 'oturum');
  const sec = h('select', { 'aria-label': 'Oturum akışı' }, h('option', { value: '' }, '— yok —'),
    oturumlar.map((a) => h('option', { value: a.id, selected: s.ayarlar.oturumAkisi === a.id }, a.baslik)));
  const durum = h('span', { class: 'kayit-durumu soluk kucuk', 'aria-live': 'polite' });
  sec.addEventListener('change', async () => {
    durum.textContent = 'Kaydediliyor…';
    try {
      await api('/platform/servis/kaydet', { govde: { projeId: proje.id, id: s.id, anahtar: s.anahtar, ad: s.ad, yol: s.ayarlar.yol, oturumAkisi: sec.value || null } });
      s.ayarlar.oturumAkisi = sec.value || undefined;
      durum.textContent = '✓ Kaydedildi';
    } catch (e) { durum.textContent = `Kaydedilemedi: ${e.message}`; }
  });
  const oturumKarti = h('div', { class: 'kart form-paneli' },
    h('div', { class: 'kart-basligi' }, h('h3', {}, ikon('anahtar'), 'Oturum akışı (token)'), h('span', { class: 'sag' }, durum)),
    h('p', { class: 'soluk kucuk' }, 'Bu servisin senaryolarında ', h('code', {}, '${akis:Token}'), ' gibi bir değer kullanılıyorsa (ör. başlıkta ',
      h('code', {}, 'Authorization: Bearer ${akis:Token}'), ') değer seçilen oturum akışından gelir. Token koşular arasında süresi dolana kadar yeniden kullanılır; sunucu 401 dönerse bir kez yenilenir.'),
    oturumlar.length ? alan('Oturum akışı', sec) : h('p', { class: 'soluk' }, 'Henüz oturum akışı yok. Aşağıdan türü "Oturum" olan bir akış ekleyin (ör. tek adım: Giriş → Token oku).'));

  // --- Projenin akışları ----------------------------------------------------------------------------------------------------
  const satirlar = akislar.map((a) => h('tr', {},
    h('td', {}, h('a', { class: 'satir-baglantisi', href: `${adres}/${q(a.id)}` }, a.baslik),
      a.kullananServisler.length ? h('div', { class: 'soluk kucuk' }, `Oturum: ${a.kullananServisler.map((x) => x.ad).join(', ')}`) : null),
    h('td', {}, a.tur === 'oturum' ? rozet('Oturum', 'vurgu') : rozet('Akış')),
    h('td', {}, String(a.adimSayisi)),
    h('td', {}, a.sonKosu ? h('span', { title: tarihMetni(a.sonKosu.baslangic) }, durumRozeti(a.sonKosu.durum)) : h('span', { class: 'cok-soluk' }, '—')),
    h('td', { class: 'eylem' }, h('a', { class: 'dugme ikon-dugme', href: `${adres}/${q(a.id)}`, title: 'Düzenle', 'aria-label': `Düzenle: ${a.baslik}` }, ikon('duzenle')),
      h('button', { type: 'button', class: 'ikon-dugme hayalet', title: 'Sil', 'aria-label': `Sil: ${a.baslik}`, onclick: async () => {
        if (!(await onayIste({ baslik: `"${a.baslik}" silinsin mi?`, metin: 'Akış silinir; geçmiş koşu kayıtları kalır.', dugme: 'Sil', tehlikeli: true }))) return;
        try { await api('/platform/servis-akisi/sil', { govde: { projeId: proje.id, id: a.id } }); bildir('Akış silindi.'); yenile(); } catch (e) { bildir(e.message, 'hata'); }
      } }, ikon('cop')))));
  yerlestir(kap, oturumKarti,
    h('div', { class: 'kart' },
      h('div', { class: 'kart-basligi' }, h('h3', {}, 'Servis akışları'), h('span', { class: 'sag' }, h('a', { class: 'dugme kucuk-dugme', href: `${adres}/yeni` }, ikon('arti'), 'Yeni akış'))),
      h('p', { class: 'soluk kucuk' }, 'Akış, kayıtlı senaryoları sırayla koşar (başka servislerin senaryoları da olabilir). Bir adımın yanıtından okunan değer sonraki adımlarda ',
        h('code', {}, '${akis:Ad}'), ' ile gövdede, başlıkta ve kontrollerde kullanılır.'),
      akislar.length
        ? h('div', { class: 'tablo-kaydirma' }, h('table', { class: 'veri-tablosu', 'aria-label': 'Servis akışları' },
          h('thead', {}, h('tr', {}, ...['Akış', 'Tür', 'Adım', 'Son koşu', ''].map((x) => h('th', { scope: 'col' }, x)))), h('tbody', {}, satirlar)))
        : bosDurum('Henüz akış yok.', 'Örnek: 1. adım Giriş senaryosu (yanıttan Token okunur), 2. adım Teklif senaryosu (başlıkta Bearer ${akis:Token}).', { ikon: 'katman' })));
}

/** Düzenleyici. @param {HTMLElement} kap @param {{ id: string }} proje @param {any} s @param {any[]} ortamlar @param {string | null} akisId */
async function akisDuzenleyici(kap, proje, s, ortamlar, akisId) {
  const [{ servisler }, kayit] = await Promise.all([
    api(`/platform/servisler?projeId=${q(proje.id)}`),
    akisId ? api(`/platform/servis-akisi?projeId=${q(proje.id)}&id=${q(akisId)}`) : Promise.resolve(null)
  ]);
  /** Servis → senaryolar (gerektikçe alınır). @type {Map<string, any[]>} */
  const senaryolar = new Map();
  const senaryolariAl = async (servisId) => {
    if (!servisId) return [];
    if (!senaryolar.has(servisId)) senaryolar.set(servisId, (await api(`/platform/servis?projeId=${q(proje.id)}&id=${q(servisId)}`)).senaryolar);
    return senaryolar.get(servisId);
  };
  const a = kayit?.akis ?? { baslik: '', tur: 'akis', kapsam: 'test', kosuyaDahil: true, icerik: { adimlar: [{ ad: 'Adım 1', servisId: s.id, senaryoId: '', okumalar: [] }] } };
  /** Düzenleme kopyası. */
  const is = { baslik: a.baslik, tur: a.tur, kapsam: a.kapsam, omur: a.icerik.omurSaniye ?? 3600, yenileme: a.icerik.tokenYenileme ?? 'suresiDolunca', adimlar: JSON.parse(JSON.stringify(a.icerik.adimlar)) };
  for (const x of is.adimlar) await senaryolariAl(x.servisId);
  const adres = `#/servisler/s/${q(s.id)}/akislar`;
  const mesaj = mesajKutusu();
  const adimKap = h('div', { class: 'akis-adimlari' });
  const sonucKap = h('div', { 'aria-live': 'polite' });
  const kosuKap = h('div', {});

  const baslik = h('input', { type: 'text', value: is.baslik, maxlength: '200', autocomplete: 'off', placeholder: 'ör. Giriş → Teklif' });
  baslik.addEventListener('input', () => { is.baslik = baslik.value; });
  const tur = h('select', {}, h('option', { value: 'akis', selected: is.tur === 'akis' }, 'Akış'), h('option', { value: 'oturum', selected: is.tur === 'oturum' }, 'Oturum (servise atanır; token sağlar)'));
  const omur = h('input', { type: 'number', min: '30', max: '86400', step: '1', value: String(is.omur), 'aria-label': 'Oturum ömrü (saniye)' });
  const omurAlani = alan('Token ömrü (sn)', omur, { yardim: 'Oturum değerleri bu süre boyunca yeniden kullanılır; dolunca yeniden alınır.' });
  omur.addEventListener('input', () => { is.omur = Number(omur.value); });
  const yenileme = h('select', {},
    h('option', { value: 'suresiDolunca', selected: is.yenileme === 'suresiDolunca' }, 'Süresi dolunca yeniden al (koşular arasında paylaşılır)'),
    h('option', { value: 'herIstekte', selected: is.yenileme === 'herIstekte' }, 'Her istekte yeniden al'));
  const yenilemeAlani = alan('Token', yenileme, { yardim: 'Sunucu 401 / 403 dönerse token her iki seçenekte de bir kez yenilenir.' });
  const oturumAlanlariniGoster = () => { yenilemeAlani.hidden = is.tur !== 'oturum'; omurAlani.hidden = is.tur !== 'oturum' || is.yenileme === 'herIstekte'; };
  yenileme.addEventListener('change', () => { is.yenileme = yenileme.value; oturumAlanlariniGoster(); });
  tur.addEventListener('change', () => { is.tur = tur.value; oturumAlanlariniGoster(); });
  oturumAlanlariniGoster();
  const kapsam = h('select', {}, [['test', 'TEST'], ['canli', 'CANLI'], ['ikisi', 'TEST + CANLI']].map(([d, m]) => h('option', { value: d, selected: is.kapsam === d }, m)));
  kapsam.addEventListener('change', () => { is.kapsam = kapsam.value; });

  /** Adım n'den önce okunan değer adları. */
  const oncekiOkumalar = (n) => is.adimlar.slice(0, n).flatMap((x) => x.okumalar.map((o) => o.ad)).filter(Boolean);
  function adimlariCiz() {
    yerlestir(adimKap, is.adimlar.map((x, n) => {
      const servisSec = h('select', { 'aria-label': `${n + 1}. adım servisi` }, h('option', { value: '' }, '— servis —'),
        servisler.map((sv) => h('option', { value: sv.id, selected: sv.id === x.servisId }, sv.ad)));
      const senaryoSec = h('select', { 'aria-label': `${n + 1}. adım senaryosu` }, h('option', { value: '' }, '— senaryo —'),
        (senaryolar.get(x.servisId) || []).map((sn) => h('option', { value: sn.id, selected: sn.id === x.senaryoId }, sn.baslik)));
      servisSec.addEventListener('change', async () => { x.servisId = servisSec.value; x.senaryoId = ''; await senaryolariAl(x.servisId); adimlariCiz(); });
      senaryoSec.addEventListener('change', () => { x.senaryoId = senaryoSec.value; });
      const ad = h('input', { type: 'text', value: x.ad, maxlength: '100', 'aria-label': `${n + 1}. adım adı` });
      ad.addEventListener('input', () => { x.ad = ad.value; });
      const devam = h('input', { type: 'checkbox', checked: Boolean(x.hataOlursaDevam), id: `devam-${n}` });
      devam.addEventListener('change', () => { if (devam.checked) x.hataOlursaDevam = true; else delete x.hataOlursaDevam; });
      const okumaSatirlari = x.okumalar.map((o, k) => {
        const oad = h('input', { type: 'text', value: o.ad, maxlength: '60', placeholder: 'Token', 'aria-label': `${n + 1}. adım ${k + 1}. okuma adı` });
        const kaynak = h('select', { 'aria-label': `${n + 1}. adım ${k + 1}. okuma kaynağı` }, Object.entries(KAYNAK).map(([d, m]) => h('option', { value: d, selected: (o.kaynak || 'xml') === d }, m)));
        const yol = h('input', { type: 'text', value: o.yol, maxlength: '300', spellcheck: 'false', class: 'kod-girdisi',
          placeholder: o.kaynak === 'json' ? 'veri.token' : o.kaynak === 'baslik' ? 'x-auth-token' : '//Sonuc/Token', 'aria-label': `${n + 1}. adım ${k + 1}. okuma yolu` });
        const gizli = h('input', { type: 'checkbox', checked: o.gizli ?? GIZLI_AD.test(o.ad), 'aria-label': `${n + 1}. adım ${k + 1}. okuma gizli`, title: 'Gizli: raporlarda maskelenir (token, parola…)' });
        oad.addEventListener('input', () => { o.ad = oad.value.trim(); if (o.gizli === undefined) gizli.checked = GIZLI_AD.test(o.ad); });
        kaynak.addEventListener('change', () => { o.kaynak = kaynak.value; adimlariCiz(); });
        yol.addEventListener('input', () => { o.yol = yol.value; });
        gizli.addEventListener('change', () => { o.gizli = gizli.checked; });
        return h('div', { class: 'okuma-satiri' }, oad, kaynak, yol, h('label', { class: 'secenek' }, gizli, 'gizli'),
          h('button', { type: 'button', class: 'ikon-dugme hayalet', 'aria-label': `${n + 1}. adım ${k + 1}. okumayı sil`, onclick: () => { x.okumalar.splice(k, 1); adimlariCiz(); } }, ikon('carpi')));
      });
      const once = oncekiOkumalar(n);
      const tasi = (yon) => { const [b] = is.adimlar.splice(n, 1); is.adimlar.splice(n + yon, 0, b); adimlariCiz(); };
      return h('section', { class: 'kart akis-adimi', 'aria-label': `${n + 1}. adım` },
        h('div', { class: 'kart-basligi' }, h('span', { class: 'adim-no' }, String(n + 1)), ad,
          h('span', { class: 'sag' },
            h('button', { type: 'button', class: 'ikon-dugme hayalet', disabled: n === 0, 'aria-label': `${n + 1}. adımı yukarı taşı`, onclick: () => tasi(-1) }, '↑'),
            h('button', { type: 'button', class: 'ikon-dugme hayalet', disabled: n === is.adimlar.length - 1, 'aria-label': `${n + 1}. adımı aşağı taşı`, onclick: () => tasi(1) }, '↓'),
            h('button', { type: 'button', class: 'ikon-dugme hayalet', disabled: is.adimlar.length === 1, 'aria-label': `${n + 1}. adımı sil`, onclick: () => { is.adimlar.splice(n, 1); adimlariCiz(); } }, ikon('carpi')))),
        h('div', { class: 'satir-duzen' }, alan('Servis', servisSec), alan('Senaryo', senaryoSec)),
        once.length ? h('p', { class: 'soluk kucuk' }, 'Bu adımda kullanılabilir: ', ...once.map((o) => h('code', { class: 'akis-degeri' }, `\${akis:${o}}`))) : null,
        h('fieldset', {}, h('legend', {}, 'Yanıttan oku'), ...okumaSatirlari,
          h('button', { type: 'button', class: 'kucuk-dugme', onclick: () => { x.okumalar.push({ ad: '', kaynak: 'xml', yol: '' }); adimlariCiz(); } }, ikon('arti'), 'Değer oku')),
        h('label', { class: 'secenek', for: devam.id }, devam, 'Bu adım kalırsa da sonraki adımlara devam et'));
    }), h('button', { type: 'button', class: 'kucuk-dugme', onclick: () => {
      is.adimlar.push({ ad: `Adım ${is.adimlar.length + 1}`, servisId: s.id, senaryoId: '', okumalar: [] }); adimlariCiz();
    } }, ikon('arti'), 'Adım ekle'));
  }

  const icerikAl = () => ({
    adimlar: is.adimlar.map((x) => ({ ...x, okumalar: x.okumalar.filter((o) => o.ad || o.yol) })),
    ...(is.tur === 'oturum' ? { omurSaniye: is.omur, tokenYenileme: is.yenileme } : {})
  });
  const eksik = () => {
    if (!is.baslik.trim()) return 'Başlık boş olamaz.';
    const n = is.adimlar.findIndex((x) => !x.servisId || !x.senaryoId);
    return n >= 0 ? `${n + 1}. adımda servis ve senaryo seçin.` : '';
  };
  const kaydet = h('button', { type: 'button', class: 'birincil' }, 'Kaydet');
  kaydet.addEventListener('click', async () => {
    mesaj.temizle();
    const e = eksik();
    if (e) { mesaj.goster(e); return; }
    try {
      const r = await mesgulIken(kaydet, 'Kaydediliyor…', () => api('/platform/servis-akisi/kaydet', { govde: {
        projeId: proje.id, id: akisId || undefined, baslik: is.baslik.trim(), tur: is.tur, kapsam: is.kapsam, icerik: icerikAl()
      } }));
      bildir('Akış kaydedildi.');
      location.hash = `${adres}/${q(r.id)}`;
    } catch (e2) { mesaj.goster(e2.message); }
  });
  const test = ortamlar.find((o) => !o.canli && o.varsayilan) || ortamlar.find((o) => !o.canli);
  const dene = h('button', { type: 'button', disabled: !test, title: 'Kaydedilmemiş hâliyle TEST ortamında dener' }, ikon('oynat'), 'Dene (TEST)');
  dene.addEventListener('click', async () => {
    mesaj.temizle();
    const e = eksik();
    if (e) { mesaj.goster(e); return; }
    const liste = is.adimlar.map((x, n) => `${n + 1}. ${servisler.find((sv) => sv.id === x.servisId)?.ad ?? '?'} › ${(senaryolar.get(x.servisId) || []).find((sn) => sn.id === x.senaryoId)?.baslik ?? '?'}`);
    if (!(await onayIste({ baslik: 'TEST ortamına istek atılsın mı?', metin: `Akışın adımları sırayla "${test.ad}" ortamında çalıştırılacak.`, liste, dugme: 'Dene', ikonAd: 'ag' }))) return;
    try {
      const { sonuc } = await mesgulIken(dene, 'Deneniyor…', () => api('/platform/servis-akisi/dene', { govde: {
        projeId: proje.id, ortamId: test.id, akisId: akisId || undefined, baslik: is.baslik.trim() || 'Taslak akış', tur: is.tur, icerik: icerikAl()
      } }));
      yerlestir(sonucKap, sonucKarti(sonuc));
      if (akisId) kosulariCiz();
    } catch (e2) { mesaj.goster(e2.message); }
  });

  function sonucKarti(r) {
    return h('div', { class: 'kart akis-sonucu' },
      h('div', { class: 'kart-basligi' }, h('h3', {}, r.baslik), durumRozeti(r.durum), h('span', { class: 'alt' }, `${r.ortam} · ${(r.sureMs / 1000).toFixed(1)} sn`)),
      h('p', { class: 'soluk' }, r.ozet),
      h('ol', { class: 'akis-adim-listesi' }, r.adimlar.map((x) => h('li', { class: x.durum === 'basarili' ? 'basarili' : x.durum === 'atlandi' || x.durum === 'durduruldu' ? 'atlanan' : 'basarisiz' },
        h('span', { class: 'adim-adi' }, `${x.ad} — ${x.servis} › ${x.senaryo}`), durumRozeti(x.durum),
        x.sureMs ? h('span', { class: 'soluk kucuk' }, ` ${x.sureMs} ms`) : null,
        x.neden ? h('div', { class: 'soluk kucuk' }, x.neden) : null,
        x.okunanlar ? h('div', { class: 'kucuk' }, 'Okunan: ', ...Object.entries(x.okunanlar).map(([k, v]) => h('code', { class: 'akis-degeri' }, `${k} = ${v}`))) : null,
        x.kosuId ? h('a', { class: 'kucuk', href: `#/servisler/s/${q(servisler.find((sv) => sv.ad === x.servis)?.id ?? s.id)}/raporlar/${q(x.kosuId)}` }, 'İstek / yanıt') : null))));
  }

  async function kosulariCiz() {
    if (!akisId) return;
    try {
      const { kosular } = await api(`/platform/servis-akisi/kosular?projeId=${q(proje.id)}&akisId=${q(akisId)}&sinir=20`);
      yerlestir(kosuKap, kosular.length ? h('div', { class: 'kart' }, h('h3', {}, 'Son koşular'),
        h('ul', { class: 'akis-kosulari' }, kosular.map((k) => h('li', {}, h('button', { type: 'button', class: 'hayalet', onclick: async () => {
          const { kosu } = await api(`/platform/servis-akisi/kosu?projeId=${q(proje.id)}&id=${q(k.id)}`);
          yerlestir(sonucKap, sonucKarti({ ...kosu.sonuc, baslik: kosu.baslik, durum: kosu.durum, sureMs: kosu.sureMs }));
        } }, durumRozeti(k.durum), ` ${tarihMetni(k.baslangic)} · ${k.tur === 'dene' ? 'Dene' : 'Koşu'}`))))) : null);
    } catch { /* liste yoksa gösterilmez */ }
  }

  adimlariCiz();
  yerlestir(kap, h('div', { class: 'kart form-paneli' },
    h('h3', {}, akisId ? 'Akışı düzenle' : 'Yeni akış'), mesaj.kutu,
    kayit?.hatalar?.length ? h('div', { class: 'not-kutusu uyari', role: 'status' }, h('b', {}, 'Akış şu an koşulamaz: '), kayit.hatalar.join(' ')) : null,
    alan('Başlık', baslik, { zorunlu: true }),
    h('div', { class: 'satir-duzen' }, alan('Tür', tur), alan('Kapsam', kapsam, { yardim: 'Koşuda hangi ortam türünde koşacağı. Dene her zaman TEST\'te.' }), yenilemeAlani, omurAlani),
    adimKap,
    h('div', { class: 'dugmeler' }, kaydet, dene, h('a', { class: 'dugme hayalet', href: adres }, 'Vazgeç'))),
  sonucKap, kosuKap);
  kosulariCiz();
}
