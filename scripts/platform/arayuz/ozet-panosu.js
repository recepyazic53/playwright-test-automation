// ÖZET PANOSU (Sonuçlar > Genel > Özet). Kartlar 12 sütunlu ızgarada durur; düzen PROJE BAŞINA kasada saklanır (GET /platform/pano,
// POST /platform/pano/kaydet; sonuclar/ozet-panosu.mjs). Varsayılan düzen bugünkü Özet'tir. Düzen kuralları (boyutlar, kart türleri,
// doğrulama, kaldır / ekle / taşı / boyutlandır) sunucuyla ORTAK saf modüldedir (pano-duzeni.mjs).
//   "Panoyu düzenle" → düzenleme kipi: her kartın üstünde tutamak (sürükle-bırak; odaktayken ↑ ↓ tuşları), ↑ / ↓ düğmeleri, boyut
//   seçimi, Düzenle (kullanıcı kartı) ve Kaldır (×). Üstte "Kart ekle", "Varsayılana dön", "Vazgeç", "Bitti". Değişiklikler "Bitti"ye
//   basınca kaydedilir; "Vazgeç" kayıtlı düzene döner. Düzenleme kipinde değilken pano yalnız kartları gösterir.
//   Kart türleri: yerleşik (sonuc-ozeti.js üretir), SQL sorgusu, Nöbetçi verisi (hazır şablonlar), metin ve bağlantılar.
// SQL KARTI: sorgu YALNIZ "Yenile"ye basınca çalışır (sayfa açılınca ya da aralıklı çalışmaz); kartın üstünde "Son veri: gg.aa.yyyy
//   ss:dd" (hiç alınmadıysa "Henüz yenilenmedi"). Son (maskeli) sonuç sunucuda önbellektedir. CANLI ortama ait bağlantıda ilk "Yenile"
//   standart CANLI penceresini açar (ortak.js > api); onay bu oturumda o kart için hatırlanır.
// DOM'a yalnız metin yazılır (h(); innerHTML yok); bağlantılar yalnız Nöbetçi içi adreslere (#/…) gider.
import { api, bildir, degisiklikleriBirak, alan, h, ikon, kayitIzi, mesgulIken, rozet, s, yeniKimlik, yerlestir } from './ortak.js';
import {
  BOYUTLAR, ESIK_ISLECLERI, ESIK_RENKLERI, EN_COK_BAGLANTI, EN_COK_ESIK, IC_SAYFALAR, OZEL_KART_TURLERI, SQL_GORUNUMLERI, VERI_SABLONLARI,
  eksikYerlesikler, esikRengi, kartAdi, kartAyarla, kartBoyutla, kartEkle, kartKaldir, kartTasi, kartTemizle, sayiyaCevir, turAdi,
  varsayilanDuzen, varsayilanMi, yerlesikMi
} from './pano-duzeni.mjs';
import { oranSaglikSinifi } from './sonuclar.js';

const SQL_UCU = '/platform/pano/sql/yenile';
/** Liste kartında görünen en çok madde. */
const LISTE_ILK = 10;
/** CANLI onayı verilmiş SQL kartları (bu sayfa oturumunda; kart hedefi / sorgusu değişince yeniden sorulur). @type {Set<string>} */
const canliOnaylari = new Set();

/** @param {unknown} v */
const kopya = (v) => JSON.parse(JSON.stringify(v));
/** @param {number} n */
const iki = (n) => String(n).padStart(2, '0');
/** "02.10.2026 14:35" (yerel saat). @param {string} iso */
export function sonVeriMetni(iso) {
  const t = new Date(iso);
  if (Number.isNaN(t.getTime())) return '—';
  return `${iki(t.getDate())}.${iki(t.getMonth() + 1)}.${t.getFullYear()} ${iki(t.getHours())}:${iki(t.getMinutes())}`;
}
/** @param {unknown} v */
const hucreMetni = (v) => (v === null || v === undefined ? '' : typeof v === 'number' ? v.toLocaleString('tr-TR') : String(v));

/**
 * Panoyu kurar.
 * @param {HTMLElement} kap
 * @param {{ proje: { id: string; ad: string }; yerlesik: Record<string, () => HTMLElement>; eylemler: HTMLElement; altAdres: string }} s0
 */
