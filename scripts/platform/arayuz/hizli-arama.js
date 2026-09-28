// HIZLI ARAMA (Ctrl+K / ⌘K ya da üst çubuktaki "Ara" düğmesi): ekranlar, ortak akışlar, senaryolar, servisler, Ayarlar
// bölümleri ve sık işler tek kutudan bulunur. Veriler açılışta bir kez okunur (projenin kendi kayıtları; hiçbir dış istek yok).
// Klavye: ↑ / ↓ gezinir, Enter açar, Esc kapatır. Arama Türkçe karakter ve büyük/küçük harf duyarsızdır; tüm sözcükler geçmeli.
// Kullanıcı verisi DOM'a yalnızca metin olarak yazılır (h(); innerHTML yok).
import { api, h, ikon, yerlestir } from './ortak.js';

/** Türkçe duyarsız sadeleştirme. @param {unknown} s */
const sade = (s) => String(s ?? '').toLocaleLowerCase('tr').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ı/g, 'i');

/**
 * @typedef {{ tur: string; baslik: string; alt?: string; ikonAd: string; hedef: string }} Sonuc
 */

/**
 * Proje verisinden aranabilir öğeler.
 * @param {{ id: string }} proje @param {Array<{ ad: string; etiket: string; ikon: string }>} ayarBolumleri
 * @returns {Promise<Sonuc[]>}
 */
async function ogeleriTopla(proje, ayarBolumleri) {
  const p = encodeURIComponent(proje.id);
  // Senaryolar tüm ortamlardan (birleşik liste; ortamId verilmez).
  const [ekranlar, servisler, senaryolar] = await Promise.all([
    api(`/platform/ekranlar?projeId=${p}`).then((y) => y.ekranlar || []).catch(() => []),
    api(`/platform/servisler?projeId=${p}`).then((y) => y.servisler || []).catch(() => []),
    api(`/platform/senaryolar?projeId=${p}`).then((y) => y.senaryolar || []).catch(() => [])
  ]);
  const ekranAdi = new Map(ekranlar.map((e) => [e.id, e.ad]));
  /** @type {Sonuc[]} */
  const ogeler = [
    { tur: 'İşler', baslik: 'Senaryo ekle', alt: 'Senaryolar', ikonAd: 'arti', hedef: '#/senaryolar' },
    { tur: 'İşler', baslik: 'Ekran ekle', alt: 'Ekranlar · paket, tarama ya da akış kaydı', ikonAd: 'arti', hedef: '#/ekranlar/yeni' },
    { tur: 'İşler', baslik: 'Servis ekle', alt: 'WSDL, SoapUI, Postman ya da elle', ikonAd: 'arti', hedef: '#/servisler/yeni' },
    { tur: 'İşler', baslik: 'Sonuçlar', alt: 'Koşu geçmişi, eğilim, hata kalıpları', ikonAd: 'grafik', hedef: '#/sonuclar' }
  ];
  for (const e of ekranlar) {
    const ortak = e.modelTuru === 'ortakAkis';
    if (e.modelTuru === 'altModel') continue;
    ogeler.push({ tur: ortak ? 'Ortak akışlar' : 'Ekranlar', baslik: e.ad, alt: e.durum === 'devre_disi' ? 'devre dışı' : e.modelSurumu ? `model v${e.modelSurumu}` : undefined, ikonAd: ortak ? 'pusula' : 'ekran', hedef: `#/ekranlar/e/${encodeURIComponent(e.id)}` });
  }
  for (const s of senaryolar) {
    ogeler.push({ tur: 'Senaryolar', baslik: s.baslik, alt: ekranAdi.get(s.ekranId) || s.ekranAdi || undefined, ikonAd: 'liste', hedef: `#/senaryolar/duzenle/${encodeURIComponent(s.id)}` });
  }
  for (const s of servisler) {
    ogeler.push({ tur: 'Servisler', baslik: s.ad, alt: s.senaryoSayisi ? `${s.senaryoSayisi} senaryo` : undefined, ikonAd: 'ag', hedef: `#/servisler/s/${encodeURIComponent(s.id)}` });
  }
  for (const b of ayarBolumleri) ogeler.push({ tur: 'Ayarlar', baslik: b.etiket, alt: 'Ayarlar', ikonAd: b.ikon, hedef: `#/ayarlar/${b.ad}` });
  return ogeler;
}

const GRUP_SIRASI = ['İşler', 'Ekranlar', 'Ortak akışlar', 'Senaryolar', 'Servisler', 'Ayarlar'];
const GRUP_SINIRI = 8;

