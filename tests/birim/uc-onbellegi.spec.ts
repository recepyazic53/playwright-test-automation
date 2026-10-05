// KORUMA TESTLERİ — LİSTE UÇLARININ ÖNBELLEĞİ (veritabani/nesil-onbellegi.mjs, baglanti.mjs nesil / tablo nesli, kasa kilidi).
//  1) Nesil: satır değiştiren işlem genel nesli ve YAZILAN tablonun neslini artırır; DELETE tüm tabloları etkilenmiş sayar; geri
//     alınan işlem nesli değiştirmez; açık işlemin içinde önbellek kullanılmaz.
//  2) Model bağlamı önbelleği: bağlı olmadığı tabloya yazmak (senaryo) önbelleği korur; tablo değeri / ekran alan bağı değişince
//     yeni veri görünür (yeni seçenek listede).
//  3) Kasa kilitlenince (tamamen ya da arayüz kilidi) önbellek boşalır; kilitliyken önbellekten okunmaz (KASA_KILITLI).
// Bellekteki geçici veritabanı; değerler SAHTEDİR. Tarayıcı açmaz, ağ isteği yok.
import { expect, test } from '@playwright/test';
import { KasaHatasi, arayuzuKilitle, kasaAc, kasaKilitle, kasaOlustur } from '../../scripts/platform/kasa.mjs';
import type { Veritabani } from '../../scripts/platform/veritabani/baglanti.mjs';
import { veritabaniniHazirla } from '../../scripts/platform/veritabani/depo.mjs';
import { onbellekBoyutu, onbellekte } from '../../scripts/platform/veritabani/nesil-onbellegi.mjs';
import { ekranGirdileri, modelBaglamiOnbellekli, senaryoKaydet } from '../../scripts/platform/senaryolar/senaryo-servisi.mjs';
import { tabloKaydet, tablolariListele, tablolariListeleOnbellekli } from '../../scripts/platform/tablolar/tablo-deposu.mjs';
import { ekranAlanBaglari, ekranAlanBaglariniKaydet } from '../../scripts/platform/tablolar/ekran-baglari.mjs';
import { buyukProjeUret, type BuyukProje } from './buyuk-proje-fikstur.mjs';
import { HIZLI_KDF } from './platform-ortak';

const PAROLA = 'Onbellek-Kasa-Parolasi-9';
type Nesne = Record<string, any>;

test.describe.configure({ mode: 'serial' });

let vt: Veritabani;
let proje: BuyukProje;
let ekranId = '';

test.beforeAll(async () => {
  test.setTimeout(120_000);
  vt = await veritabaniniHazirla(null as unknown as string);
  await kasaOlustur(vt, PAROLA, { kdf: HIZLI_KDF });
  // Küçük ölçekli "büyük proje": aynı yapı (9 ekran, bağlı listeler, kişi tablosu), az satır.
  proje = await buyukProjeUret(vt, { olcek: 0.05 });
  ekranId = String(vt.tek("SELECT id FROM ekranlar WHERE proje_id = ? AND anahtar = 'ekran-3'", [proje.projeId])?.id);
});

test.afterAll(() => vt?.kapat());

/** Ekranın tabloya bağlı, model seçenekli bir seçim alanı ve bağlı olduğu tablo. */
function bagliSecim(): { alan: string; tablo: Nesne } {
  const baglar = ekranAlanBaglari(vt, ekranId);
  const tablolar = tablolariListele(vt, proje.projeId);
  for (const [alan, b] of Object.entries(baglar)) {
    const t = tablolar.find((x) => x.id === b.tablo);
    if (t && t.ad.startsWith('Liste ')) return { alan, tablo: t };
  }
  throw new Error('bağlı seçim alanı yok');
}

test('nesil: yazılan tablonun nesli artar; DELETE hepsini etkiler; geri alınan işlem ve okuma nesli değiştirmez', () => {
  const n0 = vt.nesil;
  const ekranNesli = vt.tabloNesli('ekran_modelleri');
  vt.tek('SELECT COUNT(*) AS n FROM senaryolar');
  expect(vt.nesil).toBe(n0);
  vt.calistir("UPDATE senaryolar SET baslik = baslik || '' WHERE proje_id = ?", [proje.projeId]);
  expect(vt.nesil).toBe(n0 + 1);
  expect(vt.tabloNesli('senaryolar')).toBe(n0 + 1);
  expect(vt.tabloNesli('ekran_modelleri')).toBe(ekranNesli);
  expect(() => vt.islem(() => { vt.calistir("UPDATE ekranlar SET ad = ad || 'x'"); throw new Error('geri al'); })).toThrow('geri al');
  expect(vt.nesil).toBe(n0 + 1);
  expect(vt.tabloNesli('ekranlar')).toBeLessThanOrEqual(n0);
  vt.calistir("DELETE FROM senaryolar WHERE id = 'olmayan-kimlik'");
  expect(vt.nesil).toBe(n0 + 1); // hiçbir satır silinmedi: değişiklik yok
  vt.calistir("INSERT INTO meta (anahtar, deger) VALUES ('onbellek-testi', '1') ON CONFLICT(anahtar) DO UPDATE SET deger = '2'");
  vt.calistir("DELETE FROM meta WHERE anahtar = 'onbellek-testi'");
  expect(vt.tabloNesli('ekran_modelleri')).toBe(vt.nesil);
  // Açık işlemin içinde önbellek kullanılmaz (her çağrı hesaplar).
  let hesap = 0;
  vt.islem(() => {
    onbellekte(vt, 'islem-ici', () => ++hesap);
    onbellekte(vt, 'islem-ici', () => ++hesap);
  });
  expect(hesap).toBe(2);
  onbellekte(vt, 'islem-disi', () => ++hesap);
  onbellekte(vt, 'islem-disi', () => ++hesap);
  expect(hesap).toBe(3);
});

