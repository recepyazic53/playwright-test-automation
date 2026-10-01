// POLİGON DÜZELTMESİ 2 — varsayılan "Bitti" etiketi yalnız basıştan sonra beliren SONUÇ nitelikli metne (başarı kalıbı / kutusu, durum
// bölgesi, bildirim, başlık, bilgi penceresi) önerilir; sekme / anahtar etiketleri ve liste seçenekleri etiketsiz kalır. Basıştan önce de
// görünen metin önerilmez; hiç gönderim (yazma isteği / gezinme) olmadan "Bitti" görülürse uyarılır.
// Güvenlik: yalnız 127.0.0.1'deki poligon ve setContent sayfaları; ayrı Nöbetçi + geçici veri kökü.
import { expect, test } from '@playwright/test';
import { KALIPLAR } from '../../scripts/platform/tarama/eylem-kesfi.mjs';
import { hizliMetinleriTopla } from '../../scripts/platform/tarama/hizli-test-sayfasi';
import { bitisUyarilari, varsayilanEtiketler } from '../../scripts/platform/hizli-test/akis.mjs';
import { isBitsin, oturumBekle, poligonOrtami, type Nesne, type PoligonOrtami } from '../poligon/surucu';
import { korumaliTarayici } from './giris-fikstur';

test.describe.configure({ mode: 'serial' });

test('saf kural: Bitti yalnız son basıştan sonra beliren sonuç metnine; sekme / seçenek yazısı ve önceden görünen metin etiketsiz; uyarılar', () => {
  const e = varsayilanEtiketler([
    { metin: 'E-posta bildirimleri', tur: 'normal', basis: 1 },
    { metin: 'Kişisel', tur: 'normal', basis: 1 },
    { metin: 'Ayarlar kaydedildi', tur: 'normal', basis: 1, sonuc: true },
    { metin: 'Siparişiniz alındı', tur: 'normal', basis: 1, sonuc: true, onceGorundu: true },
    { metin: 'Kayıt başarılı', tur: 'basari', basis: 1 }
  ], 1);
  expect(e).toEqual({ 'E-posta bildirimleri': null, Kişisel: null, 'Ayarlar kaydedildi': 'bitti', 'Siparişiniz alındı': null, 'Kayıt başarılı': 'bitti' });
  const u = bitisUyarilari({ izin: 'evet', gonderimVar: false, gorulenler: [{ metin: 'Kişisel', onceGorundu: true }], etiketler: { Kişisel: 'bitti' } });
  expect(u.length).toBe(2);
  expect(u[0]).toMatch(/Hiçbir basışta sunucuya kayıt \/ gönderim isteği gitmedi/);
  expect(u[1]).toMatch(/Bu metin düğmeye basmadan da görünüyordu/);
  expect(bitisUyarilari({ izin: 'evet', gonderimVar: true, gorulenler: [], etiketler: { x: 'bitti' } })).toEqual([]);
  expect(bitisUyarilari({ izin: 'hayir', gonderimVar: false, gorulenler: [], etiketler: { x: 'bitti' } })).toEqual([]);
});

test('sayfa okuması: sekme / anahtar / liste seçeneği yazıları alınmaz; durum bölgesi, bildirim ve başarı kalıbı "sonuç", başlık işaretli', async () => {
  const tarayici = await korumaliTarayici();
  try {
    const page = await tarayici.newPage();
    await page.setContent(`<main>
      <div role="tablist"><button role="tab">Profil</button><span role="tab">Bildirimler</span></div>
      <div><span id="eA">E-posta bildirimleri</span><button role="switch" aria-checked="true" aria-labelledby="eA"></button></div>
      <ul role="listbox"><li role="option">Kişisel</li><li role="option">Acil</li></ul>
      <p>Sıradan açıklama yazısı</p>
      <div class="toast">Ayarlar güncel</div>
      <p role="status">İşlem no 42 hazırlandı</p>
      <p>Başvurunuz alındı</p>
      <h1>Rezervasyon özeti</h1>
    </main>`);
    const m = (await page.evaluate(hizliMetinleriTopla, { kaliplar: { ...KALIPLAR }, enCok: 50 })) as Array<{ metin: string; sonuc?: boolean; baslik?: boolean }>;
    const ad = (x: string) => m.find((y) => y.metin === x);
    for (const x of ['Profil', 'Bildirimler', 'E-posta bildirimleri', 'Kişisel', 'Acil']) expect(ad(x), x).toBeUndefined();
    expect(ad('Sıradan açıklama yazısı')?.sonuc).toBeUndefined();
    expect(ad('Ayarlar güncel')?.sonuc).toBe(true);
    expect(ad('İşlem no 42 hazırlandı')?.sonuc).toBe(true);
    expect(ad('Başvurunuz alındı')?.sonuc).toBe(true);
    expect(ad('Rezervasyon özeti')?.baslik).toBe(true);
  } finally { await tarayici.close(); }
});

