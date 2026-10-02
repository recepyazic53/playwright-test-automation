// HIZLI ARAMA (Ctrl+K / ⌘K ya da üst çubuktaki "Ara" düğmesi): eylemler (Yedek al, Yedek yükle, Playwright koduna dışa aktar,
// Kurtarma kuralı ekle, Rapor al…), ekranlar, genel senaryolar, senaryolar, servisler, metotlar, servis akışları, uçtan uca akışlar,
// Ayarlar bölümleri ve sık aranan ayarlar tek kutudan bulunur. Veriler pencere açılınca bir kez okunur (projenin kendi kayıtları;
// hiçbir dış istek yok). Klavye: ↑ / ↓ gezinir, Enter açar, Esc kapatır; alt listede (ör. dışa aktarılacak senaryo) boş kutuda
// Geri (Backspace) ana listeye döner. Arama Türkçe büyük/küçük harf, aksan ve noktalama duyarsızdır; tüm sözcükler geçmeli.
// Kullanıcı verisi DOM'a yalnızca metin olarak yazılır (h(); innerHTML yok).
import { api, h, ikon, yerlestir } from './ortak.js';

/** Türkçe duyarsız sadeleştirme (büyük/küçük harf, aksan, ı/i, noktalama). @param {unknown} s */
export const sade = (s) => String(s ?? '').toLocaleLowerCase('tr').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ı/g, 'i')
  .replace(/[’'`"“”.,:;!?()[\]{}›>/\\|…-]+/g, ' ');

/**
 * hedef: gidilecek adres; eylem: adres yerine çalıştırılacak iş (pencere önce kapanır); altListe: seçilince açılan ikinci liste
 * (ör. dışa aktarılacak senaryo). ek: aramada eşleşen ama gösterilmeyen eş anlamlılar.
 * @typedef {{ tur: string; baslik: string; alt?: string; ek?: string; ikonAd: string; hedef?: string; eylem?: () => unknown;
 *   altListe?: { baslik: string; ogeler: () => Promise<Sonuc[]> } }} Sonuc
 */

/**
 * Hızlı aramanın eylemleri (proje verisinden bağımsız). Yönlendirenler adres, diğerleri iş çalıştırır.
 * @param {{ id: string; ad?: string }} proje @param {() => Promise<Sonuc[]>} disaAktarilacaklar
 * @returns {Sonuc[]}
 */
function eylemler(proje, disaAktarilacaklar) {
  const E = 'Eylemler';
  return [
    { tur: E, baslik: 'Senaryo ekle', alt: 'Senaryolar', ek: 'yeni senaryo olustur test', ikonAd: 'arti', hedef: '#/senaryolar' },
    { tur: E, baslik: 'Ekran ekle', alt: 'Ekranlar · paket, tarama ya da akış kaydı', ek: 'yeni ekran tara', ikonAd: 'arti', hedef: '#/ekranlar/yeni' },
    { tur: E, baslik: 'Servis ekle', alt: 'WSDL, SoapUI, Postman, cURL ya da elle', ek: 'yeni servis soap rest', ikonAd: 'arti', hedef: '#/servisler/yeni' },
    { tur: E, baslik: 'Uçtan uca akış ekle', alt: 'Servis + ekran + SQL adımları', ek: 'yeni akis', ikonAd: 'katman', hedef: '#/akislar/yeni' },
    { tur: E, baslik: 'Yedek al', alt: 'Ayarlar › Yedekleme · şifreli .tayedek dosyası', ek: 'yedekle disa aktar indir tayedek backup', ikonAd: 'arsiv', hedef: '#/ayarlar/yedekleme/disa' },
    { tur: E, baslik: 'Yedek yükle', alt: 'Ayarlar › Yedekleme · başka bilgisayarın yedeğini içe aktar', ek: 'ice aktar geri yukle yedekten tayedek', ikonAd: 'yukle', hedef: '#/ayarlar/yedekleme/ice' },
    {
      tur: E, baslik: 'Playwright koduna dışa aktar', alt: 'Kaydedilmiş bir senaryoyu .spec.ts dosyası olarak indir', ek: "playwright'a aktar kod spec ts indir disa aktar",
      ikonAd: 'indir', altListe: { baslik: 'Dışa aktarılacak senaryoyu seçin', ogeler: disaAktarilacaklar }
    },
    { tur: E, baslik: 'Kurtarma kuralı ekle', alt: 'Ayarlar › Kurtarma kuralları', ek: 'yeni kural kurtar tekrar dene yenile', ikonAd: 'yenile', hedef: '#/ayarlar/kurtarma/yeni' },
    {
      tur: E, baslik: 'Rapor al (PDF)', alt: 'Ekran ya da servis raporu', ek: 'pdf rapor indir yonetici ozet', ikonAd: 'dosya',
      eylem: () => import('./pdf-rapor.js').then((m) => m.pdfRaporDiyalogu({ id: proje.id, ad: proje.ad || '' }))
    },
    { tur: E, baslik: 'Sonuçlar', alt: 'Koşu geçmişi, eğilim, hata kalıpları', ek: 'kosu sonuc rapor', ikonAd: 'grafik', hedef: '#/sonuclar' },
    { tur: E, baslik: 'Panoyu düzenle', alt: 'Sonuçlar › Özet · kartları kaldır, taşı, boyutlandır', ek: 'pano ozet kart duzen yerlesim', ikonAd: 'izgara', hedef: '#/sonuclar/ozet/duzenle' },
    { tur: E, baslik: 'Kart ekle', alt: 'Sonuçlar › Özet panosu · SQL sorgusu, Nöbetçi verisi, metin ya da yerleşik kart', ek: 'pano kart ekle sql sorgu veritabani ozet', ikonAd: 'arti', hedef: '#/sonuclar/ozet/kart-ekle' },
    { tur: E, baslik: 'Ortam ekle', alt: 'Ayarlar › Proje ve ortamlar', ek: 'yeni ortam test canli adres', ikonAd: 'ag', hedef: '#/ayarlar/proje' },
    { tur: E, baslik: 'Giriş tarifi', alt: 'Ayarlar › Giriş profilleri · oturum kontrol adresi', ek: 'giris profili oturum kontrol adresi login', ikonAd: 'anahtar', hedef: '#/ayarlar/giris' },
    { tur: E, baslik: 'Oturum kontrolü (sn)', alt: 'Ayarlar › Koşu › Gelişmiş › Giriş', ek: 'oturum suresi giris bekleme', ikonAd: 'saat', hedef: '#/ayarlar/kosu/oturumKontrolSn' }
  ];
}

/**
 * Proje verisinden aranabilir öğeler.
 * @param {{ id: string; ad?: string }} proje @param {Array<{ ad: string; etiket: string; ikon: string }>} ayarBolumleri
 * @param {Array<{ ad: string; menu: string; etiket: string; ikon: string }>} [ustSayfalar] üst menüdeki Test verisi / Planlı koşular
 * @returns {Promise<Sonuc[]>}
 */
export async function ogeleriTopla(proje, ayarBolumleri, ustSayfalar = []) {
  const p = encodeURIComponent(proje.id);
  const q = encodeURIComponent;
  // Senaryolar tüm ortamlardan (birleşik liste; ortamId verilmez).
  const [ekranlar, servisler, senaryolar, servisAkislari, uctanUca] = await Promise.all([
    api(`/platform/ekranlar?projeId=${p}`).then((y) => y.ekranlar || []).catch(() => []),
    api(`/platform/servisler?projeId=${p}`).then((y) => y.servisler || []).catch(() => []),
    api(`/platform/senaryolar?projeId=${p}`).then((y) => y.senaryolar || []).catch(() => []),
    api(`/platform/servis-akislari?projeId=${p}`).then((y) => y.akislar || []).catch(() => []),
    api(`/platform/uctan-uca/akislar?projeId=${p}`).then((y) => y.akislar || []).catch(() => [])
  ]);
  const ekranAdi = new Map(ekranlar.map((e) => [e.id, e.ad]));
  const servisAdi = new Map(servisler.map((s) => [s.id, s.ad]));

  /** Dışa aktarılabilecek (ekran modeliyle koşan, en az bir ortamda tanımlı) senaryolar; seçilince onaylı indirme. */
  const disaAktarilacaklar = async () => {
    const { ortamlar = [] } = await api(`/platform/ortamlar?projeId=${p}`).catch(() => ({ ortamlar: [] }));
    const { playwrightKodunaAktar } = await import('./playwright-disa-aktarma.js');
    return senaryolar.filter((s) => s.modelKosusu !== false).map((s) => {
      const tanimli = ortamlar.filter((o) => (s.ortamlar || []).some((x) => x.ortamId === o.id && x.tanimli));
      return { s, tanimli };
    }).filter((x) => x.tanimli.length).map(({ s, tanimli }) => ({
      tur: 'Senaryolar', baslik: s.baslik, alt: `${ekranAdi.get(s.ekranId) || s.ekranAdi || ''}${ekranAdi.get(s.ekranId) || s.ekranAdi ? ' · ' : ''}${tanimli.map((o) => o.ad).join(', ')}`,
      ikonAd: 'indir', eylem: () => playwrightKodunaAktar({ projeId: proje.id, senaryo: { id: s.id, baslik: s.baslik }, ortamlar: tanimli })
    }));
  };

  /** @type {Sonuc[]} */
  const ogeler = [
    ...eylemler(proje, disaAktarilacaklar),
    ...ustSayfalar.map((s) => ({ tur: 'Eylemler', baslik: s.etiket, alt: `Üst menü · ${s.menu}`, ikonAd: s.ikon, hedef: `#/${s.ad}` }))
  ];
  for (const e of ekranlar) {
    const ortak = e.modelTuru === 'ortakAkis';
    if (e.modelTuru === 'altModel') continue;
    ogeler.push({ tur: ortak ? 'Genel senaryolar' : 'Ekranlar', baslik: e.ad, alt: e.durum === 'devre_disi' ? 'devre dışı' : e.modelSurumu ? `model v${e.modelSurumu}` : undefined, ikonAd: ortak ? 'pusula' : 'ekran', hedef: `#/ekranlar/e/${q(e.id)}` });
  }
  for (const s of senaryolar) {
    ogeler.push({ tur: 'Senaryolar', baslik: s.baslik, alt: ekranAdi.get(s.ekranId) || s.ekranAdi || undefined, ikonAd: 'liste', hedef: `#/senaryolar/duzenle/${q(s.id)}` });
  }
  for (const s of servisler) {
    ogeler.push({ tur: 'Servisler', baslik: s.ad, alt: s.senaryoSayisi ? `${s.senaryoSayisi} senaryo` : undefined, ikonAd: 'ag', hedef: `#/servisler/s/${q(s.id)}` });
    for (const op of (s.ayarlar && Array.isArray(s.ayarlar.operasyonlar) ? s.ayarlar.operasyonlar : [])) {
      if (!op || !op.ad) continue;
      const uc = op.metot ? ` · ${op.metot}${op.yol ? ` ${op.yol}` : ''}` : '';
      ogeler.push({ tur: 'Metotlar', baslik: op.ad, alt: `${s.ad}${uc}`, ikonAd: 'duzenle', hedef: `#/servisler/s/${q(s.id)}/sozlesme/${q(op.ad)}` });
    }
  }
  for (const a of servisAkislari) {
    if (a.icerik && a.icerik.uctanUca) continue; // uçtan uca akışlar aşağıda (kendi ekranı)
    // Akış proje düzeyindedir; açılacak servis: oturum akışını kullanan servis, yoksa ilk adımın servisi, yoksa ilk servis.
    const adimServisi = ((a.icerik && a.icerik.adimlar) || []).map((x) => x && x.servisId).find((id) => id && servisAdi.has(id));
    const servisId = (a.kullananServisler && a.kullananServisler[0] && a.kullananServisler[0].id) || adimServisi || (servisler[0] && servisler[0].id);
    if (!servisId) continue;
    ogeler.push({ tur: 'Servis akışları', baslik: a.baslik, alt: `${a.tur === 'oturum' ? 'Oturum akışı' : 'Akış'} · ${a.adimSayisi ?? 0} adım`, ek: 'akis', ikonAd: 'katman', hedef: `#/servisler/s/${q(servisId)}/akislar/${q(a.id)}` });
  }
  for (const a of uctanUca) {
    ogeler.push({ tur: 'Uçtan uca akışlar', baslik: a.baslik, alt: `${a.adimSayisi ?? 0} adım`, ek: 'akis uctan uca', ikonAd: 'katman', hedef: `#/akislar/${q(a.id)}` });
  }
  for (const b of ayarBolumleri) ogeler.push({ tur: 'Ayarlar', baslik: b.etiket, alt: 'Ayarlar', ikonAd: b.ikon, hedef: `#/ayarlar/${b.ad}` });
  return ogeler;
}

const GRUP_SIRASI = ['Eylemler', 'Ekranlar', 'Genel senaryolar', 'Senaryolar', 'Servisler', 'Metotlar', 'Servis akışları', 'Uçtan uca akışlar', 'Ayarlar'];
const GRUP_SINIRI = 8;

/**
 * Aramayla eşleşenler, grup sırasıyla (grup başına en çok GRUP_SINIRI). Boş aramada yalnız eylemler ve Ayarlar.
 * @param {Sonuc[]} ogeler @param {string} arama @param {{ hepsi?: boolean }} [secenek] hepsi: boş aramada tüm öğeler (alt liste)
 */
export function suz(ogeler, arama, secenek = {}) {
  const sozcukler = sade(arama).split(/\s+/).filter(Boolean);
  const eslesen = sozcukler.length
    ? ogeler.filter((o) => { const m = sade(`${o.baslik} ${o.alt ?? ''} ${o.tur} ${o.ek ?? ''}`); return sozcukler.every((s) => m.includes(s)); })
    : secenek.hepsi ? ogeler : ogeler.filter((o) => o.tur === 'Eylemler' || o.tur === 'Ayarlar');
  // Sıra (grup içinde): başlığı aramayla başlayanlar, sonra tüm sözcükleri başlıkta geçenler, sonra yalnız açıklama / eş anlamlıda geçenler.
  const ilk = sozcukler.join(' ');
  const puan = (/** @type {Sonuc} */ o) => {
    const b = sade(o.baslik).replace(/\s+/g, ' ').trim();
    return (ilk && b.startsWith(ilk) ? 2 : 0) + (sozcukler.length && sozcukler.every((s) => b.includes(s)) ? 1 : 0);
  };
  const gruplar = [...GRUP_SIRASI, ...new Set(eslesen.map((o) => o.tur).filter((t) => !GRUP_SIRASI.includes(t)))];
  return gruplar.flatMap((g) => eslesen.filter((o) => o.tur === g)
    .sort((a, b) => puan(b) - puan(a))
    // Eylemler ve Ayarlar kısa, sabit listelerdir: hepsi görünür (boş aramada neler yapılabileceği okunur).
    .slice(0, secenek.hepsi ? 50 : g === 'Eylemler' || g === 'Ayarlar' ? 20 : GRUP_SINIRI));
}

let acikDiyalog = null;

/**
 * Hızlı arama penceresini açar.
 * @param {{ proje: { id: string; ad?: string } | null; ayarBolumleri: Array<{ ad: string; etiket: string; ikon: string }>; ustSayfalar?: Array<{ ad: string; menu: string; etiket: string; ikon: string }> }} baglam
 */
export async function hizliAramaAc(baglam) {
  if (acikDiyalog || !baglam.proje) return;
  const onceOdak = /** @type {HTMLElement | null} */ (document.activeElement);
  const listeId = 'hizli-arama-listesi';
  const ANA_IPUCU = 'Ekran, senaryo, servis, metot, akış, ayar ya da eylem ara…';
  const girdi = h('input', {
    type: 'search', class: 'hizli-arama-girdi', placeholder: ANA_IPUCU, autocomplete: 'off', spellcheck: 'false',
    role: 'combobox', 'aria-expanded': 'true', 'aria-controls': listeId, 'aria-autocomplete': 'list', 'aria-label': 'Hızlı arama'
  });
  const altBaslik = h('div', { class: 'hizli-arama-alt-baslik', hidden: true });
  const liste = h('ul', { class: 'hizli-arama-listesi', id: listeId, role: 'listbox', 'aria-label': 'Sonuçlar' });
  const durum = h('p', { class: 'hizli-arama-durum soluk', role: 'status' }, 'Yükleniyor…');
  const diyalog = h('dialog', { class: 'hizli-arama', 'aria-label': 'Hızlı arama' },
    h('div', { class: 'hizli-arama-ust' }, ikon('ara'), girdi, h('kbd', {}, 'Esc')),
    altBaslik, liste, durum,
    h('div', { class: 'hizli-arama-alt soluk' }, h('span', {}, h('kbd', {}, '↑'), h('kbd', {}, '↓'), ' gezin'), h('span', {}, h('kbd', {}, 'Enter'), ' aç'), h('span', {}, h('kbd', {}, 'Ctrl'), h('kbd', {}, 'K'), ' her yerden')));
  acikDiyalog = diyalog;
  document.body.append(diyalog);
  diyalog.showModal();
  girdi.focus();

  /** @type {Sonuc[]} */
  let anaOgeler = [];
  /** @type {Sonuc[]} */
  let ogeler = [];
  /** @type {Sonuc[]} */
  let gorunen = [];
  /** Alt listede miyiz (ör. dışa aktarılacak senaryo)? */
  let altta = false;
  let secili = 0;
  // Kapatma eşzamanlı ve tekrarlanabilir: seçimden hemen sonra (close olayı beklenmeden) yeni Ctrl+K pencereyi yeniden açabilsin.
  const kapat = () => {
    if (diyalog.open) diyalog.close();
    if (acikDiyalog !== diyalog) return;
    diyalog.remove();
    acikDiyalog = null;
    if (onceOdak && onceOdak.isConnected && !location.hash.startsWith('#/')) onceOdak.focus();
  };

  const anaListeyeDon = () => {
    altta = false;
    ogeler = anaOgeler;
    altBaslik.hidden = true;
    girdi.placeholder = ANA_IPUCU;
    girdi.value = '';
    secili = 0;
    ciz();
  };
  /** @param {Sonuc} o */
  const git = async (o) => {
    if (o.altListe) {
      const alt = o.altListe;
      altta = true;
      girdi.value = '';
      girdi.placeholder = `${alt.baslik}…`;
      yerlestir(altBaslik, h('button', { type: 'button', class: 'hizli-arama-geri', onclick: () => { anaListeyeDon(); girdi.focus(); } }, ikon('geri'), 'Geri'), h('b', {}, o.baslik), h('span', { class: 'soluk' }, ` · ${alt.baslik}`));
      altBaslik.hidden = false;
      durum.textContent = 'Yükleniyor…';
      yerlestir(liste);
      const altOgeler = await alt.ogeler().catch(() => []);
      if (!diyalog.open || !altta) return;
      ogeler = altOgeler;
      secili = 0;
      ciz();
      if (!altOgeler.length) durum.textContent = 'Dışa aktarılabilecek senaryo yok (senaryo ekran modeliyle koşmalı ve en az bir ortamda tanımlı olmalı).';
      girdi.focus();
      return;
    }
    kapat();
    if (o.eylem) { await o.eylem(); return; }
    if (o.hedef) location.hash = o.hedef;
  };
  const ciz = () => {
    gorunen = suz(ogeler, girdi.value, { hepsi: altta });
    secili = Math.min(secili, Math.max(0, gorunen.length - 1));
    const satirlar = [];
    let oncekiTur = '';
    gorunen.forEach((o, i) => {
      if (!altta && o.tur !== oncekiTur) { satirlar.push(h('li', { class: 'hizli-arama-grup', role: 'presentation' }, o.tur)); oncekiTur = o.tur; }
      satirlar.push(h('li', {
        id: `hizli-arama-${i}`, role: 'option', class: 'hizli-arama-oge', 'aria-selected': String(i === secili),
        onclick: () => git(o), onmousemove: () => { if (secili !== i) { secili = i; isaretle(); } }
      }, h('span', { class: 'hizli-arama-ikon', 'aria-hidden': 'true' }, ikon(o.ikonAd)),
      h('span', { class: 'hizli-arama-metin' }, h('b', {}, o.baslik), o.alt ? h('small', {}, o.alt) : null),
      o.altListe ? h('span', { class: 'hizli-arama-ok soluk', 'aria-hidden': 'true' }, '›') : null));
    });
    yerlestir(liste, satirlar);
    durum.textContent = gorunen.length ? `${gorunen.length} sonuç` : girdi.value.trim() ? 'Sonuç yok.' : '';
    isaretle();
  };
  const isaretle = () => {
    for (const li of liste.querySelectorAll('[role="option"]')) li.setAttribute('aria-selected', String(li.id === `hizli-arama-${secili}`));
    const el = liste.querySelector(`#hizli-arama-${secili}`);
    if (el) { girdi.setAttribute('aria-activedescendant', el.id); el.scrollIntoView({ block: 'nearest' }); } else girdi.removeAttribute('aria-activedescendant');
  };
  girdi.addEventListener('input', () => { secili = 0; ciz(); });
  girdi.addEventListener('keydown', (o) => {
    if (o.key === 'ArrowDown') { o.preventDefault(); if (gorunen.length) { secili = (secili + 1) % gorunen.length; isaretle(); } }
    else if (o.key === 'ArrowUp') { o.preventDefault(); if (gorunen.length) { secili = (secili - 1 + gorunen.length) % gorunen.length; isaretle(); } }
    else if (o.key === 'Enter') { o.preventDefault(); if (gorunen[secili]) git(gorunen[secili]); }
    else if (o.key === 'Backspace' && altta && !girdi.value) { o.preventDefault(); anaListeyeDon(); }
  });
  diyalog.addEventListener('click', (o) => { if (o.target === diyalog) diyalog.close(); });
  diyalog.addEventListener('close', () => kapat());

  anaOgeler = await ogeleriTopla(baglam.proje, baglam.ayarBolumleri, baglam.ustSayfalar || []);
  ogeler = anaOgeler;
  if (diyalog.open && !altta) ciz();
}

/** Üst çubuktaki "Ara" düğmesi ve Ctrl+K / ⌘K kısayolu. @param {() => Parameters<typeof hizliAramaAc>[0]} baglamAl */
export function hizliAramaDugmesi(baglamAl) {
  const d = h('button', { type: 'button', class: 'hizli-arama-dugmesi', title: 'Hızlı arama (Ctrl+K)', 'aria-keyshortcuts': 'Control+K Meta+K' },
    ikon('ara'), h('span', { class: 'dugme-metni' }, 'Ara'), h('kbd', { 'aria-hidden': 'true' }, 'Ctrl K'));
  d.addEventListener('click', () => hizliAramaAc(baglamAl()));
  return d;
}

let kisayolKuruldu = false;
/** Ctrl+K / ⌘K her ekranda (bir kez kurulur). @param {() => Parameters<typeof hizliAramaAc>[0]} baglamAl */
export function hizliAramaKisayolu(baglamAl) {
  if (kisayolKuruldu) return;
  kisayolKuruldu = true;
  document.addEventListener('keydown', (o) => {
    if ((o.ctrlKey || o.metaKey) && !o.altKey && !o.shiftKey && o.key.toLocaleLowerCase('tr') === 'k') {
      if (document.querySelector('dialog[open]:not(.hizli-arama)') || document.querySelector('.rehber-kok')) return;
      o.preventDefault();
      hizliAramaAc(baglamAl());
    }
  });
}
