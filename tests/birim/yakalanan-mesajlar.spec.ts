// KORUMA TESTLERİ — koşuda yakalanan mesajlar: (1) model koşucusunun okuma noktalarıyla 127.0.0.1'deki sahte sayfada diyalog,
// hata göstergesi, konsol hatası, sayfa hatası ve aynı kökendeki HTTP 5xx yakalanır; tekrarlar sayılır, gizli değer / kart no /
// sorgu dizesi maskelenir, beklenen mesaj işaretlenir. (2) Depo: geçen ve kalan testlerin yakalanan mesajları "Koşuda yakalanan
// mesajlar" kümesinde kaynak + kalıp ile gruplanır (önce beklenmeyen), ürün süzgeci uygulanır, test ayrıntısında listelenir.
// Dış siteye istek gitmez (DNS kapalı tarayıcı).
import { randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { kasaOlustur } from '../../scripts/platform/kasa.mjs';
import { ekranKaydet, projeKaydet, senaryoKaydet, veritabaniniHazirla } from '../../scripts/platform/veritabani/depo.mjs';
import { hataKaliplari, kosuKaydet, kosuyuBitir, sonucDetayi, sonucKaydet } from '../../scripts/platform/veritabani/sonuc-deposu.mjs';
import { yakalananMesajlariAyristir } from '../../scripts/platform/sonuclar/yakalanan-mesajlar.mjs';
import { mesajYakalayicisiKur } from '../support/mesaj-yakalayici';
import { hataMesajlari, tarayiciUyarilariniDinle } from '../support/model-kosucu';
import { korumaliTarayici, yerelSunucu } from './giris-fikstur';
import { HIZLI_KDF } from './platform-ortak';

const SAYFA = `<!doctype html><html lang="tr"><head><meta charset="utf-8"><title>Sahte</title></head><body>
<p id="uyari" role="alert">Fatura 12345 bulunamadı</p>
<script>
  console.error('Doğrulama: parola=Gizli-Deger-987 kart 4111 1111 1111 1111');
  console.log('bilgi iletisi yakalanmaz');
  fetch('/api/hesapla?kimlik=10000000146').catch(() => {});
  setTimeout(() => { throw new Error('Beklenmeyen hata oluştu'); }, 10);
</script></body></html>`;

test('model koşucusu okuma noktaları: diyalog, hata göstergesi, konsol, sayfa hatası, ağ 5xx yakalanır ve maskelenir', async () => {
  const fikstur = await yerelSunucu((i) => (i.yol === '/api/hesapla'
    ? { durum: 500, tur: 'application/json', govde: '{"hata":"sunucu"}' }
    : { tur: 'text/html; charset=utf-8', govde: SAYFA }));
  const tarayici = await korumaliTarayici();
  try {
    const page = await tarayici.newPage();
    const y = mesajYakalayicisiKur(page);
    y.gizliDegerEkle('Gizli-Deger-987');
    y.beklenenEkle('Tutar sıfır olamaz');
    tarayiciUyarilariniDinle(page);
    y.adim = 'Ekran açılır';
    await page.goto(`${fikstur.adres}/ekran`);
    y.adim = 'Toplam hesaplanır';
    // Diyalog: mevcut davranış (kapatılır) değişmez; iki kez aynı metin → tek kayıt, sayı 2.
    await page.evaluate(() => { alert('Tutar sıfır olamaz'); alert('Tutar sıfır olamaz'); });
    // Hata göstergesi yoklanırken aynı metin bir kez sayılır.
    for (let i = 0; i < 3; i++) expect(await hataMesajlari(page, { hataGostergesi: { secici: '#uyari' } })).toContain('Fatura 12345 bulunamadı');
    await expect.poll(() => [...new Set(y.liste().map((m) => m.kaynak))].sort()).toEqual(['ag', 'diyalog', 'hata-gostergesi', 'konsol', 'sayfa-hatasi']);
    const bul = (k: string) => y.liste().find((m) => m.kaynak === k)!;
    expect(bul('diyalog')).toMatchObject({ metin: 'Tutar sıfır olamaz', sayi: 2, beklenen: true, adim: 'Toplam hesaplanır' });
    expect(bul('hata-gostergesi')).toMatchObject({ metin: 'Fatura 12345 bulunamadı', sayi: 1, beklenen: false });
    expect(bul('ag').metin).toBe('GET /api/hesapla → HTTP 500');
    expect(bul('sayfa-hatasi').metin).toContain('Beklenmeyen hata oluştu');
    const konsol = y.liste().find((m) => m.kaynak === 'konsol' && m.metin.startsWith('Doğrulama'))!.metin;
    expect(konsol).not.toContain('Gizli-Deger-987');
    expect(konsol).not.toContain('4111');
    expect(konsol).toContain('•••');
    expect(JSON.stringify(y.liste())).not.toContain('10000000146');
    // Raporlayıcının ayrıştırması aynı kayıtları taşır.
    expect(yakalananMesajlariAyristir(JSON.stringify(y.liste()))).toHaveLength(y.liste().length);
  } finally {
    await tarayici.close();
    await fikstur.kapat();
  }
});

test('depo: koşuda yakalanan mesajlar gruplanır (önce beklenmeyen, geçen/kalan), ürün süzgeci ve test ayrıntısı', async () => {
  const klasor = mkdtempSync(join(tmpdir(), 'yakalanan-'));
  try {
    const vt = await veritabaniniHazirla(join(klasor, 'platform.db'));
    await kasaOlustur(vt, `Gecici-${randomBytes(6).toString('hex')}`, { kdf: HIZLI_KDF });
    const proje = projeKaydet(vt, { ad: 'Yakalama' });
    const e1 = ekranKaydet(vt, { projeId: proje, anahtar: 'rota', ad: 'Rota' });
    const e2 = ekranKaydet(vt, { projeId: proje, anahtar: 'kargo', ad: 'Kargo' });
    const s1 = senaryoKaydet(vt, { projeId: proje, ekranId: e1, baslik: 'Standart', icerik: {} });
    const s2 = senaryoKaydet(vt, { projeId: proje, ekranId: e2, baslik: 'Kargo peşin', icerik: {} });
    const z = (dk: number) => new Date(Date.UTC(2026, 8, 27, 9, dk)).toISOString();
    kosuKaydet(vt, { id: 'k1', projeId: proje, tur: 'tam', baslangic: z(0) });
    const m = (kaynak: string, metin: string, beklenen = false, sayi = 1) => ({ kaynak, metin, adim: 'Toplam hesaplanır', sayi, beklenen, ilk: z(1), son: z(1) });
    const gecen = sonucKaydet(vt, { kosuId: 'k1', projeId: proje, senaryoId: s1, senaryoBaslik: 'Standart', durum: 'basarili', testKimligi: 't1', bitis: z(2),
      yakalananMesajlar: [m('ag', 'POST /api/siparis/123 → HTTP 500', false, 2), m('diyalog', 'Tutar sıfır olamaz', true)] });
    sonucKaydet(vt, { kosuId: 'k1', projeId: proje, senaryoId: s2, senaryoBaslik: 'Kargo peşin', durum: 'basarisiz', testKimligi: 't2', bitis: z(3),
      hataMesaji: 'Error: beklenmeyen', yakalananMesajlar: [m('ag', 'POST /api/siparis/456 → HTTP 500'), m('konsol', 'Uncaught TypeError: x is undefined'),
        { kaynak: 'bilinmez', metin: 'atlanır' }] });
    kosuyuBitir(vt, 'k1', { durum: 'tamamlandi', bitis: z(4) });

    const y = hataKaliplari(vt, proje).yakalanan;
    expect(y.toplam).toBe(5);
    expect(y.beklenmeyen).toBe(4);
    expect(y.kaynaklar).toMatchObject({ ag: 3, diyalog: 1, konsol: 1 });
    // Aynı kalıp (sayılar #) iki testte: bir geçen, bir kalan; beklenen grup en sonda.
    expect(y.kaliplar.map((k) => [k.kaynak, k.kalip, k.beklenen])).toEqual([
      ['ag', 'POST /api/siparis/# → HTTP #', false], ['konsol', 'Uncaught TypeError: x is undefined', false], ['diyalog', 'Tutar sıfır olamaz', true]]);
    expect(y.kaliplar[0]).toMatchObject({ sayi: 3, senaryoSayisi: 2, gecenTestSayisi: 1, kalanTestSayisi: 1, urunler: ['Kargo', 'Rota'] });
    expect(y.kaliplar[0].sonuclar.map((x) => [x.senaryoBaslik, x.durum])).toEqual([['Kargo peşin', 'basarisiz'], ['Standart', 'basarili']]);
    // Ürün süzgeci ve tarih aralığı.
    expect(hataKaliplari(vt, proje, { urun: e1 }).yakalanan.kaliplar.map((k) => k.kaynak)).toEqual(['ag', 'diyalog']);
    expect(hataKaliplari(vt, proje, { baslangic: z(30) }).yakalanan.toplam).toBe(0);
    // Test ayrıntısı: önce beklenmeyen.
    expect(sonucDetayi(vt, gecen.id)?.yakalananMesajlar.map((x) => [x.kaynak, x.beklenen, x.sayi])).toEqual([['ag', false, 2], ['diyalog', true, 1]]);
    // Yeniden deneme (aynı test kimliği) eski satırın mesajlarını da siler.
    sonucKaydet(vt, { kosuId: 'k1', projeId: proje, senaryoId: s1, senaryoBaslik: 'Standart', durum: 'basarili', testKimligi: 't1', bitis: z(5) });
    expect(hataKaliplari(vt, proje).yakalanan.toplam).toBe(2);
    vt.kapat();
  } finally {
    rmSync(klasor, { recursive: true, force: true });
  }
});
