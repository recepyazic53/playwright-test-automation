// Çalışma alanları (arayüz): başlangıç ekranındaki çalışma alanı listesi (Aç · ⋯ Yeniden adlandır / Bu bilgisayardan
// kaldır), "Yeni çalışma alanı" ad adımı (ad kilit açılmadan önce görünür — uyarılır), sağ üst hesap menüsü (Kilitle ·
// Yeniden adlandır · Çalışma alanını kapat) ve kapatma diyaloğu ("Son hâlini dışa aktarmak ister misiniz?").
// Sunucu: /platform/calisma-alanlari, /platform/calisma-alani/{olustur,ac,kapat,yeniden-adlandir,kaldir}.
// Kullanıcı verisi DOM'a yalnızca metin olarak yazılır (h(); innerHTML yok).
import { api, bildir, geriSayim, h, ikon, mesgulIken, parolaAlani, tarihMetni, yeniKimlik } from './ortak.js';
import { etiketliAlan, formDiyalogu } from './ekran-yonetimi.js';
import { disaAktarmaFormu } from './ayarlar.js';

export const AD_EN_COK = 60;
const ADIN_GORUNURLUGU = 'Çalışma alanının adı şifrelenmez: kilit açılmadan önce bu bilgisayarın başlangıç ekranında görünür. '
  + 'Müşteri ya da proje adı yerine nötr bir ad seçebilirsiniz (ör. "İş", "Deneme 2").';

const basHarf = (ad) => (String(ad || '?').trim()[0] || '?').toLocaleUpperCase('tr');

/** Basit ⋯ / açılır menü (klavye: ok tuşları, Escape). ogeler: [{ ikon, metin, fn, tehlikeli?, devreDisi?, title? } | 'ayrac'] */
export function acilirMenu({ dugme, ogeler, sinif = 'satir-menusu-kap', baslik = null }) {
  const oge = (o) => h('button', {
    type: 'button', role: 'menuitem', class: o.tehlikeli ? 'tehlikeli' : null, disabled: Boolean(o.devreDisi), title: o.title || null,
    onclick: (olay) => { olay.stopPropagation(); kapat(); o.fn(); }
  }, ikon(o.ikon), o.metin);
  const menu = h('div', { class: 'acilir-menu', role: 'menu', hidden: true },
    baslik ? h('div', { class: 'menu-baslik', 'aria-hidden': 'true' }, baslik) : null,
    ogeler.filter(Boolean).map((o) => (o === 'ayrac' ? h('hr', {}) : oge(o))));
  const kap = h('span', { class: sinif }, dugme, menu);
  const disTik = (o) => { if (!kap.contains(o.target)) kapat(); };
  function kapat() { menu.hidden = true; dugme.setAttribute('aria-expanded', 'false'); document.removeEventListener('click', disTik); }
  dugme.setAttribute('aria-haspopup', 'menu');
  dugme.setAttribute('aria-expanded', 'false');
  dugme.addEventListener('click', (o) => {
    o.preventDefault();
    o.stopPropagation();
    if (!menu.hidden) { kapat(); return; }
    menu.hidden = false; dugme.setAttribute('aria-expanded', 'true');
    setTimeout(() => document.addEventListener('click', disTik), 0);
    menu.querySelector('button:not(:disabled)')?.focus();
  });
  menu.addEventListener('keydown', (o) => {
    const liste = [...menu.querySelectorAll('button:not(:disabled)')];
    const j = liste.indexOf(document.activeElement);
    if (o.key === 'Escape') { kapat(); dugme.focus(); }
    else if (o.key === 'ArrowDown') { o.preventDefault(); liste[(j + 1) % liste.length]?.focus(); }
    else if (o.key === 'ArrowUp') { o.preventDefault(); liste[(j - 1 + liste.length) % liste.length]?.focus(); }
  });
  return kap;
}

// ---------------------------------------------------------------------------------------
// Diyaloglar
// ---------------------------------------------------------------------------------------

/**
 * Yeni çalışma alanının adı (ilk adım): oluşturulup açılır, ardından devam() (Yedek yükle / Yeni proje / Aktar).
 * @param {{ amac: string; devam: (alan: { id: string; ad: string }) => void }} s
 */
