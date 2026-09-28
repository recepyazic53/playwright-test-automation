// VERİ KLASÖRÜ ve YEDEK KLASÖRÜ SEÇİMİ (arayüz). Sunucu: /platform/veri-klasoru* (kasa gerekmez), /platform/yedek/klasor* (kasada),
// yeniden başlatma /platform/yeniden-baslat. Kurallar: scripts/platform/ayarlar/klasor-secimi.mjs.
//   · veriKlasoruSatiri(): karşılama / başlangıç ekranında kapalı "Ayrıntılar" içinde "Veri klasörü: <yol> [Değiştir…] [Var olan veri klasörünü aç…]".
//   · veriKlasoruKarti(): Ayarlar > Yedekleme > "Veri klasörü" kartı.
//   · yedekKlasoruBolumu(bilgi, yenile): Ayarlar > Yedekleme > Otomatik yedekler içindeki "Yedek klasörü" satırı.
// Tarayıcı bir klasör seçme penceresi açamaz: yol metin olarak yazılır, sunucu doğrular (mutlak yol, sistem / program klasörü
// değil, yazılabilir) ve durumu söyler. Hiçbir şey kendiliğinden taşınmaz; taşımada kopyalanır, doğrulanır, eski klasör SİLİNMEZ.
import { api, bildir, h, ikon, mesajKutusu, mesgulIken, yeniKimlik, yerlestir } from './ortak.js';

const DURUM_METNI = {
  yok: 'Klasör yok: oluşturulacak (boş).',
  bos: 'Klasör boş.',
  nobetci: 'Bu klasörde Nöbetçi verisi var (çalışma alanları / kasa).',
  dolu: 'Klasörde başka dosyalar var: taşımak ya da boş başlamak için boş bir klasör seçin.'
};

/** Sunucu yeniden açılınca sayfayı yeniler (en çok ~60 sn bekler). */
async function yenidenAcilinca(durumMetni) {
  await new Promise((c) => setTimeout(c, 1200));
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch('/saglik', { cache: 'no-store' });
      if (r.ok) { location.href = '/'; return; }
    } catch { /* henüz açılmadı */ }
    durumMetni.textContent = `Nöbetçi yeniden başlatılıyor… (${i + 1})`;
    await new Promise((c) => setTimeout(c, 1000));
  }
  durumMetni.textContent = 'Nöbetçi yeniden açılmadı. Başlatıcıyı (Nöbetçi.exe / Nöbetçi.app) kendiniz açın.';
}

/** "Nöbetçi'yi yeniden başlat" düğmesi ya da (başlatıcı desteklemiyorsa) yönerge. @param {{ yenidenBaslatilabilir: boolean }} bilgi */
function yenidenBaslatAlani(bilgi) {
  if (!bilgi.yenidenBaslatilabilir) {
    return h('p', { class: 'not-kutusu uyari kucuk', role: 'status' }, h('b', {}, 'Yeniden başlatma gerekiyor: '), 'Nöbetçi\'yi kapatıp yeniden açın; yeni veri klasörü açılışta kullanılır.');
  }
  const durumMetni = h('span', { class: 'kucuk soluk', 'aria-live': 'polite' });
  const dugme = h('button', { type: 'button', class: 'birincil' }, ikon('yenile'), 'Nöbetçi\'yi yeniden başlat');
  dugme.addEventListener('click', async () => {
    try {
      await mesgulIken(dugme, 'Yeniden başlatılıyor…', () => api('/platform/yeniden-baslat', { govde: {}, kilitOlayiYok: true }));
      dugme.disabled = true;
      await yenidenAcilinca(durumMetni);
    } catch (hata) { durumMetni.textContent = hata.message; }
  });
  return h('div', { class: 'dugmeler' }, dugme, durumMetni);
}

/**
 * Veri klasörü değiştirme penceresi. kip: 'tasi' (mevcut veriyi yeni klasöre kopyala + doğrula; eski silinmez) | 'bos' (yeni klasörde
 * boş başla) | 'ac' (yeni klasördeki mevcut Nöbetçi verisini aç). ilkKip: pencere açılınca seçili gelen.
 * @param {Record<string, any>} bilgi GET /platform/veri-klasoru @param {{ ilkKip?: 'tasi' | 'bos' | 'ac'; baslik?: string }} [s]
 */