export function ozetPanosu(kap, s0) {
  const { proje, yerlesik, eylemler } = s0;
  /** @type {{ duzen: any; sqlSonuclari: Record<string, any> }} */
  let kayitli = { duzen: varsayilanDuzen(), sqlSonuclari: {} };
  /** @type {any} */
  let calisan = null;
  let duzenleniyor = false;
  /** @type {Map<string, { sar: HTMLElement; icerik: HTMLElement; imza: string }>} */
  const ogeler = new Map();
  /** @type {Promise<any> | null} */
  let secenekSozu = null;
  const secenekler = () => {
    secenekSozu ??= api(`/platform/pano/secenekler?projeId=${encodeURIComponent(proje.id)}`).catch((e) => { secenekSozu = null; throw e; });
    return secenekSozu;
  };

  const duyuru = h('div', { class: 'gorunmez', 'aria-live': 'polite', role: 'status' });
  const duyur = (m) => { duyuru.textContent = ''; requestAnimationFrame(() => { duyuru.textContent = m; }); };
  const pano = h('div', { class: 'ozet-panosu', role: 'list', 'aria-label': 'Özet panosu' });
  const yardimId = yeniKimlik('pano-yardim');
  const cubuk = h('div', { class: 'pano-duzen-cubugu', hidden: true, role: 'region', 'aria-label': 'Pano düzenleme' });
  const bosNot = h('div', { class: 'pano-bos', hidden: true });
  yerlestir(kap, cubuk, duyuru, bosNot, pano);

  const duzenleDugmesi = h('button', { type: 'button', class: 'pano-duzenle-dugmesi', title: 'Kartları ekleyin, kaldırın, taşıyın ya da boyutlandırın (proje için saklanır)' },
    ikon('izgara'), 'Panoyu düzenle');
  duzenleDugmesi.addEventListener('click', () => duzenlemeyiAc());
  yerlestir(eylemler, duzenleDugmesi);

  const etkinDuzen = () => (duzenleniyor ? calisan : kayitli.duzen);
  const degisti = () => { kayitIzi.kirli = true; };

  // ---- Düzenleme çubuğu -------------------------------------------------------------------------------------------------
  const kartEkleDugmesi = h('button', { type: 'button', class: 'pano-kart-ekle' }, ikon('arti'), 'Kart ekle');
  const varsayilanDugmesi = h('button', { type: 'button', class: 'hayalet pano-varsayilan' }, ikon('geri'), 'Varsayılana dön');
  const vazgecDugmesi = h('button', { type: 'button', class: 'hayalet pano-vazgec' }, 'Vazgeç');
  const bittiDugmesi = h('button', { type: 'button', class: 'birincil pano-bitti' }, ikon('onay'), 'Bitti');
  cubuk.append(
    h('div', { class: 'pano-duzen-metni' }, h('strong', {}, 'Pano düzenleniyor'),
      h('span', { id: yardimId, class: 'soluk kucuk' }, 'Kartı tutamaktan (⠿) sürükleyin ya da tutamak seçiliyken ↑ ↓ tuşlarıyla taşıyın. Değişiklikler "Bitti"ye basınca kaydedilir.')),
    h('div', { class: 'dugmeler' }, kartEkleDugmesi, varsayilanDugmesi, vazgecDugmesi, bittiDugmesi));
  kartEkleDugmesi.addEventListener('click', () => kartEklePenceresi());
  varsayilanDugmesi.addEventListener('click', () => {
    calisan = varsayilanDuzen();
    degisti();
    ciz();
    duyur('Varsayılan düzen yüklendi. Kaydetmek için "Bitti"ye basın.');
    bildir('Varsayılan düzen yüklendi; kaydetmek için "Bitti"ye basın.');
  });
  vazgecDugmesi.addEventListener('click', () => { degisiklikleriBirak(); duzenlemeyiKapat(); duyur('Değişiklikler geri alındı.'); });
  bittiDugmesi.addEventListener('click', async () => {
    if (JSON.stringify(calisan) === JSON.stringify(kayitli.duzen)) { degisiklikleriBirak(); duzenlemeyiKapat(); return; }
    try {
      const y = await mesgulIken(bittiDugmesi, 'Kaydediliyor…', () => api('/platform/pano/kaydet', { govde: { projeId: proje.id, duzen: calisan } }));
      kayitli = { duzen: y.duzen, sqlSonuclari: y.sqlSonuclari || {} };
      degisiklikleriBirak();
      duzenlemeyiKapat();
      bildir('Pano kaydedildi.');
    } catch (e) {
      if (!(e && e.durum === 423)) bildir(e && e.message ? e.message : String(e), 'hata');
    }
  });

  function duzenlemeyiAc() {
    if (duzenleniyor) return;
    calisan = kopya(kayitli.duzen);
    duzenleniyor = true;
    ciz();
    kartEkleDugmesi.focus();
    duyur('Düzenleme kipi açıldı.');
  }
  function duzenlemeyiKapat() {
    duzenleniyor = false;
    calisan = null;
    if (/^#\/sonuclar\/ozet\/(duzenle|kart-ekle)$/.test(location.hash)) history.replaceState(null, '', '#/sonuclar/ozet');
    ciz();
    duzenleDugmesi.focus();
  }

  // ---- Çizim ------------------------------------------------------------------------------------------------------------
  /** @param {{ id: string; rol: string } | null} [odak] */
  function ciz(odak = null) {
    const duzen = etkinDuzen();
    pano.classList.toggle('duzenleniyor', duzenleniyor);
    cubuk.hidden = !duzenleniyor;
    duzenleDugmesi.hidden = duzenleniyor;
    const n = duzen.kartlar.length;
    yerlestir(pano, ...duzen.kartlar.map((k, i) => ogeHazirla(k, i, n)));
    bosNot.hidden = n > 0;
    yerlestir(bosNot, ...(n ? [] : [h('p', { class: 'soluk' }, ikon('izgara'), duzenleniyor
      ? 'Panoda kart yok. "Kart ekle" ile kart ekleyin ya da "Varsayılana dön"e basın.'
      : 'Panoda kart yok. "Panoyu düzenle" ile kart ekleyebilirsiniz.')]));
    varsayilanDugmesi.disabled = duzenleniyor && varsayilanMi(calisan);
    if (odak) {
      const el = /** @type {HTMLElement | null} */ (pano.querySelector(`[data-kart-id="${CSS.escape(odak.id)}"] [data-rol="${odak.rol}"]`));
      if (el && !(/** @type {HTMLButtonElement} */ (el).disabled)) el.focus();
      else /** @type {HTMLElement | null} */ (pano.querySelector(`[data-kart-id="${CSS.escape(odak.id)}"] [data-rol="tutamak"]`))?.focus();
    }
  }

  /** Kartın sarmalayıcısı (içerik değişmediyse önceki öğe yeniden kullanılır; veri yeniden istenmez). */
  function ogeHazirla(k, i, n) {
    const imza = `${k.tur}:${JSON.stringify(k.ayar ?? null)}`;
    let o = ogeler.get(k.id);
    if (!o || o.imza !== imza) {
      const icerik = h('div', { class: 'pano-icerik' }, ...kartIcerigi(k));
      o = { sar: h('div', { class: 'pano-ogesi', role: 'listitem', 'data-kart-id': k.id, 'data-kart-tur': k.tur }, icerik), icerik, imza };
      ogeler.set(k.id, o);
      suruklemeBagla(o.sar, k.id);
    }
    o.sar.className = `pano-ogesi boyut-${k.boyut}`;
    o.sar.querySelector(':scope > .pano-arac-cubugu')?.remove();
    if (duzenleniyor) o.sar.prepend(aracCubugu(k, i, n));
    return o.sar;
  }

  /** @returns {Node[]} */
  function kartIcerigi(k) {
    if (yerlesikMi(k.tur)) {
      const el = yerlesik[k.tur] ? yerlesik[k.tur]() : h('p', { class: 'soluk' }, turAdi(k.tur));
      // Başlarken tamamlanınca / gizlenince kaybolur; düzenleme kipinde yerini gösteren not.
      return k.tur === 'baslarken'
        ? [el, h('p', { class: 'pano-gizli-not soluk kucuk' }, ikon('gorunum'), 'Başlarken listesi bu projede şu an görünmüyor (tamamlandı ya da gizlendi).')]
        : [el];
    }
    if (k.tur === 'sql') return [sqlKarti(k)];
    if (k.tur === 'veri') return [veriKarti(k)];
    return [metinKarti(k)];
  }

  /** Düzenleme kipinde kartın üstündeki araçlar. */
  function aracCubugu(k, i, n) {
    const ad = kartAdi(k);
    const tutamak = h('button', { type: 'button', class: 'pano-tutamak hayalet kucuk-dugme', 'data-rol': 'tutamak', 'aria-label': `Taşı: ${ad}`,
      'aria-describedby': yardimId, title: 'Sürükleyin ya da ↑ ↓ tuşlarıyla taşıyın' }, h('span', { 'aria-hidden': 'true' }, '⠿'));
    tutamak.addEventListener('keydown', (o) => {
      if (o.key === 'ArrowUp' || o.key === 'ArrowDown') { o.preventDefault(); tasi(k.id, o.key === 'ArrowUp' ? 'yukari' : 'asagi', 'tutamak'); }
    });
    tutamak.addEventListener('pointerdown', () => { const sar = ogeler.get(k.id)?.sar; if (sar) sar.draggable = true; });
    const yukari = h('button', { type: 'button', class: 'hayalet kucuk-dugme', 'data-rol': 'yukari', 'aria-label': `Yukarı taşı: ${ad}`, disabled: i === 0 },
      h('span', { 'aria-hidden': 'true' }, '↑'));
    const asagi = h('button', { type: 'button', class: 'hayalet kucuk-dugme', 'data-rol': 'asagi', 'aria-label': `Aşağı taşı: ${ad}`, disabled: i === n - 1 },
      h('span', { 'aria-hidden': 'true' }, '↓'));
    yukari.addEventListener('click', () => tasi(k.id, 'yukari', 'yukari'));
    asagi.addEventListener('click', () => tasi(k.id, 'asagi', 'asagi'));
    const boyut = h('select', { class: 'pano-boyut', 'aria-label': `Boyut: ${ad}`, 'data-rol': 'boyut' },
      BOYUTLAR.map((b) => h('option', { value: b.anahtar, selected: b.anahtar === k.boyut }, b.ad)));
    boyut.addEventListener('change', () => {
      calisan = kartBoyutla(calisan, k.id, boyut.value);
      degisti();
      ciz({ id: k.id, rol: 'boyut' });
      duyur(`${ad}: boyut ${BOYUTLAR.find((b) => b.anahtar === boyut.value)?.ad ?? ''}.`);
    });
    const kaldir = h('button', { type: 'button', class: 'hayalet kucuk-dugme pano-kaldir', 'data-rol': 'kaldir', 'aria-label': `Kaldır: ${ad}`, title: 'Panodan kaldır ("Kart ekle"den geri eklenebilir)' },
      ikon('carpi'));
    kaldir.addEventListener('click', () => {
      calisan = kartKaldir(calisan, k.id);
      degisti();
      const sonraki = calisan.kartlar[Math.min(i, calisan.kartlar.length - 1)];
      ciz(sonraki ? { id: sonraki.id, rol: 'kaldir' } : null);
      if (!sonraki) kartEkleDugmesi.focus();
      duyur(`${ad} panodan kaldırıldı. "Kart ekle"den geri ekleyebilirsiniz.`);
    });
    const duzenle = yerlesikMi(k.tur) ? null : h('button', { type: 'button', class: 'hayalet kucuk-dugme pano-kart-duzenle', 'data-rol': 'duzenle', 'aria-label': `Düzenle: ${ad}` },
      ikon('duzenle'), 'Düzenle');
    duzenle?.addEventListener('click', () => kartPenceresi(k));
    return h('div', { class: 'pano-arac-cubugu' }, tutamak, h('span', { class: 'pano-kart-adi', title: ad }, ad),
      h('span', { class: 'pano-araclar' }, yukari, asagi, boyut, duzenle, kaldir));
  }

  /** @param {string} id @param {number | 'yukari' | 'asagi'} hedef @param {string} rol */
  function tasi(id, hedef, rol) {
    const once = calisan.kartlar.findIndex((k) => k.id === id);
    calisan = kartTasi(calisan, id, hedef);
    const sonra = calisan.kartlar.findIndex((k) => k.id === id);
    if (once === sonra) return;
    degisti();
    ciz({ id, rol });
    const k = calisan.kartlar[sonra];
    duyur(`${kartAdi(k)} ${sonra + 1}. sıraya taşındı (${calisan.kartlar.length} kart).`);
  }

  /** Sürükle-bırak (yalnız düzenleme kipinde; sürükleme tutamaktan başlar). */
  function suruklemeBagla(sar, id) {
    sar.addEventListener('dragstart', (o) => {
      if (!duzenleniyor) { o.preventDefault(); return; }
      o.dataTransfer?.setData('text/plain', id);
      if (o.dataTransfer) o.dataTransfer.effectAllowed = 'move';
      sar.classList.add('surukleniyor');
    });
    sar.addEventListener('dragend', () => {
      sar.draggable = false;
      sar.classList.remove('surukleniyor');
      for (const x of pano.querySelectorAll('.birakma-hedefi')) x.classList.remove('birakma-hedefi');
    });
  }
  pano.addEventListener('dragover', (o) => {
    if (!duzenleniyor) return;
    const hedef = /** @type {HTMLElement | null} */ (/** @type {HTMLElement} */ (o.target).closest?.('.pano-ogesi'));
    if (!hedef) return;
    o.preventDefault();
    for (const x of pano.querySelectorAll('.birakma-hedefi')) if (x !== hedef) x.classList.remove('birakma-hedefi');
    hedef.classList.add('birakma-hedefi');
  });
  pano.addEventListener('drop', (o) => {
    if (!duzenleniyor) return;
    const hedef = /** @type {HTMLElement | null} */ (/** @type {HTMLElement} */ (o.target).closest?.('.pano-ogesi'));
    const id = o.dataTransfer?.getData('text/plain') || pano.querySelector('.surukleniyor')?.getAttribute('data-kart-id') || '';
    if (!hedef || !id) return;
    o.preventDefault();
    const j = calisan.kartlar.findIndex((k) => k.id === hedef.dataset.kartId);
    if (j >= 0) tasi(id, j, 'tutamak');
  });

  // ---- Kart ekle / düzenle penceresi -----------------------------------------------------------------------------------
  function kartEklePenceresi() { kartPenceresi(null); }

  /** @param {any} mevcut düzenlenen kullanıcı kartı (null: yeni kart) */
  function kartPenceresi(mevcut) {
    const baslikId = yeniKimlik('pano-pencere');
    const hataKutusu = h('div', { class: 'not-kutusu hata', role: 'alert', hidden: true });
    const hataGoster = (m) => { hataKutusu.textContent = m || ''; hataKutusu.hidden = !m; };
    const alanKap = h('div', { class: 'pano-form' });
    const tamam = h('button', { type: 'submit', class: 'birincil' }, ikon(mevcut ? 'onay' : 'arti'), mevcut ? 'Uygula' : 'Panoya ekle');
    const vazgec = h('button', { type: 'button', class: 'hayalet' }, 'Vazgeç');
    /** @type {() => Promise<any>} */
    let topla = async () => null;
    let tur = mevcut ? mevcut.tur : 'yerlesik';
    const turlar = [['yerlesik', 'Yerleşik kartlar'], ...OZEL_KART_TURLERI.map((t) => [t.tur, t.ad])];
    const turSecimi = mevcut ? null : h('fieldset', { class: 'pano-tur-secimi' }, h('legend', {}, 'Kart türü'),
      ...turlar.map(([a, etiket]) => {
        const r = h('input', { type: 'radio', name: `${baslikId}-tur`, value: a, checked: a === tur });
        r.addEventListener('change', () => { if (r.checked) { tur = a; turuCiz(); } });
        return h('label', { class: 'pano-tur' }, r, etiket);
      }));
    const form = h('form', { method: 'dialog', novalidate: true },
      h('div', { class: 'diyalog-govde' },
        h('h2', { id: baslikId }, h('span', { class: 'diyalog-ikon', 'aria-hidden': 'true' }, ikon(mevcut ? 'duzenle' : 'arti')),
          mevcut ? `Kartı düzenle: ${kartAdi(mevcut)}` : 'Kart ekle'),
        turSecimi, alanKap, hataKutusu),
      h('div', { class: 'diyalog-alt' }, vazgec, tamam));
    const diyalog = h('dialog', { class: 'onay-diyalogu genis-onay pano-penceresi', 'aria-labelledby': baslikId }, form);

    const ekleVeKapat = (kart) => {
      const ad = kartAdi(kart);
      calisan = mevcut ? kartAyarla(calisan, mevcut.id, kart.ayar) : kartEkle(calisan, kart);
      degisti();
      diyalog.close();
      ciz({ id: mevcut ? mevcut.id : kart.id || kart.tur, rol: mevcut ? 'duzenle' : 'tutamak' });
      duyur(mevcut ? `${ad} güncellendi.` : `${ad} panoya eklendi.`);
    };

    function turuCiz() {
      hataGoster('');
      tamam.hidden = tur === 'yerlesik';
      if (tur === 'yerlesik') {
        const eksik = eksikYerlesikler(calisan);
        yerlestir(alanKap, eksik.length
          ? h('ul', { class: 'pano-yerlesik-listesi' }, eksik.map((y) => {
            const ekle = h('button', { type: 'button', class: 'kucuk-dugme', 'aria-label': `Ekle: ${y.ad}` }, ikon('arti'), 'Ekle');
            ekle.addEventListener('click', () => ekleVeKapat({ tur: y.tur, boyut: y.boyut }));
            return h('li', {}, h('div', {}, h('strong', {}, y.ad), h('p', { class: 'soluk kucuk' }, y.aciklama)), ekle);
          }))
          : h('p', { class: 'soluk' }, 'Bütün yerleşik kartlar panoda. Kaldırdığınız kartlar burada listelenir.'));
        topla = async () => null;
        return;
      }
      yerlestir(alanKap, h('div', { class: 'iskelet', 'aria-busy': 'true' }, h('span', { class: 'gorunmez', role: 'status' }, 'Yükleniyor…'), h('i', {}), h('i', { class: 'yarim' })));
      const ayar = mevcut ? mevcut.ayar : null;
      const sec = tur === 'metin' ? Promise.resolve(null) : secenekler();
      sec.then((se) => {
        if (tur === 'sql') topla = sqlFormu(alanKap, ayar, se, mevcut);
        else if (tur === 'veri') topla = veriFormu(alanKap, ayar, se);
        else topla = metinFormu(alanKap, ayar);
      }).catch((e) => { if (!(e && e.durum === 423)) yerlestir(alanKap, h('div', { class: 'not-kutusu hata', role: 'alert' }, e && e.message ? e.message : String(e))); });
    }

    form.addEventListener('submit', async (o) => {
      o.preventDefault();
      if (tur === 'yerlesik' || tamam.disabled) return;
      hataGoster('');
      try {
        const ayar = await mesgulIken(tamam, 'Denetleniyor…', () => topla());
        if (!ayar) return;
        const kart = kartTemizle({ id: mevcut ? mevcut.id : `k-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`, tur,
          boyut: mevcut ? mevcut.boyut : OZEL_KART_TURLERI.find((t) => t.tur === tur)?.boyut, ayar });
        ekleVeKapat(kart);
      } catch (e) {
        if (e && e.durum === 423) { diyalog.close(); return; }
        hataGoster(e && e.message ? e.message : String(e));
      }
    });
    vazgec.addEventListener('click', () => diyalog.close());
    diyalog.addEventListener('close', () => diyalog.remove());
    document.body.append(diyalog);
    turuCiz();
    diyalog.showModal();
    (/** @type {HTMLElement | null} */ (diyalog.querySelector('input[type="radio"]:checked, input, select, textarea')))?.focus();
  }

  // ---- Kullanıcı kartı formları (dönen işlev ayarı toplar; hatalıysa Error fırlatır) -------------------------------------
  /** @returns {() => Promise<any>} */
  function sqlFormu(kapsayici, ayar, se, mevcut) {
    const a = ayar || {};
    const baslik = h('input', { type: 'text', maxlength: 80, value: a.baslik || '', autocomplete: 'off' });
    const hedefDegeri = a.hedef ? (a.hedef.veritabaniId ? `v:${a.hedef.veritabaniId}:${a.hedef.ortamId}` : `b:${a.hedef.baglantiId}`) : '';
    const hedef = h('select', {},
      h('option', { value: '' }, 'Bağlantı seçin'),
      se.veritabanlari.length ? h('optgroup', { label: 'Veritabanları (ortama göre)' }, se.veritabanlari.flatMap((v) => v.ortamlar.map((o) => h('option', {
        value: `v:${v.id}:${o.id}`, selected: hedefDegeri === `v:${v.id}:${o.id}` }, `${v.ad} · ${o.ad}${o.canli ? ' (CANLI ortam)' : ''}`)))) : null,
      se.baglantilar.length ? h('optgroup', { label: 'Veritabanı bağlantıları' }, se.baglantilar.map((b) => h('option', {
        value: `b:${b.id}`, selected: hedefDegeri === `b:${b.id}` }, `${b.ad} (${b.surucu})${b.canli ? ' · CANLI ortam' : ''}${b.etkin ? '' : ' · kapalı'}`))) : null);
    const sorgu = h('textarea', { rows: 6, class: 'mono pano-sorgu', spellcheck: 'false', maxlength: 20000 });
    sorgu.value = a.sorgu || '';
    const gorunum = h('select', {}, SQL_GORUNUMLERI.map((g) => h('option', { value: g.anahtar, selected: g.anahtar === (a.gorunum || 'sayi') }, g.ad)));
    const sutunlar = h('input', { type: 'text', value: (a.sutunlar || []).join(', '), autocomplete: 'off' });
    const bilinen = mevcut && kayitli.sqlSonuclari[mevcut.id] ? kayitli.sqlSonuclari[mevcut.id].sutunlar : null;
    // Renk eşikleri (yalnız "Tek sayı"): ilk eşleşen uygulanır.
    const esikListesi = h('div', { class: 'pano-esikler' });
    const esikEkle = h('button', { type: 'button', class: 'kucuk-dugme hayalet' }, ikon('arti'), 'Eşik ekle');
    const esikSatiri = (e = { islec: '>', deger: '', renk: 'kirmizi' }) => {
      const islec = h('select', { 'aria-label': 'Eşik işleci' }, ESIK_ISLECLERI.map((x) => h('option', { value: x, selected: x === e.islec }, x)));
      const deger = h('input', { type: 'text', inputmode: 'decimal', value: String(e.deger ?? ''), 'aria-label': 'Eşik değeri', size: 8 });
      const renk = h('select', { 'aria-label': 'Eşik rengi' }, ESIK_RENKLERI.map((r) => h('option', { value: r.anahtar, selected: r.anahtar === e.renk }, r.ad)));
      const sil = h('button', { type: 'button', class: 'hayalet kucuk-dugme', 'aria-label': 'Eşiği kaldır' }, ikon('carpi'));
      const satir = h('div', { class: 'pano-esik-satiri' }, h('span', { class: 'soluk kucuk' }, 'Değer'), islec, deger, h('span', { class: 'soluk kucuk' }, 'ise'), renk, sil);
      sil.addEventListener('click', () => { satir.remove(); esikEkle.disabled = esikListesi.children.length >= EN_COK_ESIK; });
      esikListesi.append(satir);
      esikEkle.disabled = esikListesi.children.length >= EN_COK_ESIK;
    };
    for (const e of a.esikler || []) esikSatiri(e);
    esikEkle.addEventListener('click', () => esikSatiri());
    const esikAlani = h('fieldset', { class: 'pano-esik-alani' }, h('legend', {}, 'Renk eşikleri'),
      h('p', { class: 'soluk kucuk' }, 'Tek sayı için: ilk tutan eşiğin rengi uygulanır (ör. değer > 0 ise kırmızı).'), esikListesi, esikEkle);
    const sutunYardimi = () => (gorunum.value === 'sayi' ? 'Değerin sütunu (boşsa ilk sütun).' : gorunum.value === 'tablo' ? 'Gösterilecek sütunlar, virgülle (boşsa tümü).'
      : 'Önce etiket, sonra değer sütunu, virgülle (boşsa ilk iki sütun).');
    const sutunAlani = alan('Sütunlar', sutunlar, { yardim: `${sutunYardimi()}${bilinen && bilinen.length ? ` Son sonuçtaki sütunlar: ${bilinen.join(', ')}.` : ''}` });
    const yardimYaz = () => {
      const y = sutunAlani.querySelector('.yardim');
      if (y) y.textContent = `${sutunYardimi()}${bilinen && bilinen.length ? ` Son sonuçtaki sütunlar: ${bilinen.join(', ')}.` : ''}`;
      esikAlani.hidden = gorunum.value !== 'sayi';
    };
    gorunum.addEventListener('change', yardimYaz);
    const bos = !se.veritabanlari.length && !se.baglantilar.length;
    yerlestir(kapsayici, 
      bos ? h('div', { class: 'not-kutusu uyari' }, 'Bu projede henüz veritabanı bağlantısı yok. ', h('a', { href: '#/ayarlar/entegrasyonlar' }, 'Ayarlar > Entegrasyonlar'),
        '\'dan "Veritabanı bağlantısı" ekleyin.') : null,
      alan('Kart başlığı', baslik, { zorunlu: true }),
      alan('Veritabanı bağlantısı', hedef, { zorunlu: true, yardim: 'Nöbetçi\'de tanımlı bağlantılar (Ayarlar > Entegrasyonlar). CANLI ortama ait bağlantıda ilk "Yenile" onay ister.' }),
      alan('Sorgu', sorgu, { zorunlu: true, yardim: `Yalnız okuma: tek SELECT ya da WITH … SELECT (INSERT, UPDATE, DELETE, DROP, EXEC ve ";" ile birden çok ifade reddedilir). Sorgu yalnız "Yenile"ye basınca çalışır; en çok ${se.sinirlar?.zamanAsimiSn ?? 15} sn ve ${se.sinirlar?.satirSiniri ?? 500} satır. Gizli adlı sütunlar (T.C. kimlik, kart, IBAN, parola…) maskelenir.` }),
      alan('Görünüm', gorunum),
      sutunAlani,
      esikAlani);
    yardimYaz();
    return async () => {
      const [t, x, y] = hedef.value.split(':');
      const ayarYeni = {
        baslik: baslik.value.trim(), sorgu: sorgu.value, gorunum: gorunum.value,
        hedef: t === 'v' ? { veritabaniId: x, ortamId: y } : t === 'b' ? { baglantiId: x } : null,
        sutunlar: sutunlar.value.split(',').map((m) => m.trim()).filter(Boolean),
        esikler: gorunum.value === 'sayi' ? [...esikListesi.children].map((satir) => {
          const [islec, renk] = [...satir.querySelectorAll('select')].map((x2) => /** @type {HTMLSelectElement} */ (x2).value);
          return { islec, deger: /** @type {HTMLInputElement} */ (satir.querySelector('input')).value.trim(), renk };
        }) : []
      };
      if (!ayarYeni.baslik) throw new Error('Kart başlığı boş olamaz.');
      if (!ayarYeni.hedef) throw new Error('SQL kartı için bir veritabanı bağlantısı seçin.');
      // Yalnız okuma kuralı sunucuda denetlenir (bağlantı açılmaz): kaydetmeden önce uyarı.
      await api('/platform/pano/sql/denetle', { govde: { projeId: proje.id, sorgu: ayarYeni.sorgu } });
      return ayarYeni;
    };
  }

  /** @returns {() => Promise<any>} */
  function veriFormu(kapsayici, ayar, se) {
    const a = ayar || {};
    const sablon = h('select', {}, VERI_SABLONLARI.map((t) => h('option', { value: t.anahtar, selected: t.anahtar === (a.sablon || VERI_SABLONLARI[0].anahtar) }, t.ad)));
    const baslik = h('input', { type: 'text', maxlength: 80, value: a.baslik || '', autocomplete: 'off', placeholder: 'Boşsa şablonun adı' });
    const aciklama = h('p', { class: 'soluk kucuk' });
    const parametreKap = h('div', { class: 'pano-parametreler' });
    /** @type {Map<string, HTMLInputElement | HTMLSelectElement>} */
    let girdiler = new Map();
    const parametreleriCiz = () => {
      const t = VERI_SABLONLARI.find((x) => x.anahtar === sablon.value) || VERI_SABLONLARI[0];
      aciklama.textContent = t.aciklama;
      const eski = a.sablon === t.anahtar ? a.parametreler || {} : {};
      girdiler = new Map();
      yerlestir(parametreKap, ...t.parametreler.map((p) => {
        let g;
        if (p.tur === 'hedef') {
          g = h('select', {}, h('option', { value: '' }, 'Seçin'), se.hedefler.map((x) => h('option', { value: x.deger, selected: x.deger === eski[p.ad] }, x.ad)));
        } else if (p.tur === 'sayi') {
          g = h('input', { type: 'number', min: p.en, max: p.enCok, step: 1, value: String(eski[p.ad] ?? p.varsayilan) });
        } else {
          g = h('select', {}, (p.secenekler || []).map(([d, e]) => h('option', { value: d, selected: d === (eski[p.ad] ?? p.varsayilan) }, e)));
        }
        girdiler.set(p.ad, g);
        return alan(p.etiket, g, { zorunlu: p.tur === 'hedef' });
      }));
    };
    sablon.addEventListener('change', parametreleriCiz);
    yerlestir(kapsayici, alan('Şablon', sablon, { zorunlu: true }), aciklama, parametreKap, alan('Kart başlığı', baslik));
    parametreleriCiz();
    return async () => ({
      sablon: sablon.value, baslik: baslik.value.trim(),
      parametreler: Object.fromEntries([...girdiler].map(([ad, g]) => [ad, g.value]))
    });
  }

  /** @returns {() => Promise<any>} */
  function metinFormu(kapsayici, ayar) {
    const a = ayar || {};
    const baslik = h('input', { type: 'text', maxlength: 80, value: a.baslik || '', autocomplete: 'off' });
    const not = h('textarea', { rows: 4, maxlength: 1000 });
    not.value = a.not || '';
    const liste = h('div', { class: 'pano-baglanti-listesi' });
    const ekle = h('button', { type: 'button', class: 'kucuk-dugme hayalet' }, ikon('arti'), 'Bağlantı ekle');
    const satirEkle = (b = { etiket: '', adres: IC_SAYFALAR[0][1] }) => {
      const adres = h('select', { 'aria-label': 'Bağlantının sayfası' }, IC_SAYFALAR.map(([e, d]) => h('option', { value: d, selected: d === b.adres }, e)),
        IC_SAYFALAR.some(([, d]) => d === b.adres) ? null : h('option', { value: b.adres, selected: true }, b.adres));
      const etiket = h('input', { type: 'text', maxlength: 60, value: b.etiket, 'aria-label': 'Bağlantı metni', placeholder: 'Bağlantı metni' });
      const sil = h('button', { type: 'button', class: 'hayalet kucuk-dugme', 'aria-label': 'Bağlantıyı kaldır' }, ikon('carpi'));
      const satir = h('div', { class: 'pano-baglanti-satiri' }, adres, etiket, sil);
      adres.addEventListener('change', () => { if (!etiket.value.trim()) etiket.value = adres.selectedOptions[0]?.textContent || ''; });
      sil.addEventListener('click', () => { satir.remove(); ekle.disabled = liste.children.length >= EN_COK_BAGLANTI; });
      liste.append(satir);
      ekle.disabled = liste.children.length >= EN_COK_BAGLANTI;
    };
    for (const b of a.baglantilar || []) satirEkle(b);
    ekle.addEventListener('click', () => satirEkle());
    yerlestir(kapsayici, alan('Kart başlığı', baslik, { zorunlu: true }), alan('Not', not, { yardim: 'En çok 1000 karakter.' }),
      h('fieldset', { class: 'pano-baglanti-alani' }, h('legend', {}, 'Bağlantılar (Nöbetçi içindeki sayfalar)'), liste, ekle));
    return async () => ({
      baslik: baslik.value.trim(), not: not.value,
      baglantilar: [...liste.children].map((satir) => ({
        adres: /** @type {HTMLSelectElement} */ (satir.querySelector('select')).value,
        etiket: /** @type {HTMLInputElement} */ (satir.querySelector('input')).value.trim() || /** @type {HTMLSelectElement} */ (satir.querySelector('select')).selectedOptions[0]?.textContent || ''
      }))
    });
  }

  // ---- Kullanıcı kartları -----------------------------------------------------------------------------------------------
  /** SQL kartı: yalnız "Yenile"ye basınca çalışır; son sonuç ve alındığı saat üstte. */
  function sqlKarti(k) {
    const a = k.ayar;
    const basId = yeniKimlik('pano-sql');
    const sonVeri = h('p', { class: 'pano-son-veri' });
    const govde = h('div', { class: 'pano-sql-govde' });
    const durum = h('div', { class: 'pano-durum soluk kucuk', role: 'status' });
    const hata = h('div', { class: 'not-kutusu hata', role: 'alert', hidden: true });
    const hedefRozeti = h('span', { class: 'pano-hedef' });
    const yenile = h('button', { type: 'button', class: 'kucuk-dugme pano-yenile', 'aria-label': `Yenile: ${a.baslik}`, title: 'Sorguyu şimdi çalıştır' }, ikon('yenile'), 'Yenile');
    const onayAnahtari = `${proje.id}:${k.id}:${JSON.stringify([a.hedef, a.sorgu])}`;
    const sonucCiz = (sonuc) => {
      if (!sonuc) {
        yerlestir(sonVeri, ikon('saat'), 'Henüz yenilenmedi');
        yerlestir(govde, h('p', { class: 'soluk kucuk pano-bos-sonuc' }, 'Sorgu yalnız "Yenile"ye basınca çalışır; son sonuç burada saklanır.'));
        return;
      }
      yerlestir(sonVeri, ikon('saat'), `Son veri: ${sonVeriMetni(sonuc.zaman)}`,
        sonuc.kesildi ? h('span', { class: 'pano-kesildi' }, ` · ilk ${Number(sonuc.satirSiniri || sonuc.satirlar.length).toLocaleString('tr-TR')} satır`) : null);
      yerlestir(govde, sonucGorunumu(a, sonuc));
    };
    sonucCiz(kayitli.sqlSonuclari[k.id]);
    secenekler().then((se) => {
      const h0 = a.hedef || {};
      if (h0.veritabaniId) {
        const v = se.veritabanlari.find((x) => x.id === h0.veritabaniId);
        const o = v && v.ortamlar.find((x) => x.id === h0.ortamId);
        yerlestir(hedefRozeti, rozet(v ? `${v.ad}${o ? ` · ${o.ad}` : ''}` : 'bağlantı bulunamadı', v ? '' : 'hata', { kisalt: true }), o && o.canli ? rozet('CANLI ortam', 'hata') : null);
      } else {
        const b = se.baglantilar.find((x) => x.id === h0.baglantiId);
        yerlestir(hedefRozeti, rozet(b ? b.ad : 'bağlantı bulunamadı', b ? '' : 'hata', { kisalt: true }), b && b.canli ? rozet('CANLI ortam', 'hata') : null);
      }
    }).catch(() => { /* rozet olmadan da kart çalışır */ });
    yenile.addEventListener('click', async () => {
      hata.hidden = true;
      govde.classList.add('yenileniyor');
      yerlestir(durum, h('span', { class: 'donen-kucuk', 'aria-hidden': 'true' }), 'Sorgu çalışıyor…');
      try {
        const y = await mesgulIken(yenile, 'Yenileniyor…', () => api(SQL_UCU, {
          govde: { projeId: proje.id, kartId: k.id, ...(canliOnaylari.has(onayAnahtari) ? { canliOnay: true } : {}) }
        }));
        // Onay (CANLI ortamda) bu oturumda bu kart için hatırlanır; CANLI değilse zararsızdır.
        canliOnaylari.add(onayAnahtari);
        kayitli.sqlSonuclari[k.id] = y.sonuc;
        sonucCiz(y.sonuc);
        yerlestir(durum, `Güncellendi (${y.sonuc.satirlar.length.toLocaleString('tr-TR')} satır).`);
      } catch (e) {
        yerlestir(durum);
        if (e && e.durum === 423) return;
        hata.textContent = e && e.message ? e.message : String(e);
        hata.hidden = false;
      } finally {
        govde.classList.remove('yenileniyor');
      }
    });
    return h('section', { class: 'kart pano-karti pano-sql-karti', 'aria-labelledby': basId },
      h('div', { class: 'kart-basligi' }, h('h3', { id: basId }, ikon('veri'), a.baslik), h('span', { class: 'sag pano-kart-sag' }, hedefRozeti, yenile)),
      sonVeri, durum, hata, govde);
  }

  /** Nöbetçi verisi kartı: sayfa açılınca Nöbetçi'nin kendi verisinden hesaplanır (dış istek yok). */
  function veriKarti(k) {
    const a = k.ayar;
    const basId = yeniKimlik('pano-veri');
    const govde = h('div', { class: 'pano-veri-govde' }, h('div', { class: 'iskelet', 'aria-busy': 'true' },
      h('span', { class: 'gorunmez', role: 'status' }, 'Yükleniyor…'), h('i', {}), h('i', { class: 'yarim' })));
    const sorgu = new URLSearchParams({ projeId: proje.id, sablon: a.sablon, p: JSON.stringify(a.parametreler || {}) });
    api(`/platform/pano/veri?${sorgu}`).then(({ sonuc }) => {
      if (sonuc.tur === 'sayi') {
        const sinif = sonuc.deger === null ? '' : `saglik-${oranSaglikSinifi(sonuc.deger)}`;
        const deger = h('strong', { class: 'pano-sayi-deger' }, sonuc.deger === null ? '—' : `${sonuc.birim}${Math.round(sonuc.deger).toLocaleString('tr-TR')}`);
        yerlestir(govde, sonuc.adres
          ? h('a', { class: `pano-sayi ${sinif}`, href: sonuc.adres }, deger, h('span', { class: 'pano-sayi-alt' }, sonuc.alt))
          : h('div', { class: `pano-sayi ${sinif}` }, deger, h('span', { class: 'pano-sayi-alt' }, sonuc.alt)));
        return;
      }
      if (!sonuc.toplam) { yerlestir(govde, h('p', { class: 'farkindalik-temiz', role: 'status' }, ikon('onay'), sonuc.bos)); return; }
      yerlestir(govde, 
        h('ul', { class: 'farkindalik-listesi' }, sonuc.maddeler.slice(0, LISTE_ILK).map((m) => h('li', {}, h('a', { href: m.adres, class: 'farkindalik-maddesi' },
          h('span', { class: 'farkindalik-adi' }, m.ad), h('span', { class: 'farkindalik-ayrintisi' }, m.ayrinti))))),
        sonuc.toplam > LISTE_ILK ? h('p', { class: 'soluk kucuk' }, `İlk ${LISTE_ILK} gösteriliyor (toplam ${sonuc.toplam.toLocaleString('tr-TR')}).`) : null);
    }).catch((e) => {
      if (e && e.durum === 423) return;
      yerlestir(govde, h('div', { class: 'not-kutusu hata', role: 'alert' }, e && e.message ? e.message : String(e)));
    });
    return h('section', { class: 'kart pano-karti pano-veri-karti', 'aria-labelledby': basId },
      h('div', { class: 'kart-basligi' }, h('h3', { id: basId }, ikon('grafik'), a.baslik)), govde);
  }

  /** Metin / bağlantı kartı. */
  function metinKarti(k) {
    const a = k.ayar;
    const basId = yeniKimlik('pano-metin');
    return h('section', { class: 'kart pano-karti pano-metin-karti', 'aria-labelledby': basId },
      h('div', { class: 'kart-basligi' }, h('h3', { id: basId }, ikon('dosya'), a.baslik)),
      a.not ? h('p', { class: 'pano-not' }, a.not) : null,
      a.baglantilar && a.baglantilar.length ? h('ul', { class: 'pano-baglantilar' }, a.baglantilar.map((b) => h('li', {}, h('a', { href: b.adres }, ikon('ok'), b.etiket)))) : null);
  }

  // ---- Yükleme ----------------------------------------------------------------------------------------------------------
  pano.append(h('div', { class: 'iskelet pano-iskelet', 'aria-busy': 'true' }, h('span', { class: 'gorunmez', role: 'status' }, 'Yükleniyor…'), h('i', {}), h('i', { class: 'yarim' })));
  api(`/platform/pano?projeId=${encodeURIComponent(proje.id)}`).then((y) => {
    kayitli = { duzen: y.duzen, sqlSonuclari: y.sqlSonuclari || {} };
  }).catch((e) => {
    if (e && e.durum === 423) return;
    bildir(`Pano düzeni okunamadı; varsayılan düzen gösteriliyor (${e && e.message ? e.message : String(e)}).`, 'hata');
  }).finally(() => {
    ciz();
    if (s0.altAdres === 'duzenle' || s0.altAdres === 'kart-ekle') {
      duzenlemeyiAc();
      if (s0.altAdres === 'kart-ekle') kartEklePenceresi();
    }
  });
}

// ---- SQL sonucu görünümleri ----------------------------------------------------------------------------------------------
/** Seçilen sütunların sıraları (adı bulunamayan atlanır; hiçbiri yoksa boş). @param {string[]} secili @param {string[]} sutunlar */
function sutunSiralari(secili, sutunlar) {
  return (secili || []).map((ad) => sutunlar.findIndex((x) => x.toLocaleLowerCase('tr') === ad.toLocaleLowerCase('tr'))).filter((i) => i >= 0);
}

/** @param {any} a kart ayarı @param {any} sonuc */
function sonucGorunumu(a, sonuc) {
  const { sutunlar, satirlar } = sonuc;
  const gizli = new Set(sonuc.gizliSutunlar || []);
  const secili = sutunSiralari(a.sutunlar, sutunlar);
  if (!sutunlar.length) return h('p', { class: 'soluk kucuk' }, 'Sorgu sütun döndürmedi.');
  if (a.gorunum === 'sayi') {
    const i = secili.length ? secili[0] : 0;
    const ham = satirlar.length ? satirlar[0][i] : null;
    const n = gizli.has(sutunlar[i]) ? null : sayiyaCevir(ham);
    const renk = n === null ? null : esikRengi(n, a.esikler || []);
    return h('div', { class: `pano-sayi${renk ? ` esik-${renk}` : ''}` },
      h('strong', { class: 'pano-sayi-deger' }, satirlar.length ? (n !== null ? n.toLocaleString('tr-TR') : hucreMetni(ham)) : '—'),
      h('span', { class: 'pano-sayi-alt' }, satirlar.length ? sutunlar[i] : 'Sorgu satır döndürmedi'),
      renk ? h('span', { class: 'gorunmez' }, ` (eşik: ${ESIK_RENKLERI.find((r) => r.anahtar === renk)?.ad ?? renk})`) : null);
  }
  if (!satirlar.length) return h('p', { class: 'soluk kucuk' }, 'Sorgu satır döndürmedi.');
  if (a.gorunum === 'tablo') {
    const siralar = secili.length ? secili : sutunlar.map((_, i) => i);
    return h('div', { class: 'tablo-kaydirma pano-tablo', tabindex: '0', role: 'region', 'aria-label': `${a.baslik} sonucu` },
      h('table', { class: 'ozet-tablosu' },
        h('thead', {}, h('tr', {}, siralar.map((i) => h('th', { scope: 'col' }, sutunlar[i], gizli.has(sutunlar[i]) ? [' ', ikon('kilit'), h('span', { class: 'gorunmez' }, '(maskeli)')] : null)))),
        h('tbody', {}, satirlar.map((r) => h('tr', {}, siralar.map((i) => h('td', {}, hucreMetni(r[i]))))))));
  }
  // Grafik: etiket + değer sütunu (seçilmediyse ilk sütun etiket, ilk sayısal diğer sütun değer).
  const etiketI = secili.length ? secili[0] : 0;
  const degerI = secili.length > 1 ? secili[1] : sutunlar.findIndex((_, i) => i !== etiketI && satirlar.some((r) => sayiyaCevir(r[i]) !== null));
  if (degerI < 0) return h('p', { class: 'soluk kucuk' }, 'Grafik için sayısal bir değer sütunu bulunamadı ("Sütunlar"da etiket ve değer sütununu yazın).');
  const noktalar = satirlar.slice(0, 60).map((r) => ({ etiket: hucreMetni(r[etiketI]), deger: sayiyaCevir(r[degerI]) ?? 0 }));
  return grafik(a, noktalar, sutunlar[degerI]);
}

/** Basit SVG çubuk / çizgi grafik (etiketler altta). @param {any} a @param {Array<{ etiket: string; deger: number }>} noktalar @param {string} degerAdi */
function grafik(a, noktalar, degerAdi) {
  const G = 600; const Y = 200; const sol = 40; const alt = 34; const ust = 10;
  const enCok = Math.max(0, ...noktalar.map((n) => n.deger));
  const enAz = Math.min(0, ...noktalar.map((n) => n.deger));
  const aralik = enCok - enAz || 1;
  const y = (v) => ust + (Y - ust - alt) * (1 - (v - enAz) / aralik);
  const adim = (G - sol - 8) / Math.max(1, noktalar.length);
  const x = (i) => sol + adim * i + adim / 2;
  const svg = s('svg', { viewBox: `0 0 ${G} ${Y}`, class: `pano-grafik ${a.gorunum}`, role: 'img', 'aria-label': `${a.baslik}: ${degerAdi}, ${noktalar.length} değer`, preserveAspectRatio: 'none' },
    s('line', { x1: sol, y1: y(0), x2: G - 4, y2: y(0), class: 'eksen' }),
    s('text', { x: sol - 6, y: ust + 8, class: 'eksen-yazi', 'text-anchor': 'end' }, enCok.toLocaleString('tr-TR')),
    s('text', { x: sol - 6, y: y(0), class: 'eksen-yazi', 'text-anchor': 'end', 'dominant-baseline': 'middle' }, '0'));
  if (a.gorunum === 'cubuk') {
    for (const [i, n] of noktalar.entries()) {
      const g = Math.max(2, adim * 0.66);
      svg.append(s('rect', { x: x(i) - g / 2, y: Math.min(y(n.deger), y(0)), width: g, height: Math.max(1, Math.abs(y(0) - y(n.deger))), class: 'cubuk', rx: 2 },
        s('title', {}, `${n.etiket}: ${n.deger.toLocaleString('tr-TR')}`)));
    }
  } else {
    svg.append(s('polyline', { points: noktalar.map((n, i) => `${x(i)},${y(n.deger)}`).join(' '), class: 'cizgi', fill: 'none' }));
    for (const [i, n] of noktalar.entries()) svg.append(s('circle', { cx: x(i), cy: y(n.deger), r: 3.5, class: 'nokta' }, s('title', {}, `${n.etiket}: ${n.deger.toLocaleString('tr-TR')}`)));
  }
  const etiketAdimi = Math.ceil(noktalar.length / 12);
  for (const [i, n] of noktalar.entries()) {
    if (i % etiketAdimi) continue;
    svg.append(s('text', { x: x(i), y: Y - alt + 16, class: 'eksen-yazi', 'text-anchor': 'middle' }, n.etiket.length > 10 ? `${n.etiket.slice(0, 9)}…` : n.etiket));
  }
  // Ekran okuyucu için değerler (görsel olarak gizli liste).
  return h('figure', { class: 'pano-grafik-kap' }, svg,
    h('figcaption', { class: 'gorunmez' }, noktalar.map((n) => `${n.etiket}: ${n.deger.toLocaleString('tr-TR')}`).join('; ')));
}
