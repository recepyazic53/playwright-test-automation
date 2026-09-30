// BASİT SONUÇLAR (#/basit-sonuclar[/kosu/<id>]; Basit modda Sonuçlar'ın görünümü) — son ekran koşusu üstte ("N başarılı · M
// başarısız"), başarısız testin sade nedeni (beklenen / görülen ya da hata mesajının ilk cümlesi), son ekran görüntüsü ve video,
// ▷ Yeniden (o değişkeni aynı ortamda tek başına çalıştırır; CANLI'da bugünkü onay). Altta önceki koşular (kısa liste; seçilen koşu
// üstte açılır) ve "Tüm ayrıntılar (Gelişmiş Sonuçlar)" / "Rapor al (PDF)". Trend, hata kalıpları, karşılaştırma ve kapsam Gelişmiş
// Sonuçlar'da kalır. Yalnız okuma: veriler Sonuçlar'ın uçlarından (sonuc-deposu.mjs), medya /platform/medya ile (kasa açıkken).
// Kullanıcı verisi DOM'a yalnızca metin olarak yazılır (h(); innerHTML yok).
import { TOKEN, api, bosDurum, h, ikon, iskelet, rozet } from './ortak.js';
import { pdfRaporDugmesi } from './pdf-rapor.js';

/** Önceki koşular listesinde en çok. */
const ONCEKI_EN_COK = 8;
/** Nedeni ve kanıtı okunacak başarısız test sayısı üst sınırı (daha fazlası Gelişmiş Sonuçlar'da). */
const BASARISIZ_EN_COK = 12;

const iki = (n) => String(n).padStart(2, '0');
const hataMetni = (e) => (e && e.message ? e.message : String(e));
const medyaUrl = (id) => `/platform/medya/${encodeURIComponent(id)}?token=${encodeURIComponent(TOKEN)}`;

/** "Bugün 09:12" / "Dün 18:40" / "28.09 09:12". @param {string | null} d */
export function gunSaat(d) {
  const t = new Date(String(d || ''));
  if (Number.isNaN(t.getTime())) return '—';
  const saat = `${iki(t.getHours())}:${iki(t.getMinutes())}`;
  const bugun = new Date();
  const gun = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const fark = Math.round((gun(bugun) - gun(t)) / 86_400_000);
  return fark === 0 ? `Bugün ${saat}` : fark === 1 ? `Dün ${saat}` : `${iki(t.getDate())}.${iki(t.getMonth() + 1)} ${saat}`;
}

/** Süre metni ("14 sn", "1 dk 5 sn"). @param {number} ms */
const sure = (ms) => (ms < 1000 ? `${ms} ms` : ms < 60_000 ? `${Math.round(ms / 1000)} sn` : `${Math.floor(ms / 60_000)} dk ${Math.round((ms % 60_000) / 1000)} sn`);

/**
 * Başarısız testin sade nedeni: beklenen / görülen varsa o; yoksa hata mesajının ilk satırı (kısaltılmış).
 * @param {{ hataMesaji?: string | null; beklenenGorulen?: { beklenen: string; gorulen: string } | null }} d
 */
export function sadeNeden(d) {
  if (d.beklenenGorulen && d.beklenenGorulen.beklenen) {
    return `Beklenen görülmedi: "${d.beklenenGorulen.beklenen}".${d.beklenenGorulen.gorulen ? ` Son görülen: "${d.beklenenGorulen.gorulen}".` : ''}`;
  }
  const ilk = String(d.hataMesaji || '').split(/\r?\n/).map((x) => x.trim()).find(Boolean) || 'Neden kaydedilmemiş.';
  return ilk.length > 240 ? `${ilk.slice(0, 237)}…` : ilk;
}

/**
 * @param {HTMLElement} icerik @param {string[]} parcalar ["kosu", "<id>"] ya da []
 * @param {{ durum: { proje: { id: string; ad: string } }; gelismiseGec: (adres?: string) => void }} baglam
 */
