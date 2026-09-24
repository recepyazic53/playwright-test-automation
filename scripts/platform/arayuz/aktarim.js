// "Eski proje dosyalarını aktar" akışı (genel; projeye özgü okuma sunucudaki adaptördedir).
//   mod 'hosgeldin': kasa parolası (iki kez) → önizleme (sayılar) → uygula → özet
//   mod 'ayarlar'  : (kasa açık) önizleme → uygula → özet  — "Eski proje dosyalarından yeniden aktar"
// Eski dosyalar bir KAYNAK KLASÖRDEN okunur (varsayılan: en yeni veri/eski-dosyalar/<zaman> yedeği);
// kullanıcı önizleme adımında başka bir klasör seçebilir (ör. eski dosyaları olan başka bir makinede).
// Önizleme ve özet YALNIZCA sayılar/uyarılar içerir; gizli değer gösterilmez. Parola yalnızca bu
// akışın belleğinde durur ve uygulama isteğinden hemen sonra silinir.
import { alan, alanHatasi, api, h, ikon, iskelet, mesajKutusu, mesgulIken, parolaAlani } from './ortak.js';

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
 * Kaynak klasör seçimi: metin alanı + "Klasörü kontrol et". Klasörde eski dosyalar bulunursa
 * secildi(yol) çağrılır; bulunamazsa sunucunun Türkçe açıklaması alanın altında gösterilir.
 * @param {{ ad: string }} adaptor @param {string} mevcut @param {(yol: string) => void} secildi
 */
function kaynakKlasoruSecimi(adaptor, mevcut, secildi) {
  const girdi = h('input', { type: 'text', value: mevcut, autocomplete: 'off', spellcheck: 'false' });
  const kontrol = h('button', { type: 'submit' }, ikon('ara'), 'Klasörü kontrol et');
  const form = h('form', { class: 'kaynak-klasoru', novalidate: true },
    alan('Eski dosyaların klasörü', girdi, {
      yardim: 'İçinde tests/data/<ortam>/ortak.json olan klasör (varsayılan: en yeni veri/eski-dosyalar/<zaman> yedeği). Göreli yol proje köküne göredir. Klasördeki .env varsa taban adresler ve giriş bilgileri oradan okunur. Dosyalar DEĞİŞTİRİLMEZ; yalnızca okunur.'
    }),
    h('div', { class: 'dugmeler' }, kontrol));
  form.addEventListener('submit', async (o) => {
    o.preventDefault();
    alanHatasi(girdi, '');
    const yol = girdi.value.trim();
    if (!yol) { alanHatasi(girdi, 'Klasör yolunu yazın.'); girdi.focus(); return; }
    try {
      const d = await mesgulIken(kontrol, 'Kontrol ediliyor…', () => api(`/platform/aktarim/durum?kaynakKlasoru=${encodeURIComponent(yol)}`));
      const a = (d.adaptorler || []).find((x) => x.ad === adaptor.ad);
      if (!a || !a.dosyalarVar || !a.kaynakKlasoru) { alanHatasi(girdi, (a && a.kaynakHatasi) || 'Bu klasörde eski proje dosyaları bulunamadı.'); girdi.focus(); return; }
      secildi(a.kaynakKlasoru);
    } catch (hata) {
      alanHatasi(girdi, hata.message);
    }
  });
  return form;
}

/**
 * @param {HTMLElement} kapsayici
 * @param {{ mod: 'hosgeldin' | 'ayarlar'; adaptor: { ad: string; etiket: string; projeAdi: string; kaynakKlasoru?: string | null }; bitti: () => void; vazgec: () => void }} secenekler
 */
