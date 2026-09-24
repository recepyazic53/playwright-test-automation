// "Mevcut proje dosyalarını aktar" akışı (genel; projeye özgü okuma sunucudaki adaptördedir).
//   mod 'hosgeldin': kasa parolası (iki kez) → önizleme (sayılar) → uygula → özet
//   mod 'ayarlar'  : (kasa açık) önizleme → uygula → özet  — "Proje dosyalarından yeniden aktar"
// Önizleme ve özet YALNIZCA sayılar/uyarılar içerir; gizli değer gösterilmez. Parola yalnızca bu
// akışın belleğinde durur ve uygulama isteğinden hemen sonra silinir.
import { alanHatasi, api, h, mesajKutusu, mesgulIken, parolaAlani } from './ortak.js';

const ADIMLAR_HOSGELDIN = [
  { ad: 'kasa', etiket: 'Kasa parolası' },
  { ad: 'onizleme', etiket: 'Önizleme' },
  { ad: 'ozet', etiket: 'Özet' }
];
const ADIMLAR_AYARLAR = ADIMLAR_HOSGELDIN.slice(1);

function adimListesi(adimlar, aktif) {
  const aktifSira = adimlar.findIndex((a) => a.ad === aktif);
  return h('ol', { class: 'adimlar', 'aria-label': 'Aktarım adımları' },
    adimlar.map((a, i) => h('li', { class: i < aktifSira ? 'tamam' : '', 'aria-current': a.ad === aktif ? 'step' : null },
      a.etiket, i < aktifSira ? h('span', { class: 'gorunmez' }, ' (tamamlandı)') : null)));
}

/** Varlık başına sayılar tablosu. sutunlar: [anahtar, başlık] */
function sayimTablosu(sayimlar, sutunlar, baslik) {
  const satirlar = Object.entries(sayimlar).filter(([, s]) => s.toplam > 0 || s.kaldirilacak > 0 || s.kaynaktaYok > 0);
  return h('div', { class: 'tablo-kaydirma' },
    h('table', { class: 'ozet-tablosu' },
      h('caption', { class: 'gorunmez' }, baslik),
      h('thead', {}, h('tr', {}, h('th', { scope: 'col' }, 'Kayıt türü'), sutunlar.map(([, b]) => h('th', { scope: 'col' }, b)))),
      h('tbody', {}, satirlar.map(([, s]) => h('tr', {},
        h('th', { scope: 'row' }, s.etiket),
        sutunlar.map(([k]) => h('td', {}, String(s[k] ?? 0))))))));
}

function uyariListesi(uyarilar) {
  if (!uyarilar || !uyarilar.length) return null;
  return h('div', { class: 'not-kutusu uyari' }, h('p', {}, h('strong', {}, 'Uyarılar')),
    h('ul', {}, uyarilar.map((u) => h('li', {}, u))));
}

/**
 * @param {HTMLElement} kapsayici
 * @param {{ mod: 'hosgeldin' | 'ayarlar'; adaptor: { ad: string; etiket: string; projeAdi: string }; bitti: () => void; vazgec: () => void }} secenekler
 */