export async function basitSonuclarEkrani(icerik, parcalar, baglam) {
  const proje = baglam.durum.proje;
  const seciliKosu = parcalar[0] === 'kosu' && parcalar[1] ? parcalar[1] : null;
  const baslik = h('div', { class: 'sayfa-basligi' }, h('div', {},
    h('h2', { id: 'bolum-basligi', tabindex: '-1' }, 'Sonuçlar'),
    h('p', { class: 'soluk' }, 'Son koşu üstte: hangi test başarısız oldu, neden ve kanıtı. Ayrıntılar Gelişmiş Sonuçlar\'da.')));
  icerik.replaceChildren(baslik, iskelet('sayfa'));
  let ozet;
  let ortamlar = [];
  try {
    [ozet, { ortamlar }] = await Promise.all([
      api(`/platform/sonuclar/ozet?projeId=${encodeURIComponent(proje.id)}`),
      api(`/platform/ortamlar?projeId=${encodeURIComponent(proje.id)}`)
    ]);
  } catch (e) {
    if (!(e && e.durum === 423)) icerik.replaceChildren(baslik, h('div', { class: 'not-kutusu hata', role: 'alert' }, hataMetni(e)));
    return;
  }
  const gecmis = /** @type {any[]} */ (ozet.kosuGecmisi || []);
  if (!gecmis.length) {
    icerik.replaceChildren(baslik, bosDurum('Henüz sonuç yok', 'Testlerim\'de ▷ ya da "Hepsini çalıştır" ile ilk koşuyu başlatın; sonuç burada görünür.', {
      ikon: 'grafik', eylem: h('a', { class: 'dugme birincil', href: '#/testlerim' }, 'Testlerim\'e git')
    }));
    return;
  }
  const secili = (seciliKosu && gecmis.find((k) => k.id === seciliKosu)) || gecmis[0];
  const kosuAlani = h('section', { class: 'kart basit-son-kosu', 'aria-labelledby': 'basit-kosu-basligi' }, iskelet('liste'));
  const onceki = gecmis.filter((k) => k.id !== secili.id).slice(0, ONCEKI_EN_COK);
  const ortamAdi = (id) => (ortamlar.find((o) => o.id === id) || {}).ad || '';
  icerik.replaceChildren(baslik, kosuAlani,
    onceki.length ? h('section', { class: 'basit-onceki', 'aria-labelledby': 'basit-onceki-basligi' },
      h('h3', { id: 'basit-onceki-basligi' }, secili === gecmis[0] ? 'Önceki koşular' : 'Diğer koşular'),
      h('ul', { class: 'basit-onceki-listesi' }, onceki.map((k) => h('li', {},
        h('a', { href: `#/basit-sonuclar/kosu/${encodeURIComponent(k.id)}` }, gunSaat(k.baslangic)),
        h('span', { class: 'soluk kucuk' }, k.kapsam || 'Genel'),
        sayiRozeti(k))))) : null,
    h('p', { class: 'basit-baglantilar kucuk' },
      h('a', { href: `#/sonuclar/kosu/${encodeURIComponent(secili.id)}` }, 'Tüm ayrıntılar (Gelişmiş Sonuçlar)'),
      h('span', { 'aria-hidden': 'true' }, ' · '),
      pdfRaporDugmesi(proje, {}, 'bag-dugme')));
  try {
    await kosuCiz(kosuAlani, secili.id, { proje, ortamAdi, ortamlar, enYeni: secili === gecmis[0] });
  } catch (e) {
    if (!(e && e.durum === 423)) kosuAlani.replaceChildren(h('div', { class: 'not-kutusu hata', role: 'alert' }, hataMetni(e)));
  }
}

/** "3 başarılı · 1 başarısız" rozeti. @param {{ basarili: number; basarisiz: number; atlanan?: number; durduruldu?: number }} k */
function sayiRozeti(k) {
  const metin = [`${k.basarili} başarılı`, `${k.basarisiz} başarısız`, k.atlanan ? `${k.atlanan} atlandı` : '', k.durduruldu ? `${k.durduruldu} durduruldu` : ''].filter(Boolean).join(' · ');
  return rozet(metin, k.basarisiz ? 'hata' : k.basarili ? 'basari' : '');
}

