// Ayarlar > İzinler — Nöbetçi'nin sizin adınıza yapabileceği işlemlerin açık / kapalı anahtarları (varsayılan KAPALI).
// Tüm metinler izin tanımlarından gelir (izin-tanimlari.mjs; sunucuyla ortak tek kaynak): başlık, açıklama, "?" açıklaması
// (neler yapabilir, nerelerde, hangi işlemlerde, riski ve kapalıyken), açma onayı ve kapalı izin uyarısı. Açmak kısa bir onay
// penceresi ister (ne yapar / riski); kapatmak serbesttir. Değişiklikler kasada saklanır ve "Son değişiklikler"de görünür.
// Kullanıcı verisi DOM'a yalnızca metin olarak yazılır (h(); innerHTML yok).
import { api, bildir, h, ikon, rozet, tarihMetni } from './ortak.js';
import { IZIN_TANIMLARI } from './izin-tanimlari.mjs';

let sayac = 0;

/** "?" açıklamasının gövdesi (tanımdan). @param {import('./izin-tanimlari.mjs').IzinTanimi} t */
function aciklamaGovdesi(t) {
  const liste = (/** @type {readonly string[]} */ ogeler) => h('ul', {}, ogeler.map((x) => h('li', {}, x)));
  return [
    h('h4', {}, 'Bu izin neler yapabilir?'), liste(t.yapabilecekleri),
    h('h4', {}, 'Nerelerde kullanılır?'), liste(t.yerler),
    h('h4', {}, 'Hangi işlemlerde kullanılır?'),
    h('ul', { class: 'izin-islemleri' }, t.islemler.map((i) => h('li', {}, i.ad, i.kosul ? h('small', { class: 'soluk' }, ` (${i.kosul})`) : null))),
    h('h4', {}, 'Riski'), h('p', {}, t.risk),
    h('h4', {}, 'Kapalıyken'), h('p', {}, t.kapaliyken)
  ];
}

/**
 * Tek izin satırı: başlık + "?" (tıklanır / klavye; Esc kapatır) + anahtar.
 * @param {import('./izin-tanimlari.mjs').IzinTanimi} t @param {boolean} acik @param {(anahtar: string, acik: boolean) => Promise<boolean>} degistir
 */
function izinSatiri(t, acik, degistir) {
  const no = ++sayac;
  const panelId = `izin-aciklama-${no}`;
  const anahtarId = `izin-anahtar-${no}`;
  const soru = h('button', {
    type: 'button', class: 'ikon-dugme izin-soru', 'aria-expanded': 'false', 'aria-controls': panelId,
    'aria-label': `"${t.etiket}" izni ne yapar?`, title: 'Bu izin ne yapar?'
  }, ikon('soru'));
  const panel = h('div', { id: panelId, class: 'izin-aciklama', role: 'region', 'aria-label': `${t.etiket}: açıklama`, hidden: true }, aciklamaGovdesi(t));
  const ac = (/** @type {boolean} */ goster) => {
    panel.hidden = !goster;
    soru.setAttribute('aria-expanded', String(goster));
  };
  soru.addEventListener('click', () => ac(panel.hidden));
  const escKapat = (/** @type {KeyboardEvent} */ o) => {
    if (o.key === 'Escape' && !panel.hidden) { o.preventDefault(); o.stopPropagation(); ac(false); soru.focus(); }
  };
  soru.addEventListener('keydown', escKapat);
  panel.addEventListener('keydown', escKapat);

  const girdi = h('input', { type: 'checkbox', id: anahtarId, role: 'switch', class: 'anahtar izin-anahtari', checked: acik, 'aria-describedby': `${panelId}-kisa` });
  const durum = rozet(acik ? 'Açık' : 'Kapalı', acik ? 'uyari' : '');
  const satir = h('li', { class: `izin-satiri ${acik ? 'acik' : ''}`, 'data-izin': t.anahtar },
    h('div', { class: 'izin-ust' },
      h('label', { class: 'izin-baslik', for: anahtarId }, ikon(acik ? 'kilit' : 'kalkan'), h('span', {}, t.etiket)),
      soru,
      h('span', { class: 'bosluk' }),
      durum,
      h('span', { class: 'anahtar-kap' }, girdi)),
    h('p', { class: 'soluk kucuk', id: `${panelId}-kisa` }, t.aciklama),
    h('p', { class: 'kucuk izin-risk' }, h('b', {}, 'Risk: '), t.risk),
    panel);
  girdi.addEventListener('change', async () => {
    const yeni = girdi.checked;
    girdi.disabled = true;
    const tamam = await degistir(t.anahtar, yeni).catch(() => false);
    girdi.disabled = false;
    if (!tamam) girdi.checked = !yeni;
  });
  return satir;
}

/**
 * Açma onayı: ne yapar / riski (tanımdan). @param {import('./izin-tanimlari.mjs').IzinTanimi} t @returns {Promise<boolean>}
 */