export function yeniAlanDiyalogu(s) {
  const ad = h('input', { type: 'text', maxlength: AD_EN_COK, required: true, autocomplete: 'off', spellcheck: 'false', placeholder: 'ör. İş' });
  formDiyalogu({
    baslik: 'Yeni çalışma alanı', ikonAd: 'cekmece', dugme: 'Oluştur ve devam et',
    aciklama: `Her çalışma alanının kendi veritabanı, şifreli medyası, yedekleri ve kasa parolası vardır. Sonraki adım: ${s.amac}.`,
    govde: [
      etiketliAlan('Çalışma alanı adı', ad),
      h('div', { class: 'not-kutusu uyari kucuk ad-gorunur-uyarisi', role: 'note' }, h('b', {}, 'Ad görünür: '), ADIN_GORUNURLUGU)
    ],
    gonder: async () => {
      if (!ad.value.trim()) throw new Error('Çalışma alanı adı boş olamaz.');
      const r = await api('/platform/calisma-alani/olustur', { govde: { ad: ad.value } });
      setTimeout(() => s.devam(r.calismaAlani), 0);
    }
  });
  ad.focus();
}

/** @param {{ alan: { id: string; ad: string }; sonra: () => void }} s */
export function alanYenidenAdlandirDiyalogu(s) {
  const ad = h('input', { type: 'text', value: s.alan.ad, maxlength: AD_EN_COK, required: true, autocomplete: 'off', spellcheck: 'false' });
  formDiyalogu({
    baslik: 'Çalışma alanını yeniden adlandır', ikonAd: 'duzenle', dugme: 'Kaydet',
    govde: [etiketliAlan('Çalışma alanı adı', ad), h('div', { class: 'not-kutusu uyari kucuk', role: 'note' }, h('b', {}, 'Ad görünür: '), ADIN_GORUNURLUGU)],
    gonder: async () => {
      if (!ad.value.trim()) throw new Error('Çalışma alanı adı boş olamaz.');
      const r = await api('/platform/calisma-alani/yeniden-adlandir', { govde: { id: s.alan.id, ad: ad.value } });
      bildir(`Çalışma alanının adı "${r.calismaAlani.ad}" olarak kaydedildi.`);
      s.sonra();
    }
  });
  ad.select();
}

/** Bu bilgisayardan kaldır: dışa aktarma uyarısı + adı yazarak onay. @param {{ alan: { id: string; ad: string; projeSayisi?: number | null }; sonra: () => void }} s */
export function alanKaldirDiyalogu(s) {
  const onay = h('input', { type: 'text', autocomplete: 'off', spellcheck: 'false', id: yeniKimlik('alan-onay') });
  const d = formDiyalogu({
    baslik: `Bu bilgisayardan kaldır: ${s.alan.ad}`, ikonAd: 'cop', dugme: 'Kalıcı olarak kaldır', tehlikeli: true,
    aciklama: 'Çalışma alanının veritabanı, şifreli medyası (ekran görüntüleri, videolar, iz ve senaryo dosyaları) ve bu bilgisayardaki yedekleri silinir. Bu işlem geri alınamaz.',
    govde: [
      h('div', { class: 'not-kutusu uyari kucuk', role: 'note' },
        h('b', {}, 'Önce dışa aktardınız mı? '),
        'Verileri saklamak istiyorsanız çalışma alanını açıp Ayarlar > Yedekleme > Dışa aktar ile bir .tayedek dosyası alın; kaldırdıktan sonra yalnızca o dosyadan geri yüklenebilir.'),
      h('p', { class: 'kucuk cok-soluk' }, 'Dosyalar silinmeden önce (en iyi çabayla) üzerine yazılır; SSD\'lerde bu fiziksel silmeyi garanti etmez.'),
      h('div', { class: 'alan ust-bosluk' }, h('label', { for: onay.id }, 'Onaylamak için çalışma alanının adını yazın: ', h('b', {}, s.alan.ad)), onay)
    ],
    gonder: async () => {
      const r = await api('/platform/calisma-alani/kaldir', { govde: { id: s.alan.id, onayAdi: onay.value } });
      bildir(`"${s.alan.ad}" bu bilgisayardan kaldırıldı (${r.silinenDosya} dosya silindi).`);
      s.sonra();
    }
  });
  const guncelle = () => { d.tamam.disabled = onay.value.replace(/\s+/g, ' ').trim() !== s.alan.ad; };
  onay.addEventListener('input', guncelle);
  guncelle();
  onay.focus();
}