/**
 * Koşunun sade görünümü: başarısızlar (neden + kanıt + ▷ Yeniden), sonra ekran başına başarılılar.
 * @param {HTMLElement} alan @param {string} kosuId
 * @param {{ proje: { id: string }; ortamAdi: (id: string) => string; ortamlar: any[]; enYeni: boolean }} b
 */
async function kosuCiz(alan, kosuId, b) {
  const { kosu, sonuclar } = await api(`/platform/sonuclar/kosu?id=${encodeURIComponent(kosuId)}`);
  const basarisizlar = sonuclar.filter((x) => x.durum === 'basarisiz');
  const digerleri = sonuclar.filter((x) => x.durum !== 'basarisiz');
  const ortam = kosu.ortamId ? b.ortamAdi(kosu.ortamId) : '';
  const gorunumAlani = h('div', { class: 'basit-kanit', hidden: true });
  alan.replaceChildren(
    h('div', { class: 'basit-kosu-ust' },
      h('h3', { id: 'basit-kosu-basligi' }, [gunSaat(kosu.baslangic), ortam].filter(Boolean).join(' · ')),
      sayiRozeti(kosu),
      kosu.durum === 'calisiyor' ? rozet('Çalışıyor', 'vurgu') : null,
      b.enYeni ? null : h('a', { class: 'kucuk', href: '#/basit-sonuclar' }, 'Son koşuya dön')),
    basarisizlar.length ? h('ul', { class: 'basit-sonuc-listesi', 'aria-label': 'Başarısız testler' },
      basarisizlar.slice(0, BASARISIZ_EN_COK).map((x) => basarisizSatiri(x, { ...b, kosu, gorunumAlani }))) : null,
    basarisizlar.length > BASARISIZ_EN_COK ? h('p', { class: 'soluk kucuk' }, `… ve ${basarisizlar.length - BASARISIZ_EN_COK} başarısız test daha (Tüm ayrıntılar).`) : null,
    gorunumAlani,
    digerleri.length ? h('ul', { class: 'basit-sonuc-listesi', 'aria-label': 'Diğer testler' }, gruplar(digerleri).map(grupSatiri)) : null,
    !sonuclar.length ? h('p', { class: 'soluk' }, 'Bu koşuda sonuç kaydı yok.') : null);
}

/** Başarılı / atlanan sonuçları ekran başına toplar. @param {any[]} liste */
function gruplar(liste) {
  /** @type {Map<string, { urun: string; toplam: number; basarili: number; atlanan: number; durduruldu: number; sureMs: number }>} */
  const m = new Map();
  for (const x of liste) {
    const g = m.get(x.urun) || { urun: x.urun, toplam: 0, basarili: 0, atlanan: 0, durduruldu: 0, sureMs: 0 };
    g.toplam += 1;
    if (x.durum === 'basarili') g.basarili += 1;
    else if (x.durum === 'atlanan') g.atlanan += 1;
    else if (x.durum === 'durduruldu') g.durduruldu += 1;
    g.sureMs += Number(x.sureMs) || 0;
    m.set(x.urun, g);
  }
  return [...m.values()];
}

/** @param {{ urun: string; toplam: number; basarili: number; atlanan: number; durduruldu: number; sureMs: number }} g */
function grupSatiri(g) {
  const hepsi = g.basarili === g.toplam;
  const alt = [hepsi ? (g.toplam > 1 ? 'Hepsi başarılı' : 'Başarılı') : [g.basarili ? `${g.basarili} başarılı` : '', g.atlanan ? `${g.atlanan} atlandı` : '', g.durduruldu ? `${g.durduruldu} durduruldu` : ''].filter(Boolean).join(' · '),
    g.sureMs ? sure(g.sureMs) : ''].filter(Boolean).join(' · ');
  return h('li', { class: 'basit-sonuc' },
    h('div', { class: 'basit-sonuc-bilgi' }, h('b', {}, `${g.urun} · ${g.toplam} değişken`), h('span', { class: 'soluk kucuk' }, alt)),
    rozet(hepsi ? 'Başarılı' : g.atlanan ? 'Atlandı' : 'Durduruldu', hepsi ? 'basari' : g.atlanan ? 'atlanan' : 'durdu'));
}

