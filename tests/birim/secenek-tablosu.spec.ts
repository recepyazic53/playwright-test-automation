// KORUMA TESTLERİ — "Modeli güncelle" karşılaştırmasında yeni / kaldırılan seçeneğin bağlı test verisi tablosuna da yansıtılması
// (tablolar/secenek-tablosu.mjs): öneri (uygulanabilir mi, neden) ve yazma (yeni seçenek satır + karşılık; kalkan seçeneğin satırları silinir).
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { kasaOlustur } from '../../scripts/platform/kasa.mjs';
import { projeKaydet, veritabaniniHazirla } from '../../scripts/platform/veritabani/depo.mjs';
import { tabloKaydet, tablolariListele } from '../../scripts/platform/tablolar/tablo-deposu.mjs';
import { secenekleriTabloyaYaz, tabloOnerisi } from '../../scripts/platform/tablolar/secenek-tablosu.mjs';
import { HIZLI_KDF, geciciKlasor } from './platform-ortak';

test('yeni seçenek tabloya satır (ve karşılık) olur; kalkan seçeneğin satırı silinir; uygulanamaz durumlarda neden', async () => {
  const klasor = geciciKlasor('secenek-tablosu');
  const vt = await veritabaniniHazirla(join(klasor.yol, 'platform.db'));
  try {
    await kasaOlustur(vt, 'Gecici-Secenek-Tablosu-1', { kdf: HIZLI_KDF });
    const projeId = projeKaydet(vt, { ad: 'Seçenek' });
    const ulke = tabloKaydet(vt, { projeId, ad: 'Form — Ülke', sutunlar: [{ ad: 'Ülke' }], satirlar: [{ degerler: { Ülke: 'FRANSA' } }, { degerler: { Ülke: 'İTALYA' } }], tur: 'liste' });
    const iki = tabloKaydet(vt, { projeId, ad: 'Form — İl / İlçe', sutunlar: [{ ad: 'İl' }, { ad: 'İlçe' }], satirlar: [{ degerler: { İl: 'İSTANBUL', İlçe: 'KADIKÖY' } }] });
    const tablolar = () => tablolariListele(vt, projeId) as unknown as Parameters<typeof tabloOnerisi>[1];
    const baglar = { ulke: { tablo: ulke, sutun: 'Ülke' }, ilce: { tablo: iki, sutun: 'İlçe' }, kosullu: { tablo: ulke, sutun: 'Ülke', secimeGore: { alan: 'x', degerler: { a: { tablo: iki, sutun: 'İl' } } } } };
    const yeni = { id: 'b1', tur: 'yeniSecenek', alanId: 'ulke', secenek: { deger: 'DE', metin: 'ALMANYA' } };
    const kalkan = { id: 'b2', tur: 'kaldirilanSecenek', alanId: 'ulke', secenek: { deger: 'IT', metin: 'İTALYA' } };
    expect(tabloOnerisi(baglar, tablolar(), yeni)).toMatchObject({ islem: 'ekle', tabloAd: 'Form — Ülke', sutun: 'Ülke', uygulanabilir: true });
    expect(tabloOnerisi(baglar, tablolar(), { ...yeni, alanId: 'yok' })).toBeNull();
    expect(tabloOnerisi(baglar, tablolar(), { ...yeni, tur: 'yeniAlan' })).toBeNull();
    expect(tabloOnerisi(baglar, tablolar(), { ...yeni, alanId: 'ilce' })).toMatchObject({ uygulanabilir: false, neden: expect.stringContaining('birden çok sütunlu') });
    expect(tabloOnerisi(baglar, tablolar(), { ...kalkan, alanId: 'ilce' })).toMatchObject({ uygulanabilir: true });
    expect(tabloOnerisi(baglar, tablolar(), { ...yeni, alanId: 'kosullu' })).toMatchObject({ uygulanabilir: false, neden: expect.stringContaining('seçime göre') });

    const oneriler = [tabloOnerisi(baglar, tablolar(), yeni)!, tabloOnerisi(baglar, tablolar(), kalkan)!];
    expect(secenekleriTabloyaYaz(vt, projeId, tablolar(), oneriler)).toEqual({ eklenen: 1, silinen: 1 });
    const t = tablolariListele(vt, projeId).find((x) => x.id === ulke)!;
    expect(t.satirlar.map((r) => r.degerler.Ülke).sort()).toEqual(['ALMANYA', 'FRANSA']);
    expect(t.sutunlar[0].karsiliklar).toMatchObject({ ALMANYA: { sayfa: 'DE' } });
    // Tekrar yazmak yinelenen satır üretmez (zaten var).
    expect(secenekleriTabloyaYaz(vt, projeId, tablolar(), [tabloOnerisi(baglar, tablolar(), yeni)!])).toEqual({ eklenen: 0, silinen: 0 });
  } finally { vt.kapat(); klasor.temizle(); }
});
