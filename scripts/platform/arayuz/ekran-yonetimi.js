// Ekran yönetimi (Ekranlar > ekran kartı ve ayrıntı başlığındaki ⋯ menüsü):
//   Yeniden adlandır (görünen ad + açıklama; ekran anahtarı değişmez) · Düzenle (URL yolu → yeni model sürümü) ·
//   Yukarı / Aşağı taşı (sol listelerdeki sıra) · Devre dışı bırak / Etkinleştir · Sil (kalıcı; sayfa içi onay: ekran adını
//   yazın, sayılar, "Geçmiş sonuçları da sil", "Bu ekranın test kodu da projeden kaldırılsın" + tam dosya listesi) ·
//   Silinmiş ekranı geri yükle. Sunucu tarafı: scripts/platform/ekranlar/ekran-yonetimi.mjs.
// Kullanıcı verisi DOM'a yalnızca metin olarak yazılır (h(); innerHTML yok).
import { api, bildir, h, ikon, mesgulIken, rozet, yeniKimlik } from './ortak.js';

const GOSTER_ANAHTARI = 'platform.devreDisiEkranlar';
/** "Devre dışı ekranları göster" (tarayıcıda hatırlanır; Ekranlar ve Senaryolar sol listeleri ortak). */
export function devreDisiGoster() {
  try { return localStorage.getItem(GOSTER_ANAHTARI) === '1'; } catch { return false; }
}
export function devreDisiGosterAyarla(acik) {
  try { localStorage.setItem(GOSTER_ANAHTARI, acik ? '1' : '0'); } catch { /* yok sayılır */ }
}

/** Sol listenin altındaki "Devre dışı ekranları göster" anahtarı. sayi: devre dışı ekran sayısı (0 ise gösterilmez). */
export function devreDisiAnahtari(sayi, degisti) {
  if (!sayi) return null;
  const kutu = h('input', { type: 'checkbox', class: 'anahtar', role: 'switch', checked: devreDisiGoster(), id: yeniKimlik('devre-disi') });
  kutu.addEventListener('change', () => { devreDisiGosterAyarla(kutu.checked); degisti(kutu.checked); });
  return h('label', { class: 'devre-disi-anahtari', for: kutu.id }, kutu, h('span', {}, 'Devre dışı ekranları göster', h('small', {}, ` (${sayi})`)));
}

/** Görünümü yeniden çizer (geçerli adres). */
export const yenile = () => window.dispatchEvent(new HashChangeEvent('hashchange'));

const hata = (e) => { if (e && e.durum !== 423) bildir(e.message, 'hata'); };

/**
 * Modal form diyaloğu (Enter = birincil; Escape = vazgeç). Döner: { diyalog, hataGoster, kapat }.
 * @param {{ baslik: string; aciklama?: string; ikonAd: string; govde: Node[]; dugme: string; tehlikeli?: boolean; gonder: (dugme: HTMLButtonElement) => Promise<boolean | void> }} s
 */
function formDiyalogu(s) {
  const baslikId = yeniKimlik('ekran-diyalog');
  const hataKutusu = h('div', { class: 'not-kutusu hata', role: 'alert', hidden: true });
  const tamam = h('button', { type: 'submit', class: s.tehlikeli ? 'tehlike' : 'birincil' }, s.tehlikeli ? ikon('cop') : null, s.dugme);
  const vazgec = h('button', { type: 'button', class: 'hayalet' }, 'Vazgeç');
  const form = h('form', { method: 'dialog', novalidate: true },
    h('div', { class: 'diyalog-govde' },
      h('h2', { id: baslikId }, h('span', { class: 'diyalog-ikon', 'aria-hidden': 'true' }, ikon(s.ikonAd)), s.baslik),
      s.aciklama ? h('p', { class: 'soluk' }, s.aciklama) : null,
      ...s.govde, hataKutusu),
    h('div', { class: 'diyalog-alt' }, vazgec, tamam));
  const diyalog = h('dialog', { class: `onay-diyalogu ekran-yonetim-diyalogu ${s.tehlikeli ? 'tehlikeli' : ''}`.trim(), 'aria-labelledby': baslikId }, form);
  const hataGoster = (m) => { hataKutusu.textContent = m || ''; hataKutusu.hidden = !m; };
  form.addEventListener('submit', async (o) => {
    o.preventDefault();
    if (tamam.disabled) return;
    hataGoster('');
    try {
      const kapansin = await mesgulIken(tamam, 'Kaydediliyor…', () => s.gonder(tamam));
      if (kapansin !== false) diyalog.close();
    } catch (e) {
      if (e && e.durum === 423) { diyalog.close(); return; }
      hataGoster(e.message || String(e));
    }
  });
  vazgec.addEventListener('click', () => diyalog.close());
  diyalog.addEventListener('close', () => diyalog.remove());
  document.body.append(diyalog);
  diyalog.showModal();
  return { diyalog, hataGoster, tamam };
}

