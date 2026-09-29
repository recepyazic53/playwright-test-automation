// "Servis sonuçları" ekranı (Sonuçlar ekranının servis karşılığı; ekran sonuçlarından AYRIDIR). Solda tüm servisler / tek
// servis / servis akışı süzgeci (son koşunun sağlık noktası); sağda tarih aralığı + ortam süzgeci, özet kartlar, koşu trendi
// (sonuclar.js'teki grafik), sayfalı koşu geçmişi ve hata kalıpları. Koşu ayrıntısı (her senaryo / akış adımı: durum, süre,
// hata) ve senaryo ayrıntısı (istek / yanıt — gizli alanlar maskeli) aynı ekranda açılır.
// TEK YER: Sonuçlar > Servisler (Sonuçlar ekranının içinde, sol paneli Ürünler). Adresler: #/sonuclar/servisler (tümü),
// #/sonuclar/s/<servisId> (servise süzülmüş), #/sonuclar/servisler/a/<akisId>, …/kosu/<s-… | a-…>, …/senaryo/<satırId>,
// …/karsilastir/<A>/<B> (yan yana koşu karşılaştırması: karsilastirma.js). Eski #/servisler/sonuclar[/…] adresleri buraya
// yönlenir (eskiServisSonucAdresi). Servisin kendi "Raporlar" sekmesi yalnız o servisin çalıştırma listesidir.
// Veri: /platform/servis-sonuclari* (yalnız okuma). Kullanıcı verisi DOM'a yalnızca metin olarak yazılır (h(); innerHTML yok).
import { alan, api, bildir, bosDurum, h, ikon, iskelet, kullaniciAyarlari, rozet, tarihMetni, yeniKimlik, yerlestir } from './ortak.js';
import { dagilimCubugu, dogrulananDosyaIndir, dogrulananDosyalar, farkHapi, kalipMetni, kisaTarih, kivilcim, segment, sureMetni, trendKarti } from './sonuclar.js';
import { aralikMetni, araligiSorguyaEkle, kayitliAralik, tarihAraligiSecici } from './tarih-araligi.js';
import { htmlRaporDugmesi } from './html-rapor.js';
import { pdfRaporDugmesi } from './pdf-rapor.js';
import { ortamSecenekMetni } from './kosu-paneli.js';
import { karsilastirDugmesi, karsilastirmaEkrani, karsilastirmaHatasi, kosuSecici } from './karsilastirma.js';

export const TABAN = '#/sonuclar/servisler';
const q = encodeURIComponent;
/** Servise süzülmüş servis sonuçları (Sonuçlar ekranının sol panelinde servis seçili). @param {string} id */
export const servisSonucAdresi = (id) => `#/sonuclar/s/${q(id)}`;
/**
 * Eski adres (#/servisler/sonuclar/…) → yeni (Sonuçlar > Servisler). Geriye uyum: yer imleri ve paylaşılmış bağlantılar çalışır.
 * @param {string[]} parcalar #/servisler/sonuclar sonrası (ham, kodlanmış)
 */
export function eskiServisSonucAdresi(parcalar) {
  const [tur, a, b] = parcalar;
  if (tur === 's' && a) return `#/sonuclar/s/${a}`;
  if ((tur === 'a' || tur === 'kosu' || tur === 'senaryo') && a) return `${TABAN}/${tur}/${a}`;
  if (tur === 'karsilastir' && a && b) return `${TABAN}/karsilastir/${a}/${b}`;
  return TABAN;
}
/** Koşu geçmişinde bir sayfadaki koşu (Ayarlar > Arayüz; kullanıcı kararı). */
let SAYFA_BOYU = 15;
const DURUM = {
  basarili: ['Başarılı', 'basari'], basarisiz: ['Başarısız', 'hata'], hata: ['Hata', 'hata'], atlandi: ['Atlandı', 'atlanan'], durduruldu: ['Durduruldu', 'durdu']
};
const DURUM_SIRASI = { hata: 0, basarisiz: 1, durduruldu: 2, atlandi: 3, basarili: 4 };
const ORTAM_ANAHTARI = 'platform.servisSonucOrtami';
const DENEME_ANAHTARI = 'platform.servisSonucDenemeler';
const oku = (a) => { try { return sessionStorage.getItem(a) || ''; } catch { return ''; } };
const yaz = (a, d) => { try { sessionStorage.setItem(a, d); } catch { /* yok sayılır */ } };
const durumRozeti = (d) => { const [e, s] = DURUM[d] || [d, '']; return rozet(e, s); };
const hataKutusu = (e) => h('div', { class: 'not-kutusu hata', role: 'alert' }, e.message || String(e));
const ayrac = () => h('span', { 'aria-hidden': 'true' }, '/');
/** Kalan = başarısız + hata (istek / kontrol). */
const kalan = (k) => (k.basarisiz || 0) + (k.hata || 0);
const oran = (k) => { const p = (k.basarili || 0) + kalan(k); return p ? Math.round((k.basarili / p) * 100) : null; };
/** Ortak grafik / dağılım biçimi (başarısız = kalan). */
const sayilar = (k) => ({ basarili: k.basarili, basarisiz: kalan(k), atlanan: k.atlanan, durduruldu: k.durduruldu });
const saglikSinifi = (son) => (!son ? '' : kalan(son) ? 'hata' : son.basarili ? 'basari' : 'uyari');
const kosuAdresi = (id) => `${TABAN}/kosu/${q(id)}`;
const kaynakAdresi = (k) => (!k.kaynakId ? TABAN : k.tur === 'akis' ? `${TABAN}/a/${q(k.kaynakId)}` : servisSonucAdresi(k.kaynakId));

/**
 * Sonuçlar > Servisler'in alt görünümleri (Sonuçlar ekranının içeriğine çizilir; sol panel Sonuçlar'ınki):
 * a/<akisId> (akışa süzülmüş), kosu/<id>, senaryo/<satırId>, karsilastir/<A>/<B>. Tanınmayan alt adres false döner.
 * @param {HTMLElement} icerik @param {{ id: string; ad: string }} proje @param {string[]} parcalar #/sonuclar/servisler sonrası
 * @returns {Promise<void> | false}
 */