export function aktarimAkisi(kapsayici, secenekler) {
  const { mod, adaptor } = secenekler;
  const adimlar = mod === 'hosgeldin' ? ADIMLAR_HOSGELDIN : ADIMLAR_AYARLAR;
  let parola = '';
  let parolaTekrar = '';

  const ciz = (adim, ...icerik) => {
    kapsayici.replaceChildren(
      h('h2', { tabindex: '-1', id: 'aktarim-basligi' }, mod === 'hosgeldin' ? 'Mevcut proje dosyalarını aktar' : 'Proje dosyalarından yeniden aktar'),
      adimListesi(adimlar, adim), ...icerik);
    const baslik = kapsayici.querySelector('#aktarim-basligi');
    if (baslik) baslik.focus({ preventScroll: false });
  };

  // --- 1) Kasa parolası (yalnızca hoş geldiniz akışı) --------------------------------------
  const kasaAdimi = () => {
    const p1 = parolaAlani('Kasa parolası', { zorunlu: true, otomatik: 'new-password', yardim: 'En az 8 karakter. Aktarılan tüm gizli bilgiler (parolalar, kimlik numaraları, kart bilgileri, adresler) bu parolayla şifrelenir.' });
    const p2 = parolaAlani('Kasa parolası (tekrar)', { zorunlu: true, otomatik: 'new-password' });
    const anladim = h('input', { type: 'checkbox', id: 'aktarim-parola-anladim' });
    const mesaj = mesajKutusu();
    const devam = h('button', { type: 'submit', class: 'birincil' }, 'Devam: önizleme');
    const form = h('form', { class: 'kart', novalidate: true },
      h('p', { class: 'soluk' }, `${adaptor.etiket}. Dosyalarınız DEĞİŞTİRİLMEZ; yalnızca okunur.`),
      h('div', { class: 'not-kutusu uyari' }, h('p', {}, h('strong', {}, 'Bu parolayı unutmayın. '), 'Parola unutulursa veriler kurtarılamaz. Testleri terminalden çalıştırırken de bu parola sorulacak.')),
      mesaj.kutu, p1.kapsayici, p2.kapsayici,
      h('label', { class: 'secenek', for: anladim.id }, anladim, 'Parolayı unutursam verilerin kurtarılamayacağını anladım.'),
      h('div', { class: 'dugmeler' }, devam, h('button', { type: 'button', onclick: () => secenekler.vazgec() }, 'Geri')));
    form.addEventListener('submit', (o) => {
      o.preventDefault();
      mesaj.temizle();
      alanHatasi(p1.girdi, ''); alanHatasi(p2.girdi, '');
      if ([...p1.girdi.value].length < 8) { alanHatasi(p1.girdi, 'Parola en az 8 karakter olmalıdır.'); p1.girdi.focus(); return; }
      if (p1.girdi.value !== p2.girdi.value) { alanHatasi(p2.girdi, 'Parolalar aynı değil.'); p2.girdi.focus(); return; }
      if (!anladim.checked) { mesaj.goster('Devam etmek için parolanın kurtarılamayacağını onaylayın.'); anladim.focus(); return; }
      parola = p1.girdi.value;
      parolaTekrar = p2.girdi.value;
      p1.girdi.value = ''; p2.girdi.value = '';
      onizlemeAdimi();
    });
    ciz('kasa', form);
    p1.girdi.focus();
  };

  // --- 2) Önizleme -----------------------------------------------------------------------
  const onizlemeAdimi = async () => {
    const durumMetni = h('p', { class: 'soluk', role: 'status' }, 'Dosyalar okunuyor ve test listesi çıkarılıyor… (birkaç saniye sürebilir)');
    ciz('onizleme', h('div', { class: 'kart' }, durumMetni));
    let onizleme;
    try {
      ({ onizleme } = await api('/platform/aktarim/onizle', { govde: { adaptor: adaptor.ad } }));
    } catch (hata) {
      if (hata.durum === 423) return;
      const tekrar = h('button', { type: 'button', onclick: () => onizlemeAdimi() }, 'Tekrar dene');
      ciz('onizleme', h('div', { class: 'kart' }, h('div', { class: 'not-kutusu hata', role: 'alert' }, hata.message),
        h('div', { class: 'dugmeler' }, tekrar, h('button', { type: 'button', onclick: () => geriDon() }, 'Vazgeç'))));
      return;
    }
    const mesaj = mesajKutusu();
    const uygula = h('button', { type: 'button', class: 'birincil' }, mod === 'hosgeldin' ? 'Kasayı oluştur ve aktar' : 'Aktar');
    const sutunlar = mod === 'hosgeldin'
      ? [['toplam', 'Aktarılacak']]
      : [['toplam', 'Kaynakta'], ['yeni', 'Yeni'], ['guncellenecek', 'Güncellenecek'], ['ayni', 'Aynı (atlanacak)'], ['kaldirilacak', 'Kaldırılacak'], ['silinmisAtlanacak', 'Silinmiş (atlanacak)']];
    const kart = h('div', { class: 'kart' },
      h('p', {}, `Proje: `, h('strong', {}, onizleme.proje.ad), onizleme.proje.mevcut ? ' (mevcut projeyle birleştirilecek)' : ' (yeni proje)'),
      sayimTablosu(onizleme.sayimlar, sutunlar, 'Aktarım önizlemesi'),
      h('p', { class: 'soluk kucuk' }, `Koşudan hariç tutulan senaryo: ${onizleme.kosudanHaricSenaryo}. `,
        'Hassas alanlar (T.C./vergi/pasaport/yabancı kimlik no, telefon, doğum tarihi, pasaport sahibinin adı-soyadı, kart no ve güvenlik kodu) kasada şifreli saklanır.'),
      mod === 'ayarlar' ? h('p', { class: 'soluk kucuk' }, 'Birleştirme kuralı: yalnızca dosyada DEĞİŞEN kayıtlar güncellenir; dosyada değişmeyen kayıtlarda burada yaptığınız düzenlemeler korunur. Dosyadan kalkan senaryo ve profiller kaldırılır.') : null,
      uyariListesi(onizleme.uyarilar), mesaj.kutu,
      h('div', { class: 'dugmeler' }, uygula, h('button', { type: 'button', onclick: () => geriDon() }, mod === 'hosgeldin' ? 'Geri' : 'Vazgeç')));
    uygula.addEventListener('click', async () => {
      mesaj.temizle();
      try {
        const govde = { adaptor: adaptor.ad };
        if (mod === 'hosgeldin') { govde.parola = parola; govde.parolaTekrar = parolaTekrar; }
        const { sonuc } = await mesgulIken(uygula, 'Aktarılıyor…', () => api('/platform/aktarim/uygula', { govde }));
        parola = ''; parolaTekrar = '';
        ozetAdimi(sonuc);
      } catch (hata) {
        if (hata.durum === 423) return;
        mesaj.goster(hata.message);
      }
    });
    ciz('onizleme', kart);
  };

  const geriDon = () => {
    if (mod === 'hosgeldin') { parola = ''; parolaTekrar = ''; kasaAdimi(); } else secenekler.vazgec();
  };

  // --- 3) Özet ---------------------------------------------------------------------------
  const ozetAdimi = (sonuc) => {
    const devam = h('button', { type: 'button', class: 'birincil', onclick: () => secenekler.bitti() }, mod === 'hosgeldin' ? 'Platforma geç' : 'Tamam');
    ciz('ozet', h('div', { class: 'kart' },
      h('div', { class: 'not-kutusu basari', role: 'status' }, 'Aktarım tamamlandı.'),
      sayimTablosu(sonuc.sayimlar, [['yeni', 'Eklendi'], ['guncellenecek', 'Güncellendi'], ['ayni', 'Aynı (atlandı)'], ['kaldirilacak', 'Kaldırıldı']], 'Aktarım özeti'),
      sonuc.atlanan.silinmis.length ? h('p', { class: 'kucuk' }, `Veritabanında silinmiş olduğu için yeniden eklenmeyen: ${sonuc.atlanan.silinmis.length}`) : null,
      sonuc.kaynaktaYok.length ? h('p', { class: 'kucuk' }, `Dosyalarda artık olmayan ama korunan kayıt: ${sonuc.kaynaktaYok.length}`) : null,
      uyariListesi(sonuc.uyarilar),
      h('p', { class: 'soluk kucuk' }, 'Testler artık veriyi bu veritabanından okur. Terminalden çalıştırırken kasa parolası gizli olarak sorulur; dashboard koşularında kasa açıksa sorulmaz.'),
      h('div', { class: 'dugmeler' }, devam)));
    devam.focus();
  };

  if (mod === 'hosgeldin') kasaAdimi();
  else onizlemeAdimi();
}
