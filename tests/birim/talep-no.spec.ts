// KORUMA TESTLERİ — Talep no ve kapsam matrisi (veri katmanı): talep numaralarının ekran senaryosu, servis senaryosu ve
// uçtan uca akış içeriğine yazılıp okunması (kırpma, harf duyarsız tekillik, verilmezse korunur, [] kaldırır, geçersiz girdi reddi; servis
// ve akış içeriğinde şifreli), proje içi öneri listesi, listelerdeki süzme kuralı, "Bu talebin senaryolarını koş" planı (ortam başına doğru
// küme ve atlama nedenleri), kapsam matrisi hesabı (son sonuç, ortam ve dönem süzgeci, "Dene" / atlanan sayılmaz, hata = başarısız), CSV ve
// PDF üretimi (maskeleme, ağ isteği yok), Playwright dışa aktarma yorumu, içe aktarma ve proje silme.
// Yalnız geçici veritabanları; dış istek ve gerçek koşu YOK. Örnek talep numaraları nötrdür.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import type { Veritabani } from '../../scripts/platform/veritabani/baglanti.mjs';
import { kasaOlustur } from '../../scripts/platform/kasa.mjs';
import { ekranKaydet, girisProfiliKaydet, kosuOlustur, kosuSonucuEkle, ortamKaydet, projeKaydet, senaryoKaydet as depoSenaryoKaydet, veritabaniniHazirla } from '../../scripts/platform/veritabani/depo.mjs';
import {
  servisAkisKosusuKaydet, servisAkisiGetir, servisAkisiKaydet, servisKaydet, servisKosusuKaydet, servisSenaryosuGetir, servisSenaryosuKaydet
} from '../../scripts/platform/servisler/servis-deposu.mjs';
import { senaryoDetayi, senaryoKaydet, senaryoKopyala, senaryoListesi } from '../../scripts/platform/senaryolar/senaryo-servisi.mjs';
import {
  TALEP_EN_COK, TALEP_EN_UZUN, benzerTalep, icerikTalepleri, talepAnahtari, talepEslesir, talepTemizle, talepleriAyikla
} from '../../scripts/platform/senaryolar/talepler.mjs';
import { projeTalepleri, talepKosuPlani, talepSenaryolari } from '../../scripts/platform/senaryolar/talep-servisi.mjs';
import { kapsamMatrisi, kapsamMatrisiCsv, kapsamMatrisiCsvUcu, kapsamMatrisiPdf, matrisGirdisi } from '../../scripts/platform/sonuclar/kapsam-matrisi.mjs';
import { pdfTarayicisiniKapat } from '../../scripts/platform/sonuclar/pdf-rapor/pdf.mjs';
import { playwrightKoduUret } from '../../scripts/platform/senaryolar/playwright-disa-aktarma.mjs';
import { projeyiSil } from '../../scripts/platform/proje-yonetimi.mjs';
import { yedekOlustur } from '../../scripts/platform/yedek.mjs';
import { iceAktarmaHazirla, iceAktarmaUygula } from '../../scripts/platform/ice-aktarma.mjs';
import { HIZLI_KDF, geciciKlasor } from './platform-ortak';

test.describe.configure({ mode: 'serial' });

const PAROLA = 'Talep-No-Kasa-Parolasi-3';
const GIZLI_PAROLA = 'Gizli-Giris-Degeri-7719';
const SPEC = 'scenarios/ornek/ornek.spec.ts';

type Fikstur = {
  vt: Veritabani; projeId: string; test: string; canli: string; ekranId: string; pasifEkranId: string;
  e1: string; e2: string; e3: string; e4: string; servisId: string; s1: string; s2: string; s3: string; akisId: string; digerAkisId: string;
};

