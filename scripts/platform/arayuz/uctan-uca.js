// UÇTAN UCA AKIŞLAR (#/akislar) — servis, ekran ve SQL adımlarını tek akışta sırayla koşan akışlar (sunucu: akislar/uctan-uca.mjs).
//   #/akislar            → liste (adım türleri, kapsam, son koşu; Koş…, Düzenle, Sil)
//   #/akislar/<id|yeni>  → tasarım: servis akışı tasarımcısı (servis-akis-diyagrami.js) uçtan uca kipinde (ekran adımı + Koş…)
//   Sonuçlar > "Uçtan uca akışlar" sekmesi (#/sonuclar/uctan-uca[/<koşu>]): uctanUcaSonuclari.
// Koşu penceresi: ortam seçimi → ön denetim (seçilen ortamda eksik adımlar; hiçbir istek atılmaz) ve gereken izinler (toplu liste);
// kapalı izin koşu başlarken standart izin penceresiyle ("İzin ver ve devam et") sorulur; riskli ortamda ayrıca açık onay.
// Kullanıcı verisi DOM'a yalnız metin olarak yazılır (h(); innerHTML yok). Taşınan değerler sunucudan maskeli gelir.
import { TOKEN, alan, api, bildir, bosDurum, h, ikon, iskelet, rozet, tarihMetni, yerlestir } from './ortak.js';
import { onayIste, onerilenOrtam, ortamSecenekMetni, riskliOrtamMi } from './kosu-paneli.js';
import { servisAkisTasarimi } from './servis-akis-diyagrami.js';
import { urunlerPaneli } from './senaryolar.js';

const q = encodeURIComponent;
const ADRES = '#/akislar';
const DURUM = { basarili: ['Başarılı', 'basari'], basarisiz: ['Başarısız', 'hata'], hata: ['Hata', 'hata'], atlandi: ['Atlandı', 'atlanan'], durduruldu: ['Durduruldu', 'durdu'] };
const TUR = { servis: ['Servis', 'ag'], ekran: ['Ekran', 'ekran'], SQL: ['SQL', 'veri'] };
const durumRozeti = (d) => rozet(DURUM[d]?.[0] ?? d, DURUM[d]?.[1] ?? '');
const saniye = (ms) => `${((Number(ms) || 0) / 1000).toFixed(1).replace('.', ',')} sn`;
const hataKutusu = (e) => h('div', { class: 'not-kutusu hata', role: 'alert' }, e?.message || String(e));
const medyaUrl = (id) => `/platform/medya/${q(id)}?token=${q(TOKEN)}`;
/** Adımın türü (kayıttaki tur alanından). */
const adimTuru = (x) => (x.tur === 'sql' ? 'SQL' : x.tur === 'ekran' ? 'ekran' : 'servis');
const turRozeti = (t) => rozet([ikon(TUR[t]?.[1] ?? 'isaret'), TUR[t]?.[0] ?? t], `tur-rozeti tur-${t === 'SQL' ? 'sql' : t}`);

/**
 * @param {HTMLElement} main @param {string[]} parcalar #/akislar sonrası
 * @param {{ durum: { proje: { id: string; ad: string } } }} baglam
 */