export function aktarimAkisi(kapsayici, secenekler) {
  const { mod, adaptor } = secenekler;
  const adimlar = mod === 'hosgeldin' ? ADIMLAR_HOSGELDIN : ADIMLAR_AYARLAR;
  let parola = '';
  let parolaTekrar = '';
  let kaynakKlasoru = adaptor.kaynakKlasoru || '';
  const kaynakSecimi = () => kaynakKlasoruSecimi(adaptor, kaynakKlasoru, (yol) => { kaynakKlasoru = yol; onizlemeAdimi(); });

  const ciz = (adim, ...icerik) => {
    kapsayici.replaceChildren(
      h('div', { class: 'sihirbaz-baslik' }, h('div', { class: 'kirinti' }, h('span', {}, adaptor.etiket)),
        h('h2', { tabindex: '-1', id: 'aktarim-basligi' }, mod === 'hosgeldin' ? 'Eski proje dosyalarını aktar' : 'Eski proje dosyalarından yeniden aktar')),
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
      kaynakKlasoru ? h('p', { class: 'kucuk' }, 'Kaynak klasör: ', h('code', {}, kaynakKlasoru), ' (bir sonraki adımda değiştirebilirsiniz)') : null,
      h('div', { class: 'not-kutusu uyari' }, h('p', {}, h('strong', {}, 'Bu parolayı unutmayın. '), 'Parola unutulursa veriler kurtarılamaz. Testleri terminalden çalıştırırken de bu parola sorulacak.')),
      mesaj.kutu, p1.kapsayici, p2.kapsayici,
      h('label', { class: 'secenek', for: anladim.id }, anladim, 'Parolayı unutursam verilerin kurtarılamayacağını anladım.'),
      h('div', { class: 'dugmeler' }, devam, h('button', { type: 'button', class: 'hayalet', onclick: () => secenekler.vazgec() }, 'Geri')));
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
    const durumMetni = h('p', { class: 'secim-sayaci', role: 'status' }, 'Dosyalar okunuyor ve test listesi çıkarılıyor… (birkaç saniye sürebilir)');
    ciz('onizleme', h('div', { class: 'kart' }, h('div', { class: 'ilerleme' }, h('div', { class: 'ilerleme-ust' }, h('span', { class: 'donen', 'aria-hidden': 'true' }), durumMetni)), iskelet('liste')));
    let onizleme;
    try {
      let yanit;
      ({ onizleme, ...yanit } = await api('/platform/aktarim/onizle', { govde: { adaptor: adaptor.ad, kaynakKlasoru: kaynakKlasoru || undefined } }));
      if (yanit.kaynakKlasoru) kaynakKlasoru = yanit.kaynakKlasoru;
    } catch (hata) {
      if (hata.durum === 423) return;
      const tekrar = h('button', { type: 'button', onclick: () => onizlemeAdimi() }, 'Tekrar dene');
      ciz('onizleme', h('div', { class: 'kart' }, h('div', { class: 'not-kutusu hata', role: 'alert' }, hata.message),
        kaynakSecimi(),
        h('div', { class: 'dugmeler' }, tekrar, h('button', { type: 'button', onclick: () => geriDon() }, 'Vazgeç'))));
      return;
    }
    const mesaj = mesajKutusu();
    const uygula = h('button', { type: 'button', class: 'birincil' }, mod === 'hosgeldin' ? 'Kasayı oluştur ve aktar' : 'Aktar');
    const sutunlar = mod === 'hosgeldin'
      ? [['toplam', 'Aktarılacak']]
      : [['toplam', 'Kaynakta'], ['yeni', 'Yeni'], ['guncellenecek', 'Güncellenecek'], ['ayni', 'Aynı (atlanacak)'], ['kaldirilacak', 'Kaldırılacak'], ['silinmisAtlanacak', 'Silinmiş (atlanacak)']];
    const kart = h('div', { class: 'kart' },
      h('div', { class: 'kart-basligi' }, h('h3', {}, ikon('klasor'), `Proje: `, h('strong', {}, onizleme.proje.ad)),
        h('span', { class: 'alt' }, onizleme.proje.mevcut ? 'mevcut projeyle birleştirilecek' : 'yeni proje')),
      kaynakSecimi(),
      sayimTablosu(onizleme.sayimlar, sutunlar, 'Aktarım önizlemesi'),
      h('p', { class: 'soluk kucuk' }, `Koşudan hariç tutulan senaryo: ${onizleme.kosudanHaricSenaryo}. `,
        'Test verisi profillerinin TÜM alanları (kimlik bilgileri, adres, kart sahibi ve kart bilgileri…) kasada şifreli saklanır; yalnızca profil adları açıktır. ',
        'Varsa eski koşu sonuçları (allure-results) ve ekran görüntüsü/videoları da şifrelenerek aktarılır; eski klasörler silinmez.'),
      mod === 'ayarlar' ? h('p', { class: 'soluk kucuk' }, 'Birleştirme kuralı: yalnızca dosyada DEĞİŞEN kayıtlar güncellenir; dosyada değişmeyen kayıtlarda burada yaptığınız düzenlemeler korunur. Dosyadan kalkan senaryo ve profiller kaldırılır.') : null,
      uyariListesi(onizleme.uyarilar), mesaj.kutu,
      h('div', { class: 'dugmeler' }, uygula, h('button', { type: 'button', class: 'hayalet', onclick: () => geriDon() }, mod === 'hosgeldin' ? 'Geri' : 'Vazgeç')));
    uygula.addEventListener('click', async () => {
      mesaj.temizle();
      try {
        const govde = { adaptor: adaptor.ad, kaynakKlasoru };
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
      sonuc.sonucAktarimi && (sonuc.sonucAktarimi.sonuc || sonuc.sonucAktarimi.zatenVar)
        ? h('p', { class: 'kucuk' }, `Eski koşu sonuçları: ${sonuc.sonucAktarimi.kosu} koşu, ${sonuc.sonucAktarimi.sonuc} sonuç ve ${sonuc.sonucAktarimi.medya} ekran görüntüsü/video aktarıldı`
          + (sonuc.sonucAktarimi.zatenVar ? ` (daha önce aktarılmış ${sonuc.sonucAktarimi.zatenVar} sonuç atlandı)` : '') + '. Eski klasörler olduğu gibi duruyor.')
        : null,
      uyariListesi(sonuc.uyarilar),
      h('p', { class: 'soluk kucuk' }, 'Testler artık veriyi bu veritabanından okur. Terminalden çalıştırırken kasa parolası gizli olarak sorulur; Nöbetçi\'den başlatılan koşularda kasa açıksa sorulmaz.'),
      h('div', { class: 'dugmeler' }, devam)));
    devam.focus();
  };

  if (mod === 'hosgeldin') kasaAdimi();
  else onizlemeAdimi();
}