export function servisSonucAltGorunumu(icerik, proje, parcalar) {
  const [tur, kimlik, ikinci] = parcalar;
  const id = kimlik ? decodeURIComponent(kimlik) : null;
  if (!id) return false;
  if (tur === 'kosu') return kosuAyrintisi(icerik, proje, id);
  if (tur === 'senaryo') return senaryoAyrintisi(icerik, proje, id);
  if (tur === 'a') return servisGenelBakis(icerik, proje, { akisId: id, gomulu: true });
  if (tur === 'karsilastir' && ikinci) {
    return karsilastirmaEkrani(icerik, proje, { tur: 'servis', a: id, b: decodeURIComponent(ikinci) })
      .catch((e) => { if (!(e && e.durum === 423)) karsilastirmaHatasi(icerik, e, TABAN); });
  }
  return false;
}

/** @param {{ id: string }} proje @param {{ servisId?: string; akisId?: string }} secim */
function ozetAl(proje, secim) {
  const sorgu = new URLSearchParams({ projeId: proje.id });
  if (secim.servisId) sorgu.set('servisId', secim.servisId);
  if (secim.akisId) sorgu.set('akisId', secim.akisId);
  if (oku(ORTAM_ANAHTARI)) sorgu.set('ortamId', oku(ORTAM_ANAHTARI));
  if (oku(DENEME_ANAHTARI) === '1') sorgu.set('denemeler', '1');
  araligiSorguyaEkle(sorgu, kayitliAralik());
  return api(`/platform/servis-sonuclari?${sorgu}`);
}

// ---------------------------------------------------------------------------------------
// Genel bakış (tüm servisler / tek servis / tek akış)
// ---------------------------------------------------------------------------------------

/**
 * @param {HTMLElement} icerik
 * @param {{ id: string; ad: string }} proje
 * @param {{ servisId?: string; akisId?: string; ust?: HTMLElement | null; gomulu?: boolean }} secenek
 *   ust: sayfanın üstüne konan öğe (Sonuçlar > Genel sekmeleri); gomulu: Sonuçlar ekranının içinde (kırıntı Sonuçlar'a döner).
 */
export async function servisGenelBakis(icerik, proje, secenek = {}) {
  const ayar = await kullaniciAyarlari().catch(() => ({}));
  if (Number.isInteger(ayar.kosuGecmisiSayfaBoyu)) SAYFA_BOYU = ayar.kosuGecmisiSayfaBoyu;
  let veri = await ozetAl(proje, secenek);
  // Oturumda seçili ortam artık yoksa süzgeç kaldırılır.
  if (oku(ORTAM_ANAHTARI) && !veri.ortamlar.some((o) => o.id === oku(ORTAM_ANAHTARI))) { yaz(ORTAM_ANAHTARI, ''); veri = await ozetAl(proje, secenek); }
  const baslikAlani = h('div', {});
  const govde = h('div', { class: 'servis-sonuc-govdesi' });
  const ortamSec = h('select', { id: yeniKimlik('ss-ortam') },
    h('option', { value: '' }, 'Tüm ortamlar'),
    ...veri.ortamlar.map((o) => h('option', { value: o.id, selected: o.id === oku(ORTAM_ANAHTARI) }, ortamSecenekMetni(o))));
  const deneme = h('input', { type: 'checkbox', id: yeniKimlik('ss-deneme'), checked: oku(DENEME_ANAHTARI) === '1' });
  const yenile = async () => {
    govde.setAttribute('aria-busy', 'true');
    try {
      veri = await ozetAl(proje, secenek);
      ciz();
    } catch (e) {
      if (e && e.durum === 423) return;
      yerlestir(govde, hataKutusu(e));
    } finally { govde.removeAttribute('aria-busy'); }
  };
  ortamSec.addEventListener('change', () => { yaz(ORTAM_ANAHTARI, ortamSec.value); yenile(); });
  deneme.addEventListener('change', () => { yaz(DENEME_ANAHTARI, deneme.checked ? '1' : ''); yenile(); });
  // Süzgeçler yeniden çizilmez (odak ve yazılan tarih korunur); başlık ve gövde veriye göre yenilenir.
  const suzgec = h('section', { class: 'kart servis-sonuc-suzgeci', 'aria-label': 'Süzgeçler' },
    tarihAraligiSecici({ degisti: () => yenile() }),
    h('div', { class: 'filtre-satiri' }, alan('Ortam', ortamSec),
      h('label', { class: 'secenek mini-secenek', for: deneme.id }, deneme, 'Denemeleri (Dene) de say')));
  const ciz = () => {
    const ad = secenek.servisId ? (veri.servisler.find((s) => s.id === secenek.servisId) || {}).ad
      : secenek.akisId ? (veri.akislar.find((a) => a.id === secenek.akisId) || {}).baslik : 'Tüm servisler';
    yerlestir(baslikAlani, sayfaBasligi(veri, proje, secenek, ad || 'Servis'));
    const aralik = kayitliAralik();
    if (!veri.kosular.length) {
      yerlestir(govde, veri.kosuVar
        ? bosDurum('Bu aralıkta koşu yok.', `Seçilen aralık: ${aralikMetni(aralik)}. Aralığı genişletin ya da "Tümü"nü seçin.`, { ikon: 'takvim' })
        : bosDurum('Henüz servis koşusu yok.',
          'Servis sayfasında senaryoları "Koşuyu başlat" ile ya da bir servis akışını koşunca sonuçlar burada görünür. Denemeler (Dene) yukarıdaki kutu işaretlenirse sayılır.',
          { ikon: 'grafik', eylem: h('a', { class: 'dugme birincil', href: secenek.servisId ? `#/servisler/s/${q(secenek.servisId)}/senaryolar` : '#/servisler' }, ikon('ag'), 'Servislere git') }));
      return;
    }
    const genel = !secenek.servisId && !secenek.akisId;
    yerlestir(govde,
      kartlar(veri.kosular),
      trendKarti(veri.kosular.slice().reverse().map((k) => ({ z: k.baslangic, kosuId: k.id, kapsam: k.baslik, ...sayilar(k) })), null, {
        altYazi: `${genel ? 'Servis ve akış koşuları' : 'Bu kaynağın koşuları'} · ${aralikMetni(aralik)}`,
        aciklama: 'Servis ve akış koşularının durum dağılımı; kırmızı dilim başarısız (kontrolü tutmayan ya da hata veren) senaryolardır.',
        grafikEtiketi: 'servis koşusunun', kosuAdresi: (nk) => kosuAdresi(nk.kosuId)
      }),
      kosuGecmisi(veri.kosular, genel),
      kalipBolumu(veri, aralik));
  };
  yerlestir(icerik, baslikAlani, secenek.ust || null, suzgec, govde);
  ciz();
}