export function uctanUcaEkrani(main, parcalar, baglam) {
  const proje = baglam.durum.proje;
  const [kimlik] = parcalar;
  const icerik = h('section', { class: 'icerik-alani sonuc-icerik' }, iskelet('sayfa'));
  const nav = h('nav', { class: 'alt-nav', 'aria-label': 'Ürünler' }, iskelet('liste'));
  yerlestir(main, h('h1', { class: 'gorunmez' }, 'Uçtan uca akışlar'),
    h('div', { class: 'kabuk-duzen' },
      h('aside', { class: 'yan-panel' }, nav,
        h('div', { class: 'yan-not' }, h('b', {}, 'Uçtan uca akış'), h('br', {}),
          'Servis, ekran ve SQL adımları tek akışta sırayla koşar; bir adımda okunan değer sonraki adımlarda ${akis:Ad} ile kullanılır.')),
      icerik));
  urunlerPaneli(nav, proje, { servisId: null }).catch(() => undefined);
  const hata = (e) => { if (e && e.durum === 423) return; yerlestir(icerik, hataKutusu(e)); };
  (async () => {
    const { ortamlar } = await api(`/platform/ortamlar?projeId=${q(proje.id)}`);
    if (!kimlik) { await listeSayfasi(icerik, proje, ortamlar); return; }
    const akisId = kimlik === 'yeni' ? null : decodeURIComponent(kimlik);
    const kap = h('div', {});
    yerlestir(icerik,
      h('div', { class: 'sayfa-basligi' }, h('div', {},
        h('div', { class: 'kirinti' }, h('span', {}, proje.ad), h('span', { 'aria-hidden': 'true' }, '/'), h('a', { href: ADRES }, 'Uçtan uca akışlar'),
          h('span', { 'aria-hidden': 'true' }, '/'), h('span', { class: 'simdiki' }, akisId ? 'Düzenle' : 'Yeni')),
        h('div', { class: 'baslik-satiri' }, h('h2', { tabindex: '-1' }, akisId ? 'Uçtan uca akış' : 'Yeni uçtan uca akış')))),
      kap);
    await servisAkisTasarimi(kap, proje, null, ortamlar, akisId, {
      uctanUca: true, adres: ADRES,
      kosuPenceresi: (g) => kosuPenceresi(proje, ortamlar, g),
      sonucKarti: (r) => uctanUcaSonucKarti(r)
    });
  })().catch(hata);
}

