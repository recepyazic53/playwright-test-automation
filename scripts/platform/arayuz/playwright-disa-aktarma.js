// "Playwright koduna dışa aktar" (Senaryolar > satır ⋯ ve senaryo ayrıntısı). Seçilen ortam için senaryonun koşu planından
// üretilen tek ".spec.ts" dosyası sunucudan METİN olarak alınır ve tarayıcıda indirilir (sunucu dosya yazmaz, dışarı istek
// atılmaz). Gizli / kişisel değerler dosyada yoktur: ortam değişkenlerinden okunur (dosyanın başında listelenir).
import { api, bildir, h } from './ortak.js';
import { secenekIste } from './kosu-paneli.js';

/**
 * @param {{ projeId: string; senaryo: { id: string; baslik: string }; ortamlar: Array<{ id: string; ad: string }> }} s
 *   ortamlar: senaryonun tanımlı olduğu ortamlar (birden çoksa kullanıcı seçer).
 */
export async function playwrightKodunaAktar(s) {
  if (!s.ortamlar.length) { bildir(`"${s.senaryo.baslik}" hiçbir ortamda tanımlı değil.`, 'hata'); return; }
  let ortam = s.ortamlar[0];
  if (s.ortamlar.length > 1) {
    const secim = await secenekIste({
      baslik: 'Hangi ortam için dışa aktarılsın?',
      metin: 'Adres, giriş tarifi ve test verisi seçilen ortamdan alınır. Gizli değerler dosyaya yazılmaz; ortam değişkeniyle verilir.',
      ikonAd: 'indir',
      secenekler: s.ortamlar.map((o) => ({ deger: o.id, etiket: o.ad, aciklama: 'Bu ortamın adresi ve verisiyle', ikonAd: 'ag' }))
    });
    if (secim === null) return;
    ortam = s.ortamlar.find((o) => o.id === secim) || ortam;
  }
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