function sayfaBasligi(veri, proje, secenek, ad) {
  const [son] = veri.kosular;
  const meta = [];
  if (son) {
    meta.push(h('span', {}, ikon('takvim'), 'Son koşu ', h('b', { class: 'mono' }, kisaTarih(son.baslangic))));
    meta.push(h('span', {}, ikon('saat'), h('span', { class: 'mono' }, sureMetni(son.sureMs))));
  }
  meta.push(h('span', {}, ikon('liste'), `${veri.kosular.length} koşu`));
  if (!secenek.servisId && !secenek.akisId) meta.push(h('span', {}, ikon('ag'), `${veri.servisler.length} servis · ${veri.akislar.length} akış`));
  return h('div', { class: 'sayfa-basligi' },
    h('div', {},
      h('div', { class: 'kirinti' }, h('span', {}, proje.ad), ayrac(),
        h('a', { href: '#/sonuclar' }, 'Sonuçlar'), ayrac(),
        secenek.servisId || secenek.akisId ? [h('a', { href: TABAN }, 'Servisler'), ayrac()] : null,
        h('span', { class: 'simdiki' }, !secenek.servisId && !secenek.akisId ? 'Servisler' : ad)),
      h('div', { class: 'baslik-satiri' },
        h('h2', { tabindex: '-1' }, h('span', { class: 'gorunmez' }, 'Servis sonuçları — '), ad),
        son ? (kalan(son) ? rozet([ikon('uyari'), `${kalan(son)} başarısız`], 'hata') : rozet([ikon('onay'), 'hepsi geçti'], 'basari')) : null),
      h('div', { class: 'meta' }, meta)),
    h('div', { class: 'eylemler' },
      // Dönem raporu (PDF): servis sayfasında kapsam ve seçim dolu gelir.
      secenek.akisId ? null : pdfRaporDugmesi(proje, secenek.servisId ? { kapsam: 'servis', id: secenek.servisId } : { kapsam: 'servis' }),
      secenek.servisId ? h('a', { class: 'dugme hayalet', href: `#/servisler/s/${q(secenek.servisId)}/raporlar` }, ikon('liste'), 'Servisin çalıştırma listesi') : null,
      h('a', {
        class: 'dugme birincil', href: secenek.servisId ? `#/servisler/s/${q(secenek.servisId)}/senaryolar` : '#/servisler',
        title: 'Servis sayfasında onayla başlatılır'
      }, ikon('oynat'), 'Koşuyu başlat')));
}

function kartlar(kosular) {
  const [son, onceki] = kosular;
  const seri = kosular.slice(0, 30).reverse();
  const fark = (a, b, artisIyi, birim = '') => (b === null || b === undefined || a === null
    ? h('span', { class: 'fark notr' }, onceki ? '—' : 'ilk koşu') : farkHapi(a - b, artisIyi ? a > b : a < b, birim));
  const kart = (sinif, etiket, deger, ek, altMetin, farkOgesi, degerler) => h('div', { class: `sonuc-karti ${sinif}` },
    h('span', { class: 'kart-etiket' }, etiket),
    h('div', { class: 'kart-deger' }, h('strong', { class: 'kart-sayi' }, deger), ek ? h('small', {}, ek) : null),
    h('div', { class: 'kart-alt' }, farkOgesi, h('span', {}, altMetin)),
    degerler ? kivilcim(degerler) : null);
  const sureFarki = () => {
    if (!onceki) return h('span', { class: 'fark notr' }, 'ilk koşu');
    const d = son.sureMs - onceki.sureMs;
    if (!d) return h('span', { class: 'fark notr' }, '= 0');
    return h('span', { class: `fark ${d < 0 ? 'iyi' : 'kotu'}` }, `${d > 0 ? '▲' : '▼'} ${sureMetni(Math.abs(d))}`, h('span', { class: 'gorunmez' }, d > 0 ? ' uzadı' : ' kısaldı'));
  };
  const o = oran(son);
  const oo = onceki ? oran(onceki) : null;
  return h('div', {},
    h('div', { class: 'sonuc-kartlari' },
      kart('basarili', 'Başarılı', String(son.basarili), `/ ${son.toplam}`, 'önceki koşuya göre', fark(son.basarili, onceki && onceki.basarili, true), seri.map((k) => k.basarili)),
      kart('basarisiz', 'Başarısız', String(kalan(son)), `/ ${son.toplam}`, `${son.basarisiz} başarısız · ${son.hata} hata`, fark(kalan(son), onceki && kalan(onceki), false), seri.map(kalan)),
      kart('atlanan', 'Atlanan', String(son.atlanan), null, 'önceki koşuya göre', fark(son.atlanan, onceki && onceki.atlanan, false), seri.map((k) => k.atlanan)),
      kart('sure', 'Süre', sureMetni(son.sureMs), null, 'önceki koşuya göre', sureFarki(), null),
      h('div', { class: 'sonuc-karti oran' },
        h('span', { class: 'kart-etiket' }, 'Başarı oranı'),
        h('div', { class: 'kart-deger' }, h('strong', { class: 'kart-sayi' }, o === null ? '—' : `%${o}`)),
        h('div', { class: 'kart-alt' }, o !== null && oo !== null ? fark(o, oo, true, ' puan') : h('span', { class: 'fark notr' }, '—'),
          h('span', {}, oo !== null ? `önceki %${oo}` : 'önceki yok')),
        dagilimCubugu(sayilar(son), '100%'))),
    h('p', { class: 'kart-kaynak' }, 'Son koşu: ', h('span', { class: 'mono' }, kisaTarih(son.baslangic)), ' · ', son.baslik, ' · ', son.ortam,
      son.calistirma === 'dene' ? [' ', rozet('deneme')] : null,
      onceki ? '' : ' · Önceki koşu olmadığı için fark gösterilmiyor.',
      son.tur === 'servis' ? ' · Not: servis koşularında ortama uymayan (atlanan) senaryolar kayda geçmez; atlanan sayısı akış adımlarından gelir.' : ''));
}

