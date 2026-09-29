// "BAŞLARKEN" KONTROL LİSTESİ (Sonuçlar > Genel > Özet; proje henüz tam koşu görmediyse Genel > Ekranlar'ın başında da): ilk koşuya
// giden yedi adım — ortam, giriş tarifi, ilk ekran, ilk senaryo, Dene, Koşuyu başlat, sonuçları incele. Durumlar sunucuda projenin
// verisinden hesaplanır (GET /platform/baslarken; ayarlar/baslarken.mjs): ✓ tamam, ilk eksik adım "sıradaki". Her adım tek tıkla
// ilgili ekranı açar. Liste tamamlanınca ya da "Gizle" ile kaybolur; gizleme kararı tarayıcıda değil, kasada proje ayarı olarak
// saklanır (POST /platform/baslarken/kaydet). Ayarlar > Arayüz > "Başlarken listesini yeniden göster" geri getirir.
// DOM'a yalnız metin yazılır (h(); innerHTML yok).
import { api, bildir, h, ikon, mesgulIken } from './ortak.js';

/**
 * @typedef {{ anahtar: string; baslik: string; aciklama: string; eylem: string; adres: string; durum: 'tamam' | 'siradaki' | 'bekliyor';
 *   atlanabilir?: boolean; atlandi?: boolean }} Adim
 * @typedef {{ gizli: boolean; tamam: boolean; tamamlanan: number; toplam: number; adimlar: Adim[] }} Durum
 */

const DURUM_METNI = { tamam: 'tamamlandı', siradaki: 'sıradaki', bekliyor: 'bekliyor' };

/**
 * Kartın yer tutucusu: veri gelince kart çizilir; gizliyse / tamamsa ya da (yalnizKosusuz) proje tam koşu görmüşse kendini kaldırır.
 * @param {{ id: string }} proje @param {{ yalnizKosusuz?: boolean }} [secenek]
 * @returns {HTMLElement}
 */
export function baslarkenKarti(proje, secenek = {}) {
  const kap = h('div', { class: 'baslarken-kap', hidden: true });
  api(`/platform/baslarken?projeId=${encodeURIComponent(proje.id)}`).then(({ baslarken }) => {
    ciz(kap, proje, baslarken, secenek);
  }).catch(() => { kap.remove(); });
  return kap;
}

/** @param {Durum} d @param {{ yalnizKosusuz?: boolean }} secenek */
function gorunurMu(d, secenek) {
  if (d.gizli || d.tamam) return false;
  if (secenek.yalnizKosusuz && d.adimlar.some((a) => a.anahtar === 'kosu' && a.durum === 'tamam')) return false;
  return true;
}