function acmaOnayi(t) {
  return new Promise((coz) => {
    const ac = h('button', { type: 'button', class: 'birincil' }, 'İzni aç');
    const vazgec = h('button', { type: 'button', class: 'hayalet' }, 'Vazgeç');
    const diyalog = h('dialog', { class: 'onay-diyalogu izin-onayi', 'aria-labelledby': 'izin-onay-basligi' },
      h('div', { class: 'diyalog-govde' },
        h('h2', { id: 'izin-onay-basligi' }, h('span', { class: 'diyalog-ikon', 'aria-hidden': 'true' }, ikon('uyari')), `"${t.etiket}" izni açılsın mı?`),
        h('p', {}, t.aciklama),
        h('h4', {}, 'Ne yapar?'), h('ul', { class: 'onay-listesi' }, t.yapabilecekleri.map((x) => h('li', {}, x))),
        h('div', { class: 'not-kutusu hata', role: 'note' }, h('strong', {}, 'Riski: '), t.risk),
        h('p', { class: 'soluk kucuk' }, 'İzni istediğiniz an kapatabilirsiniz. Mevcut işlem onayları (ör. canlı ortam onayı) izin açıkken de sorulur.')),
      h('div', { class: 'diyalog-alt' }, vazgec, ac));
    let sonuc = false;
    ac.addEventListener('click', () => { sonuc = true; diyalog.close(); });
    vazgec.addEventListener('click', () => diyalog.close());
    diyalog.addEventListener('close', () => { diyalog.remove(); coz(sonuc); });
    document.body.append(diyalog);
    diyalog.showModal();
    vazgec.focus();
  });
}

/** Son değişiklikler listesi. @param {any[]} kayitlar @param {Record<string, string>} makineler */
function degisiklikListesi(kayitlar, makineler) {
  if (!kayitlar.length) return h('p', { class: 'soluk kucuk' }, 'Henüz izin değişikliği yok. Tüm izinler kapalı başlar.');
  return h('ul', { class: 'izin-gecmisi' }, kayitlar.map((k) => {
    const at = k.yapan.indexOf('@');
    const yapan = at > 0 && makineler[k.yapan.slice(at + 1)] ? `${k.yapan.slice(0, at)} (${makineler[k.yapan.slice(at + 1)]})` : k.yapan;
    return h('li', {}, h('time', { datetime: k.zaman }, tarihMetni(k.zaman)), ' · ', h('b', {}, k.etiket), ' ',
      rozet(k.acik ? 'açıldı' : 'kapatıldı', k.acik ? 'uyari' : ''), h('span', { class: 'soluk' }, ` · ${yapan}`));
  }));
}

/**
 * Ayarlar > İzinler bölümü. baglam.odak: adresle gelen izin (#/ayarlar/izinler/<anahtar>) — satırına kaydırılır ve anahtar odaklanır.
 * @param {HTMLElement} govde @param {{ odak?: string | null }} baglam
 */
export async function izinlerBolumu(govde, baglam = {}) {
  let veri = await api('/platform/izinler');
  const liste = h('ul', { class: 'izin-listesi', 'aria-label': 'İzinler' });
  const gecmis = h('div', {});
  const ozet = h('p', { class: 'kucuk izin-ozeti', 'aria-live': 'polite' });
  const ciz = () => {
    ozet.textContent = `${Object.values(veri.izinler).filter(Boolean).length} / ${IZIN_TANIMLARI.length} izin açık.`;
    liste.replaceChildren(...IZIN_TANIMLARI.map((t) => izinSatiri(t, veri.izinler[t.anahtar] === true, degistir)));
    gecmis.replaceChildren(degisiklikListesi(veri.degisiklikler || [], veri.makineler || {}));
  };
  /** @param {string} anahtar @param {boolean} acik */
  const degistir = async (anahtar, acik) => {
    const t = IZIN_TANIMLARI.find((x) => x.anahtar === anahtar);
    if (!t) return false;
    if (acik && !(await acmaOnayi(t))) return false;
    try {
      const r = await api('/platform/izin/degistir', { govde: { anahtar, acik, ...(acik ? { onay: true } : {}) } });
      veri = { ...veri, izinler: r.izinler, degisiklikler: r.degisiklikler };
      bildir(`"${t.etiket}" izni ${acik ? 'açıldı' : 'kapatıldı'}.`);
      ciz();
      const yeni = liste.querySelector(`[data-izin="${anahtar}"] .izin-anahtari`);
      if (yeni instanceof HTMLElement) yeni.focus();
      return true;
    } catch (hata) {
      bildir(hata.message, 'hata');
      return false;
    }
  };
  ciz();
  govde.replaceChildren(
    h('div', { class: 'kart' },
      h('h3', {}, ikon('kalkan'), 'İzinler'),
      h('p', { class: 'soluk kucuk' }, 'Nöbetçi\'nin sizin adınıza yaptığı her işlem bir izne bağlıdır. İzinler varsayılan olarak kapalıdır; kapalı bir izne bağlı işlem denenirse yapılmaz ve buraya yönlendiren bir uyarı çıkar. Her iznin yanındaki "?" ne yaptığını, nerede kullanıldığını ve riskini anlatır.'),
      ozet,
      liste),
    h('div', { class: 'kart' }, h('h3', {}, ikon('tarih'), 'Son değişiklikler'), gecmis));
  const odak = baglam.odak ? liste.querySelector(`[data-izin="${CSS.escape(baglam.odak)}"]`) : null;
  if (odak instanceof HTMLElement) {
    odak.classList.add('vurgulu');
    odak.scrollIntoView({ block: 'center' });
    const a = odak.querySelector('.izin-anahtari');
    if (a instanceof HTMLElement) a.focus();
  }
}