/** Liste sayfası. */
async function listeSayfasi(icerik, proje, ortamlar) {
  const { akislar } = await api(`/platform/uctan-uca/akislar?projeId=${q(proje.id)}`);
  const yenile = () => listeSayfasi(icerik, proje, ortamlar).catch((e) => yerlestir(icerik, hataKutusu(e)));
  const turSayilari = (turler) => Object.entries(turler.reduce((a, t) => ({ ...a, [t]: (a[t] ?? 0) + 1 }), {}))
    .map(([t, n]) => h('span', { class: 'tur-sayisi' }, turRozeti(t), h('span', { class: 'mono kucuk' }, `×${n}`)));
  const satirlar = akislar.map((a) => h('tr', {},
    h('td', {}, h('a', { class: 'satir-baglantisi', href: `${ADRES}/${q(a.id)}` }, a.baslik)),
    h('td', {}, h('span', { class: 'etiketler' }, turSayilari(a.adimTurleri))),
    h('td', {}, rozet(a.kapsam === 'ikisi' ? 'TEST + CANLI' : a.kapsam === 'canli' ? 'CANLI' : 'TEST')),
    h('td', {}, a.sonKosu ? h('span', { class: 'akis-son-kosu', title: tarihMetni(a.sonKosu.baslangic) }, durumRozeti(a.sonKosu.durum),
      h('span', { class: 'soluk kucuk' }, ortamlar.find((o) => o.id === a.sonKosu.ortamId)?.ad ?? '')) : h('span', { class: 'cok-soluk' }, '—')),
    h('td', { class: 'eylem' },
      h('button', { type: 'button', class: 'kucuk-dugme', 'aria-label': `Koş: ${a.baslik}`, onclick: async () => {
        const r = await kosuPenceresi(proje, ortamlar, { akisId: a.id, baslik: a.baslik });
        if (r) { yenile(); location.hash = `#/sonuclar/uctan-uca/${q(r.kosuId)}`; }
      } }, ikon('oynat'), 'Koş…'),
      h('a', { class: 'dugme ikon-dugme', href: `${ADRES}/${q(a.id)}`, title: 'Düzenle', 'aria-label': `Düzenle: ${a.baslik}` }, ikon('duzenle')),
      h('button', { type: 'button', class: 'kucuk-dugme tehlike', 'aria-label': `Sil: ${a.baslik}`, onclick: async () => {
        if (!(await onayIste({ baslik: `"${a.baslik}" silinsin mi?`, metin: 'Akış silinir; geçmiş koşu kayıtları kalır.', dugme: 'Sil', tehlikeli: true }))) return;
        try { await api('/platform/servis-akisi/sil', { govde: { projeId: proje.id, id: a.id } }); bildir('Akış silindi.'); yenile(); } catch (e) { bildir(e.message, 'hata'); }
      } }, ikon('cop'), 'Sil'))));
  yerlestir(icerik,
    h('div', { class: 'sayfa-basligi' }, h('div', {},
      h('div', { class: 'kirinti' }, h('span', {}, proje.ad), h('span', { 'aria-hidden': 'true' }, '/'), h('span', { class: 'simdiki' }, 'Uçtan uca akışlar')),
      h('div', { class: 'baslik-satiri' }, h('h2', { tabindex: '-1' }, 'Uçtan uca akışlar'))),
    h('div', { class: 'eylemler' },
      h('a', { class: 'dugme hayalet', href: '#/sonuclar/uctan-uca' }, ikon('grafik'), 'Sonuçlar'),
      h('a', { class: 'dugme birincil', href: `${ADRES}/yeni` }, ikon('arti'), 'Uçtan uca akış ekle'))),
    h('div', { class: 'kart' },
      h('p', { class: 'soluk' }, 'Bir iş akışını baştan sona sınar: örneğin servisle sipariş oluşturulur, sipariş numarası ekranda aranır ve veritabanında durumu denetlenir. ',
        'Bir adımda okunan değer (servis yanıtı, ekran, sorgu sonucu) sonraki adımlarda ', h('code', {}, '${akis:Ad}'), ' ile kullanılır; gizli değerler raporda maskelenir.'),
      akislar.length
        ? h('div', { class: 'tablo-kaydirma' }, h('table', { class: 'veri-tablosu', 'aria-label': 'Uçtan uca akışlar' },
          h('thead', {}, h('tr', {}, ...['Akış', 'Adımlar', 'Kapsam', 'Son koşu', ''].map((x) => h('th', { scope: 'col' }, x)))), h('tbody', {}, satirlar)))
        : bosDurum('Henüz uçtan uca akış yok.', 'Örnek: 1. adım servis (yanıttan SiparisNo okunur), 2. adım ekran (arama alanı ← ${akis:SiparisNo}), 3. adım SQL (durum denetlenir).',
          { ikon: 'katman', eylem: h('a', { class: 'dugme birincil', href: `${ADRES}/yeni` }, ikon('arti'), 'Uçtan uca akış ekle') })));
}

/**
 * Koşu penceresi: ortam seçimi, ön denetim (eksik adımlar, izinler), riskli ortamda açık onay; "Koş" koşuyu başlatır ve bitene kadar
 * bekler. Sonuç (ya da vazgeçilirse null) döner.
 * @param {{ id: string }} proje @param {any[]} ortamlar @param {{ akisId?: string; icerik?: unknown; baslik?: string; kapsam?: string }} g
 */