/** Veri güdümlü ekran senaryosu (model koşucusu içeriği; model gerekmez). */
function ekranSenaryosu(vt: Veritabani, projeId: string, ekranId: string, baslik: string, ortamlar: string[], talepler?: string[]): string {
  return depoSenaryoKaydet(vt, {
    projeId, ekranId, baslik,
    icerik: {
      kosucu: 'model', kaynak: { dosya: SPEC, ad: baslik }, veri: { dosya: 'ornek', yol: 'ornek' },
      ortamlar: Object.fromEntries(ortamlar.map((o, i) => [o, { sira: i, veri: { baslik } }])), ...(talepler ? { talepler } : {})
    }
  });
}

async function kur(yol: string | null = null): Promise<Fikstur> {
  const vt = await veritabaniniHazirla(yol);
  await kasaOlustur(vt, PAROLA, { kdf: HIZLI_KDF });
  const projeId = projeKaydet(vt, { ad: 'Talep Projesi' });
  const test = ortamKaydet(vt, { projeId, ad: 'TEST', tabanUrl: 'http://127.0.0.1:9', varsayilan: true, ayarlar: { riskli: false } });
  const canli = ortamKaydet(vt, { projeId, ad: 'CANLI', tabanUrl: 'http://127.0.0.1:9', ayarlar: { riskli: true } });
  // Maskeleme denetimi için bilinen gizli değer (giriş profili parolası).
  girisProfiliKaydet(vt, { projeId, ortamId: test, ad: 'Ana', kullaniciAdi: 'ornek.kullanici', parola: GIZLI_PAROLA });
  const ekranId = ekranKaydet(vt, { projeId, anahtar: 'form', ad: 'Başvuru formu' });
  const pasifEkranId = ekranKaydet(vt, { projeId, anahtar: 'eski', ad: 'Eski form' });
  vt.calistir("UPDATE ekranlar SET durum = 'devre_disi' WHERE id = ?", [pasifEkranId]);
  const e1 = ekranSenaryosu(vt, projeId, ekranId, 'Zorunlu alan uyarısı', [test], ['TALEP-101']);
  const e2 = ekranSenaryosu(vt, projeId, ekranId, 'Başarılı başvuru', [test, canli], ['talep-101', 'TALEP-102']);
  const e3 = ekranSenaryosu(vt, projeId, pasifEkranId, 'Eski ekran senaryosu', [test], ['TALEP-101']);
  const e4 = ekranSenaryosu(vt, projeId, ekranId, 'Talepsiz senaryo', [test]);
  // Servis: TEST'te tanımlı, CANLI'da değil (taban adres boş).
  const servisId = servisKaydet(vt, { projeId, anahtar: 'ornek', ad: 'Örnek servis', ayarlar: { yol: '/Servis/ornek.asmx', tabanlar: { [canli]: '' } } });
  const icerik = (ek: Record<string, unknown> = {}) => ({ operasyon: 'Siparis', govde: '<Siparis/>', kontroller: [{ tur: 'soapYaniti' }], ...ek });
  const s1 = servisSenaryosuKaydet(vt, { projeId, servisId, baslik: 'Sipariş sorgu', kapsam: 'ikisi', icerik: icerik({ talepler: ['  TALEP-101  ', 'talep-101', 'TALEP-103'] }) });
  const s2 = servisSenaryosuKaydet(vt, { projeId, servisId, baslik: 'Sipariş iptal', kapsam: 'test', icerik: icerik({ talepler: ['TALEP-102'] }) });
  const s3 = servisSenaryosuKaydet(vt, { projeId, servisId, baslik: 'Talepsiz servis', icerik: icerik() });
  const akisId = servisAkisiKaydet(vt, {
    projeId, baslik: 'Sipariş uçtan uca', tur: 'akis', kapsam: 'test',
    icerik: { uctanUca: true, adimlar: [{ servisId, senaryoId: s1 }], talepler: ['TALEP-101'] }
  });
  // Uçtan uca olmayan servis akışında talep saklanmaz.
  const digerAkisId = servisAkisiKaydet(vt, { projeId, baslik: 'Token akışı', tur: 'akis', icerik: { adimlar: [{ servisId, senaryoId: s3 }], talepler: ['TALEP-101'] } });
  return { vt, projeId, test, canli, ekranId, pasifEkranId, e1, e2, e3, e4, servisId, s1, s2, s3, akisId, digerAkisId };
}