function kosuNoktasi(k) {
  const sinif = kalan(k) ? 'hata' : k.durduruldu ? 'durdu' : k.basarili ? 'basari' : 'atlanan';
  return h('span', { class: `nokta ${sinif}`, 'aria-hidden': 'true' });
}

function kosuGecmisi(kosular, genel) {
  const govdeT = h('tbody', {});
  const sayfalama = h('div', { class: 'sayfalama' });
  let sayfa = 0;
  let filtre = 'tumu';
  const sayiHucresi = (v, ek = '') => h('td', { class: `sayi ${v ? ek : 'sifir'}`.trim() }, String(v));
  // Karşılaştırma: iki satır seçilip "Karşılaştır" (karsilastirma.js; servis ↔ servis, akış ↔ akış).
  const secici = kosuSecici('servis');
  const ciz = () => {
    const secilen = filtre === 'tumu' ? kosular : kosular.filter((k) => k.tur === filtre);
    const sayfaSayisi = Math.max(1, Math.ceil(secilen.length / SAYFA_BOYU));
    if (sayfa >= sayfaSayisi) sayfa = sayfaSayisi - 1;
    secici.sifirla();
    govdeT.replaceChildren(...secilen.slice(sayfa * SAYFA_BOYU, (sayfa + 1) * SAYFA_BOYU).map((k) => {
      const o = oran(k);
      return h('tr', {}, secici.hucre(k, k.baslangic, `${kisaTarih(k.baslangic)} ${k.baslik}`, k.tur),
        h('td', {}, h('a', { class: 'kosu-baglantisi', href: kosuAdresi(k.id) }, kosuNoktasi(k), kisaTarih(k.baslangic)),
          h('span', { class: 'gorunmez' }, kalan(k) ? ` (${kalan(k)} başarısız)` : ' (hepsi geçti)')),
        h('td', { class: 'servis-sonuc-kaynak' }, h('span', { class: 'etiketler' }, rozet(k.tur === 'akis' ? 'akış' : 'servis', k.tur === 'akis' ? 'vurgu' : ''),
          k.calistirma === 'dene' ? rozet('deneme') : null), ' ', h('a', { href: kaynakAdresi(k), title: k.baslik }, k.baslik)),
        h('td', {}, k.ortam),
        h('td', {}, dagilimCubugu(sayilar(k))),
        h('td', { class: 'sayi' }, String(k.toplam)), sayiHucresi(k.basarili, 'basarili-renk'),
        sayiHucresi(kalan(k), 'basarisiz-renk'), sayiHucresi(k.atlanan),
        h('td', { class: 'sayi oran' }, o === null ? '—' : `%${o}`), h('td', { class: 'sayi' }, sureMetni(k.sureMs)));
    }));
    sayfalama.replaceChildren(
      h('span', {}, `Sayfa ${sayfa + 1} / ${sayfaSayisi} · ${secilen.length} koşu`),
      h('span', { class: 'sag' },
        h('button', { type: 'button', class: 'kucuk-dugme', disabled: sayfa === 0, onclick: () => { sayfa--; ciz(); } }, '‹ Önceki'),
        h('button', { type: 'button', class: 'kucuk-dugme', disabled: sayfa + 1 >= sayfaSayisi, onclick: () => { sayfa++; ciz(); } }, 'Sonraki ›')));
  };
  ciz();
  const filtreSegmenti = genel ? segment([['tumu', 'Tümü'], ['servis', 'Servis'], ['akis', 'Akış']], filtre, (d) => { filtre = d; sayfa = 0; ciz(); }, 'Koşu türü') : null;
  return h('section', { class: 'kart', 'aria-labelledby': 'ss-gecmis-basligi' },
    h('div', { class: 'kart-basligi' }, h('h3', { id: 'ss-gecmis-basligi' }, ikon('liste'), 'Koşu geçmişi'),
      h('span', { class: 'alt' }, 'Bir koşuya tıklayınca senaryo / adım sonuçları açılır'),
      h('div', { class: 'sag' }, filtreSegmenti, kosular.length > 1 ? secici.dugme : null)),
    h('div', { class: 'tablo-kaydirma' }, h('table', { class: 'ozet-tablosu gecmis-tablosu' },
      h('caption', { class: 'gorunmez' }, 'Servis koşu geçmişi'),
      h('thead', {}, h('tr', {}, secici.baslik(), ...[['Koşu'], ['Servis / akış'], ['Ortam'], ['Dağılım'], ['Top.', 1], ['Başarılı', 1], ['Başarısız', 1], ['Atlanan', 1], ['Oran', 1], ['Süre', 1]]
        .map(([b, sag]) => h('th', { scope: 'col', class: sag ? 'sayi' : null }, b)))),
      govdeT)),
    sayfalama);
}

