// Kaydedilmemiş değişiklik uyarısı (tüm sayfalar): ana içerikte bir alana veri girilip kaydetmeden başka sayfaya
// geçilmek istenince "Değişiklikleriniz kaydedilmeyecek" onayı sorulur; sekme kapatma / yenilemede tarayıcının uyarısı.
//   · İz: ana içerikteki input / select / textarea değişince. Sayılmayanlar: diyaloglar (kendi Vazgeç'leri var), arama
//     kutuları, filtreler, tablo seçim kutuları ve [data-kayit-disi] altındakiler.
//   · Temizlenir: kayıt uçları başarılı olunca (ortak.js api), sayfa yeniden çizilince, onayla çıkınca.
//   · Adres değişimi (bağlantı, Vazgeç, geri tuşu) hashchange'te yakalanır: adres geri alınır, onay sorulur.
import { degisiklikleriBirak, kayitIzi } from './ortak.js';

const SAYILMAYAN = 'dialog, [data-kayit-disi], .filtre-secimi, [role="toolbar"]';

/** @param {EventTarget | null} el */
function izlenirMi(el) {
  if (!(el instanceof HTMLInputElement || el instanceof HTMLSelectElement || el instanceof HTMLTextAreaElement)) return false;
  if (!el.closest('main.ana-icerik') || el.closest(SAYILMAYAN)) return false;
  if (el instanceof HTMLInputElement && el.type === 'search') return false;
  // Tablo seçim kutuları ("Seç: …", "Görünen tüm … seç") veri değildir.
  if (el instanceof HTMLInputElement && el.type === 'checkbox' && /^(Seç:|Görünen tüm)/.test(el.getAttribute('aria-label') || '')) return false;
  return true;
}

let kuruldu = false;

export function cikisKorumasiniKur() {
  if (kuruldu) return;
  kuruldu = true;
  let sonAdres = location.hash;
  let soruluyor = false;
  /** @param {Event} o */
  const isaretle = (o) => { if (o.isTrusted && izlenirMi(o.target)) kayitIzi.kirli = true; };
  document.addEventListener('input', isaretle, true);
  document.addEventListener('change', isaretle, true);
  window.addEventListener('beforeunload', (o) => { if (kayitIzi.kirli) { o.preventDefault(); o.returnValue = ''; } });
  // Sayfa yönlendiricisinden ÖNCE kaydedilir (uygulama.js başında kurulur): gerekirse çizimi durdurur. Engellenen
  // geçişte adres, olay çıkarmadan (replaceState) eski sayfaya geri yazılır; sayfa yerinde kalır.
  window.addEventListener('hashchange', (o) => {
    const hedef = location.hash;
    if (hedef === sonAdres || !kayitIzi.kirli) { degisiklikleriBirak(); sonAdres = hedef; return; }
    o.stopImmediatePropagation();
    history.replaceState(history.state, '', sonAdres || `${location.pathname}${location.search}`);
    if (soruluyor) return;
    soruluyor = true;
    void import('./kosu-paneli.js').then(({ onayIste }) => onayIste({
      baslik: 'Değişiklikleriniz kaydedilmeyecek',
      metin: 'Bu sayfada kaydedilmemiş değişiklikler var. Sayfadan çıkarsanız girdiğiniz bilgiler kaybolacak.',
      dugme: 'Kaydetmeden çık', tehlikeli: false, ikonAd: 'uyari'
    })).then((tamam) => {
      soruluyor = false;
      if (!tamam) return;
      degisiklikleriBirak();
      location.hash = hedef;
    }, () => { soruluyor = false; });
  });
}