test('talepler.mjs: kırpma, tekillik (harf duyarsız), sınırlar, denetim karakteri, eşleşme ve benzer yazım', () => {
  expect(talepTemizle('  TALEP-101 ')).toEqual({ talep: 'TALEP-101', hata: null });
  expect(talepTemizle('   ')).toEqual({ talep: null, hata: null });
  expect(talepTemizle(42).hata).toMatch(/metin/);
  expect(talepTemizle('A\nB').hata).toMatch(/satır sonu/);
  expect(talepTemizle('x'.repeat(TALEP_EN_UZUN + 1)).hata).toMatch(String(TALEP_EN_UZUN));
  expect(talepleriAyikla([' TALEP-101', 'talep-101', '', 'Talep 102 ', 'TALEP-102'])).toEqual({ talepler: ['TALEP-101', 'Talep 102', 'TALEP-102'], hata: null });
  expect(talepleriAyikla(null)).toEqual({ talepler: [], hata: null });
  expect(talepleriAyikla('TALEP-101').hata).toMatch(/liste/);
  expect(talepleriAyikla(Array.from({ length: TALEP_EN_COK + 1 }, (_, i) => `T-${i}`)).hata).toMatch(String(TALEP_EN_COK));
  expect(icerikTalepleri({ talepler: [' A ', 5, '', 'B'] })).toEqual(['A', 'B']);
  expect(icerikTalepleri(null)).toEqual([]);
  expect(talepEslesir(['TALEP-101'], ' talep-101 ')).toBe(true);
  expect(talepEslesir(['TALEP-101'], 'TALEP-10')).toBe(false);
  expect(talepAnahtari('Talep 101')).toBe(talepAnahtari('TALEP-101'));
  expect(benzerTalep('talep-101', ['TALEP-101'])).toEqual({ tur: 'ayni', talep: 'TALEP-101' });
  expect(benzerTalep('Talep 101', ['TALEP-101'])).toEqual({ tur: 'benzer', talep: 'TALEP-101' });
  expect(benzerTalep('TALEP-999', ['TALEP-101'])).toBeNull();
  // Türkçe büyük / küçük harf: "İ" ↔ "i".
  expect(talepEslesir(['İŞ-7'], 'iş-7')).toBe(true);
});