function kalipBolumu(veri, aralik) {
  const liste = veri.kaliplar.map((k, i) => {
    const testler = h('div', { class: 'kalip-testleri', hidden: true, id: `ss-kalip-${i}` });
    const ac = h('button', { type: 'button', class: 'kucuk-dugme hayalet', 'aria-expanded': 'false', 'aria-controls': testler.id }, ikon('liste'), `Senaryolar (${k.ornekler.length})`);
    ac.addEventListener('click', () => {
      const acik = testler.hidden;
      testler.hidden = !acik;
      ac.setAttribute('aria-expanded', String(acik));
      if (acik && !testler.childElementCount) {
        yerlestir(testler, h('ul', { class: 'kalip-test-listesi', 'aria-label': 'Hatanın görüldüğü senaryolar' }, k.ornekler.map((x) => h('li', {},
          h('span', { class: 'kalip-test-adi' }, h('b', { title: x.baslik }, x.baslik), h('small', {}, `${x.kaynak} · ${kisaTarih(x.zaman)}`)),
          h('span', { class: 'kalip-test-eylemleri' },
            h('a', { class: 'dugme kucuk-dugme hayalet', href: `${TABAN}/senaryo/${q(x.id)}`, 'aria-label': `Ayrıntı: ${x.baslik}` }, 'Ayrıntı'),
            h('a', { class: 'dugme kucuk-dugme hayalet', href: kosuAdresi(x.kosuId), 'aria-label': `Koşu: ${x.baslik}` }, 'Koşu'))))));
      }
    });
    return h('div', { class: 'kalip-satiri k-diger', role: 'listitem' },
      h('span', { class: 'kalip-ikon', 'aria-hidden': 'true' }, ikon('uyari')),
      h('div', { class: 'kalip-baslik' }, rozet(`${k.senaryoSayisi} senaryo`), ...k.kaynaklar.slice(0, 3).map((a) => rozet(a, 'vurgu', { kisalt: true, title: a })),
        k.kaynaklar.length > 3 ? rozet(`+${k.kaynaklar.length - 3}`) : null,
        h('span', { class: 'cok-soluk' }, `ilk ${kisaTarih(k.ilk)} · son ${kisaTarih(k.son)}`)),
      h('div', { class: 'kalip-sayi' }, h('span', {}, String(k.sayi), h('small', {}, ' adet')), ac),
      kalipMetni(k.kalip), testler);
  });
  return h('section', { class: 'kart', 'aria-labelledby': 'ss-kalip-basligi' },
    h('div', { class: 'kart-basligi' }, h('h3', { id: 'ss-kalip-basligi' }, ikon('uyari'), 'Hata kalıpları'),
      h('span', { class: 'alt' }, `${aralikMetni(aralik)} · aynı hata metni kaç senaryoda görüldü; değişken sayılar # olur`)),
    liste.length ? h('div', { class: 'kalip-listesi', role: 'list', 'aria-label': 'Hata kalıpları' }, liste) : h('p', { class: 'bos-liste' }, 'Bu aralıkta başarısız senaryo yok.'),
    veri.kalipIncelenen >= 400 ? h('p', { class: 'soluk kucuk' }, `En yeni ${veri.kalipIncelenen} başarısız senaryo incelendi.`) : null);
}

// ---------------------------------------------------------------------------------------
// Koşu ayrıntısı
// ---------------------------------------------------------------------------------------

/** Uzun hata metni: ilk satırlar görünür, tamamı title'da (taşma yok). */
const hataHucresi = (metin) => h('td', { class: 'servis-sonuc-hata' }, metin ? h('span', { title: metin }, metin) : h('span', { class: 'cok-soluk' }, '—'));