/**
 * Çalışma alanını aç: o çalışma alanının kasa parolası (yanlış parolada çalışma alanı başına artan bekleme).
 * @param {{ alan: { id: string; ad: string; beklemeSaniye?: number; veritabaniVar?: boolean }; acildi: () => void }} s
 */
export function alanAcDiyalogu(s) {
  const parola = parolaAlani('Kasa parolası', { zorunlu: true, otomatik: 'current-password' });
  let durdur = () => {};
  const d = formDiyalogu({
    baslik: `Aç: ${s.alan.ad}`, ikonAd: 'kilit', dugme: 'Kilidi aç',
    aciklama: 'Bu çalışma alanının kasa parolasını girin. Açık çalışma alanı (varsa) kapatılır.',
    govde: [parola.kapsayici],
    gonder: async (tamam) => {
      if (!parola.girdi.value) throw new Error('Parolayı girin.');
      try {
        await api('/platform/calisma-alani/ac', { govde: { id: s.alan.id, parola: parola.girdi.value }, kilitOlayiYok: true });
      } catch (hata) {
        parola.girdi.select();
        let bekle = hata.durum === 429 ? hata.bekleSaniye : 0;
        if (hata.kod === 'PAROLA_YANLIS') {
          const liste = await api('/platform/calisma-alanlari').catch(() => ({ alanlar: [] }));
          bekle = (liste.alanlar.find((a) => a.id === s.alan.id) || {}).beklemeSaniye || 0;
        }
        if (bekle > 0) {
          beklemeBaslat(bekle, hata.kod === 'PAROLA_YANLIS' ? 'Parola yanlış.' : 'Art arda yanlış parola girildi.', tamam);
          return false;
        }
        throw hata.kod === 'PAROLA_YANLIS' ? new Error('Parola yanlış.') : hata;
      }
      parola.girdi.value = '';
      durdur();
      setTimeout(() => s.acildi(), 0);
    }
  });
  function beklemeBaslat(saniye, onMetin, tamam) {
    durdur();
    durdur = geriSayim(saniye, (kalan) => {
      // formDiyalogu gönderim bitince düğmeyi yeniden etkinleştirir; bekleme sürüyorsa hemen ardından tekrar kilitlenir.
      const ayarla = () => { tamam.disabled = kalan > 0; };
      ayarla();
      setTimeout(ayarla, 0);
      d.hataGoster(kalan > 0 ? `${onMetin} ${kalan} saniye sonra tekrar deneyebilirsiniz.` : `${onMetin} Şimdi tekrar deneyebilirsiniz.`);
    });
  }
  d.diyalog.addEventListener('close', () => durdur());
  if (s.alan.beklemeSaniye > 0) beklemeBaslat(s.alan.beklemeSaniye, 'Art arda yanlış parola girildi.', d.tamam);
  parola.girdi.focus();
}

/**
 * Çalışma alanını kapat. Son dışa aktarımdan beri değişiklik varsa "Son hâlini dışa aktarmak ister misiniz?"
 * [Dışa aktar ve kapat] [Dışa aktarmadan kapat] [Vazgeç]; yoksa yalnızca [Kapat] [Vazgeç] + not.
 * @param {{ alanAdi: string; kapandi: () => void }} s
 */