test('kayıt ve okuma: ekran senaryosu, servis senaryosu ve uçtan uca akış', async () => {
  const k = geciciKlasor('talep-kayit');
  const f = await kur(join(k.yol, 'platform.db'));
  const { vt, projeId } = f;
  try {
    // Ekran: senaryo servisiyle (form yolu) — kırpılır, tekilleşir; verilmezse korunur; [] kaldırır; geçersiz reddedilir.
    senaryoKaydet(vt, { id: f.e4, projeId, baslik: 'Talepsiz senaryo', talepler: ['  TALEP-201 ', 'talep-201', 'TALEP-202'] });
    expect(senaryoDetayi(vt, f.e4, null).talepler).toEqual(['TALEP-201', 'TALEP-202']);
    expect(senaryoListesi(vt, projeId, null).senaryolar.find((x) => x.id === f.e4)?.talepler).toEqual(['TALEP-201', 'TALEP-202']);
    senaryoKaydet(vt, { id: f.e4, projeId, baslik: 'Talepsiz senaryo (yeni başlık)' });
    expect(senaryoDetayi(vt, f.e4, null).talepler).toEqual(['TALEP-201', 'TALEP-202']);
    expect(() => senaryoKaydet(vt, { id: f.e4, projeId, baslik: 'X', talepler: 'TALEP-1' })).toThrow(/liste/);
    senaryoKaydet(vt, { id: f.e4, projeId, baslik: 'Talepsiz senaryo', talepler: [] });
    expect(senaryoDetayi(vt, f.e4, null).talepler).toEqual([]);
    expect(String(vt.tek('SELECT icerik_json FROM senaryolar WHERE id = ?', [f.e4])?.icerik_json)).not.toContain('talepler');
    // Kopya talepleri taşır.
    const kopya = senaryoKopyala(vt, projeId, f.e2, 'birim-test');
    expect(senaryoDetayi(vt, kopya.id, null).talepler).toEqual(['talep-101', 'TALEP-102']);

    // Servis senaryosu: içerikte, şifreli; verilmezse korunur; [] kaldırır.
    expect(servisSenaryosuGetir(vt, f.s1)?.icerik.talepler).toEqual(['TALEP-101', 'TALEP-103']);
    expect(String(vt.tek('SELECT icerik_json FROM servis_senaryolari WHERE id = ?', [f.s1])?.icerik_json)).toMatch(/^kasa:v1:/);
    servisSenaryosuKaydet(vt, { id: f.s1, projeId, servisId: f.servisId, baslik: 'Sipariş sorgu', icerik: { operasyon: 'Siparis', govde: '<Siparis/>', kontroller: [] } });
    expect(servisSenaryosuGetir(vt, f.s1)?.icerik.talepler).toEqual(['TALEP-101', 'TALEP-103']);
    expect(() => servisSenaryosuKaydet(vt, { id: f.s1, projeId, servisId: f.servisId, baslik: 'X', icerik: { operasyon: 'Siparis', govde: '<a/>', kontroller: [], talepler: ['A\u0007'] } }))
      .toThrow(/denetim karakteri/);
    servisSenaryosuKaydet(vt, { id: f.s3, projeId, servisId: f.servisId, baslik: 'Talepsiz servis', icerik: { operasyon: 'Siparis', govde: '<a/>', kontroller: [], talepler: [] } });
    expect(servisSenaryosuGetir(vt, f.s3)?.icerik.talepler).toBeUndefined();

    // Uçtan uca akış: talepler içerikte (şifreli); verilmezse korunur; uçtan uca olmayan akışta saklanmaz.
    expect(servisAkisiGetir(vt, f.akisId)?.icerik.talepler).toEqual(['TALEP-101']);
    servisAkisiKaydet(vt, { id: f.akisId, projeId, baslik: 'Sipariş uçtan uca', icerik: { uctanUca: true, adimlar: [{ servisId: f.servisId, senaryoId: f.s1 }] } });
    expect(servisAkisiGetir(vt, f.akisId)?.icerik.talepler).toEqual(['TALEP-101']);
    expect(servisAkisiGetir(vt, f.digerAkisId)?.icerik.talepler).toBeUndefined();
    expect(String(vt.tek('SELECT icerik_json FROM servis_akislari WHERE id = ?', [f.akisId])?.icerik_json)).toMatch(/^kasa:v1:/);
  } finally {
    vt.kapat();
    k.temizle();
  }
});

test('öneri listesi proje içinde tekil (harf duyarsız), sayılı ve sıralı; süzme harf duyarsız tam eşleşme', async () => {
  const f = await kur();
  try {
    const t = projeTalepleri(f.vt, f.projeId);
    // "TALEP-101" (4 ekran/servis/akış kaydında; bir kez "talep-101" yazılmış) tek satır, en sık yazımla.
    expect(t.map((x) => x.talep)).toEqual(['TALEP-101', 'TALEP-102', 'TALEP-103']);
    expect(t[0]).toEqual({ talep: 'TALEP-101', ekran: 3, servis: 1, uctanUca: 1, toplam: 5 });
    expect(t[1]).toMatchObject({ talep: 'TALEP-102', ekran: 1, servis: 1, uctanUca: 0 });
    const kume = talepSenaryolari(f.vt, f.projeId, 'talep-101');
    expect(kume.ekran.map((x) => x.baslik).sort()).toEqual(['Başarılı başvuru', 'Eski ekran senaryosu', 'Zorunlu alan uyarısı']);
    expect(kume.servis.map((x) => x.baslik)).toEqual(['Sipariş sorgu']);
    expect(kume.uctanUca.map((x) => x.baslik)).toEqual(['Sipariş uçtan uca']);
    // Önek eşleşmesi yok (TALEP-10 ≠ TALEP-101).
    expect(talepSenaryolari(f.vt, f.projeId, 'TALEP-10')).toEqual({ ekran: [], servis: [], uctanUca: [] });
    // Liste satırında talepler (arayüz süzgeci bu alanı kullanır).
    const liste = senaryoListesi(f.vt, f.projeId, null).senaryolar;
    expect(liste.filter((x) => talepEslesir(x.talepler, 'TALEP-102')).map((x) => x.baslik)).toEqual(['Başarılı başvuru']);
  } finally { f.vt.kapat(); }
});