export function veriKlasoruDiyalogu(bilgi, s = {}) {
  const yol = h('input', { type: 'text', autocomplete: 'off', spellcheck: 'false', class: 'mono', placeholder: 'ör. D:\\Nöbetçi verisi', 'aria-label': 'Yeni veri klasörü (tam yol)' });
  const denetle = h('button', { type: 'button' }, ikon('ara'), 'Denetle');
  const sonuc = h('div', { class: 'klasor-inceleme', 'aria-live': 'polite' });
  const ad = yeniKimlik('veri-kip');
  const kipler = /** @type {Array<['tasi' | 'bos' | 'ac', string, string]>} */ ([
    ['tasi', 'Mevcut veriyi yeni klasöre taşı', 'Kopyalanır ve her dosya doğrulanır; eski klasör SİLİNMEZ. Açık çalışma alanı kapanır (kasa kilitlenir).'],
    ['bos', 'Yeni klasörde boş başla', 'Mevcut veri eski klasörde olduğu gibi kalır; yeni klasörde ilk kurulum yapılır.'],
    ['ac', 'Yeni klasördeki mevcut veriyi aç', 'Daha önce kullanılan (ör. eski sürümün) Nöbetçi veri klasörü.']
  ]);
  const radyolar = kipler.map(([deger, baslik, aciklama]) => {
    const r = h('input', { type: 'radio', name: ad, value: deger, id: `${ad}-${deger}`, checked: (s.ilkKip || 'tasi') === deger, disabled: true });
    return { deger, r, el: h('label', { class: 'onay-satiri', for: r.id }, r, h('span', {}, h('b', {}, baslik), h('small', { class: 'blok soluk' }, aciklama))) };
  });
  const mesaj = mesajKutusu();
  const uygula = h('button', { type: 'button', class: 'birincil', disabled: true }, ikon('onay'), 'Uygula');
  const kapat = h('button', { type: 'button', class: 'hayalet' }, 'Kapat');
  const govde = h('div', { class: 'diyalog-govde' },
    h('h2', { id: 'veri-klasoru-basligi' }, h('span', { class: 'diyalog-ikon', 'aria-hidden': 'true' }, ikon('klasor')), s.baslik || 'Veri klasörünü değiştir'),
    h('p', { class: 'soluk kucuk' }, 'Şu an: ', h('code', {}, bilgi.etkin)),
    h('div', { class: 'alan' }, h('label', { for: yol.id || (yol.id = yeniKimlik('veri-yol')) }, 'Yeni veri klasörü (tam yol)'),
      h('div', { class: 'satir-girdi' }, yol, denetle),
      h('div', { class: 'yardim' }, 'Paketin dışında, yerel diskte bir klasör önerilir. Nöbetçi\'nin program klasörünün içi ve sistem klasörleri seçilemez.')),
    sonuc,
    h('fieldset', { class: 'kip-secimi' }, h('legend', {}, 'Ne yapılsın?'), radyolar.map((x) => x.el)),
    mesaj.kutu);
  const diyalog = h('dialog', { class: 'onay-diyalogu genis-onay veri-klasoru-diyalogu', 'aria-labelledby': 'veri-klasoru-basligi' }, govde, h('div', { class: 'diyalog-alt' }, kapat, uygula));
  let inceleme = null;
  const kipDurumu = () => {
    for (const x of radyolar) {
      const uygun = inceleme && !inceleme.ayni && (x.deger === 'ac' ? inceleme.durum === 'nobetci' : inceleme.durum === 'bos' || inceleme.durum === 'yok');
      x.r.disabled = !uygun;
      if (!uygun && x.r.checked) x.r.checked = false;
    }
    if (!radyolar.some((x) => x.r.checked)) { const ilk = radyolar.find((x) => !x.r.disabled); if (ilk) ilk.r.checked = true; }
    uygula.disabled = !radyolar.some((x) => x.r.checked);
  };
  yol.addEventListener('input', () => { inceleme = null; yerlestir(sonuc); kipDurumu(); });
  denetle.addEventListener('click', async () => {
    mesaj.temizle();
    try {
      const y = await mesgulIken(denetle, 'Denetleniyor…', () => api('/platform/veri-klasoru/incele', { govde: { klasor: yol.value }, kilitOlayiYok: true }));
      inceleme = y.inceleme;
      yerlestir(sonuc, h('p', { class: inceleme.ayni ? 'not-kutusu uyari kucuk' : 'not-kutusu bilgi kucuk' }, inceleme.ayni ? 'Bu klasör zaten kullanılıyor.' : DURUM_METNI[inceleme.durum] || inceleme.durum),
        inceleme.uyarilar.map((u) => h('p', { class: 'not-kutusu uyari kucuk', role: 'note' }, ikon('uyari'), ' ', u)));
    } catch (hata) { inceleme = null; yerlestir(sonuc); mesaj.goster(hata.message); }
    kipDurumu();
  });
  uygula.addEventListener('click', async () => {
    const kip = radyolar.find((x) => x.r.checked)?.deger;
    if (!kip || !inceleme) return;
    mesaj.temizle();
    try {
      const y = await mesgulIken(uygula, kip === 'tasi' ? 'Kopyalanıyor ve doğrulanıyor…' : 'Kaydediliyor…',
        () => api('/platform/veri-klasoru/degistir', { govde: { klasor: inceleme.yol, kip, onay: true }, kilitOlayiYok: true }));
      yerlestir(govde,
        h('h2', { id: 'veri-klasoru-basligi' }, h('span', { class: 'diyalog-ikon', 'aria-hidden': 'true' }, ikon('onay')), 'Veri klasörü seçildi'),
        h('p', {}, 'Yeni veri klasörü: ', h('code', {}, y.yeniKlasor)),
        y.kopya ? h('p', { class: 'kucuk' }, `${y.kopya.dosya} dosya kopyalandı ve doğrulandı (${(y.kopya.bayt / 1048576).toFixed(1)} MB).`) : null,
        h('p', { class: 'not-kutusu bilgi kucuk' }, 'Eski veri klasörü silinmedi: ', h('code', {}, y.eskiKlasor), '. Yeni klasörde her şeyin yerinde olduğunu gördükten sonra dilerseniz kendiniz silebilirsiniz.'),
        yenidenBaslatAlani(y));
      uygula.hidden = true;
    } catch (hata) { mesaj.goster(hata.message); }
  });
  kapat.addEventListener('click', () => diyalog.close());
  diyalog.addEventListener('close', () => diyalog.remove());
  document.body.append(diyalog);
  diyalog.showModal();
  yol.focus();
  kipDurumu();
  return diyalog;
}