export function kosuPenceresi(proje, ortamlar, g) {
  return new Promise((coz) => {
    const taslak = g.icerik !== undefined;
    const secilebilir = taslak ? ortamlar.filter((o) => !riskliOrtamMi(o)) : ortamlar;
    const ilk = onerilenOrtam(secilebilir);
    const ortamSec = h('select', { 'aria-label': 'Ortam' }, secilebilir.map((o) => h('option', { value: o.id, selected: o.id === ilk?.id }, ortamSecenekMetni(o))));
    const denetimKap = h('div', { class: 'uctan-denetim', 'aria-live': 'polite' });
    const onay = h('input', { type: 'checkbox' });
    const onayAlani = h('label', { class: 'secenek uctan-canli-onay', hidden: true }, onay, 'Bu ortam riskli: adımların gerçek işlem oluşturabileceğini biliyorum.');
    const mesaj = h('p', { class: 'alan-hatasi', role: 'alert' });
    const kos = h('button', { type: 'button', class: 'birincil', disabled: true }, ikon('oynat'), taslak ? 'Dene' : 'Koş');
    const vazgec = h('button', { type: 'button', class: 'hayalet' }, 'Vazgeç');
    let denetim = null;
    let sonuc = null;
    let kosuyor = false;
    const dugmeyiGuncelle = () => { kos.disabled = kosuyor || !denetim || !denetim.kosulabilir || (denetim.canliOnayGerekli && !onay.checked); };
    const denetle = async () => {
      denetim = null;
      dugmeyiGuncelle();
      yerlestir(denetimKap, h('p', { class: 'soluk kucuk' }, 'Denetleniyor…'));
      try {
        const y = await api('/platform/uctan-uca/on-denetim', { govde: { projeId: proje.id, ortamId: ortamSec.value, ...(g.akisId ? { akisId: g.akisId } : {}),
          ...(taslak ? { icerik: g.icerik, baslik: g.baslik, kapsam: g.kapsam } : {}) } });
        denetim = y.denetim;
        onayAlani.hidden = !denetim.canliOnayGerekli;
        yerlestir(denetimKap,
          denetim.hatalar.length ? h('div', { class: 'not-kutusu hata', role: 'alert' }, h('b', {}, 'Akışta sorun var:'), h('ul', {}, denetim.hatalar.map((m) => h('li', {}, m)))) : null,
          denetim.uyarilar.length ? h('div', { class: 'not-kutusu uyari uctan-eksik', role: 'alert' },
            h('b', {}, `Bu ortamda koşamayan adım var (${denetim.uyarilar.length}); koşu başlamaz:`), h('ul', {}, denetim.uyarilar.map((m) => h('li', {}, m)))) : null,
          h('div', { class: 'uctan-izinler' }, h('h3', { class: 'ayrinti-basligi' }, 'Gereken izinler'),
            denetim.izinler.length ? h('ul', { class: 'uctan-izin-listesi', 'aria-label': 'Gereken izinler' }, denetim.izinler.map((z) => h('li', { class: z.acik ? 'acik' : 'kapali' },
              ikon(z.acik ? 'onay' : 'kilit'), h('span', {}, z.etiket), h('span', { class: 'soluk kucuk' }, ` · ${z.adimlar.join(', ')}`),
              z.acik ? h('span', { class: 'gorunmez' }, ' (açık)') : rozet('kapalı', 'uyari')))) : h('p', { class: 'soluk kucuk' }, 'İzin gerekmiyor.'),
            denetim.izinler.some((z) => !z.acik) ? h('p', { class: 'soluk kucuk' }, 'Kapalı izinler koşu başlarken tek tek sorulur ("İzin ver ve devam et").') : null),
          denetim.kosulabilir ? h('p', { class: 'kucuk' }, ikon('onay'), ` ${denetim.akis.adimSayisi} adım bu ortamda koşabilir.`) : null);
      } catch (e) {
        yerlestir(denetimKap, hataKutusu(e));
      }
      dugmeyiGuncelle();
    };
    ortamSec.addEventListener('change', () => { onay.checked = false; void denetle(); });
    onay.addEventListener('change', dugmeyiGuncelle);
    const diyalog = h('dialog', { class: 'onay-diyalogu genis-onay uctan-kosu-diyalogu', 'aria-labelledby': 'uctan-kosu-basligi' },
      h('div', { class: 'diyalog-govde' },
        h('h2', { id: 'uctan-kosu-basligi' }, h('span', { class: 'diyalog-ikon', 'aria-hidden': 'true' }, ikon('oynat')), taslak ? 'Uçtan uca akışı dene' : 'Uçtan uca akışı koş'),
        h('p', { class: 'soluk' }, `"${g.baslik || 'Akış'}" adımları seçilen ortamda sırayla koşar: servis istekleri gönderilir, ekran senaryoları tarayıcıda koşar, SQL sorguları çalışır.`,
          taslak ? ' Kaydedilmemiş hâl yalnız TEST ortamında denenir.' : ''),
        secilebilir.length ? alan('Ortam', ortamSec) : h('p', { class: 'not-kutusu uyari' }, 'Uygun ortam yok (Ayarlar > Proje ve ortamlar).'),
        denetimKap, onayAlani, mesaj),
      h('div', { class: 'diyalog-alt' }, vazgec, kos));
    vazgec.addEventListener('click', () => { if (!kosuyor) diyalog.close(); });
    diyalog.addEventListener('cancel', (o) => { if (kosuyor) o.preventDefault(); });
    kos.addEventListener('click', async () => {
      mesaj.textContent = '';
      kosuyor = true;
      dugmeyiGuncelle();
      vazgec.disabled = true;
      const eski = [...kos.childNodes];
      kos.replaceChildren(h('span', { class: 'donen-kucuk', 'aria-hidden': 'true' }), 'Koşuyor…');
      kos.setAttribute('aria-busy', 'true');
      try {
        const y = await api('/platform/uctan-uca/kos', { govde: {
          projeId: proje.id, ortamId: ortamSec.value, ...(g.akisId ? { akisId: g.akisId } : {}),
          ...(taslak ? { icerik: g.icerik, baslik: g.baslik, kapsam: g.kapsam } : {}), ...(denetim?.canliOnayGerekli && onay.checked ? { canliOnay: true } : {})
        } });
        sonuc = y.sonuc;
        bildir(sonuc.durum === 'basarili' ? 'Uçtan uca akış başarılı.' : `Uçtan uca akış: ${sonuc.ozet}`, sonuc.durum === 'basarili' ? 'basari' : 'hata');
        diyalog.close();
      } catch (e) {
        mesaj.textContent = e?.message || String(e);
        kosuyor = false;
        vazgec.disabled = false;
        kos.replaceChildren(...eski);
        kos.removeAttribute('aria-busy');
        dugmeyiGuncelle();
      }
    });
    diyalog.addEventListener('close', () => { diyalog.remove(); coz(sonuc); });
    document.body.append(diyalog);
    diyalog.showModal();
    ortamSec.focus();
    if (secilebilir.length) void denetle();
  });
}