test('"Bu talebin senaryolarını koş" planı: ortam başına doğru küme, atlama nedenleri (istek atılmaz)', async () => {
  const f = await kur();
  try {
    expect(() => talepKosuPlani(f.vt, f.projeId, '   ')).toThrow(/boş/);
    const plan = talepKosuPlani(f.vt, f.projeId, ' talep-101 ');
    expect(plan.talep).toBe('talep-101');
    expect(plan.sayilar).toEqual({ ekran: 3, servis: 1, uctanUca: 1 });
    const test = plan.planlar.find((p) => p.ortamId === f.test);
    const canli = plan.planlar.find((p) => p.ortamId === f.canli);
    // TEST: iki ekran senaryosu (devre dışı ekranınki atlanır), servis senaryosu, uçtan uca akış.
    expect(test?.riskli).toBe(false);
    expect(test?.ekran.map((x) => x.baslik).sort()).toEqual(['Başarılı başvuru', 'Zorunlu alan uyarısı']);
    expect(test?.servis).toEqual([{ servisId: f.servisId, servisAdi: 'Örnek servis', senaryolar: [{ id: f.s1, baslik: 'Sipariş sorgu' }] }]);
    expect(test?.uctanUca).toEqual([{ id: f.akisId, baslik: 'Sipariş uçtan uca' }]);
    expect(test?.atlananlar).toEqual([{ tur: 'ekran', baslik: 'Eski ekran senaryosu', neden: 'Ekran devre dışı.' }]);
    // CANLI: yalnız her iki ortamda tanımlı ekran senaryosu; servis bu ortamda tanımlı değil; akış kapsamı TEST.
    expect(canli?.riskli).toBe(true);
    expect(canli?.ekran.map((x) => x.baslik)).toEqual(['Başarılı başvuru']);
    expect(canli?.servis).toEqual([]);
    expect(canli?.uctanUca).toEqual([]);
    expect(canli?.atlananlar.map((a) => `${a.tur}:${a.baslik}`).sort()).toEqual(['ekran:Eski ekran senaryosu', 'ekran:Zorunlu alan uyarısı', 'servis:Sipariş sorgu', 'uctanUca:Sipariş uçtan uca']);
    expect(canli?.atlananlar.find((a) => a.tur === 'servis')?.neden).toMatch(/tanımlı değil|taban/i);
    expect(canli?.atlananlar.find((a) => a.tur === 'uctanUca')?.neden).toMatch(/TEST/);
    // Başka talep: TALEP-102 → TEST'te ekran + servis (kapsam test), CANLI'da servis atlanır.
    const p2 = talepKosuPlani(f.vt, f.projeId, 'TALEP-102').planlar.find((p) => p.ortamId === f.test);
    expect(p2?.ekran.map((x) => x.id)).toEqual([f.e2]);
    expect(p2?.servis[0].senaryolar.map((x) => x.id)).toEqual([f.s2]);
  } finally { f.vt.kapat(); }
});