/** @param {Sonuc[]} ogeler @param {string} arama */
function suz(ogeler, arama) {
  const sozcukler = sade(arama).split(/\s+/).filter(Boolean);
  const eslesen = sozcukler.length
    ? ogeler.filter((o) => { const m = sade(`${o.baslik} ${o.alt ?? ''} ${o.tur}`); return sozcukler.every((s) => m.includes(s)); })
    : ogeler.filter((o) => o.tur === 'İşler' || o.tur === 'Ayarlar');
  // Başlığı aramayla başlayanlar öne.
  const ilk = sade(arama).trim();
  return GRUP_SIRASI.flatMap((g) => eslesen.filter((o) => o.tur === g)
    .sort((a, b) => Number(sade(b.baslik).startsWith(ilk)) - Number(sade(a.baslik).startsWith(ilk)))
    .slice(0, GRUP_SINIRI));
}

let acikDiyalog = null;

/**
 * Hızlı arama penceresini açar.
 * @param {{ proje: { id: string } | null; ayarBolumleri: Array<{ ad: string; etiket: string; ikon: string }> }} baglam
 */
export async function hizliAramaAc(baglam) {
  if (acikDiyalog || !baglam.proje) return;
  const onceOdak = /** @type {HTMLElement | null} */ (document.activeElement);
  const listeId = 'hizli-arama-listesi';
  const girdi = h('input', {
    type: 'search', class: 'hizli-arama-girdi', placeholder: 'Ekran, senaryo, servis ya da ayar ara…', autocomplete: 'off', spellcheck: 'false',
    role: 'combobox', 'aria-expanded': 'true', 'aria-controls': listeId, 'aria-autocomplete': 'list', 'aria-label': 'Hızlı arama'
  });
  const liste = h('ul', { class: 'hizli-arama-listesi', id: listeId, role: 'listbox', 'aria-label': 'Sonuçlar' });
  const durum = h('p', { class: 'hizli-arama-durum soluk', role: 'status' }, 'Yükleniyor…');
  const diyalog = h('dialog', { class: 'hizli-arama', 'aria-label': 'Hızlı arama' },
    h('div', { class: 'hizli-arama-ust' }, ikon('ara'), girdi, h('kbd', {}, 'Esc')),
    liste, durum,
    h('div', { class: 'hizli-arama-alt soluk' }, h('span', {}, h('kbd', {}, '↑'), h('kbd', {}, '↓'), ' gezin'), h('span', {}, h('kbd', {}, 'Enter'), ' aç'), h('span', {}, h('kbd', {}, 'Ctrl'), h('kbd', {}, 'K'), ' her yerden')));
  acikDiyalog = diyalog;
  document.body.append(diyalog);
  diyalog.showModal();
  girdi.focus();

  /** @type {Sonuc[]} */
  let ogeler = [];
  /** @type {Sonuc[]} */
  let gorunen = [];
  let secili = 0;
  const git = (o) => { diyalog.close(); location.hash = o.hedef; };
  const ciz = () => {
    gorunen = suz(ogeler, girdi.value);
    secili = Math.min(secili, Math.max(0, gorunen.length - 1));
    const satirlar = [];
    let oncekiTur = '';
    gorunen.forEach((o, i) => {
      if (o.tur !== oncekiTur) { satirlar.push(h('li', { class: 'hizli-arama-grup', role: 'presentation' }, o.tur)); oncekiTur = o.tur; }
      satirlar.push(h('li', {
        id: `hizli-arama-${i}`, role: 'option', class: 'hizli-arama-oge', 'aria-selected': String(i === secili),
        onclick: () => git(o), onmousemove: () => { if (secili !== i) { secili = i; isaretle(); } }
      }, h('span', { class: 'hizli-arama-ikon', 'aria-hidden': 'true' }, ikon(o.ikonAd)), h('span', { class: 'hizli-arama-metin' }, h('b', {}, o.baslik), o.alt ? h('small', {}, o.alt) : null)));
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
  });
  diyalog.addEventListener('click', (o) => { if (o.target === diyalog) diyalog.close(); });
  diyalog.addEventListener('close', () => {
    diyalog.remove();
    acikDiyalog = null;
    if (onceOdak && onceOdak.isConnected && !location.hash.startsWith('#/')) onceOdak.focus();
  });

  ogeler = await ogeleriTopla(baglam.proje, baglam.ayarBolumleri);
  if (diyalog.open) ciz();
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