/** SQL adımının sonuç tablosu (sunucudan en çok 20 satır, gizliler maskeli). */
function sqlTablosu(x) {
  return h('details', { class: 'sql-sonucu' },
    h('summary', { class: 'kucuk' }, `Sorgu sonucu: ${x.toplamSatir} satır${x.kesildi ? ' (ilk 20)' : ''}`),
    x.beklenen ? h('p', { class: 'kucuk' }, h('b', {}, 'Beklenen: '), x.beklenen, ' — ', h('b', {}, 'Görülen: '), x.gorulen ?? '') : null,
    x.sutunlar?.length ? h('div', { class: 'tablo-kaydirma' }, h('table', { class: 'veri-tablosu kucuk' },
      h('thead', {}, h('tr', {}, x.sutunlar.map((c) => h('th', { scope: 'col' }, c)))),
      h('tbody', {}, x.satirlar.map((row) => h('tr', {}, row.map((v) => h('td', { class: 'mono' }, v))))))) : null);
}

/**
 * Uçtan uca koşu sonucu kartı: adım adım (tür, durum, süre, neden), ekran adımının son ekran görüntüsü ve ekran sonucu bağlantısı,
 * servis adımının istek / yanıt bağlantısı, SQL sonuç tablosu, okunan ve doldurulan değerler; taşınan değerler özeti (maskeli).
 * @param {any} r koşu sonucu (sunucu: servisAkisiCalistir dönüşü ya da kayıttaki sonuc + baslik / durum / sureMs)
 */