export async function kapatDiyalogu(s) {
  let durum;
  try { durum = await api('/platform/durum'); } catch (e) { bildir(e.message, 'hata'); return; }
  const deg = durum.degisiklik || { degisti: true, sonDisaAktarma: null };
  const baslikId = yeniKimlik('kapat-diyalog');
  const hataKutusu = h('div', { class: 'not-kutusu hata', role: 'alert', hidden: true });
  const hataGoster = (m) => { hataKutusu.textContent = m || ''; hataKutusu.hidden = !m; };
  const govde = h('div', { class: 'diyalog-govde' });
  const alt = h('div', { class: 'diyalog-alt' });
  const diyalog = h('dialog', { class: 'onay-diyalogu kapat-diyalogu', 'aria-labelledby': baslikId }, govde, alt);
  diyalog.addEventListener('close', () => diyalog.remove());
  const vazgec = h('button', { type: 'button', class: 'hayalet', onclick: () => diyalog.close() }, 'Vazgeç');
  const kapat = async (dugme) => {
    hataGoster('');
    try {
      await mesgulIken(dugme, 'Kapatılıyor…', () => api('/platform/calisma-alani/kapat', { govde: {} }));
    } catch (e) {
      hataGoster(e.message || String(e));
      return false;
    }
    diyalog.close();
    bildir(`"${s.alanAdi}" kapatıldı.`);
    s.kapandi();
    return true;
  };
  const sonMetin = deg.sonDisaAktarma ? `Son dışa aktarma: ${tarihMetni(deg.sonDisaAktarma)}.` : 'Bu çalışma alanı bu bilgisayarda hiç dışa aktarılmadı.';
  const baslik = h('h2', { id: baslikId }, h('span', { class: 'diyalog-ikon', 'aria-hidden': 'true' }, ikon('cikis')), 'Çalışma alanını kapat');
  const ortakNot = h('p', { class: 'kucuk cok-soluk' }, 'Kapatınca kasa kilitlenir ve başlangıç ekranına dönülür; veriler bu bilgisayarda kalır.');
  if (deg.degisti) {
    const disaDugme = h('button', { type: 'button', class: 'birincil' }, ikon('indir'), 'Dışa aktar ve kapat');
    const kapatDugme = h('button', { type: 'button' }, 'Dışa aktarmadan kapat');
    kapatDugme.addEventListener('click', () => kapat(kapatDugme));
    disaDugme.addEventListener('click', async () => {
      hataGoster('');
      const tahmin = await api('/platform/yedek/tahmin').catch(() => null);
      const { form, parola } = disaAktarmaFormu(tahmin, {
        baslik: null, aciklama: 'Seçtiğiniz medya dosyalarıyla şifreli bir .tayedek dosyası indirilir, ardından çalışma alanı kapatılır.',
        dugmeMetni: 'Dışa aktar ve kapat', kart: false,
        ekDugmeler: [h('button', { type: 'button', class: 'hayalet', onclick: () => diyalog.close() }, 'Vazgeç')],
        bitti: async () => {
          // İndirme tarayıcıda başladı; sunucu dosyayı çalışma alanı kapansa da sunar.
          await new Promise((coz) => setTimeout(coz, 600));
          const kapatici = form.querySelector('button[type="submit"]');
          await kapat(kapatici);
        }
      });
      govde.replaceChildren(baslik, h('p', { class: 'soluk' }, `"${s.alanAdi}" — son hâli dışa aktarılıyor.`), form, hataKutusu);
      alt.hidden = true;
      parola.girdi.focus();
    });
    govde.append(baslik,
      h('p', {}, h('b', {}, 'Son hâlini dışa aktarmak ister misiniz?')),
      h('p', { class: 'soluk' }, `"${s.alanAdi}" son dışa aktarımdan beri değişti. ${sonMetin}`),
      ortakNot, hataKutusu);
    alt.append(vazgec, kapatDugme, disaDugme);
    document.body.append(diyalog);
    diyalog.showModal();
    disaDugme.focus();
  } else {
    const kapatDugme = h('button', { type: 'button', class: 'birincil' }, ikon('cikis'), 'Kapat');
    kapatDugme.addEventListener('click', () => kapat(kapatDugme));
    govde.append(baslik,
      h('div', { class: 'not-kutusu basari kucuk degisiklik-yok', role: 'note' }, `Son dışa aktarımdan beri değişiklik yok. ${sonMetin}`),
      ortakNot, hataKutusu);
    alt.append(vazgec, kapatDugme);
    document.body.append(diyalog);
    diyalog.showModal();
    kapatDugme.focus();
  }
}

// ---------------------------------------------------------------------------------------
// Başlangıç ekranındaki liste ve sağ üst hesap menüsü
// ---------------------------------------------------------------------------------------

/**
 * Çalışma alanı kartları. alanlar: GET /platform/calisma-alanlari > alanlar.
 * @param {Array<{ id: string; ad: string; sonAcilma: string | null; olusturulma: string | null; projeSayisi: number | null; beklemeSaniye: number; veritabaniVar: boolean }>} alanlar
 * @param {{ acildi: () => void; yenile: () => void }} s
 */