/** Sonuçları yazar: ekran (kosu_sonuclari), servis (servis_kosulari), uçtan uca (servis_akis_kosulari). */
function sonuclariYaz(f: Fikstur) {
  const { vt, projeId } = f;
  const ekran = (ortamId: string | null, senaryoId: string, durum: string, bitis: string) => {
    const kosuId = kosuOlustur(vt, { projeId, ortamId });
    kosuSonucuEkle(vt, { kosuId, senaryoId, senaryoBaslik: 'x', durum, hataMesaji: null, bitis });
  };
  ekran(f.test, f.e1, 'basarisiz', '2026-09-10T10:00:00.000Z');
  ekran(f.test, f.e1, 'basarili', '2026-09-20T10:00:00.000Z');
  // Atlanan / durdurulan koşu sayılmaz (son geçerli sonuç: 20 Eylül başarılı).
  ekran(f.test, f.e1, 'atlanan', '2026-09-25T10:00:00.000Z');
  ekran(f.canli, f.e2, 'basarisiz', '2026-09-22T10:00:00.000Z');
  ekran(f.test, f.e2, 'basarili', '2026-09-05T10:00:00.000Z');
  const servis = (senaryoId: string, ortamId: string, tur: 'dene' | 'kosu', durum: 'basarili' | 'basarisiz' | 'hata', baslangic: string) =>
    servisKosusuKaydet(vt, { projeId, servisId: f.servisId, senaryoId, ortamId, tur, durum, baslangic, sureMs: 10, baslik: 'x', sonuc: {} });
  servis(f.s1, f.test, 'kosu', 'hata', '2026-09-21T09:00:00.000Z');
  // "Dene" sayılmaz.
  servis(f.s1, f.test, 'dene', 'basarili', '2026-09-23T09:00:00.000Z');
  servisAkisKosusuKaydet(vt, { projeId, akisId: f.akisId, ortamId: f.test, tur: 'kosu', durum: 'basarili', baslangic: '2026-09-24T09:00:00.000Z', sureMs: 10, baslik: 'x', sonuc: {} });
}

test('kapsam matrisi: son sonuç, koşmadı, ortam ve dönem süzgeci; yalnız senaryosu olan talepler', async () => {
  const f = await kur();
  try {
    sonuclariYaz(f);
    const m = kapsamMatrisi(f.vt, f.projeId, { simdi: new Date('2026-09-29T12:00:00Z') });
    expect(m.talepler.map((x) => x.talep)).toEqual(['TALEP-101', 'TALEP-102', 'TALEP-103']);
    const satir = (talep: string, id: string) => m.satirlar.find((r) => r.talep === talep && r.id === id);
    expect(satir('TALEP-101', f.e1)).toMatchObject({ tur: 'ekran', sonuc: 'basarili', zaman: '2026-09-20T10:00:00.000Z', ortamAdi: 'TEST', oge: 'Başvuru formu' });
    // Tüm ortamlar: en yeni (CANLI, başarısız).
    expect(satir('TALEP-101', f.e2)).toMatchObject({ sonuc: 'basarisiz', ortamAdi: 'CANLI' });
    expect(satir('TALEP-101', f.e3)).toMatchObject({ sonuc: 'kosmadi', zaman: null, ortamAdi: null });
    expect(satir('TALEP-101', f.s1)).toMatchObject({ tur: 'servis', sonuc: 'basarisiz', oge: 'Örnek servis', zaman: '2026-09-21T09:00:00.000Z' });
    expect(satir('TALEP-101', f.akisId)).toMatchObject({ tur: 'uctanUca', sonuc: 'basarili', oge: '' });
    expect(satir('TALEP-102', f.s2)).toMatchObject({ sonuc: 'kosmadi' });
    // Talep özeti: TALEP-101 (5 senaryo; 2 başarılı, 2 başarısız, 1 koşmadı) → "başarısız var".
    expect(m.talepler[0]).toEqual({ talep: 'TALEP-101', toplam: 5, basarili: 2, basarisiz: 2, kosmadi: 1, durum: 'basarisiz' });
    expect(m.talepler.find((x) => x.talep === 'TALEP-103')).toMatchObject({ toplam: 1, durum: 'basarisiz' });
    // Talepsiz senaryolar matriste yok.
    expect(m.satirlar.some((r) => r.id === f.e4 || r.id === f.s3)).toBe(false);
    // Sıra: talep, tür (ekran → servis → uçtan uca).
    expect(m.satirlar.filter((r) => r.talep === 'TALEP-101').map((r) => r.tur)).toEqual(['ekran', 'ekran', 'ekran', 'servis', 'uctanUca']);

    // Ortam süzgeci: TEST'te e2'nin son sonucu 5 Eylül başarılı.
    const t = kapsamMatrisi(f.vt, f.projeId, { ortamId: f.test });
    expect(t.ortam).toEqual({ id: f.test, ad: 'TEST' });
    expect(t.satirlar.find((r) => r.id === f.e2 && r.talep === 'TALEP-101')).toMatchObject({ sonuc: 'basarili', zaman: '2026-09-05T10:00:00.000Z' });
    expect(() => kapsamMatrisi(f.vt, f.projeId, { ortamId: 'olmayan-ortam' })).toThrow(/Ortam bulunamadı/);

    // Dönem süzgeci: 15–30 Eylül → e1 20 Eylül başarılı; 1–15 Eylül → e1 10 Eylül başarısız, akış koşmadı.
    const g = matrisGirdisi(f.vt, { projeId: f.projeId, baslangic: '2026-09-01T00:00:00.000Z', bitis: '2026-09-15T00:00:00.000Z' });
    const d = kapsamMatrisi(f.vt, f.projeId, { aralik: g.aralik });
    expect(d.satirlar.find((r) => r.id === f.e1)).toMatchObject({ sonuc: 'basarisiz', zaman: '2026-09-10T10:00:00.000Z' });
    expect(d.satirlar.find((r) => r.id === f.akisId)).toMatchObject({ sonuc: 'kosmadi' });
    expect(() => matrisGirdisi(f.vt, { projeId: f.projeId, baslangic: '2026-09-15T00:00:00Z', bitis: '2026-09-01T00:00:00Z' })).toThrow(/Bitiş/);
    expect(() => matrisGirdisi(f.vt, { projeId: '../x' })).toThrow(/geçersiz/);
  } finally { f.vt.kapat(); }
});