export function uctanUcaSonucKarti(r) {
  const adimlar = Array.isArray(r.adimlar) ? r.adimlar : [];
  const tasinan = Array.isArray(r.tasinanDegerler) ? r.tasinanDegerler : adimlar.flatMap((x) => Object.entries(x.okunanlar ?? {}).map(([ad, deger]) => ({ ad, deger, adim: x.no })));
  const degerler = (o) => Object.entries(o).map(([k, v]) => h('code', { class: 'akis-degeri' }, `${k} = ${v}`));
  return h('section', { class: 'kart akis-sonucu uctan-sonucu', 'aria-label': 'Uçtan uca koşu sonucu' },
    h('div', { class: 'kart-basligi' }, h('h3', {}, r.baslik ?? 'Uçtan uca akış'), durumRozeti(r.durum),
      h('span', { class: 'alt' }, `${r.ortam ?? ''} · ${saniye(r.sureMs)}`)),
    r.ozet ? h('p', { class: 'soluk' }, r.ozet) : null,
    h('ol', { class: 'akis-adim-listesi uctan-adimlari' }, adimlar.map((x) => {
      const tur = adimTuru(x);
      return h('li', { class: x.durum === 'basarili' ? 'basarili' : x.durum === 'atlandi' || x.durum === 'durduruldu' ? 'atlanan' : 'basarisiz' },
        h('div', { class: 'uctan-adim-ust' }, turRozeti(tur), h('span', { class: 'adim-adi' }, x.ad), durumRozeti(x.durum),
          x.sureMs ? h('span', { class: 'soluk kucuk mono' }, saniye(x.sureMs)) : null),
        h('div', { class: 'soluk kucuk' }, tur === 'servis' ? `${x.servis} › ${x.senaryo}` : x.senaryo),
        x.neden ? h('div', { class: 'uctan-neden kucuk' }, x.neden) : null,
        x.ezmeler && Object.keys(x.ezmeler).length ? h('div', { class: 'kucuk' }, 'Doldurulan: ', ...degerler(x.ezmeler)) : null,
        x.okunanlar && Object.keys(x.okunanlar).length ? h('div', { class: 'kucuk' }, 'Okunan: ', ...degerler(x.okunanlar)) : null,
        tur === 'ekran' && x.ekran ? h('div', { class: 'uctan-ekran' },
          x.ekran.ekranGoruntusuId ? h('a', { href: x.ekran.sonucId ? `#/sonuclar/sonuc/${q(x.ekran.sonucId)}` : medyaUrl(x.ekran.ekranGoruntusuId), class: 'uctan-goruntu' },
            h('img', { src: medyaUrl(x.ekran.ekranGoruntusuId), alt: `${x.ad}: ekran görüntüsü`, loading: 'lazy' })) : null,
          x.ekran.sonucId ? h('a', { class: 'kucuk', href: `#/sonuclar/sonuc/${q(x.ekran.sonucId)}` }, 'Ekran sonucu (adım adım görüntüler, video)') : null) : null,
        tur === 'servis' && x.kosuId ? h('a', { class: 'kucuk', href: `#/servisler/sonuclar/senaryo/${q(x.kosuId)}` }, 'İstek / yanıt') : null,
        tur === 'SQL' && x.sql ? sqlTablosu(x.sql) : null);
    })),
    tasinan.length ? h('div', { class: 'uctan-tasinan' }, h('h4', { class: 'ayrinti-basligi' }, 'Taşınan değerler'),
      h('div', { class: 'tablo-kaydirma' }, h('table', { class: 'veri-tablosu kucuk', 'aria-label': 'Taşınan değerler' },
        h('thead', {}, h('tr', {}, ...['Değer', 'Okunduğu adım', 'İçerik'].map((x) => h('th', { scope: 'col' }, x)))),
        h('tbody', {}, tasinan.map((t) => h('tr', {}, h('td', {}, h('code', {}, `\${akis:${t.ad}}`)), h('td', {}, `${t.adim}. adım`), h('td', { class: 'mono' }, String(t.deger)))))))) : null);
}

/**
 * Sonuçlar > "Uçtan uca akışlar" sekmesi: koşu listesi (akış / durum süzgeci) ve koşu ayrıntısı.
 * @param {HTMLElement} icerik @param {{ id: string; ad: string }} proje @param {{ ust: HTMLElement; kosuId: string | null }} s
 */
