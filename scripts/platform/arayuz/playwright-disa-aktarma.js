// "Playwright koduna dışa aktar" (Senaryolar > satır ⋯, senaryo formunun başlık eylemleri ve hızlı arama). Seçilen ortam için
// senaryonun koşu planından üretilen tek ".spec.ts" dosyası sunucudan METİN olarak alınır ve tarayıcıda indirilir (sunucu dosya
// yazmaz, dışarı istek atılmaz). Gizli / kişisel değerler dosyada yoktur: ortam değişkenlerinden okunur (dosyanın başında listelenir).
// İndirmeden önce kısa açıklamalı onay: ne indirileceği ve hangi ortamın kullanılacağı (tek ortamda da sorulur; Vazgeç = indirme yok).
import { api, bildir, h } from './ortak.js';
import { secenekIste } from './kosu-paneli.js';

/** Onay penceresinin açıklaması (ortak; testler ve rehber aynı metni görür). */
export const DISA_AKTARMA_ACIKLAMASI = 'Senaryo, Nöbetçi\'nin koştuğu adımlarla tek bir .spec.ts dosyası olarak bilgisayarınıza indirilir; '
  + 'dosya Nöbetçi olmadan "npx playwright test" ile koşar. Adres, giriş tarifi ve test verisi seçtiğiniz ortamdan alınır. '
  + 'Parola, anahtar ve gizli değerler dosyaya yazılmaz; ortam değişkeniyle verilir (dosyanın başında listelenir). Dosya hiçbir yere gönderilmez.';

/**
 * @param {{ projeId: string; senaryo: { id: string; baslik: string }; ortamlar: Array<{ id: string; ad: string }> }} s
 *   ortamlar: senaryonun tanımlı olduğu ortamlar (kullanıcı onay penceresinde birini seçer).
 */
export async function playwrightKodunaAktar(s) {
  if (!s.ortamlar.length) { bildir(`"${s.senaryo.baslik}" hiçbir ortamda tanımlı değil.`, 'hata'); return; }
  const secim = await secenekIste({
    baslik: `Playwright koduna dışa aktar: ${s.senaryo.baslik}`,
    metin: DISA_AKTARMA_ACIKLAMASI,
    ikonAd: 'indir',
    secenekler: s.ortamlar.map((o) => ({ deger: o.id, etiket: `${o.ad} için indir`, aciklama: 'Bu ortamın adresi ve verisiyle', ikonAd: 'indir' }))
  });
  if (secim === null) return;
  const ortam = s.ortamlar.find((o) => o.id === secim) || s.ortamlar[0];
  try {
    const q = new URLSearchParams({ projeId: s.projeId, id: s.senaryo.id, ortamId: ortam.id });
    const y = await api(`/platform/senaryo/playwright-kodu?${q}`);
    const url = URL.createObjectURL(new Blob([y.icerik], { type: 'text/plain;charset=utf-8' }));
    const a = h('a', { href: url, download: y.dosyaAdi, hidden: true });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
    const n = Array.isArray(y.ortamDegiskenleri) ? y.ortamDegiskenleri.length : 0;
    bildir(`"${y.dosyaAdi}" indirildi (${ortam.ad}).${n ? ` ${n} ortam değişkeni gerekir (dosyanın başında listelenir).` : ''}`);
  } catch (e) {
    if (e && e.durum === 423) return;
    bildir(`Playwright koduna dışa aktarılamadı: ${e.message || e}`, 'hata');
  }
}
