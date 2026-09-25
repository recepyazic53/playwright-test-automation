// Proje ⋯ menüsü (üst çubuktaki proje seçicide her projenin satırı): Yeniden adlandır · Varsayılan yap · Sil (kalıcı).
// Sil: önce kuru çalıştırma (sayılar), onay için projenin adı birebir yazılır; sunucu silmeden önce yedek alır ve mevcut
// yedeklere dokunmaz. Sunucu: /platform/proje/kaydet | varsayilan | sil/onizle | sil (bkz. scripts/platform/proje-yonetimi.mjs).
// Kullanıcı verisi DOM'a yalnızca metin olarak yazılır (h(); innerHTML yok).
import { api, bildir, h, yeniKimlik } from './ortak.js';
import { etiketliAlan, formDiyalogu } from './ekran-yonetimi.js';
import { acilirMenu } from './calisma-alani.js';

/** @param {{ proje: { id: string; ad: string; aciklama?: string | null }; sonra: () => void }} s */
function yenidenAdlandirDiyalogu(s) {
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
async function silDiyalogu(s) {
  let o;
  try {
    o = (await api('/platform/proje/sil/onizle', { govde: { id: s.proje.id } })).onizleme;
  } catch (e) { if (e.durum !== 423) bildir(e.message, 'hata'); return; }
  const n = o.sayilar;
  const sayi = (etiket, deger) => h('div', {}, h('dt', {}, etiket), h('dd', {}, String(deger)));
  const onay = h('input', { type: 'text', autocomplete: 'off', spellcheck: 'false', id: yeniKimlik('proje-onay') });
  const d = formDiyalogu({
    baslik: `Projeyi kalıcı sil: ${o.proje.ad}`, ikonAd: 'cop', dugme: 'Kalıcı olarak sil', tehlikeli: true,
    aciklama: 'Projenin ortamları, giriş/bağlam profilleri, test verisi, ekranları, senaryoları, koşu sonuçları ve şifreli medyası bu çalışma alanından silinir. Bu işlem geri alınamaz.',
    govde: [
      h('dl', { class: 'onay-ozeti dortlu' },
        sayi('Ekran', n.ekran), sayi('Senaryo', n.senaryo), sayi('Koşu', n.kosu), sayi('Sonuç', n.sonuc),
        sayi('Medya', n.medya), sayi('Ortam', n.ortam), sayi('Profil', n.girisProfili + n.baglamProfili), sayi('Test verisi', n.testVerisi)),
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
 * Proje satırının ⋯ menüsü.
 * @param {{ proje: { id: string; ad: string; aciklama?: string | null }; durum: { proje: { id: string } | null; varsayilanProjeId: string | null };
 *   kapat: () => void; yonlendir: () => void; projeleriYenile: () => Promise<void>; projeyeGec: (id: string) => void }} s
 */
export function projeMenusu(s) {
  const p = s.proje;
  const yenidenCiz = () => { s.yonlendir(); };
  return acilirMenu({
    dugme: h('button', { type: 'button', class: 'ikon-dugme', 'aria-label': `Proje işlemleri: ${p.ad}`, title: 'Proje işlemleri' }, '⋯'),
    ogeler: [
      { ikon: 'duzenle', metin: 'Yeniden adlandır', fn: () => { s.kapat(); yenidenAdlandirDiyalogu({ proje: p, sonra: yenidenCiz }); } },
      {
        ikon: 'yildiz', metin: p.id === s.durum.varsayilanProjeId ? 'Varsayılan proje' : 'Varsayılan yap', devreDisi: p.id === s.durum.varsayilanProjeId,
        title: 'Seçim hatırlanmadığında (ör. başka tarayıcıda) açılan proje',
        fn: async () => {
          s.kapat();
          try {
            await api('/platform/proje/varsayilan', { govde: { id: p.id } });
            bildir(`"${p.ad}" varsayılan proje yapıldı.`);
            yenidenCiz();
          } catch (e) { if (e.durum !== 423) bildir(e.message, 'hata'); }
        }
      },
      'ayrac',
      {
        ikon: 'cop', metin: 'Sil (kalıcı)…', tehlikeli: true,
        fn: () => {
          s.kapat();
          silDiyalogu({
            proje: p,
            sonra: () => {
              // Silinen proje açıksa: kalan projelerden biri (varsayılan ya da ilk) açılır; hiç kalmadıysa sihirbaz.
              if (s.durum.proje && s.durum.proje.id === p.id) { location.hash = '#/sonuclar'; location.reload(); return; }
              yenidenCiz();
            }
          });
        }
      }
    ]
  });
}