async function kosuAyrintisi(icerik, proje, id) {
  const { kosu, senaryolar, adimlar } = await api(`/platform/servis-sonuclari/kosu?projeId=${q(proje.id)}&id=${q(id)}`);
  const akis = kosu.tur === 'akis';
  const o = oran(kosu);
  const ozetKarti = (etiket, deger, sinif) => h('div', { class: `sonuc-karti ${sinif}` },
    h('span', { class: 'kart-etiket' }, etiket), h('div', { class: 'kart-deger' }, h('strong', { class: 'kart-sayi' }, String(deger))));
  const siraliSenaryolar = senaryolar.slice().sort((a, b) => (DURUM_SIRASI[a.durum] ?? 9) - (DURUM_SIRASI[b.durum] ?? 9));
  const tablo = akis
    ? h('table', { class: 'ozet-tablosu' }, h('caption', { class: 'gorunmez' }, 'Akış adımları'),
      h('thead', {}, h('tr', {}, ...['No', 'Adım', 'Servis / senaryo', 'Durum', 'Süre', 'Neden / hata', ''].map((b, i) => h('th', { scope: 'col', class: i === 0 || i === 4 ? 'sayi' : null }, b || h('span', { class: 'gorunmez' }, 'Ayrıntı'))))),
      h('tbody', {}, ...adimlar.map((a) => h('tr', {},
        h('td', { class: 'sayi' }, String(a.no)),
        h('td', {}, a.ad, a.okunanlar && Object.keys(a.okunanlar).length
          ? h('div', { class: 'soluk kucuk servis-sonuc-okunan' }, `Okunan: ${Object.entries(a.okunanlar).map(([ad, d]) => `${ad} = ${d}`).join(', ')}`) : null),
        h('td', {}, a.servis, h('div', { class: 'soluk kucuk' }, a.senaryo)),
        h('td', {}, durumRozeti(a.durum), a.not ? h('div', { class: 'soluk kucuk yetki-notu' }, a.not) : null), h('td', { class: 'sayi' }, sureMetni(a.sureMs)), hataHucresi(a.hata),
        h('td', {}, a.satirId ? h('a', { class: 'dugme kucuk-dugme hayalet', href: `${TABAN}/senaryo/${q(a.satirId)}`, 'aria-label': `Adım ayrıntısı: ${a.ad}` }, 'Ayrıntı') : null)))))
    : h('table', { class: 'ozet-tablosu' }, h('caption', { class: 'gorunmez' }, 'Senaryo sonuçları'),
      h('thead', {}, h('tr', {}, ...['Durum', 'Senaryo', 'HTTP', 'Süre', 'Hata'].map((b, i) => h('th', { scope: 'col', class: i === 2 || i === 3 ? 'sayi' : null }, b)))),
      h('tbody', {}, ...siraliSenaryolar.map((x) => h('tr', {},
        h('td', {}, durumRozeti(x.durduruldu ? 'durduruldu' : x.durum)),
        h('td', {}, h('a', { href: `${TABAN}/senaryo/${q(x.satirId)}` }, x.baslik)),
        h('td', { class: 'sayi' }, x.durumKodu === null ? '—' : String(x.durumKodu)),
        h('td', { class: 'sayi' }, sureMetni(x.sureMs)), hataHucresi(x.hata)))));
  const satirSayisi = akis ? adimlar.length : senaryolar.length;
  // Başarısızları tekrar çalıştır (servis koşusu): yalnız başarısız çalıştırmalar (veri koşularında yalnız kalan satırlar), aynı ortam, o koşudaki satırlar.
  const tekrarlanabilir = akis || kosu.calistirma === 'dene' ? 0 : senaryolar.filter((x) => (x.durum === 'basarisiz' || x.durum === 'hata') && x.senaryoId).length;
  const tekrarDugmesi = tekrarlanabilir && kosu.ortamId
    ? h('button', { type: 'button', class: 'dugme', onclick: () => servisBasarisizlariniTekrarla(kosu, proje) }, ikon('yenile'), `Başarısızları tekrar çalıştır (${tekrarlanabilir})`) : null;
  const tekrarBagi = kosu.tekrarKaynagi ? h('span', { class: 'tekrar-bagi' }, ikon('yenile'), 'Tekrar: ',
    h('a', { href: `${TABAN}/kosu/${q(kosu.tekrarKaynagi)}` }, 'önceki koşu'), ' · ',
    h('a', { href: `${TABAN}/karsilastir/${q(kosu.tekrarKaynagi)}/${q(kosu.id)}` }, 'karşılaştır')) : null;
  yerlestir(icerik,
    h('div', { class: 'sayfa-basligi' },
      h('div', {},
        h('div', { class: 'kirinti' }, h('span', {}, proje.ad), ayrac(), h('a', { href: '#/sonuclar' }, 'Sonuçlar'), ayrac(), h('a', { href: TABAN }, 'Servisler'), ayrac(),
          h('a', { href: kaynakAdresi(kosu) }, kosu.baslik), ayrac(), h('span', { class: 'simdiki' }, 'Koşu')),
        h('h2', { tabindex: '-1' }, `${kosu.baslik} — ${tarihMetni(kosu.baslangic)}`),
        h('div', { class: 'meta' },
          h('span', {}, rozet(akis ? 'akış koşusu' : 'servis koşusu', 'vurgu')),
          kosu.calistirma === 'dene' ? h('span', {}, rozet('deneme')) : null,
          h('span', {}, ikon('ag'), `ortam: ${kosu.ortam}`),
          h('span', {}, ikon('saat'), h('span', { class: 'mono' }, `${kisaTarih(kosu.baslangic)} · ${sureMetni(kosu.sureMs)}`)),
          tekrarBagi)),
      h('div', { class: 'eylemler' }, tekrarDugmesi, karsilastirDugmesi({ tur: 'servis', projeId: proje.id, kosuId: kosu.id }), htmlRaporDugmesi({ tur: 'servis', projeId: proje.id, id: kosu.id }),
        h('a', { class: 'dugme hayalet', href: kaynakAdresi(kosu) }, ikon('geri'), 'Servis sonuçları'))),
    h('div', { class: 'sonuc-kartlari mini' },
      ozetKarti('Başarılı', kosu.basarili, 'basarili'), ozetKarti('Başarısız', kalan(kosu), 'basarisiz'),
      ozetKarti('Atlanan', kosu.atlanan, 'atlanan'), ozetKarti('Durduruldu', kosu.durduruldu, 'durduruldu'),
      h('div', { class: 'sonuc-karti oran' }, h('span', { class: 'kart-etiket' }, 'Başarı oranı'),
        h('div', { class: 'kart-deger' }, h('strong', { class: 'kart-sayi' }, o === null ? '—' : `%${o}`)), dagilimCubugu(sayilar(kosu), '100%'))),
    h('p', { class: 'kart-kaynak' }, `${kosu.basarili} başarılı, ${kosu.basarisiz} başarısız, ${kosu.hata} hata, ${kosu.atlanan} atlanan, ${kosu.durduruldu} durduruldu`,
      akis && kosu.ozet ? ` · ${kosu.ozet}` : ''),
    h('section', { class: 'kart', 'aria-labelledby': 'ss-kosu-basligi' },
      h('div', { class: 'kart-basligi' }, h('h3', { id: 'ss-kosu-basligi' }, ikon('liste'), `${akis ? 'Adımlar' : 'Senaryolar'} (${satirSayisi})`),
        h('span', { class: 'alt' }, akis ? 'Adımlar sırasıyla; ayrıntıda istek / yanıt' : 'Başarısızlar önce; senaryoya tıklayınca istek / yanıt açılır')),
      satirSayisi ? h('div', { class: 'tablo-kaydirma' }, tablo) : h('p', { class: 'bos-liste' }, 'Bu koşuda sonuç yok.')));
}

/**
 * Servis koşusunda "Başarısızları tekrar çalıştır": plan (başarısız çalıştırmalar, o koşudan bu yana değişen tablo satırları) gösterilir;
 * değişen satırlar için güncel / o koşudaki veri seçilir (o koşudaki değerler yalnız gizli sütunsuz tablolarda saklanır). Riskli ortamda
 * açık onay istenir; izinler sunucuda denetlenir. Yeni çalıştırmalar "Tekrar:" bağı taşır.
 */