test('model bağlamı: senaryo yazmak önbelleği korur; tablo değeri ve alan bağı değişince yeni veri görünür', () => {
  const { alan, tablo } = bagliSecim();
  const ilk = modelBaglamiOnbellekli(vt, ekranId);
  expect(modelBaglamiOnbellekli(vt, ekranId)).toBe(ilk);
  // Bağlı olmadığı tabloya yazma (senaryo başlığı): aynı nesne.
  senaryoKaydet(vt, { id: proje.senaryoIdleri[0], projeId: proje.projeId, baslik: 'Önbellek testi yeni başlık' });
  expect(modelBaglamiOnbellekli(vt, ekranId)).toBe(ilk);
  const secenekler = () => (ekranGirdileri(vt, proje.projeId, ekranId).girdiler.find((g) => g.id === alan)?.secenekler ?? []).map((s) => s.deger);
  expect(secenekler()).not.toContain('Önbellek yeni değeri');
  // Tablo değeri: yeni satır → yeni seçenek (önbellek geçersiz).
  const tabloListesi = tablolariListeleOnbellekli(vt, proje.projeId);
  tabloKaydet(vt, { projeId: proje.projeId, id: tablo.id, ad: tablo.ad, sutunlar: tablo.sutunlar.map((s: Nesne) => ({ ad: s.ad, gizli: s.gizli })),
    satirlar: [{ degerler: { [tablo.sutunlar[0].ad]: 'Önbellek yeni değeri' } }] });
  expect(tablolariListeleOnbellekli(vt, proje.projeId)).not.toBe(tabloListesi);
  const ikinci = modelBaglamiOnbellekli(vt, ekranId);
  expect(ikinci).not.toBe(ilk);
  expect(secenekler()).toContain('Önbellek yeni değeri');
  // Alan bağı kaldırılınca seçenekler yeniden modelden gelir.
  const baglar = { ...ekranAlanBaglari(vt, ekranId) };
  delete baglar[alan];
  ekranAlanBaglariniKaydet(vt, proje.projeId, ekranId, baglar);
  expect(modelBaglamiOnbellekli(vt, ekranId)).not.toBe(ikinci);
  expect(secenekler()).not.toContain('Önbellek yeni değeri');
});

test('kasa kilitlenince önbellek boşalır ve kilitliyken önbellekten okunmaz; arayüz kilidi de boşaltır', async () => {
  modelBaglamiOnbellekli(vt, ekranId);
  tablolariListeleOnbellekli(vt, proje.projeId);
  expect(onbellekBoyutu(vt)).toBeGreaterThan(0);
  kasaKilitle(vt);
  expect(onbellekBoyutu(vt)).toBe(0);
  expect(() => modelBaglamiOnbellekli(vt, ekranId)).toThrow(KasaHatasi);
  expect(() => tablolariListeleOnbellekli(vt, proje.projeId)).toThrow(KasaHatasi);
  await kasaAc(vt, PAROLA);
  const yeni = modelBaglamiOnbellekli(vt, ekranId);
  expect(yeni).toBeTruthy();
  expect(onbellekBoyutu(vt)).toBeGreaterThan(0);
  arayuzuKilitle(vt);
  expect(onbellekBoyutu(vt)).toBe(0);
  // Arka plan kipi (anahtar bellekte, arayüz kilitli): hesaplanır ama önbelleğe girmez.
  const arkaPlanda = modelBaglamiOnbellekli(vt, ekranId);
  expect(modelBaglamiOnbellekli(vt, ekranId)).not.toBe(arkaPlanda);
  expect(onbellekBoyutu(vt)).toBe(0);
  await kasaAc(vt, PAROLA);
  expect(modelBaglamiOnbellekli(vt, ekranId)).not.toBe(yeni);
});