/** Karşılama / başlangıç ekranı: kapalı "Ayrıntılar" bölümü içinde veri klasörü satırı (seçim yapılamıyorsa yalnız bilgi). */
export function veriKlasoruSatiri() {
  const satir = h('div', { class: 'veri-klasoru-satiri' });
  // Günlük işte gerekmeyen bilgi: varsayılan kapalı; içindeki Değiştir / Var olan veri klasörünü aç aynen.
  const kap = h('details', { class: 'veri-klasoru-ayrintilari' }, h('summary', { class: 'kucuk soluk' }, 'Ayrıntılar'), satir);
  api('/platform/veri-klasoru', { kilitOlayiYok: true }).then(({ veriKlasoru: b }) => {
    yerlestir(satir, h('span', { class: 'kucuk soluk' }, ikon('klasor'), ' Veri klasörü: '), h('code', { class: 'kucuk', title: b.etkin }, b.etkin),
      b.secilebilir ? h('button', { type: 'button', class: 'bag-dugme', onclick: () => veriKlasoruDiyalogu(b, { ilkKip: 'bos' }) }, 'Değiştir…') : null,
      b.secilebilir ? h('button', { type: 'button', class: 'bag-dugme', onclick: () => veriKlasoruDiyalogu(b, { ilkKip: 'ac', baslik: 'Var olan veri klasörünü aç' }) }, 'Var olan veri klasörünü aç…') : null);
  }).catch(() => kap.remove());
  return kap;
}