async function servisBasarisizlariniTekrarla(kosu, proje) {
  try {
    const [{ plan }, { ortamlar }, { onayIste, canliOnayIste }, { servisKosusuBaslat }] = await Promise.all([
      api(`/platform/servis-sonuclari/tekrar-plani?projeId=${q(proje.id)}&id=${q(kosu.id)}`), api(`/platform/ortamlar?projeId=${q(proje.id)}`),
      import('./kosu-paneli.js'), import('./servis-kosu-paneli.js')
    ]);
    const ortam = ortamlar.find((o) => o.id === kosu.ortamId);
    if (!ortam) { bildir('Koşunun ortamı bulunamadı; başarısızlar yalnız o ortamda tekrar çalıştırılabilir.', 'hata'); return; }
    if (!plan.testler.length) { bildir('Tekrar çalıştırılacak başarısız senaryo yok.', 'hata'); return; }
    let veri = 'guncel';
    const kosudakiOlur = plan.satirDegisiklikleri.length > 0 && plan.satirDegisiklikleri.every((x) => x.kosudakiVeri);
    const ad = yeniKimlik('servis-tekrar');
    const ek = h('div', { class: 'tekrar-plani' },
      h('ul', { 'aria-label': 'Tekrar çalıştırılacak senaryolar' }, plan.testler.slice(0, 30).map((t) => h('li', {}, t.baslik))),
      plan.satirDegisiklikleri.length ? h('div', { class: 'not-kutusu', role: 'note' },
        h('strong', {}, 'Tablo satırı o koşudan bu yana değişti: '),
        plan.satirDegisiklikleri.map((x) => `${x.tablo} → ${x.satirAdi} (${x.durum === 'silindi' ? 'silindi' : 'verisi değişti'})`).join(', '), '. ',
        kosudakiOlur
          ? h('div', { class: 'radyo-grubu', role: 'radiogroup' }, [['guncel', 'Güncel veriyle'], ['kosudaki', 'O koşudaki veriyle']].map(([d, e]) => {
            const r = h('input', { type: 'radio', name: ad, value: d, checked: d === veri });
            r.addEventListener('change', () => { veri = d; });
            return h('label', {}, r, e);
          }))
          : h('span', {}, 'O koşudaki değerler saklanmadığı için (gizli sütunlu tablo ya da silinmiş satır) güncel veriyle koşar.')) : null,
      plan.atlananlar.length ? h('p', { class: 'soluk kucuk' }, `${plan.atlananlar.length} çalıştırma tekrar edilemez: ${plan.atlananlar.map((x) => `${x.baslik} (${x.neden})`).slice(0, 5).join(', ')}.`) : null);
    const tamam = await onayIste({
      baslik: 'Başarısızları tekrar çalıştır?', ikonAd: 'yenile', dugme: `${plan.sayi} çalıştırmayı başlat`, ek,
      metin: `Yalnız başarısız ${plan.sayi} çalıştırma ${ortam.ad} ortamında, o koşudaki tablo satırlarıyla, sırayla çalışır. Yeni çalıştırmalar "Tekrar: önceki koşu" bağıyla kaydedilir.`
    });
    if (!tamam) return;
    if (!(await canliOnayIste(ortam, 'Tekrar koşusu'))) return;
    await servisKosusuBaslat({ proje, servisId: plan.kosu.servisId, ortamId: ortam.id, tekrar: { kaynakKosuId: kosu.id, veri } });
  } catch (e) {
    if (e && e.durum === 423) return;
    bildir(e.message, 'hata');
  }
}

// ---------------------------------------------------------------------------------------
// Senaryo ayrıntısı (istek / yanıt; gizli değerler maskeli)
// ---------------------------------------------------------------------------------------

function kontrolListesi(liste) {
  return h('ul', { class: 'kontrol-listesi servis-sonuc-kontroller' }, liste.map((k) => h('li', { class: k.gecti ? 'gecti' : 'kaldi' },
    h('div', {}, ikon(k.gecti ? 'onay' : 'carpi'), h('span', { class: 'gorunmez' }, k.gecti ? 'Geçti: ' : 'Başarısız: '),
      ` ${k.tur === 'veya' ? 'Şunlardan biri (VEYA)' : k.ad}`, k.aciklama ? [' — ', h('span', { class: 'soluk' }, k.aciklama)] : null),
    Array.isArray(k.alt) && k.alt.length ? kontrolListesi(k.alt) : null)));
}