export function alanListesi(alanlar, s) {
  if (!alanlar.length) return null;
  const kart = (a) => {
    const ac = h('button', { type: 'button', class: 'birincil', 'aria-label': `${a.ad}: aç` }, ikon('kilit'), 'Aç');
    ac.addEventListener('click', () => {
      if (!a.veritabaniVar) {
        // Kurulumu yarım kalmış alan: parola yok, doğrudan açılır (başlangıç seçenekleri gelir).
        mesgulIken(ac, 'Açılıyor…', () => api('/platform/calisma-alani/ac', { govde: { id: a.id, parola: '' } })).then(() => s.acildi(), (e) => bildir(e.message, 'hata'));
        return;
      }
      alanAcDiyalogu({ alan: a, acildi: s.acildi });
    });
    const menu = acilirMenu({
      dugme: h('button', { type: 'button', class: 'ikon-dugme', 'aria-label': `Çalışma alanı işlemleri: ${a.ad}`, title: 'Çalışma alanı işlemleri' }, '⋯'),
      ogeler: [
        { ikon: 'duzenle', metin: 'Yeniden adlandır', fn: () => alanYenidenAdlandirDiyalogu({ alan: a, sonra: s.yenile }) },
        'ayrac',
        { ikon: 'cop', metin: 'Bu bilgisayardan kaldır…', tehlikeli: true, fn: () => alanKaldirDiyalogu({ alan: a, sonra: s.yenile }) }
      ]
    });
    const meta = [
      a.sonAcilma ? `Son açılma: ${tarihMetni(a.sonAcilma)}` : a.olusturulma ? `Oluşturulma: ${tarihMetni(a.olusturulma)}` : null,
      typeof a.projeSayisi === 'number' ? `${a.projeSayisi} proje` : null,
      a.veritabaniVar ? null : 'kurulum tamamlanmadı'
    ].filter(Boolean);
    return h('li', { class: 'ca-karti', 'data-alan': a.id },
      h('span', { class: 'ca-avatar', 'aria-hidden': 'true' }, basHarf(a.ad)),
      h('div', { class: 'ca-bilgi' }, h('strong', { class: 'ca-adi' }, a.ad), h('span', { class: 'ca-meta' }, meta.join(' · '))),
      a.beklemeSaniye > 0 ? h('span', { class: 'rozet atlanan', title: 'Art arda yanlış parola' }, `${a.beklemeSaniye} sn bekleme`) : null,
      h('div', { class: 'ca-eylemler' }, ac, menu));
  };
  return h('section', { class: 'ca-listesi', 'aria-labelledby': 'alan-listesi-basligi' },
    h('div', { class: 'ca-listesi-baslik' }, h('h2', { id: 'alan-listesi-basligi' }, 'Çalışma alanları'),
      h('span', { class: 'kucuk cok-soluk' }, 'Adlar kilit açılmadan önce görünür; içerik şifrelidir.')),
    h('ul', { class: 'ca-kartlari' }, alanlar.map(kart)));
}

/**
 * Sağ üst hesap menüsü: açık çalışma alanının adı + Kilitle · Yeniden adlandır · Çalışma alanını kapat.
 * @param {{ calismaAlani: { id: string; ad: string; sabit: boolean } | null; kilitle: () => Promise<void>; kapandi: () => void; yenile: () => void }} s
 */
export function hesapMenusu(s) {
  const alan = s.calismaAlani;
  const ad = alan ? (alan.sabit ? 'Tek veritabanı' : alan.ad) : 'Çalışma alanı';
  const dugme = h('button', { type: 'button', class: 'hesap-dugmesi', title: `Çalışma alanı: ${ad}` },
    h('span', { class: 'ca-avatar kucuk', 'aria-hidden': 'true' }, basHarf(ad)),
    h('span', { class: 'hesap-adi', title: ad }, ad), ikon('asagi'));
  dugme.setAttribute('aria-label', `Çalışma alanı menüsü: ${ad}`);
  return acilirMenu({
    dugme, sinif: 'satir-menusu-kap hesap-menusu', baslik: 'Çalışma alanı',
    ogeler: [
      { ikon: 'kilit', metin: 'Kilitle', fn: () => { s.kilitle(); } },
      alan && !alan.sabit ? { ikon: 'duzenle', metin: 'Yeniden adlandır', fn: () => alanYenidenAdlandirDiyalogu({ alan, sonra: s.yenile }) } : null,
      alan && !alan.sabit ? 'ayrac' : null,
      alan && !alan.sabit ? { ikon: 'cikis', metin: 'Çalışma alanını kapat…', fn: () => kapatDiyalogu({ alanAdi: alan.ad, kapandi: s.kapandi }) } : null
    ]
  });
}
