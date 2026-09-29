// Proje işlemleri: Yeniden adlandır · Varsayılan yap · Sil (kalıcı). Üst çubuktaki proje seçicide her projenin ⋯ satırı ve
// Ayarlar > Proje ve ortamlar > Projeler listesi aynı işlemleri (projeIslemleri) ve diyalogları kullanır.
// Sil: önce kuru çalıştırma (sayılar), onay için projenin adı birebir yazılır; sunucu silmeden önce yedek alır ve mevcut
// yedeklere dokunmaz. Sunucu: /platform/proje/kaydet | varsayilan | sil/onizle | sil (bkz. scripts/platform/proje-yonetimi.mjs).
// Kullanıcı verisi DOM'a yalnızca metin olarak yazılır (h(); innerHTML yok).
import { api, bildir, h, ikon, yeniKimlik } from './ortak.js';
import { etiketliAlan, formDiyalogu } from './ekran-yonetimi.js';

/** @param {{ proje: { id: string; ad: string; aciklama?: string | null }; sonra: () => void }} s */
export function yenidenAdlandirDiyalogu(s) {
  const ad = h('input', { type: 'text', value: s.proje.ad, maxlength: 120, required: true, autocomplete: 'off' });
  formDiyalogu({
    baslik: 'Projeyi yeniden adlandır', ikonAd: 'duzenle', dugme: 'Kaydet',
    aciklama: 'Yalnızca görünen ad değişir; ekranlar, senaryolar ve sonuçlar projeye bağlı kalır.',
    govde: [etiketliAlan('Proje adı', ad)],
    gonder: async () => {
      if (!ad.value.trim()) throw new Error('Proje adı boş olamaz.');
      const r = await api('/platform/proje/kaydet', { govde: { id: s.proje.id, ad: ad.value } });
      bildir(`Proje adı "${r.proje.ad}" olarak kaydedildi.`);
      s.sonra();
    }
  });
  ad.select();
}

/** @param {{ proje: { id: string; ad: string }; sonra: (sonProjeSilindi: boolean) => void }} s */
export async function silDiyalogu(s) {
  let o;
  try {
    o = (await api('/platform/proje/sil/onizle', { govde: { id: s.proje.id } })).onizleme;
  } catch (e) { if (e.durum !== 423) bildir(e.message, 'hata'); return; }
  const n = o.sayilar;
  const sayi = (etiket, deger) => h('div', {}, h('dt', {}, etiket), h('dd', {}, String(deger)));
  const onay = h('input', { type: 'text', autocomplete: 'off', spellcheck: 'false', id: yeniKimlik('proje-onay') });
  const d = formDiyalogu({
    baslik: `Projeyi kalıcı sil: ${o.proje.ad}`, ikonAd: 'cop', dugme: 'Kalıcı olarak sil', tehlikeli: true,
    aciklama: 'Projenin ortamları, giriş/bağlam profilleri, test verisi, ekranları, senaryoları, servisleri (senaryoları, akışları, koşuları dahil), rapor verileri (ekipler; kritik, ekip ve süre eşiği işaretleri), kurtarma kuralları, koşu sonuçları ve şifreli medyası bu çalışma alanından silinir. Bu işlem geri alınamaz.',
    govde: [
      h('dl', { class: 'onay-ozeti dortlu' },
        sayi('Ekran', n.ekran), sayi('Senaryo', n.senaryo), sayi('Koşu', n.kosu), sayi('Sonuç', n.sonuc),
        sayi('Medya', n.medya), sayi('Ortam', n.ortam), sayi('Profil', n.girisProfili + n.baglamProfili), sayi('Test verisi', n.testVerisi),
        sayi('Servis', n.servis), sayi('Servis senaryosu', n.servisSenaryosu), sayi('Servis akışı', n.servisAkisi), sayi('Servis koşusu', n.servisKosusu),
        sayi('Ekip', n.ekip ?? 0), sayi('Rapor işareti', n.raporIsareti ?? 0), sayi('Kurtarma kuralı', n.kurtarmaKurali ?? 0)),
      h('div', { class: 'not-kutusu bilgi kucuk', role: 'note' },
        'Silmeden önce bu çalışma alanının yedekler klasörüne otomatik bir yedek alınır; mevcut yedekler silinmez. Geri almak için Ayarlar > Yedekleme > İçe aktar.'),
      o.sonProje ? h('p', { class: 'kucuk soluk' }, 'Bu, çalışma alanındaki son proje: silindikten sonra yeni proje sihirbazı açılır.') : null,
      h('div', { class: 'alan ust-bosluk' }, h('label', { for: onay.id }, 'Onaylamak için projenin adını yazın: ', h('b', {}, o.proje.ad)), onay)
    ],
    gonder: async () => {
      const r = await api('/platform/proje/sil', { govde: { id: o.proje.id, onayAdi: onay.value } });
      bildir(`"${o.proje.ad}" silindi (${r.silinen.senaryo} senaryo, ${r.silinen.kosu} koşu, ${r.silinen.medyaDosyasi} medya dosyası). Önce yedek alındı.`);
      s.sonra(o.sonProje);
    }
  });
  const guncelle = () => { d.tamam.disabled = onay.value.replace(/\s+/g, ' ').trim() !== o.proje.ad; };
  onay.addEventListener('input', guncelle);
  guncelle();
  onay.focus();
}