const etiketliAlan = (etiket, girdi, yardim) => {
  girdi.id = girdi.id || yeniKimlik('alan');
  return h('div', { class: 'alan' }, h('label', { for: girdi.id }, etiket), girdi, yardim ? h('div', { class: 'yardim' }, yardim) : null);
};

// ---------------------------------------------------------------------------------------
// Diyaloglar
// ---------------------------------------------------------------------------------------

/** @param {{ proje: { id: string }; ekran: { id: string; ad: string; anahtar: string; aciklama?: string | null } }} s */
export function yenidenAdlandirDiyalogu(s) {
  const ad = h('input', { type: 'text', value: s.ekran.ad, maxlength: 120, required: true, autocomplete: 'off' });
  const aciklama = h('textarea', { rows: 3, maxlength: 1000 });
  aciklama.value = s.ekran.aciklama || '';
  formDiyalogu({
    baslik: 'Yeniden adlandır', ikonAd: 'duzenle', dugme: 'Kaydet',
    aciklama: 'Görünen ad ve açıklama değişir; ekran anahtarı aynı kalır — senaryolar ve geçmiş sonuçlar bu ekrana bağlı kalır.',
    govde: [
      etiketliAlan('Görünen ad', ad),
      etiketliAlan('Açıklama', aciklama, 'İsteğe bağlı.'),
      h('p', { class: 'kucuk cok-soluk' }, 'Ekran anahtarı: ', h('code', {}, s.ekran.anahtar))
    ],
    gonder: async () => {
      if (!ad.value.trim()) throw new Error('Ekran adı boş olamaz.');
      const r = await api('/platform/ekran/yeniden-adlandir', { govde: { projeId: s.proje.id, ekranId: s.ekran.id, ad: ad.value, aciklama: aciklama.value } });
      bildir(r.degisti ? `Ekran adı "${r.ad}" olarak kaydedildi.` : 'Değişiklik yok.');
      yenile();
    }
  });
  ad.select();
}

/** @param {{ proje: { id: string }; ekran: { id: string; ad: string; urlYolu?: string | null; modelTuru?: string | null; modelSurumu?: number | null } }} s */
export function duzenleDiyalogu(s) {
  const yol = h('input', { type: 'text', value: s.ekran.urlYolu || '', maxlength: 500, spellcheck: 'false', placeholder: '/satis/odeme/', class: 'mono' });
  formDiyalogu({
    baslik: `Düzenle: ${s.ekran.ad}`, ikonAd: 'ag', dugme: 'Kaydet',
    aciklama: 'URL yolu ortamın taban adresine eklenir (ör. Ayarlar > Ortamlar\'daki adres + bu yol). Model sürümleri değişmez: kaydetmek yalnızca yolu farklı YENİ bir model sürümü oluşturur.',
    govde: [
      etiketliAlan('URL yolu', yol, 'Tam adres değil, "/" ile başlayan yol.'),
      h('p', { class: 'kucuk cok-soluk' }, 'Ürün / grup ataması: bu projede ekranlar tek düzeyli listelenir (grup kavramı yok). Sol listedeki sırayı ⋯ > Yukarı / Aşağı taşı ile değiştirebilirsiniz.')
    ],
    gonder: async () => {
      const r = await api('/platform/ekran/duzenle', { govde: { projeId: s.proje.id, ekranId: s.ekran.id, urlYolu: yol.value } });
      bildir(r.degisti ? `URL yolu kaydedildi (model v${r.surum}).` : 'Değişiklik yok.');
      yenile();
    }
  });
  yol.focus();
}