/** Ayarlar > Yedekleme > "Veri klasörü" kartı. */
export async function veriKlasoruKarti() {
  const { veriKlasoru: b } = await api('/platform/veri-klasoru');
  const degistir = h('button', { type: 'button', disabled: !b.secilebilir, onclick: () => veriKlasoruDiyalogu(b) }, ikon('klasor'), 'Değiştir…');
  return h('div', { class: 'kart', role: 'group', 'aria-label': 'Veri klasörü' },
    h('div', { class: 'kart-basligi' }, h('h3', {}, ikon('klasor'), 'Veri klasörü'), h('div', { class: 'sag' }, degistir)),
    h('p', { class: 'soluk' }, 'Çalışma alanları, şifreli kasa, ekran görüntüleri ve (başka seçilmediyse) yedekler bu klasördedir.'),
    h('p', { class: 'kucuk' }, h('code', {}, b.etkin), b.secili ? null : h('span', { class: 'soluk' }, ' (varsayılan)')),
    b.uyarilar.map((u) => h('p', { class: 'not-kutusu uyari kucuk', role: 'note' }, u)),
    b.secilebilir ? null : h('p', { class: 'soluk kucuk' }, 'Bu kurulumda veri klasörü buradan değiştirilemez (geliştirme kurulumu: NOBETCI_VERI_KOKU ortam değişkeni).'));
}

/**
 * Otomatik yedekler kartındaki "Yedek klasörü" bölümü: yol + Değiştir (boş = varsayılan). Mevcut yedekler taşınmaz.
 * @param {Record<string, any>} bilgi GET /platform/yedek/klasor > klasor @param {() => void} yenile
 */
export function yedekKlasoruBolumu(bilgi, yenile) {
  const girdi = h('input', { type: 'text', autocomplete: 'off', spellcheck: 'false', class: 'mono', value: bilgi.secili || '', placeholder: bilgi.varsayilan, 'aria-label': 'Yedek klasörü (tam yol; boş = varsayılan)' });
  const mesaj = mesajKutusu();
  const kaydet = h('button', { type: 'button' }, ikon('onay'), 'Kaydet');
  kaydet.addEventListener('click', async () => {
    mesaj.temizle();
    try {
      const y = await mesgulIken(kaydet, 'Denetleniyor…', () => api('/platform/yedek/klasor/kaydet', { govde: { klasor: girdi.value } }));
      bildir(y.eskiYedekSayisi ? `Yedek klasörü değişti. Önceki ${y.eskiYedekSayisi} yedek eski klasörde kaldı (taşınmadı): ${y.eskiKlasor}` : 'Yedek klasörü kaydedildi.');
      for (const u of y.uyarilar || []) bildir(u, 'hata');
      yenile();
    } catch (hata) { mesaj.goster(hata.message); }
  });
  return h('div', { class: 'yedek-klasoru', role: 'group', 'aria-label': 'Yedek klasörü' },
    h('div', { class: 'alan' }, h('label', { for: girdi.id || (girdi.id = yeniKimlik('yedek-klasoru')) }, 'Yedek klasörü'),
      h('div', { class: 'satir-girdi' }, girdi, kaydet),
      h('div', { class: 'yardim' }, bilgi.ortamdan ? 'Bu kurulumda PLATFORM_YEDEK_KLASORU ortam değişkeniyle belirlenmiş.' : 'Boş bırakılırsa veri klasörü altındaki varsayılan kullanılır. Otomatik ve "Şimdi yedek al" yedekleri buraya yazılır; mevcut yedekler taşınmaz.')),
    bilgi.seciliBulunamadi ? h('p', { class: 'not-kutusu uyari kucuk', role: 'note' }, `Seçili klasör bulunamadı (${bilgi.secili}); varsayılan kullanılıyor.`) : null,
    mesaj.kutu);
}