async function senaryoAyrintisi(icerik, proje, id) {
  const { sonuc: r } = await api(`/platform/servis-sonuclari/senaryo?projeId=${q(proje.id)}&id=${q(id)}`);
  const kod = (metin) => h('pre', { class: 'hata-mesaji kod-blogu servis-sonuc-kod' }, metin);
  const basliklar = r.istekBasliklari && Object.keys(r.istekBasliklari).length
    ? h('dl', { class: 'servis-sonuc-basliklar' }, ...Object.entries(r.istekBasliklari).flatMap(([a, d]) => [h('dt', {}, a), h('dd', {}, String(d))])) : null;
  const sol = [
    r.hata ? h('section', { class: 'kart', 'aria-labelledby': 'ss-hata-basligi' },
      h('div', { class: 'kart-basligi' }, h('h3', { id: 'ss-hata-basligi' }, ikon('uyari'), r.durduruldu ? 'Durduruldu' : 'Hata')), kod(r.hata)) : null,
    h('section', { class: 'kart', 'aria-labelledby': 'ss-kontrol-basligi' },
      h('div', { class: 'kart-basligi' }, h('h3', { id: 'ss-kontrol-basligi' }, ikon('hedef'), 'Kontroller'),
        h('span', { class: 'alt mono' }, `${r.kontroller.filter((k) => k.gecti).length} / ${r.kontroller.length} geçti`)),
      r.kontroller.length ? kontrolListesi(r.kontroller) : h('p', { class: 'bos-liste' }, 'Kontrol sonucu yok (istek yanıt alınamadan bitti).'),
      // Yanıttaki dosya saklandıysa (Ayarlar > Koşu > Kayıt > "Doğrulanan dosya"): kasadan çözülür, tarayıcıda indirilir.
      (r.dosyalar || []).some((d) => d.saklandi) ? dogrulananDosyalar(r.dosyalar.filter((d) => d.saklandi).map((d) => dogrulananDosyaIndir(d.ad, async () => {
        const y = await api(`/platform/servis-sonuclari/dosya?projeId=${q(proje.id)}&id=${q(id)}&sira=${d.sira}`);
        const ikili = Uint8Array.from(atob(y.dosya.icerikBase64), (c) => c.charCodeAt(0));
        return new Blob([ikili], { type: y.dosya.icerikTuru || 'application/octet-stream' });
      }))) : null),
    h('section', { class: 'kart', 'aria-labelledby': 'ss-istek-basligi' },
      h('div', { class: 'kart-basligi' }, h('h3', { id: 'ss-istek-basligi' }, ikon('ok'), 'İstek'), h('span', { class: 'alt' }, 'gizli değerler maskeli')),
      basliklar, r.istek ? kod(r.istek) : h('p', { class: 'bos-liste' }, 'İstek gövdesi kaydedilmedi.')),
    h('section', { class: 'kart', 'aria-labelledby': 'ss-yanit-basligi' },
      h('div', { class: 'kart-basligi' }, h('h3', { id: 'ss-yanit-basligi' }, ikon('geri'), 'Yanıt'),
        r.durumKodu !== null ? h('span', { class: 'alt mono' }, `HTTP ${r.durumKodu}`) : null),
      r.yanit ? kod(r.yanit) : h('p', { class: 'bos-liste' }, 'Yanıt yok.'))
  ];
  const sag = [
    h('section', { class: 'kart', 'aria-labelledby': 'ss-ozet-basligi' },
      h('div', { class: 'kart-basligi' }, h('h3', { id: 'ss-ozet-basligi' }, ikon('liste'), 'Özet')),
      h('dl', { class: 'servis-sonuc-ozet' },
        h('dt', {}, 'Servis'), h('dd', {}, h('a', { href: servisSonucAdresi(r.servisId) }, r.servis)),
        h('dt', {}, 'Ortam'), h('dd', {}, r.ortam),
        h('dt', {}, 'Zaman'), h('dd', { class: 'mono' }, tarihMetni(r.baslangic)),
        h('dt', {}, 'Süre'), h('dd', { class: 'mono' }, sureMetni(r.sureMs)),
        r.adres ? [h('dt', {}, 'Adres'), h('dd', { class: 'mono' }, r.adres)] : null,
        r.akis ? [h('dt', {}, 'Akış'), h('dd', {}, `${r.akis.akisBaslik}${r.akis.adimNo ? ` · ${r.akis.adimNo}. adım` : ''}${r.akis.adimAd ? ` (${r.akis.adimAd})` : ''}`)] : null,
        r.oturum ? [h('dt', {}, 'Oturum'), h('dd', {}, `${r.oturum.akis} (${r.oturum.durum})`)] : null,
        r.yetkiTekrari ? [h('dt', {}, 'Yetki hatası'), h('dd', { class: 'yetki-notu' }, r.yetkiTekrari.not)] : null,
        r.kurtarma ? [h('dt', {}, 'Kurtarma kuralı'), h('dd', { class: 'kurtarma-notu' }, r.kurtarma.kural ? `${r.kurtarma.kural}: ` : '', r.kurtarma.not)] : null),
      r.ozet ? h('p', { class: 'servis-sonuc-yanit-ozeti' }, h('b', {}, 'Yanıt özeti: '), r.ozet) : null),
    r.okunanlar && Object.keys(r.okunanlar).length ? h('section', { class: 'kart', 'aria-labelledby': 'ss-okunan-basligi' },
      h('div', { class: 'kart-basligi' }, h('h3', { id: 'ss-okunan-basligi' }, ikon('anahtar'), 'Yanıttan okunan değerler')),
      h('dl', { class: 'servis-sonuc-ozet' }, ...Object.entries(r.okunanlar).flatMap(([a, d]) => [h('dt', {}, a), h('dd', { class: 'mono' }, d)]))) : null,
    h('p', { class: 'soluk kucuk', role: 'note' }, ikon('kalkan'), ' Parola, token gibi gizli alanlar raporda maskelidir. Maskelenen adlar: ',
      h('a', { href: '#/ayarlar/guvenlik' }, 'Ayarlar > Güvenlik > Maskeleme'), '.')
  ];
  yerlestir(icerik,
    h('div', { class: 'sayfa-basligi' },
      h('div', {},
        h('div', { class: 'kirinti' }, h('span', {}, proje.ad), ayrac(), h('a', { href: '#/sonuclar' }, 'Sonuçlar'), ayrac(), h('a', { href: TABAN }, 'Servisler'), ayrac(),
          h('a', { href: servisSonucAdresi(r.servisId) }, r.servis), ayrac(), h('span', { class: 'simdiki' }, 'Senaryo')),
        h('h2', { tabindex: '-1' }, r.baslik),
        h('div', { class: 'meta' },
          h('span', {}, durumRozeti(r.durduruldu ? 'durduruldu' : r.durum)),
          r.durumKodu !== null ? h('span', {}, rozet(`HTTP ${r.durumKodu}`)) : null,
          r.calistirma === 'dene' ? h('span', {}, rozet('deneme')) : null,
          h('span', {}, ikon('saat'), h('span', { class: 'mono' }, sureMetni(r.sureMs))),
          h('span', {}, ikon('takvim'), h('span', { class: 'mono' }, kisaTarih(r.baslangic))))),
      h('div', { class: 'eylemler' },
        h('button', { type: 'button', class: 'dugme hayalet', onclick: () => history.back() }, ikon('geri'), 'Geri'),
        r.senaryoId ? h('a', { class: 'dugme', href: `#/servisler/s/${q(r.servisId)}/senaryo/${q(r.senaryoId)}` }, ikon('duzenle'), 'Senaryoyu aç') : null)),
    h('div', { class: 'detay-izgarasi' }, h('div', {}, sol), h('div', {}, sag)));
}
