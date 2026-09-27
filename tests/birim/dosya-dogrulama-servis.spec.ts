// KORUMA TESTLERİ — Servis yanıtında "Yanıttaki dosyayı doğrula" kontrolü: REST yanıtı dosya (Content-Type / Content-Disposition)
// olarak okunur; CSV (Windows-1254), XLSX, şifreli PDF; ${Tablo.Sütun} (gizli sütun) ve ${akis:Ad} başvuruları; kalan beklenti
// Beklenen / Görülen ve maskeli; ikili yanıt metin olarak saklanmaz; dosya eki Ayarlar kararına göre (varsayılan yok); dosya
// kontrolü olmayan senaryo eskisi gibi. İstekler YALNIZCA 127.0.0.1'deki sahte sunucuya gider. Geçici klasör.
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { kasaOlustur } from '../../scripts/platform/kasa.mjs';
import type { Veritabani } from '../../scripts/platform/veritabani/baglanti.mjs';
import { ortamKaydet, projeKaydet, veritabaniniHazirla } from '../../scripts/platform/veritabani/depo.mjs';
import { restServisiKaydet } from '../../scripts/platform/servisler/rest-servisi.mjs';
import { senaryoIceriginiDogrula } from '../../scripts/platform/servisler/servis-deposu.mjs';
import { servisSenaryosuCalistir } from '../../scripts/platform/servisler/servis-islemleri.mjs';
import { tabloKaydet } from '../../scripts/platform/tablolar/tablo-deposu.mjs';
import { kosuAyarlariniKaydet } from '../../scripts/platform/ayarlar/kosu-ayarlari.mjs';
import { pdfUret, windows1254, xlsxUret } from './dosya-fikstur';
import { geciciKlasor, HIZLI_KDF } from './platform-ortak';

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- sonuç JSON'u serbestçe gezilir
type Nesne = Record<string, any>;
const KUPON = 'KIS-7730';
const CSV = `Sipariş No;Ürün;Kupon;Tutar\n5001;Mavi Kalem;${KUPON};12,50\n5002;Silgi;;4,00\n`;
const YANITLAR: Record<string, { tur: string; ad?: string; veri: Buffer }> = {
  '/rapor/csv': { tur: 'text/csv; charset=windows-1254', ad: 'siparisler.csv', veri: windows1254(CSV) },
  '/rapor/stok.xlsx': { tur: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', veri: xlsxUret([{ ad: 'Stok', satirlar: [['Ürün', 'Adet'], ['Kalem', 7]] }]) },
  '/rapor/sifreli': { tur: 'application/pdf', ad: 'belge.pdf', veri: pdfUret([['Gizli']], { sifreli: true }) },
  '/rapor/json': { tur: 'application/json', veri: Buffer.from('{"durum":"tamam"}') }
};

test.describe('servis yanıtı dosya kontrolü (sahte sunucu)', () => {
  test.describe.configure({ mode: 'serial' });
  const klasor = geciciKlasor('dosya-servis');
  let vt: Veritabani;
  let sunucu: Server;
  let projeId = '';
  let ortamId = '';
  let servisId = '';
  test.afterAll(async () => { vt?.kapat(); klasor.temizle(); await new Promise((c) => sunucu?.close(c)); });

  const kos = (yol: string, kontroller: Nesne[], ek: Nesne = {}) => servisSenaryosuCalistir(vt, projeId, {
    servisId, ortamId, tur: 'dene', taslak: { baslik: `Rapor ${yol}`, icerik: { operasyon: 'rapor', govde: '', http: { metot: 'GET', yol }, kontroller } }, ...ek
  }) as Promise<Nesne>;

  test.beforeAll(async () => {
    sunucu = createServer((q, r) => {
      const y = YANITLAR[new URL(q.url ?? '/', 'http://127.0.0.1').pathname];
      if (!y) { r.writeHead(404); r.end(); return; }
      r.writeHead(200, { 'Content-Type': y.tur, ...(y.ad ? { 'Content-Disposition': `attachment; filename="${y.ad}"` } : {}) });
      r.end(y.veri);
    });
    await new Promise<void>((c) => sunucu.listen(0, '127.0.0.1', () => c()));
    const adres = `http://127.0.0.1:${(sunucu.address() as AddressInfo).port}`;
    vt = await veritabaniniHazirla(join(klasor.yol, 'p.db'));
    await kasaOlustur(vt, 'Deneme-Parola-123!', { kdf: HIZLI_KDF });
    projeId = projeKaydet(vt, { ad: 'P' });
    ortamId = ortamKaydet(vt, { projeId, ad: 'TEST', tabanUrl: 'http://127.0.0.1:9', varsayilan: true, ayarlar: { riskli: false } });
    tabloKaydet(vt, { projeId, ad: 'Kuponlar', sutunlar: [{ ad: 'Kod', gizli: true }], satirlar: [{ degerler: { Kod: KUPON } }] });
    servisId = restServisiKaydet(vt, projeId, { anahtar: 'rapor', ad: 'Rapor', tabanlar: { [ortamId]: adres }, uclar: [{ ad: 'rapor', metot: 'GET', yol: '/rapor' }] }).id;
  });

  test('doğrulama: dosya kontrolü tanımla saklanır; VEYA içinde ve geçersiz tanım reddedilir', () => {
    const i = senaryoIceriginiDogrula({ operasyon: 'r', govde: '', http: { metot: 'GET', yol: '/x' }, kontroller: [
      { tur: 'dosya', dosya: { bicim: 'csv', zamanAsimiSn: 5, fazla: 1, beklentiler: [{ tur: 'icerir', deger: 'a' }] } }] });
    expect(i.kontroller).toEqual([{ tur: 'dosya', dosya: { bicim: 'csv', beklentiler: [{ tur: 'icerir', deger: 'a' }] } }]);
    expect(() => senaryoIceriginiDogrula({ operasyon: 'r', govde: '', http: { metot: 'GET', yol: '/x' }, kontroller: [{ tur: 'dosya', dosya: { beklentiler: [] } }] }))
      .toThrow('1. kontrol (dosya): Dosya için en az bir beklenti ekleyin');
    expect(() => senaryoIceriginiDogrula({ operasyon: 'r', govde: '', http: { metot: 'GET', yol: '/x' }, kontroller: [
      { tur: 'veya', alt: [{ tur: 'icerir', deger: 'a' }, { tur: 'dosya', dosya: { beklentiler: [{ tur: 'icerir', deger: 'a' }] } }] }] })).toThrow('VEYA içinde kullanılamaz');
  });

  test('CSV (1254): başvurular çözülür, geçer; ikili yanıt metin olarak saklanmaz; dosya eki yok (varsayılan)', async () => {
    const k = await kos('/rapor/csv', [{ tur: 'durumKodu', deger: '200' }, { tur: 'dosya', dosya: { beklentiler: [
      { tur: 'adDeseni', deger: 'siparisler.csv' }, { tur: 'hucre', sutun: 'Tutar', deger: '12,50', satir: { tur: 'kosul', sutun: 'Kupon', deger: '${Kuponlar.Kod}' } },
      { tur: 'icerir', deger: '${akis:UrunAdi}' }, { tur: 'satirSayisi', islem: 'esit', deger: 2 }] } }], { akisDegerleri: { UrunAdi: 'Mavi Kalem' } });
    expect(k.durum, JSON.stringify(k.kontroller)).toBe('basarili');
    const d = k.kontroller.find((x: Nesne) => x.tur === 'dosya');
    expect(d.aciklama).toBe('siparisler.csv (CSV, 76 bayt) · 4/4 beklenti geçti');
    expect(d.alt.map((a: Nesne) => a.gecti)).toEqual([true, true, true, true]);
    expect(k.yanit).toMatch(/^\(ikili dosya yanıtı: siparisler\.csv, 76 bayt/);
    expect(k.dosyalar).toEqual([expect.objectContaining({ ad: 'siparisler.csv', bicim: 'csv', kodlama: 'windows1254', gecti: true })]);
    expect(k.dosyalar[0]).not.toHaveProperty('icerikBase64');
    expect(JSON.stringify(k)).not.toContain(KUPON);
  });

  test('kalan beklenti: Beklenen / Görülen, gizli değer maskeli; "yalnız kalan" ayarında dosya eklenir', async () => {
    const kontroller = [{ tur: 'dosya', dosya: { beklentiler: [{ tur: 'icerir', deger: 'Kırmızı Kalem' }, { tur: 'icerir', deger: '${Yok.Sutun}' }] } }];
    const k = await kos('/rapor/csv', kontroller);
    expect(k.durum).toBe('basarisiz');
    const [bir, iki] = k.kontroller[0].alt;
    expect(bir.aciklama).toMatch(/^Beklenen: içerir: "Kırmızı Kalem" — Görülen: bulunamadı; dosyanın başı: Sipariş No;Ürün;Kupon;Tutar 5001;Mavi Kalem;•••;12,50/);
    expect(iki).toMatchObject({ gecti: false, aciklama: expect.stringContaining('"${Yok.Sutun}" başvurusu çözülemedi') });
    expect(JSON.stringify(k)).not.toContain(KUPON);
    kosuAyarlariniKaydet(vt, { indirilenDosya: 'yalnizHata' });
    try {
      const k2 = await kos('/rapor/csv', kontroller);
      expect(Buffer.from(k2.dosyalar[0].icerikBase64, 'base64').equals(YANITLAR['/rapor/csv'].veri)).toBe(true);
      const k3 = await kos('/rapor/csv', [{ tur: 'dosya', dosya: { beklentiler: [{ tur: 'icerir', deger: 'Mavi' }] } }]);
      expect(k3.dosyalar[0]).not.toHaveProperty('icerikBase64');
    } finally { kosuAyarlariniKaydet(vt, { indirilenDosya: 'kapali' }); }
  });

  test('XLSX (ad adresten, biçim içerik türünden) geçer; şifreli PDF açık hatayla kalır', async () => {
    const x = await kos('/rapor/stok.xlsx', [{ tur: 'dosya', dosya: { beklentiler: [{ tur: 'adDeseni', deger: '*.xlsx' }, { tur: 'hucre', sutun: 'Adet', deger: '7', satir: { tur: 'no', no: 1 } }] } }]);
    expect(x.durum, JSON.stringify(x.kontroller)).toBe('basarili');
    const p = await kos('/rapor/sifreli', [{ tur: 'dosya', dosya: { beklentiler: [{ tur: 'icerir', deger: 'Gizli' }] } }]);
    expect(p.durum).toBe('basarisiz');
    expect(p.kontroller[0].alt[0].aciklama).toContain('PDF şifreli (parola korumalı); metin çıkarılamadı.');
  });

  test('varsayılan davranış değişmez: dosya kontrolü olmayan senaryoda yanıt metin olarak saklanır, dosya özeti yok', async () => {
    const k = await kos('/rapor/json', [{ tur: 'icerir', deger: 'tamam' }]);
    expect(k.durum).toBe('basarili');
    expect(k.yanit).toBe('{"durum":"tamam"}');
    expect(k).not.toHaveProperty('dosyalar');
  });
});
