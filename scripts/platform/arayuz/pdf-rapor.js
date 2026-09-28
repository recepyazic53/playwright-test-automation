// "Rapor al (PDF)": dönem raporu (sonuclar/rapor-uclari.mjs). Diyalog: kapsam (bu aşamada Tek ekran / Tek servis; diğerleri görünür
// ama "yakında"), seçim, dönem (son 7 / 14 / 30 gün / özel aralık) + önceki eşit dönemle karşılaştırma (varsayılan açık), ortam
// (tümü ya da seçili), isteğe bağlı bölümler (ekran görüntüleri kapalı, hata ayrıntısı açık, ortam adresi kapalı), "Raporlar'a
// kaydet" (varsayılan açık). Önizleme betiksiz, korumalı bir iframe'dedir (sandbox=""; sunucunun tek kullanımlık önizleme adresi —
// html-rapor.js ile aynı). PDF sunucuda yerel Chromium ile basılır ve tarayıcıda indirilir (dosya adı sunucudan).
// "Raporlar" görünümü (Sonuçlar > Raporlar): kaydedilmiş raporlar; İndir (o günkü PDF'in aynısı), Aynı seçimlerle yeniden oluştur,
// Sil (onaylı). Kısayollar: Sonuçlar > Ekranlar / ekran sayfası, Servis sonuçları, Ekranlar > ekran, Servisler > servis.
import { TOKEN, alan, api, bildir, bosDurum, boyutMetni, h, ikon, rozet, tarihMetni, yeniKimlik, yerlestir } from './ortak.js';
import { onayIste } from './ekran-ortak.js';

/** Kapsam türleri: [değer, etiket, bu aşamada etkin mi]. */
const KAPSAMLAR = [
  ['ekran', 'Tek ekran', true], ['servis', 'Tek servis', true], ['coklu-ekran', 'Birden çok ekran', false],
  ['coklu-servis', 'Birden çok servis', false], ['karisik', 'Ekran + servis', false], ['genel', 'Genel', false]
];
const DONEMLER = [['son7', 'Son 7 gün'], ['son14', 'Son 14 gün'], ['son30', 'Son 30 gün'], ['ozel', 'Özel tarih aralığı']];
const ROZETLER = { saglikli: ['Sağlıklı', 'basari'], dikkat: ['Dikkat', 'atlanan'], kritik: ['Kritik', 'hata'] };
const KAPSAM_ETIKETI = { ekran: 'Tek ekran', servis: 'Tek servis' };
/** Kaydedilen rapor listesi değişti (diyalogdan kayıt): Raporlar görünümü kendini yeniler. */
export const RAPOR_OLAYI = 'nobetci-rapor-kaydedildi';

/** Yerel gün "YYYY-AA-GG". @param {Date} d */
const gunMetni = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/**
 * Tarayıcıda dosya indirir (sunucu diske yazmaz). @param {Blob} blob @param {string} ad
 */