test('CSV ve PDF: başlıklar, ";" / tırnak / formül kaçışı, BOM; PDF yerel basılır, ağ isteği yok, gizli değer maskeli', async () => {
  const k = geciciKlasor('talep-pdf');
  const f = await kur(join(k.yol, 'platform.db'));
  try {
    sonuclariYaz(f);
    // Formül gibi başlayan ve ";" / tırnak içeren talep; bilinen gizli değeri içeren senaryo başlığı (PDF'te maskelenir).
    servisSenaryosuKaydet(f.vt, { id: f.s3, projeId: f.projeId, servisId: f.servisId, baslik: `Kontrol ${GIZLI_PAROLA}`, icerik: { operasyon: 'Siparis', govde: '<a/>', kontroller: [], talepler: ['=1+2', 'A;"B"'] } });
    const csv = kapsamMatrisiCsv(kapsamMatrisi(f.vt, f.projeId));
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    const satirlar = csv.slice(1).split('\r\n');
    expect(satirlar[0]).toBe('Talep;Tür;Senaryo;Ekran / servis;Son sonuç;Tarih;Ortam');
    expect(csv).toContain("'=1+2;Servis senaryosu;");
    expect(csv).toContain('"A;""B""";Servis senaryosu;');
    expect(satirlar.some((s) => s.startsWith('TALEP-101;Ekran senaryosu;Zorunlu alan uyarısı;Başvuru formu;Başarılı;'))).toBe(true);
    const uc = kapsamMatrisiCsvUcu(f.vt, { projeId: f.projeId, ortamId: f.test });
    expect(uc.dosyaAdi).toMatch(/^nobetci-kapsam-matrisi-talep-projesi-\d{4}-\d{2}-\d{2}\.csv$/);
    expect(uc.satir).toBeGreaterThan(0);

    const r = await kapsamMatrisiPdf(f.vt, { projeId: f.projeId });
    expect(r.pdf.subarray(0, 5).toString('latin1')).toBe('%PDF-');
    expect(r.engellenenIstek).toBe(0);
    expect(r.sayfa).toBeGreaterThanOrEqual(1);
    expect(r.dosyaAdi).toMatch(/\.pdf$/);
    expect(r.html).toContain('Kapsam matrisi');
    expect(r.html).toContain('TALEP-101');
    expect(r.html).not.toContain(GIZLI_PAROLA);
    expect(r.html).toContain('Kontrol •••');
    // İsteğe bağlı: örnek PDF (sahte veri) diske yazılır.
    if (process.env.KAPSAM_ORNEK_PDF_KLASORU) {
      mkdirSync(process.env.KAPSAM_ORNEK_PDF_KLASORU, { recursive: true });
      writeFileSync(join(process.env.KAPSAM_ORNEK_PDF_KLASORU, 'ornek-kapsam-matrisi.pdf'), r.pdf);
    }
  } finally {
    await pdfTarayicisiniKapat();
    f.vt.kapat();
    k.temizle();
  }
});