/** @param {{ proje: { id: string }; ekran: { id: string; ad: string; durum: string } }} s */
export async function durumDegistir(s) {
  const etkin = s.ekran.durum === 'devre_disi';
  try {
    await api('/platform/ekran/durum', { govde: { projeId: s.proje.id, ekranId: s.ekran.id, etkin } });
    bildir(etkin ? `"${s.ekran.ad}" etkinleştirildi.` : `"${s.ekran.ad}" devre dışı bırakıldı; senaryoları koşulara girmez.`);
    yenile();
  } catch (e) { hata(e); }
}

/** Sıra: idler (tüm silinmemiş ekranlar) içinde ekranı yon (-1 yukarı, +1 aşağı) kaydırır. */
export async function tasi(s, idler, yon) {
  const i = idler.indexOf(s.ekran.id);
  const j = i + yon;
  if (i < 0 || j < 0 || j >= idler.length) return;
  const yeni = idler.slice();
  [yeni[i], yeni[j]] = [yeni[j], yeni[i]];
  try {
    await api('/platform/ekran/sirala', { govde: { projeId: s.proje.id, idler: yeni } });
    yenile();
  } catch (e) { hata(e); }
}

/** @param {{ proje: { id: string }; ekran: { id: string; ad: string } }} s */
export async function geriYukle(s) {
  try {
    await api('/platform/ekran/geri-yukle', { govde: { projeId: s.proje.id, ekranId: s.ekran.id } });
    bildir(`"${s.ekran.ad}" geri yüklendi (modelsiz ve senaryosuz; kodu duran testler bir sonraki aktarımda yeniden görünür).`);
    yenile();
  } catch (e) { hata(e); }
}

/**
 * KALICI SİL: önce kuru çalıştırma (sayılar + dosya listesi), onay için ekran adını yazmak gerekir.
 * @param {{ proje: { id: string }; ekran: { id: string; ad: string }; sonra?: () => void }} s
 */