function indir(blob, ad) {
  const url = URL.createObjectURL(blob);
  const a = h('a', { href: url, download: ad, hidden: true });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/**
 * PDF isteği (JSON gövde → application/pdf). Hata yanıtı JSON'dur.
 * @param {string} yol @param {Record<string, unknown> | null} govde
 * @returns {Promise<{ blob: Blob; ad: string; raporId: string }>}
 */
async function pdfAl(yol, govde) {
  const istek = govde
    ? { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Test-Sunucu-Token': TOKEN }, body: JSON.stringify({ ...govde, token: TOKEN }), cache: 'no-store' }
    : { headers: { 'X-Test-Sunucu-Token': TOKEN }, cache: 'no-store' };
  let y;
  try { y = await fetch(yol, istek); } catch { throw new Error('Sunucuya ulaşılamadı.'); }
  if (!y.ok || !(y.headers.get('content-type') || '').startsWith('application/pdf')) {
    let mesaj = `İstek başarısız oldu (${y.status}).`;
    try { const v = await y.json(); if (v && v.mesaj) mesaj = v.mesaj; } catch { /* JSON değil */ }
    if (y.status === 423) window.dispatchEvent(new CustomEvent('kasa-kilitli', { detail: mesaj }));
    throw new Error(mesaj);
  }
  return { blob: await y.blob(), ad: y.headers.get('x-dosya-adi') || 'nobetci-rapor.pdf', raporId: y.headers.get('x-rapor-id') || '' };
}

/**
 * "Rapor al (PDF)" düğmesi. on: kapsam ve seçim dolu gelir (kısayollar).
 * @param {{ id: string; ad: string }} proje @param {{ kapsam?: 'ekran' | 'servis'; id?: string }} [on] @param {string} [sinif]
 */
export function pdfRaporDugmesi(proje, on = {}, sinif = 'dugme hayalet') {
  return h('button', { type: 'button', class: `${sinif} pdf-rapor-dugmesi`, onclick: () => pdfRaporDiyalogu(proje, on) }, ikon('dosya'), 'Rapor al (PDF)');
}

/**
 * @param {{ id: string; ad: string }} proje @param {{ kapsam?: 'ekran' | 'servis'; id?: string }} [on]
 */
export function pdfRaporDiyalogu(proje, on = {}) {
  const ad = 'pdf-rapor-kapsam';
  const kapsamlar = KAPSAMLAR.map(([deger, etiket, etkin]) => {
    const girdi = h('input', { type: 'radio', name: ad, value: deger, id: yeniKimlik('pdf-kapsam'), disabled: !etkin, checked: deger === (on.kapsam || 'ekran') });
    return { girdi, satir: h('label', { class: `onay-satiri${etkin ? '' : ' pasif'}`, for: girdi.id }, girdi, h('span', {}, etiket, etkin ? null : h('span', { class: 'soluk kucuk' }, ' (yakında)'))) };
  });
  const secim = h('select', { id: yeniKimlik('pdf-secim') }, h('option', { value: '' }, 'Yükleniyor…'));
  const donem = h('select', { id: yeniKimlik('pdf-donem') }, DONEMLER.map(([d, e]) => h('option', { value: d, selected: d === 'son14' }, e)));
  const bugun = new Date();
  const baslangic = h('input', { type: 'date', id: yeniKimlik('pdf-bas'), value: gunMetni(new Date(bugun.getFullYear(), bugun.getMonth(), bugun.getDate() - 13)), max: gunMetni(bugun) });
  const bitis = h('input', { type: 'date', id: yeniKimlik('pdf-bit'), value: gunMetni(bugun), max: gunMetni(bugun) });
  const ozelAlan = h('div', { class: 'pdf-rapor-ozel', hidden: true }, alan('Başlangıç', baslangic), alan('Bitiş', bitis));
  const kutu = (etiket, acik, aciklama) => {
    const girdi = h('input', { type: 'checkbox', id: yeniKimlik('pdf-secenek'), checked: acik });
    return { girdi, satir: h('label', { class: 'onay-satiri', for: girdi.id }, girdi, h('span', {}, etiket, aciklama ? h('span', { class: 'soluk kucuk rapor-secenek-notu' }, aciklama) : null)) };
  };
  const karsilastir = kutu('Önceki eşit dönemle karşılaştır', true, 'Her sayı önceki dönemle ▲▼ farkıyla gösterilir.');
  const ortam = h('select', { id: yeniKimlik('pdf-ortam') }, h('option', { value: '' }, 'Tüm ortamlar'));
  const goruntu = kutu('Ekran görüntüleri', false, 'Son hatanın ekran görüntüsü kasadan çözülüp PDF\'e gömülür.');
  const hatalar = kutu('Hata ayrıntısı', true, 'Hata kalıpları, beklenen / görülen ve son hatanın ilk satırları (maskeli).');
  const adres = kutu('Ortam adresi', false, 'Kapalıyken hata metinlerindeki ortam adresi de gizlenir.');
  const kaydet = kutu('Raporlar\'a kaydet', true, 'PDF, Sonuçlar > Raporlar\'da şifreli saklanır (saklama süresi: Ayarlar > Yedekleme).');
  const bilgi = h('p', { class: 'soluk kucuk pdf-rapor-bilgi', role: 'status', 'aria-live': 'polite' }, '');
  const onizleme = h('iframe', { class: 'html-rapor-onizleme pdf-rapor-onizleme', title: 'Rapor önizlemesi', sandbox: '', referrerpolicy: 'no-referrer', hidden: true });
  const onizleDugmesi = h('button', { type: 'button' }, ikon('gorunum'), 'Önizle');
  const pdfDugmesi = h('button', { type: 'button', class: 'birincil' }, ikon('indir'), 'PDF indir');
  const kapat = h('button', { type: 'button', class: 'ikon-dugme hayalet', 'aria-label': 'Kapat' }, ikon('carpi'));
  const diyalog = h('dialog', { class: 'onay-diyalogu html-rapor-diyalogu pdf-rapor-diyalogu', 'aria-labelledby': 'pdf-rapor-basligi' },
    h('div', { class: 'diyalog-govde' },
      h('div', { class: 'diyalog-baslik-satiri' }, h('h2', { id: 'pdf-rapor-basligi' }, 'Rapor al (PDF)'), kapat),
      h('p', { class: 'soluk' }, 'Dönem raporu: güncel durum, ele alınması gerekenler, sorunlar ve eğilimleri. Rapor bu bilgisayarda üretilir; '
        + 'gizli değerler maskelenir, istek / yanıt gövdesi ve test verisi değerleri rapora girmez.'),
      h('fieldset', { class: 'html-rapor-secenekleri pdf-rapor-kapsam' }, h('legend', {}, 'Kapsam'), h('div', { class: 'pdf-rapor-kapsam-listesi' }, kapsamlar.map((k) => k.satir))),
      h('div', { class: 'pdf-rapor-alanlar' },
        alan('Seçim', secim), alan('Dönem', donem), alan('Ortam', ortam)),
      ozelAlan,
      karsilastir.satir,
      h('fieldset', { class: 'html-rapor-secenekleri' }, h('legend', {}, 'İsteğe bağlı bölümler'), goruntu.satir, hatalar.satir, adres.satir),
      kaydet.satir,
      bilgi,
      onizleme,
      h('div', { class: 'dugmeler' }, pdfDugmesi, onizleDugmesi, h('button', { type: 'button', class: 'hayalet', onclick: () => diyalog.close() }, 'Vazgeç'))));

  /** @type {{ ekranlar: Array<{ id: string; ad: string; devreDisi?: boolean }>; servisler: Array<{ id: string; ad: string }>; ortamlar: Array<{ id: string; ad: string }> } | null} */
  let secenekler = null;
  let seciliId = on.id || '';
  const kapsamDegeri = () => (kapsamlar.find((k) => k.girdi.checked)?.girdi.value) || 'ekran';
  const secimiCiz = () => {
    if (!secenekler) return;
    const liste = kapsamDegeri() === 'servis' ? secenekler.servisler : secenekler.ekranlar;
    if (!liste.some((x) => x.id === seciliId)) seciliId = liste[0] ? liste[0].id : '';
    secim.replaceChildren(...(liste.length ? liste.map((x) => h('option', { value: x.id, selected: x.id === seciliId }, x.ad)) : [h('option', { value: '' }, kapsamDegeri() === 'servis' ? 'Servis yok' : 'Ekran yok')]));
    secim.closest('.alan').querySelector('label').textContent = kapsamDegeri() === 'servis' ? 'Servis' : 'Ekran';
  };
  const girdi = () => ({
    projeId: proje.id, kapsam: kapsamDegeri(), id: secim.value,
    donem: donem.value === 'ozel' ? { tur: 'ozel', baslangic: baslangic.value, bitis: bitis.value } : { tur: donem.value },
    karsilastir: karsilastir.girdi.checked, ortamId: ortam.value || null,
    secenekler: { goruntuler: goruntu.girdi.checked, hatalar: hatalar.girdi.checked, adres: adres.girdi.checked }
  });
  const dogrula = () => {
    if (!secim.value) return 'Önce bir ekran ya da servis seçin.';
    if (donem.value === 'ozel' && (!baslangic.value || !bitis.value)) return 'Özel aralık için başlangıç ve bitiş seçin.';
    if (donem.value === 'ozel' && bitis.value < baslangic.value) return 'Bitiş, başlangıçtan önce olamaz.';
    return '';
  };
  let sira = 0;
  const mesgul = (/** @type {boolean} */ m) => { onizleDugmesi.disabled = m; pdfDugmesi.disabled = m; diyalog.setAttribute('aria-busy', m ? 'true' : 'false'); };
  onizleDugmesi.addEventListener('click', async () => {
    const hata = dogrula();
    if (hata) { bilgi.textContent = hata; return; }
    const benim = ++sira;
    mesgul(true);
    bilgi.textContent = 'Önizleme hazırlanıyor…';
    try {
      const r = await api('/platform/rapor/onizle', { govde: girdi() });
      if (benim !== sira) return;
      onizleme.hidden = false;
      onizleme.src = `/platform/sonuclar/html-rapor/onizleme/${encodeURIComponent(r.onizlemeId)}?token=${encodeURIComponent(TOKEN)}`;
      const r2 = ROZETLER[r.rozet?.durum] || ROZETLER.dikkat;
      bilgi.textContent = `Önizleme hazır · Durum: ${r2[0]} · Dosya: ${r.dosyaAdi} · HTML ${boyutMetni(r.boyut)}`;
    } catch (e) {
      if (benim === sira) bilgi.textContent = `Önizleme hazırlanamadı: ${e.message || e}`;
    } finally { if (benim === sira) mesgul(false); }
  });
  pdfDugmesi.addEventListener('click', async () => {
    const hata = dogrula();
    if (hata) { bilgi.textContent = hata; return; }
    const benim = ++sira;
    mesgul(true);
    bilgi.textContent = 'PDF hazırlanıyor (yerel tarayıcı motoruyla)…';
    try {
      const r = await pdfAl('/platform/rapor/pdf', { ...girdi(), kaydet: kaydet.girdi.checked });
      if (benim !== sira) return;
      indir(r.blob, r.ad);
      bilgi.textContent = `İndirildi: ${r.ad} (${boyutMetni(r.blob.size)})${r.raporId ? ' · Raporlar\'a kaydedildi' : ''}`;
      bildir(r.raporId ? 'Rapor indirildi ve Raporlar\'a kaydedildi.' : 'Rapor indirildi.');
      if (r.raporId) window.dispatchEvent(new CustomEvent(RAPOR_OLAYI));
    } catch (e) {
      if (benim === sira) bilgi.textContent = `PDF hazırlanamadı: ${e.message || e}`;
    } finally { if (benim === sira) mesgul(false); }
  });
  for (const k of kapsamlar) k.girdi.addEventListener('change', () => { seciliId = ''; secimiCiz(); });
  secim.addEventListener('change', () => { seciliId = secim.value; });
  donem.addEventListener('change', () => { ozelAlan.hidden = donem.value !== 'ozel'; });
  kapat.addEventListener('click', () => diyalog.close());
  diyalog.addEventListener('close', () => { sira++; diyalog.remove(); });
  document.body.append(diyalog);
  diyalog.showModal();
  mesgul(true);
  api(`/platform/rapor/secenekler?projeId=${encodeURIComponent(proje.id)}`).then((s) => {
    secenekler = s;
    ortam.replaceChildren(h('option', { value: '' }, 'Tüm ortamlar'), ...s.ortamlar.map((o) => h('option', { value: o.id }, o.ad)));
    secimiCiz();
    mesgul(false);
  }).catch((e) => { bilgi.textContent = `Seçenekler alınamadı: ${e.message || e}`; });
  return diyalog;
}

// ---------------------------------------------------------------------------------------
// Sonuçlar > Raporlar (kaydedilmiş PDF raporları)
// ---------------------------------------------------------------------------------------

/**
 * @param {HTMLElement} icerik @param {{ id: string; ad: string }} proje @param {HTMLElement | null} [ust] sekmeler
 */
export async function raporlarGorunumu(icerik, proje, ust = null) {
  const liste = h('div', { class: 'pdf-raporlar-listesi', 'aria-live': 'polite' });
  const baslik = h('div', { class: 'sayfa-basligi' },
    h('div', {},
      h('div', { class: 'kirinti' }, h('span', {}, proje.ad), h('span', { 'aria-hidden': 'true' }, '/'), h('a', { href: '#/sonuclar' }, 'Sonuçlar'),
        h('span', { 'aria-hidden': 'true' }, '/'), h('span', { class: 'simdiki' }, 'Raporlar')),
      h('div', { class: 'baslik-satiri' }, h('h2', { tabindex: '-1' }, 'Raporlar')),
      h('p', { class: 'soluk' }, 'Kaydedilen PDF raporları. İndirilen dosya o gün üretilen PDF\'in aynısıdır; saklama süresi Ayarlar > Yedekleme\'dedir.')),
    h('div', { class: 'eylemler' }, pdfRaporDugmesi(proje, {}, 'dugme birincil')));
  yerlestir(icerik, baslik, ust, liste);
  const yenile = async () => {
    liste.setAttribute('aria-busy', 'true');
    try {
      const r = await api(`/platform/raporlar?projeId=${encodeURIComponent(proje.id)}`);
      ciz(r.raporlar || []);
    } catch (e) {
      if (!(e && e.durum === 423)) yerlestir(liste, h('div', { class: 'not-kutusu hata', role: 'alert' }, `Raporlar alınamadı: ${e.message || e}`));
    } finally { liste.removeAttribute('aria-busy'); }
  };
  const ciz = (raporlar) => {
    if (!raporlar.length) {
      yerlestir(liste, bosDurum('Henüz kaydedilmiş rapor yok.', '"Rapor al (PDF)" ile bir ekranın ya da servisin dönem raporunu alın; "Raporlar\'a kaydet" açıksa burada listelenir.',
        { ikon: 'dosya', eylem: pdfRaporDugmesi(proje, {}, 'dugme birincil') }));
      return;
    }
    yerlestir(liste, h('div', { class: 'kart' }, h('div', { class: 'tablo-kaydirma' }, h('table', { class: 'tablo pdf-raporlar-tablosu' },
      h('caption', { class: 'gorunmez' }, 'Kaydedilen raporlar'),
      h('thead', {}, h('tr', {}, ['Oluşturulma', 'Kapsam · seçim', 'Dönem', 'Ortam', 'Durum', 'Oluşturan', 'İşlemler'].map((x) => h('th', { scope: 'col' }, x)))),
      h('tbody', {}, raporlar.map((r) => satir(r)))))));
  };
  const satir = (r) => {
    const m = r.meta || {};
    const rz = ROZETLER[m.rozet] || null;
    const indirDugmesi = h('button', { type: 'button', class: 'kucuk-dugme', disabled: !r.dosyaVar, title: r.dosyaVar ? null : 'PDF dosyası bu bilgisayarda yok' }, ikon('indir'), 'İndir');
    const yeniden = h('button', { type: 'button', class: 'kucuk-dugme' }, ikon('yenile'), 'Aynı seçimlerle yeniden oluştur');
    const sil = h('button', { type: 'button', class: 'kucuk-dugme tehlike-metin' }, ikon('cop'), 'Sil');
    const secimAdi = m.secim && m.secim.ad ? m.secim.ad : '—';
    indirDugmesi.addEventListener('click', async () => {
      indirDugmesi.disabled = true;
      try {
        const p = await pdfAl(`/platform/rapor/indir?projeId=${encodeURIComponent(proje.id)}&id=${encodeURIComponent(r.id)}`, null);
        indir(p.blob, p.ad);
      } catch (e) { bildir(`İndirilemedi: ${e.message || e}`, 'hata'); } finally { indirDugmesi.disabled = false; }
    });
    yeniden.addEventListener('click', async () => {
      yeniden.disabled = true;
      try {
        await api('/platform/rapor/yeniden', { govde: { projeId: proje.id, id: r.id } });
        bildir('Rapor aynı seçimlerle, dönem bugüne kaydırılarak yeniden oluşturuldu.');
        await yenile();
      } catch (e) { bildir(`Yeniden oluşturulamadı: ${e.message || e}`, 'hata'); yeniden.disabled = false; }
    });
    sil.addEventListener('click', async () => {
      const tamam = await onayIste({ baslik: 'Rapor silinsin mi?', metin: `${KAPSAM_ETIKETI[m.kapsam] || 'Rapor'} · ${secimAdi} (${tarihMetni(r.olusturulma)}) kalıcı olarak silinir; şifreli PDF dosyası da silinir.`, dugme: 'Sil', tehlikeli: true });
      if (!tamam) return;
      try {
        await api('/platform/rapor/sil', { govde: { projeId: proje.id, id: r.id, onay: true } });
        bildir('Rapor silindi.');
        await yenile();
      } catch (e) { bildir(`Silinemedi: ${e.message || e}`, 'hata'); }
    });
    return h('tr', {},
      h('td', { class: 'mono' }, tarihMetni(r.olusturulma)),
      h('td', {}, h('b', {}, KAPSAM_ETIKETI[m.kapsam] || m.kapsam || '—'), ' · ', secimAdi),
      h('td', {}, m.donem && m.donem.etiket ? `${m.donem.etiket} (${m.donem.gun} gün)` : '—', m.karsilastir === false ? h('span', { class: 'soluk kucuk' }, ' · karşılaştırmasız') : null),
      h('td', {}, m.ortam && m.ortam.ad ? m.ortam.ad : 'Tüm ortamlar'),
      h('td', {}, rz ? rozet(rz[0], rz[1]) : '—'),
      h('td', {}, r.olusturan || '—'),
      h('td', {}, h('span', { class: 'satir-eylemleri pdf-rapor-eylemleri' }, indirDugmesi, yeniden, sil)));
  };
  const dinleyici = () => { if (icerik.isConnected) yenile(); else window.removeEventListener(RAPOR_OLAYI, dinleyici); };
  window.addEventListener(RAPOR_OLAYI, dinleyici);
  await yenile();
}