/**
 * Başarısız test: sade neden (ayrıntı ucu okununca), Son görüntü / Video (varsa) ve ▷ Yeniden.
 * @param {any} x @param {{ proje: { id: string }; ortamlar: any[]; kosu: any; gorunumAlani: HTMLElement }} b
 */
function basarisizSatiri(x, b) {
  const neden = h('span', { class: 'basit-neden kucuk' }, 'Neden okunuyor…');
  const kanit = h('span', { class: 'basit-kanit-dugmeleri' });
  const yeniden = h('button', {
    type: 'button', class: 'kucuk-dugme', disabled: !x.senaryoId, title: x.senaryoId ? 'Bu değişkeni aynı ortamda yeniden çalıştır' : 'Senaryosu bulunamadı',
    'aria-label': `Yeniden: ${x.urun} · ${x.senaryoBaslik}`, onclick: () => { void yenidenCalistir(x, b); }
  }, ikon('oynat'), 'Yeniden');
  const satir = h('li', { class: 'basit-sonuc basarisiz' },
    h('div', { class: 'basit-sonuc-bilgi' }, h('b', {}, `${x.urun} · ${x.senaryoBaslik}`), neden),
    h('div', { class: 'basit-sonuc-eylemleri' }, kanit, yeniden));
  void api(`/platform/sonuclar/sonuc?id=${encodeURIComponent(x.id)}`).then(({ sonuc }) => {
    neden.textContent = sadeNeden(sonuc);
    const medya = /** @type {any[]} */ (sonuc.medya || []).filter((m) => !m.silinme && !m.yedekDisi);
    const goruntu = medya.filter((m) => m.tur === 'ekran_goruntusu').at(-1);
    const video = medya.find((m) => m.tur === 'video');
    const ac = (tur, m) => {
      b.gorunumAlani.hidden = false;
      b.gorunumAlani.replaceChildren(
        h('div', { class: 'basit-kanit-baslik' }, h('span', { class: 'soluk kucuk' }, `${tur === 'video' ? 'Video' : 'Son görüntü'} · ${x.urun} · ${x.senaryoBaslik}`),
          h('button', { type: 'button', class: 'ikon-dugme hayalet', 'aria-label': 'Kanıtı kapat', title: 'Kapat', onclick: () => { b.gorunumAlani.hidden = true; b.gorunumAlani.replaceChildren(); } }, ikon('carpi'))),
        tur === 'video' ? h('video', { controls: true, src: medyaUrl(m.id), class: 'sonuc-videosu' }) : h('img', { src: medyaUrl(m.id), alt: `Son görüntü: ${x.senaryoBaslik}`, class: 'buyuk-gorsel' }));
    };
    kanit.replaceChildren(
      goruntu ? h('button', { type: 'button', class: 'kucuk-dugme', onclick: () => ac('goruntu', goruntu) }, ikon('ekran'), 'Son görüntü') : null,
      video ? h('button', { type: 'button', class: 'kucuk-dugme', onclick: () => ac('video', video) }, ikon('video'), 'Video') : null);
  }).catch((e) => { if (!(e && e.durum === 423)) neden.textContent = sadeNeden({ hataMesaji: null }); });
  return satir;
}

/** ▷ Yeniden: değişkeni koşunun ortamında tek başına çalıştırır (CANLI'da bugünkü onay). @param {any} x @param {{ proje: { id: string }; ortamlar: any[]; kosu: any }} b */
async function yenidenCalistir(x, b) {
  const { canliOnayIste, kosuBaslat, onerilenOrtam } = await import('./kosu-paneli.js');
  const ortam = b.ortamlar.find((o) => o.id === b.kosu.ortamId) || onerilenOrtam(b.ortamlar);
  if (!ortam) return;
  if (!(await canliOnayIste(ortam))) return;
  kosuBaslat({ projeId: b.proje.id, ortam, senaryolar: [{ id: x.senaryoId, baslik: x.senaryoBaslik, ekranAdi: x.urun }], tur: 'tekil', esZamanli: true, baslik: x.senaryoBaslik, tekBasina: true });
}