/** @param {HTMLElement} kap @param {{ id: string }} proje @param {Durum} d @param {{ yalnizKosusuz?: boolean }} secenek */
function ciz(kap, proje, d, secenek) {
  if (!gorunurMu(d, secenek)) { kap.replaceChildren(); kap.hidden = true; return; }
  const kaydet = async (govde, dugme, metin) => {
    const y = await mesgulIken(dugme, metin, () => api('/platform/baslarken/kaydet', { govde: { projeId: proje.id, ...govde } }));
    return /** @type {Durum} */ (y.baslarken);
  };
  const gizle = h('button', { type: 'button', class: 'hayalet kucuk-dugme baslarken-gizle', title: 'Listeyi gizle (Ayarlar > Arayüz\'den yeniden gösterilir)' }, ikon('carpi'), 'Gizle');
  gizle.addEventListener('click', async () => {
    try {
      await kaydet({ gizli: true }, gizle, 'Gizleniyor…');
      kap.replaceChildren(); kap.hidden = true;
      bildir('Başlarken listesi gizlendi. Ayarlar > Arayüz\'den yeniden gösterebilirsiniz.');
    } catch (e) { if (!(e && e.durum === 423)) bildir(e.message || String(e), 'hata'); }
  });
  const yuzde = Math.round((d.tamamlanan / d.toplam) * 100);
  const baslikId = 'baslarken-baslik';
  const satir = (/** @type {Adim} */ a, i) => {
    const siradaki = a.durum === 'siradaki';
    const git = h('a', { class: `dugme kucuk-dugme${siradaki ? ' birincil' : a.durum === 'tamam' ? ' hayalet' : ''}`, href: a.adres, 'aria-label': `${a.baslik}: ${a.eylem}` },
      a.eylem, siradaki ? ikon('ok') : null);
    let atla = null;
    if (a.atlanabilir) {
      atla = h('button', { type: 'button', class: 'hayalet kucuk-dugme baslarken-atla' }, a.atlandi ? 'Geri al' : 'Girişe gerek yok');
      atla.addEventListener('click', async () => {
        try { ciz(kap, proje, await kaydet({ girisGerekmez: !a.atlandi }, atla, 'Kaydediliyor…'), secenek); } catch (e) { if (!(e && e.durum === 423)) bildir(e.message || String(e), 'hata'); }
      });
    }
    return h('li', { class: `baslarken-adimi ${a.durum}`, 'data-adim': a.anahtar, 'data-durum': a.durum, 'aria-current': siradaki ? 'step' : null },
      h('span', { class: 'baslarken-isaret', 'aria-hidden': 'true' }, a.durum === 'tamam' ? ikon('onay') : String(i + 1)),
      h('span', { class: 'baslarken-metni' },
        h('b', {}, a.baslik, h('span', { class: 'gorunmez' }, ` (${a.atlandi ? 'gerek yok' : DURUM_METNI[a.durum]})`)),
        h('small', {}, a.atlandi ? 'Uygulamanız giriş istemiyor olarak işaretlendi.' : a.aciklama)),
      siradaki ? h('span', { class: 'rozet vurgu baslarken-rozet', 'aria-hidden': 'true' }, 'Sıradaki') : null,
      h('span', { class: 'baslarken-eylemleri' }, atla, git));
  };
  kap.hidden = false;
  kap.replaceChildren(h('section', { class: 'kart baslarken-karti', 'aria-labelledby': baslikId },
    h('div', { class: 'kart-basligi' },
      h('h3', { id: baslikId }, ikon('pusula'), 'Başlarken'),
      h('span', { class: 'baslarken-sayac rozet' }, `${d.tamamlanan} / ${d.toplam}`),
      h('span', { class: 'bosluk' }), gizle),
    h('p', { class: 'soluk kucuk baslarken-aciklama' }, 'İlk koşuya giden yol. Adımlar projenizin verisinden işaretlenir; tıklayınca ilgili ekran açılır. Liste tamamlanınca kendiliğinden kaybolur.'),
    h('div', { class: 'baslarken-cubugu', role: 'progressbar', 'aria-label': 'Başlarken ilerlemesi', 'aria-valuemin': '0', 'aria-valuemax': String(d.toplam), 'aria-valuenow': String(d.tamamlanan) },
      h('span', { style: { width: `${yuzde}%` } })),
    h('ol', { class: 'baslarken-adimlari' }, d.adimlar.map(satir))));
}

/** Koşu ayrıntısı açıldı: "Sonuçları incele" adımı işaretlenir (proje başına oturumda bir kez; hata yok sayılır). @param {{ id: string }} proje */
const incelenenler = new Set();
export function sonuclarIncelendi(proje) {
  if (!proje || incelenenler.has(proje.id)) return;
  incelenenler.add(proje.id);
  api('/platform/baslarken/kaydet', { govde: { projeId: proje.id, incelendi: true } }).catch(() => { incelenenler.delete(proje.id); });
}

/** Ayarlar > Arayüz: gizlenmiş listeyi geri getirir. @param {{ id: string }} proje @returns {Promise<Durum>} */
export async function baslarkeniYenidenGoster(proje) {
  const y = await api('/platform/baslarken/kaydet', { govde: { projeId: proje.id, gizli: false } });
  return /** @type {Durum} */ (y.baslarken);
}
