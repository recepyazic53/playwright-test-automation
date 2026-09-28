// YEDEK YÜKLEME UYARISI PENCERESİ — yedekten yükleme izinleri (Ayarlar > İzinler) yedektekiyle değiştirdiyse, Nöbetçi açıldığında
// (ana sayfa: ilk açılış / yeniden yükleme) bir kez gösterilir: açık izinler, kapalı olanlar ve ortamların türleri (Test / Canlı).
// Yedekteki izinler ve ortam türleri olduğu gibi geçerlidir; pencere yalnız bilgi verir. "Tamam" ya da "İzinlere git" bayrağı
// sunucuda siler (guvenlik/yedek-uyarisi.mjs): başka tarayıcıdan açan da görür, bir kez kapatılınca kimse için çıkmaz.
// Esc ile kapanmaz (bilerek bir düğme seçilir). Kullanıcı verisi DOM'a yalnız metin olarak yazılır (h(); innerHTML yok).
import { api, h, ikon } from './ortak.js';

/**
 * İzin cümlesi: "A, B açık; diğerleri kapalı." / "Tüm izinler kapalı." / "Tüm izinler açık."
 * @param {Array<{ etiket: string; acik: boolean }>} izinler
 */
export function izinCumlesi(izinler) {
  const acik = izinler.filter((x) => x.acik).map((x) => x.etiket);
  if (!acik.length) return 'Tüm izinler kapalı.';
  if (acik.length === izinler.length) return `${acik.join(', ')} açık (tüm izinler açık).`;
  return `${acik.join(', ')} açık; diğerleri kapalı.`;
}

/**
 * Ortam türü özeti: "Canlı: CANLI; Test: TEST; türü seçilmemiş: …" (birden çok projede ortam adı "Proje / Ortam").
 * Türü seçilmemiş ortam Canlı sayılır (güvenli taraf; guvenlik/ortam-riski.mjs).
 * @param {Array<{ projeId: string; proje: string; ad: string; riskli: boolean | null }>} ortamlar
 */
export function riskCumlesi(ortamlar) {
  if (!ortamlar.length) return 'Ortam yok.';
  const cokProje = new Set(ortamlar.map((o) => o.projeId)).size > 1;
  const ad = (/** @type {{ proje: string; ad: string }} */ o) => (cokProje ? `${o.proje} / ${o.ad}` : o.ad);
  const grup = (/** @type {boolean | null} */ r) => ortamlar.filter((o) => o.riskli === r).map(ad);
  const parcalar = [['Canlı', grup(true)], ['Test', grup(false)], ['türü seçilmemiş (Canlı sayılır)', grup(null)]]
    .filter(([, l]) => l.length).map(([e, l]) => `${e}: ${/** @type {string[]} */ (l).join(', ')}`);
  const metin = parcalar.join('; ');
  return `${metin.charAt(0).toLocaleUpperCase('tr-TR')}${metin.slice(1)}.`;
}

/**
 * Bayrak varsa pencereyi açar. Hata olursa sessizce geçer (bir sonraki açılışta yine denenir).
 * @param {{ izinlereGit: () => void }} s
 * @returns {Promise<boolean>} pencere gösterildi mi
 */
export async function yedekUyarisiniGoster(s) {
  let uyari = null;
  try { ({ uyari } = await api('/platform/yedek-uyarisi')); } catch { return false; }
  if (!uyari || document.querySelector('dialog.yedek-uyarisi')) return false;
  const tamam = h('button', { type: 'button', class: 'birincil' }, 'Tamam');
  const git = h('button', { type: 'button', class: 'hayalet' }, ikon('kilit'), 'İzinlere git');
  const diyalog = h('dialog', { class: 'onay-diyalogu yedek-uyarisi', 'aria-labelledby': 'yedek-uyarisi-basligi', 'aria-describedby': 'yedek-uyarisi-metni' },
    h('div', { class: 'diyalog-govde' },
      h('h2', { id: 'yedek-uyarisi-basligi' }, h('span', { class: 'diyalog-ikon', 'aria-hidden': 'true' }, ikon('uyari')), 'Yedek yüklendi'),
      h('p', { id: 'yedek-uyarisi-metni' }, 'Yedekteki izinler geçerli: ', h('b', { class: 'yedek-uyarisi-izinler' }, izinCumlesi(uyari.izinler)),
        ' Ayarlar > İzinler\'den gözden geçirin.'),
      h('p', { class: 'soluk kucuk yedek-uyarisi-riskler' }, 'Ortamların türleri (Test / Canlı) de yedektekiyle geçerli. ', riskCumlesi(uyari.ortamlar))),
    h('div', { class: 'diyalog-alt' }, git, tamam));
  const kapat = async (/** @type {boolean} */ izinlere) => {
    tamam.disabled = true;
    git.disabled = true;
    try { await api('/platform/yedek-uyarisi/kapat', { govde: {} }); } catch { /* bayrak kalır: sonraki açılışta yine gösterilir */ }
    diyalog.close();
    if (izinlere) s.izinlereGit();
  };
  tamam.addEventListener('click', () => { void kapat(false); });
  git.addEventListener('click', () => { void kapat(true); });
  diyalog.addEventListener('cancel', (o) => o.preventDefault());
  diyalog.addEventListener('close', () => diyalog.remove());
  document.body.append(diyalog);
  diyalog.showModal();
  tamam.focus();
  return true;
}