export async function silDiyalogu(s) {
  let o;
  try {
    o = (await api('/platform/ekran/sil/onizle', { govde: { projeId: s.proje.id, ekranId: s.ekran.id } })).onizleme;
  } catch (e) { hata(e); return; }
  const n = o.sayilar;
  const silinmis = o.ekran.durum === 'silindi';
  const sayi = (etiket, deger, aciklama) => h('div', { title: aciklama || null }, h('dt', {}, etiket), h('dd', {}, String(deger)));
  const onay = h('input', { type: 'text', autocomplete: 'off', spellcheck: 'false', 'aria-describedby': null });
  const sonuclar = h('input', { type: 'checkbox', id: yeniKimlik('sonuclar') });
  const kod = h('input', { type: 'checkbox', id: yeniKimlik('kod') });
  const kodVar = o.kod.dosyalar.length > 0;
  const kodListesi = h('div', { class: 'kod-plani', hidden: true },
    o.kod.klasor ? h('p', { class: 'kucuk' }, 'Klasörün tamamı kaldırılır: ', h('code', {}, `${o.kod.klasor}/`)) : h('p', { class: 'kucuk' }, 'Kaldırılacak dosyalar:'),
    h('ul', { class: 'onay-listesi mono kod-dosyalari' }, o.kod.dosyalar.map((d) => h('li', { title: d }, d))),
    h('p', { class: 'kucuk cok-soluk' }, 'Dosyalar diskten silinir; git bunları "deleted" gösterir, gerekirse git ile geri alabilirsiniz. Yalnızca tests/scenarios altındaki dosyalara dokunulur.'));
  const kodUyarisi = h('div', { class: 'not-kutusu uyari kucuk', role: 'status' },
    h('b', {}, 'Test kodu projede kalıyor. '),
    'Ekran silinmiş olarak işaretlenir ve kodundaki testler koşulardan (Koşuyu başlat, npm run test) hariç tutulur; kod kaldırılana ya da ekran geri yüklenene kadar. Yalnızca geçici olarak durdurmak istiyorsanız "Devre dışı bırak" daha uygundur.');
  const guncelle = () => {
    kodListesi.hidden = !kod.checked;
    kodUyarisi.hidden = !(o.kod.testVar && !kod.checked);
    tamam.disabled = onay.value.replace(/\s+/g, ' ').trim() !== o.ekran.ad;
  };
  const d = formDiyalogu({
    baslik: silinmis ? `Silinmiş ekranı temizle: ${o.ekran.ad}` : `Ekranı kalıcı sil: ${o.ekran.ad}`, ikonAd: 'cop', dugme: 'Kalıcı olarak sil', tehlikeli: true,
    aciklama: silinmis
      ? 'Ekran zaten silinmiş (mezar taşı). Burada geçmiş sonuçlarını ve/veya hâlâ duran test kodunu da kaldırabilirsiniz.'
      : 'Ekran, tüm model sürümleri, senaryoları (değişiklik geçmişi korunur) ve şifreli ekran/senaryo dosyaları silinir. Bu işlem geri alınamaz.',
    govde: [
      h('dl', { class: 'onay-ozeti dortlu' },
        sayi('Model sürümü', n.modelSurumu), sayi('Senaryo', n.senaryo), sayi('Sonuç', n.sonuc, 'Bu ekranın ve senaryolarının koşu sonuçları'),
        sayi('Medya', n.medya, `${n.sonucMedyasi} sonuç medyası (ekran görüntüsü/video/iz) + ${n.ekranMedyasi} ekran/senaryo dosyası`)),
      h('label', { class: 'onay-satiri', for: sonuclar.id }, sonuclar,
        h('span', {}, h('b', {}, 'Geçmiş sonuçları da sil'),
          h('small', { class: 'blok soluk' }, n.sonuc
            ? `${n.sonuc} sonuç ve ${n.sonucMedyasi} şifreli medyası güvenle silinir. Kapalıysa sonuçlar Sonuçlar'da "silinmiş ekran" etiketiyle kalır.`
            : 'Bu ekranın koşu sonucu yok.'))),
      o.kod.testVar ? h('label', { class: 'onay-satiri', for: kod.id }, kod,
        h('span', {}, h('b', {}, 'Bu ekranın test kodu da projeden kaldırılsın'),
          h('small', { class: 'blok soluk' }, kodVar ? `${o.kod.dosyalar.length} dosya (tests/scenarios altında).` : 'Kaldırılabilir dosya yok.'))) : null,
      o.kod.testVar ? kodListesi : null,
      o.kod.paylasilanlar.length ? h('p', { class: 'kucuk soluk' }, 'Başka ekranlarla paylaşılan (silinmeyecek) dosyalar: ', o.kod.paylasilanlar.join(', '),
        ' — bu ekranın bu dosyalardaki testleri koşulardan hariç tutulur.') : null,
      o.kod.reddedilenler.length ? h('p', { class: 'kucuk soluk' }, 'tests/scenarios dışında olduğu için kaldırılmayacak: ',
        o.kod.reddedilenler.map((r) => `${r.yol} (${r.neden})`).join(', ')) : null,
      o.kod.testVar ? kodUyarisi : null,
      h('div', { class: 'alan ust-bosluk' },
        h('label', { for: onay.id = yeniKimlik('onay') }, 'Onaylamak için ekranın adını yazın: ', h('b', {}, o.ekran.ad)),
        onay)
    ],
    gonder: async () => {
      const r = await api('/platform/ekran/sil', {
        govde: {
          projeId: s.proje.id, ekranId: s.ekran.id, onayAdi: onay.value, sonuclariSil: sonuclar.checked, koduKaldir: kod.checked,
          beklenenDosyalar: kod.checked ? o.kod.dosyalar : undefined
        }
      });
      const parcalar = [`${r.silinen.senaryo} senaryo`, `${r.silinen.modelSurumu} model sürümü`];
      if (r.silinen.sonuc) parcalar.push(`${r.silinen.sonuc} sonuç`);
      if (r.kod.kaldirilanlar.length) parcalar.push(`${r.kod.kaldirilanlar.length} test dosyası`);
      bildir(`"${o.ekran.ad}" silindi (${parcalar.join(', ')}).${r.korunanSonuc ? ` ${r.korunanSonuc} geçmiş sonuç korundu.` : ''}`);
      if (r.kod.hatalar.length) bildir(`${r.kod.hatalar.length} dosya kaldırılamadı: ${r.kod.hatalar.map((x) => x.yol).join(', ')}`, 'hata');
      if (s.sonra) s.sonra(); else yenile();
    }
  });
  const tamam = d.tamam;
  onay.addEventListener('input', guncelle);
  sonuclar.addEventListener('change', guncelle);
  kod.addEventListener('change', guncelle);
  kod.disabled = !kodVar;
  sonuclar.disabled = !n.sonuc;
  guncelle();
  onay.focus();
}