test('Playwright dışa aktarma: talepler dosya başında yorum (tek satır)', () => {
  const plan = { adimlar: [], baglamProfili: null, hatalar: [] } as unknown as Parameters<typeof playwrightKoduUret>[0]['plan'];
  const kaynak = { ekran: 'Form', senaryo: 'Senaryo', modelSurumu: 1, ortam: 'TEST', uretim: '2026-09-29T00:00:00.000Z' };
  const ile = playwrightKoduUret({ plan, kaynak: { ...kaynak, talepler: ['TALEP-101', 'TALEP-102'] }, tabanUrl: 'http://127.0.0.1:9', girisGerekli: false } as Parameters<typeof playwrightKoduUret>[0]);
  expect(ile.icerik).toContain('//   Talep: TALEP-101, TALEP-102');
  const olmadan = playwrightKoduUret({ plan, kaynak, tabanUrl: 'http://127.0.0.1:9', girisGerekli: false } as Parameters<typeof playwrightKoduUret>[0]);
  expect(olmadan.icerik).not.toContain('Talep:');
});

test('içe aktarma talepleri taşır; proje silme talepleri siler', async () => {
  const k = geciciKlasor('talep-aktarma');
  const a = await kur(join(k.yol, 'a.db'));
  const b = await veritabaniniHazirla(join(k.yol, 'b.db'));
  try {
    await kasaOlustur(b, 'Hedef-Kasa-Parolasi-9', { kdf: HIZLI_KDF });
    const hazirlik = await iceAktarmaHazirla(b, yedekOlustur(a.vt).veri, PAROLA);
    iceAktarmaUygula(b, hazirlik, { tumu: true }, { yapan: 'birim-test' });
    expect(projeTalepleri(b, a.projeId)).toEqual(projeTalepleri(a.vt, a.projeId));
    expect(servisSenaryosuGetir(b, a.s1)?.icerik.talepler).toEqual(['TALEP-101', 'TALEP-103']);
    expect(servisAkisiGetir(b, a.akisId)?.icerik.talepler).toEqual(['TALEP-101']);
    expect(senaryoDetayi(b, a.e2, null).talepler).toEqual(['talep-101', 'TALEP-102']);

    projeyiSil(b, a.projeId, { medyaKlasoru: join(k.yol, 'medya'), yapan: 'birim-test' });
    expect(() => projeTalepleri(b, a.projeId)).toThrow(/Proje bulunamadı/);
    for (const tablo of ['senaryolar', 'servis_senaryolari', 'servis_akislari']) {
      expect(Number(b.tek(`SELECT COUNT(*) AS n FROM ${tablo} WHERE proje_id = ?`, [a.projeId])?.n), tablo).toBe(0);
    }
  } finally {
    a.vt.kapat();
    b.kapat();
    k.temizle();
  }
});