/**
 * Bir projenin işlemleri: üst çubuktaki ⋯ işlem satırı ve Ayarlar > Proje ve ortamlar > Projeler aynı listeyi ve diyalogları kullanır.
 * once: işlem başlamadan (ör. açılır listeyi kapat); sonra: işlem bitince yeniden çiz; silinceAdres: açık proje silinirse gidilecek adres.
 * @param {{ proje: { id: string; ad: string; aciklama?: string | null }; durum: { proje: { id: string } | null; varsayilanProjeId: string | null };
 *   once?: () => void; sonra: () => void; silinceAdres?: string }} s
 * @returns {Array<{ ad: string; ikon: string; metin: string; kisaMetin: string; devreDisi?: boolean; title?: string; tehlikeli?: boolean; fn: () => void }>}
 */
export function projeIslemleri(s) {
  const p = s.proje;
  const once = () => { if (s.once) s.once(); };
  const varsayilan = p.id === s.durum.varsayilanProjeId;
  return [
    { ad: 'adlandir', ikon: 'duzenle', metin: 'Yeniden adlandır', kisaMetin: 'Yeniden adlandır', fn: () => { once(); yenidenAdlandirDiyalogu({ proje: p, sonra: s.sonra }); } },
    {
      ad: 'varsayilan', ikon: 'yildiz', metin: varsayilan ? 'Varsayılan proje' : 'Varsayılan yap', kisaMetin: 'Varsayılan yap', devreDisi: varsayilan,
      title: varsayilan ? 'Bu proje zaten varsayılan; başka bir projeyi varsayılan yapınca bu seçim kalkar.' : 'Seçim hatırlanmadığında (ör. başka tarayıcıda) açılan proje',
      fn: async () => {
        once();
        try {
          await api('/platform/proje/varsayilan', { govde: { id: p.id } });
          bildir(`"${p.ad}" varsayılan proje yapıldı.`);
          s.sonra();
        } catch (e) { if (e.durum !== 423) bildir(e.message, 'hata'); }
      }
    },
    {
      ad: 'sil', ikon: 'cop', metin: 'Sil (kalıcı)…', kisaMetin: 'Sil', tehlikeli: true,
      fn: () => {
        once();
        silDiyalogu({
          proje: p,
          sonra: () => {
            // Silinen proje açıksa: kalan projelerden biri (varsayılan ya da ilk) açılır; hiç kalmadıysa sihirbaz.
            if (s.durum.proje && s.durum.proje.id === p.id) { location.hash = s.silinceAdres || '#/sonuclar'; location.reload(); return; }
            s.sonra();
          }
        });
      }
    }
  ];
}

/**
 * Proje satırının ⋯ düğmesi ve satırın ALTINA açılan satır içi işlem satırı (Yeniden adlandır · Varsayılan yap · Sil).
 * Üstte açılan bir katman değildir: listenin içinde yer kaplar, diğer satırları ve "Proje ekle"yi örtmez; dar ekranda sarılır.
 * Kap "display: contents" ile satırın esnek düzenine katılır (düğme satırda, işlem satırı alt satırda tam genişlik).
 * Klavye: ok tuşları açılır listenin görünür düğmeleri arasında gezer (uygulama.js); Esc işlem satırını kapatıp ⋯'e döner.
 * @param {{ proje: { id: string; ad: string; aciklama?: string | null }; durum: { proje: { id: string } | null; varsayilanProjeId: string | null };
 *   kapat: () => void; yonlendir: () => void; projeleriYenile: () => Promise<void>; projeyeGec: (id: string) => void }} s
 */
export function projeMenusu(s) {
  const p = s.proje;
  const panelId = yeniKimlik('proje-islemleri');
  const dugme = h('button', {
    type: 'button', class: 'ikon-dugme proje-islem-dugmesi', 'aria-label': `Proje işlemleri: ${p.ad}`, title: 'Proje işlemleri',
    'aria-expanded': 'false', 'aria-controls': panelId
  }, '⋯');
  const ogeler = projeIslemleri({ proje: p, durum: s.durum, once: s.kapat, sonra: () => { s.yonlendir(); } });
  const panel = h('div', { id: panelId, class: 'proje-islemleri', role: 'group', 'aria-label': `${p.ad}: işlemler`, hidden: true },
    ogeler.map((o) => h('button', {
      type: 'button', role: 'menuitem', class: o.tehlikeli ? 'tehlikeli' : null, disabled: Boolean(o.devreDisi), title: o.title || null,
      'data-islem': o.ad, onclick: (olay) => { olay.stopPropagation(); o.fn(); }
    }, ikon(o.ikon), o.metin)));
  const kap = h('span', { class: 'proje-islem-kap' }, dugme, panel);
  /** @param {boolean} acik */
  const ac = (acik) => {
    if (acik) {
      // Aynı anda tek işlem satırı açık.
      const liste = kap.closest('.proje-menusu');
      for (const k of liste ? liste.querySelectorAll('.proje-islem-kap') : []) if (k !== kap) k.dispatchEvent(new CustomEvent('proje-islem-kapat'));
    }
    panel.hidden = !acik;
    dugme.setAttribute('aria-expanded', String(acik));
    kap.closest('.proje-satiri')?.classList.toggle('islem-acik', acik);
    if (acik) panel.scrollIntoView({ block: 'nearest' });
  };
  kap.addEventListener('proje-islem-kapat', () => ac(false));
  dugme.addEventListener('click', (o) => {
    o.preventDefault();
    o.stopPropagation();
    const acilacak = panel.hidden;
    ac(acilacak);
    if (acilacak) /** @type {HTMLButtonElement | null} */ (panel.querySelector('button:not(:disabled)'))?.focus();
  });
  kap.addEventListener('keydown', (o) => {
    if (o.key !== 'Escape' || panel.hidden) return;
    o.stopPropagation();
    ac(false);
    dugme.focus();
  });
  return kap;
}