export async function uctanUcaSonuclari(icerik, proje, s) {
  const baslik = (simdiki, ek = null) => h('div', { class: 'sayfa-basligi' }, h('div', {},
    h('div', { class: 'kirinti' }, h('span', {}, proje.ad), h('span', { 'aria-hidden': 'true' }, '/'), h('a', { href: '#/sonuclar' }, 'Sonuçlar'),
      h('span', { 'aria-hidden': 'true' }, '/'), simdiki),
    h('div', { class: 'baslik-satiri' }, h('h2', { tabindex: '-1' }, 'Uçtan uca akışlar'))), ek);
  if (s.kosuId) {
    const { kosu } = await api(`/platform/uctan-uca/kosu?projeId=${q(proje.id)}&id=${q(s.kosuId)}`);
    yerlestir(icerik, baslik(h('a', { href: '#/sonuclar/uctan-uca' }, 'Uçtan uca akışlar')), s.ust,
      h('p', { class: 'soluk kucuk' }, `${tarihMetni(kosu.baslangic)} · ${kosu.tur === 'dene' ? 'Dene' : 'Koşu'}`),
      uctanUcaSonucKarti({ ...kosu.sonuc, baslik: kosu.baslik, durum: kosu.durum, sureMs: kosu.sureMs }),
      h('a', { class: 'dugme hayalet', href: '#/sonuclar/uctan-uca' }, ikon('geri'), 'Koşu listesi'));
    return;
  }
  const { kosular, akislar } = await api(`/platform/uctan-uca/kosular?projeId=${q(proje.id)}`);
  const akisSec = h('select', {}, h('option', { value: '' }, 'Tüm akışlar'), akislar.map((a) => h('option', { value: a.id }, a.baslik)));
  const durumSec = h('select', {}, h('option', { value: '' }, 'Tüm durumlar'), Object.entries(DURUM).slice(0, 3).map(([d, [m]]) => h('option', { value: d }, m)));
  const tabloKap = h('div', { 'aria-live': 'polite' });
  const ciz = () => {
    const liste = kosular.filter((k) => (!akisSec.value || k.akisId === akisSec.value) && (!durumSec.value || k.durum === durumSec.value));
    yerlestir(tabloKap, liste.length
      ? h('div', { class: 'tablo-kaydirma' }, h('table', { class: 'veri-tablosu', 'aria-label': 'Uçtan uca akış koşuları' },
        h('thead', {}, h('tr', {}, ...['Başlangıç', 'Akış', 'Ortam', 'Tür', 'Durum', 'Süre'].map((x) => h('th', { scope: 'col' }, x)))),
        h('tbody', {}, liste.map((k) => h('tr', {},
          h('td', {}, h('a', { class: 'satir-baglantisi', href: `#/sonuclar/uctan-uca/${q(k.id)}` }, tarihMetni(k.baslangic))),
          h('td', {}, k.akisBaslik), h('td', {}, k.ortam), h('td', {}, k.tur === 'dene' ? 'Dene' : 'Koşu'), h('td', {}, durumRozeti(k.durum)),
          h('td', { class: 'mono' }, saniye(k.sureMs)))))))
      : bosDurum(kosular.length ? 'Süzgece uyan koşu yok.' : 'Henüz uçtan uca akış koşusu yok.', 'Uçtan uca akışlar ekranından bir akışı "Koş…" ile çalıştırın.',
        { ikon: 'katman', eylem: h('a', { class: 'dugme birincil', href: ADRES }, ikon('katman'), 'Uçtan uca akışlar') }));
  };
  akisSec.addEventListener('change', ciz);
  durumSec.addEventListener('change', ciz);
  yerlestir(icerik, baslik(h('span', { class: 'simdiki' }, 'Uçtan uca akışlar'), h('div', { class: 'eylemler' }, h('a', { class: 'dugme hayalet', href: ADRES }, ikon('katman'), 'Akışlar'))),
    s.ust,
    h('section', { class: 'kart uctan-suzgec', 'aria-label': 'Süzgeçler' }, h('div', { class: 'filtre-satiri' }, alan('Akış', akisSec), alan('Durum', durumSec))),
    h('section', { class: 'kart' }, tabloKap));
  ciz();
}