let po: PoligonOrtami;
test.describe('poligon', () => {
  test.beforeAll(async () => { test.setTimeout(120_000); po = await poligonOrtami(); });
  test.afterAll(async () => { await po?.kapat(); });

  test('ayarlar: yalnız sekmeye basılınca (gönderim yok) beliren sekme yazıları Bitti önerilmez; gönderim uyarısı gösterilir', async () => {
    test.setTimeout(240_000);
    const b = await po.api('/platform/hizli-test/baslat', { projeId: po.projeId, ortamId: po.ortamId, hedef: '/ayarlar/', ekranAdi: 'Ayarlar bitiş', izin: 'evet' });
    expect(b.basarili, b.mesaj).toBe(true);
    const id = String(b.id);
    let o: Nesne = await oturumBekle(po, id);
    if (o.durum === 'veri') {
      const hakkimda = (o.soru.alanlar as Nesne[]).find((a) => a.etiket === 'Hakkımda');
      await po.api('/platform/hizli-test/veri', { id, degerler: hakkimda ? { [hakkimda.anahtar]: { deger: 'Deneme', kaynak: 'elle' } } : {} });
      o = await oturumBekle(po, id);
    }
    expect(o.durum).toBe('karar');
    const sekme = (o.soru.adaylar as Nesne[]).find((a) => a.metin === 'Bildirimler');
    expect(sekme, JSON.stringify(o.soru.adaylar)).toBeTruthy();
    await po.api('/platform/hizli-test/karar', { id, karar: 'bas', secici: sekme?.secici });
    o = await oturumBekle(po, id);
    // Sekmede beliren isteğe bağlı alanlar (kaydırıcı) boş bırakılır.
    for (let i = 0; i < 3 && o.durum === 'veri'; i++) { await po.api('/platform/hizli-test/veri', { id, degerler: {} }); o = await oturumBekle(po, id); }
    expect(o.durum).toBe('karar');
    await po.api('/platform/hizli-test/karar', { id, karar: 'bitir' });
    o = await oturumBekle(po, id);
    expect(o.durum).toBe('bitis');
    const bitti = Object.entries(o.soru.etiketler as Record<string, string | null>).filter(([, e]) => e === 'bitti').map(([m]) => m);
    expect(bitti, JSON.stringify(o.soru.gorulenler)).toEqual([]);
    expect(o.soru.gonderimVar).toBe(false);
    // Kullanıcı yine de bir sekme yazısını Bitti seçerse uyarı (engellemez).
    const metin = (o.soru.gorulenler as Nesne[])[0]?.metin;
    if (metin) {
      const y = await po.api('/platform/hizli-test/bitis', { id, etiketler: { [metin]: 'bitti' } });
      expect(y.basarili, y.mesaj).toBe(true);
      o = await oturumBekle(po, id);
      expect((o.soru.uyarilar as string[]).join(' ')).toMatch(/Hiçbir basışta sunucuya kayıt \/ gönderim isteği gitmedi/);
    }
    await po.api('/platform/hizli-test/iptal', { id });
    await isBitsin(po);
  });
});