// ---------------------------------------------------------------------------------------
// ⋯ menüsü
// ---------------------------------------------------------------------------------------

/**
 * Ekranın ⋯ menüsü (kart ve ayrıntı başlığı).
 * @param {{ proje: { id: string }; ekran: { id: string; ad: string; anahtar: string; aciklama?: string | null; durum: string; urlYolu?: string | null; modelTuru?: string | null; modelSurumu?: number | null };
 *   idler?: string[]; sonra?: () => void; etiket?: string }} s idler: sıralama için tüm ekranların sırası (yoksa taşıma gizli)
 */
export function ekranMenusu(s) {
  const e = s.ekran;
  const dugme = h('button', { type: 'button', class: 'ikon-dugme', 'aria-haspopup': 'menu', 'aria-expanded': 'false', 'aria-label': `Ekran işlemleri: ${e.ad}`, title: 'Ekran işlemleri' }, '⋯');
  const yolVar = e.modelTuru === 'ekran' && e.modelSurumu;
  const i = s.idler ? s.idler.indexOf(e.id) : -1;
  const oge = (ikonAd, metin, fn, ek = {}) => h('button', { type: 'button', role: 'menuitem', ...ek, onclick: () => { kapat(); fn(); } }, ikon(ikonAd), metin);
  const menu = h('div', { class: 'acilir-menu', role: 'menu', hidden: true },
    oge('duzenle', 'Yeniden adlandır', () => yenidenAdlandirDiyalogu(s)),
    oge('ag', 'Düzenle (URL yolu)', () => duzenleDiyalogu(s), { disabled: !yolVar, title: yolVar ? null : (e.modelTuru === 'altModel' ? 'Alt modellerin URL yolu yoktur' : 'Modeli olmayan ekranın yolu yok (önce sayfa paketi yükleyin)') }),
    s.idler ? oge('geri', 'Yukarı taşı', () => tasi(s, s.idler, -1), { disabled: i <= 0, class: 'yukari' }) : null,
    s.idler ? oge('ok', 'Aşağı taşı', () => tasi(s, s.idler, 1), { disabled: i < 0 || i >= s.idler.length - 1, class: 'asagi' }) : null,
    h('hr', {}),
    e.durum === 'devre_disi'
      ? oge('oynat', 'Etkinleştir', () => durumDegistir(s))
      : oge('eksi', 'Devre dışı bırak', () => durumDegistir(s), { title: 'Geri alınabilir: senaryoları koşulara girmez, listelerde gizlenir' }),
    oge('cop', 'Sil (kalıcı)…', () => silDiyalogu(s), { class: 'tehlikeli' }));
  const kap = h('span', { class: 'satir-menusu-kap ekran-menusu' }, dugme, menu);
  const disTik = (o) => { if (!kap.contains(o.target)) kapat(); };
  function kapat() { menu.hidden = true; dugme.setAttribute('aria-expanded', 'false'); document.removeEventListener('click', disTik); }
  dugme.addEventListener('click', (o) => {
    o.preventDefault();
    o.stopPropagation();
    if (!menu.hidden) { kapat(); return; }
    menu.hidden = false; dugme.setAttribute('aria-expanded', 'true');
    setTimeout(() => document.addEventListener('click', disTik), 0);
    menu.querySelector('button:not(:disabled)')?.focus();
  });
  menu.addEventListener('keydown', (o) => {
    const ogeler = [...menu.querySelectorAll('button:not(:disabled)')];
    const j = ogeler.indexOf(document.activeElement);
    if (o.key === 'Escape') { kapat(); dugme.focus(); }
    else if (o.key === 'ArrowDown') { o.preventDefault(); ogeler[(j + 1) % ogeler.length]?.focus(); }
    else if (o.key === 'ArrowUp') { o.preventDefault(); ogeler[(j - 1 + ogeler.length) % ogeler.length]?.focus(); }
  });
  return kap;
}

/** Devre dışı ekran rozeti. */
export const devreDisiRozeti = () => rozet([ikon('eksi'), 'devre dışı'], 'atlanan', { title: 'Senaryoları koşulara girmez (Ekranlar > ⋯ > Etkinleştir)' });
