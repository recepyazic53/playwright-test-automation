// KORUMA TESTLERİ — PDF raporu A3: genel rapor (projenin tamamı; veritabanı fikstürüyle, ağ YOK).
// Denetlenenler: seçimsiz kapsam (o anki tüm ekranlar ve servisler; ortak akış işaretli), toplamların çoklu raporla aynı hesaptan
// gelmesi, akışlar (servis + uçtan uca), planlı koşu güvenilirliği (kısıtlı geçmiş, devre dışı kural), kararsız testler, test
// verisi sağlığı, kapsam ve açıklar, ortamlara göre; girdi doğrulama; maskeleme (gizli değer, gizli sütun, e-posta, uzun rakam,
// ortam adresi, gövde HTML'de ve PDF'te yok); PDF (%PDF, sayfa > 1, dış istek yok); arşiv (kaydet → meta; yeniden oluşturma o
// anki tüm öğelerle).
import { randomBytes } from 'node:crypto';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { kasaOlustur } from '../../scripts/platform/kasa.mjs';
import { ekranKaydet, veritabaniniHazirla } from '../../scripts/platform/veritabani/depo.mjs';
import type { Veritabani } from '../../scripts/platform/veritabani/baglanti.mjs';
import { servisKaydet } from '../../scripts/platform/servisler/servis-deposu.mjs';
import { raporGirdisiDogrula, raporHazirla, raporPdf, raporSecenekleri, raporYenidenOlustur } from '../../scripts/platform/sonuclar/rapor-uclari.mjs';
import { raporlariListele } from '../../scripts/platform/sonuclar/rapor-arsivi.mjs';
import { pdfTarayicisiniKapat } from '../../scripts/platform/sonuclar/pdf-rapor/pdf.mjs';
import { HIZLI_KDF } from './platform-ortak';
import { KUPON_GIZLISI, RAPOR_SIMDI, SIZINTILAR, cokluGirdi, cokluVeriKur, genelGirdi, genelVeriKur, raporVerisiKur, type GenelFikstur } from './pdf-rapor-fikstur';

test.describe.configure({ mode: 'serial' });

let klasor = '';
let medya = '';
let vt: Veritabani;
let f: GenelFikstur;
const b = () => ({ medyaKlasoru: medya, simdi: RAPOR_SIMDI });
const hazirla = (g: Record<string, unknown>) => raporHazirla(vt, raporGirdisiDogrula(g), b());
const GENEL_SIZINTILAR = [...SIZINTILAR, KUPON_GIZLISI, 'hazirlik.ornek.invalid'];

test.beforeAll(async () => {
  klasor = mkdtempSync(join(tmpdir(), 'pdf-rapor-genel-'));
  medya = join(klasor, 'medya');
  vt = await veritabaniniHazirla(join(klasor, 'platform.db'));
  await kasaOlustur(vt, `Gecici-${randomBytes(6).toString('hex')}`, { kdf: HIZLI_KDF });
  f = genelVeriKur(vt, cokluVeriKur(vt, raporVerisiKur(vt)));
});

test.afterAll(async () => {
  await pdfTarayicisiniKapat();
  vt?.kapat();
  if (klasor) rmSync(klasor, { recursive: true, force: true });
});

test('genel: tüm ekranlar ve servisler (seçimsiz), ortak akış işaretli, toplamlar çoklu hesapla aynı', async () => {
  const { veri: v, dosyaAdi } = await hazirla(genelGirdi(f));
  expect(v.tur).toBe('genel');
  expect(v.oge.ad).toBe('Tüm proje');
  expect(dosyaAdi).toBe('nobetci-rapor-genel-tum-proje-2026-09-28.pdf');
  expect(v.secilenler).toMatchObject({ tumEkranlar: true, tumServisler: true, eksik: 0 });
  expect(v.secilenler!.ekranlar.map((x) => x.ad).sort()).toEqual(['Arşiv', 'Başvuru', 'Ortak Adım', 'Talep']);
  expect(v.secilenler!.servisler.map((x) => x.ad).sort()).toEqual(['Arşiv Servisi', 'Bildirim Servisi', 'Kayıt Servisi']);
  const et = v.coklu!.ekranTarafi!;
  const st = v.coklu!.servisTarafi!;
  // A2 fikstürü + HAZIRLIK'taki 2 test / 2 çağrı (tüm ortamlar).
  expect(et.ozet).toMatchObject({ test: 120, basarisiz: 20, atlanan: 14, ogeSayisi: 4 });
  expect(et.ozet.basari).toBeCloseTo((86 / 120) * 100, 5);
  expect(st.ozet).toMatchObject({ cagri: 87, kalan: 5, ogeSayisi: 3 });
  expect(st.ozet.basari).toBeCloseTo((82 / 87) * 100, 5);
  // Aynı öğelerle karma rapor aynı toplamları verir (hesap kopyalanmaz, yeniden kullanılır).
  const { veri: karma } = await hazirla(cokluGirdi(f, 'karisik', { ekranIdleri: [], servisIdleri: [], tumEkranlar: true, tumServisler: true }));
  expect(karma.coklu!.ekranTarafi!.ozet).toEqual(et.ozet);
  expect(karma.coklu!.servisTarafi!.ozet.cagri).toBe(st.ozet.cagri);
  expect(karma.sorunlar.map((s) => s.imza)).toEqual(v.sorunlar.map((s) => s.imza));
  expect(karma.rozet).toEqual(v.rozet);
  expect(v.ozet).toMatchObject({ taraf: 'ekran', baglantili: 1 });
  // Ortak akış: ekran tablosunda işaretli; senaryosuz ekran açığına girmez.
  expect(et.ogeler.find((o) => o.ad === 'Ortak Adım')?.ortakAkis).toBe(true);
  expect(et.ogeler.find((o) => o.ad === 'Başvuru')?.ortakAkis).toBe(false);
  expect(v.genel!.ozet).toEqual({ ekranSayisi: 3, ortakAkisSayisi: 1, servisSayisi: 3, akisSayisi: 1, uctanUcaSayisi: 1, kuralSayisi: 2 });
});

test('genel: akışlar (servis + uçtan uca), planlı koşu güvenilirliği', async () => {
  const { veri: v } = await hazirla(genelGirdi(f));
  const gn = v.genel!;
  expect(v.coklu!.akislar.map((a) => [a.ad, a.tur, a.kosu, a.basarili, a.oncekiKosu, a.oncekiBasarili])).toEqual([
    ['Kayıt akışı', 'Servis akışı', 2, 1, 2, 2], ['Uçtan uca kayıt', 'Uçtan uca akış', 2, 2, 1, 0]
  ]);
  expect(gn.akis).toMatchObject({ sayi: 2, uctanUca: 1, kosu: 4, basari: 75, oncekiKosu: 3 });
  expect(gn.akis.oncekiBasari).toBeCloseTo((2 / 3) * 100, 5);
  const [gece, haftaSonu] = gn.zamanlanmis.kurallar;
  // 15–28.09 her gün 02:00 = 14 beklenen; 12 kayıt (10 tamamlandı + 1 atlandı + 1 yarıda), 2 kaçan.
  expect(gece).toMatchObject({ etkin: true, beklenen: 14, kayit: 12, tamamlandi: 10, basarisizSonuclu: 1, atlandi: 1, yarida: 1, hata: 0, kacan: 2, kisitli: false,
    kapsam: '1 ekran + 1 servis akışı' });
  expect(gece.guvenilirlik).toBeCloseTo((10 / 14) * 100, 5);
  // Önceki dönem: geçmiş 20 kayıtla dolu, en eski kayıt 07.09 → hesap 07–14.09 (8 beklenen, 8 tamamlandı).
  expect(gece).toMatchObject({ oncekiBeklenen: 8, oncekiTamamlandi: 8, oncekiGuvenilirlik: 100 });
  // Devre dışı kural: beklenen yok, toplama girmez.
  expect(haftaSonu).toMatchObject({ etkin: false, beklenen: null, guvenilirlik: null, kapsam: '1 uçtan uca akış' });
  expect(gn.zamanlanmis).toMatchObject({ beklenen: 14, tamamlandi: 10, atlandi: 1, yarida: 1, oncekiGuvenilirlik: 100 });
  // Seçili ortam: yalnız o ortamın kuralları (HAZIRLIK'ta kural yok).
  const { veri: hz } = await hazirla(genelGirdi(f, { ortamId: f.ortam2Id }));
  expect(hz.genel!.zamanlanmis.kurallar).toEqual([]);
  expect(hz.genel!.ortamlar).toBeNull();
  expect(hz.coklu!.ekranTarafi!.ozet.test).toBe(2);
});

test('genel: kararsız testler, test verisi sağlığı, kapsam ve açıklar, ortamlara göre', async () => {
  const { veri: v } = await hazirla(genelGirdi(f));
  const gn = v.genel!;
  expect(gn.kararsiz.kararsiz).toBe(1);
  expect(gn.kararsiz.liste[0]).toMatchObject({ tur: 'ekran', ad: 'Filtre', oge: 'Başvuru', durum: 'kararsiz', kosu: 6, degisim: 5, oran: 1 });
  expect(gn.testVerisi).toMatchObject({ hesaplandi: true, kirik: 1, kullanilmayan: 1, benzer: 0 });
  expect(gn.testVerisi.kirikOrnekler[0]).toMatchObject({ yer: 'Ekran senaryosu: Talep (eski veri)', basvuru: '${Silinmis.Kod}' });
  expect(gn.testVerisi.bulgu).toBe(gn.testVerisi.kirik + gn.testVerisi.kullanilmayan + gn.testVerisi.benzer + gn.testVerisi.bosSutun);
  const kp = gn.kapsam;
  // Başvuru 8 + Talep 2 koşuya dahil senaryo; "Silme" dönemde koşmadı, "Arama" her koşuda atlandı.
  expect(kp).toMatchObject({ kosuyaDahil: 10, donemdeKosan: 9, hepAtlanan: 1, metot: { toplam: 2, senaryolu: 1, servis: 1 }, olculmeyenServis: 2,
    kuralliEkran: 1, kosulanEkran: 2, kuralliAkis: 1, akis: 2, acikSayisi: 4 });
  expect(kp.aciklar.map((a) => `${a.tur}: ${a.yer}`)).toEqual([
    'Senaryosu olmayan metot: Arşiv Servisi › DELETE /arsiv/{id}', 'Dönemde koşmayan senaryo: Başvuru › Silme',
    'Her koşuda atlanan senaryo: Başvuru › Arama', 'Senaryosu olmayan ekran: Arşiv'
  ]);
  expect(gn.ortamlar).toHaveLength(2);
  const test_ = gn.ortamlar!.find((o) => o.ad === 'TEST');
  expect(test_).toMatchObject({ riskli: false, test: 118, cagri: 85 });
  expect(test_!.ekranBasari).toBeCloseTo((84 / 118) * 100, 5);
  expect(test_!.servisBasari).toBeCloseTo((80 / 85) * 100, 5);
  expect(gn.ortamlar!.find((o) => o.ad === 'HAZIRLIK')).toMatchObject({ riskli: true, test: 2, ekranBasari: 100, cagri: 2, servisBasari: 100 });
});

test('genel: yeni öğe eklenince rapor onu da kapsar; girdi doğrulama ve seçenekler', async () => {
  // Girdi: seçim yok; gövdedeki kimlikler yok sayılır.
  expect(raporGirdisiDogrula({ ...genelGirdi(f), ekranIdleri: [f.ekranId], servisIdleri: ['x'] })).toMatchObject({
    kapsam: 'genel', id: '', ekranIdleri: [], servisIdleri: [], tumEkranlar: true, tumServisler: true
  });
  expect(() => raporGirdisiDogrula({ ...genelGirdi(f), kapsam: 'hepsi' })).toThrow('Kapsam yalnız');
  expect(raporSecenekleri(vt, new URLSearchParams({ projeId: f.projeId })).kapsamlar).toContain('genel');
  // Başka projede öğe yoksa açık hata.
  await expect(hazirla({ ...genelGirdi(f), projeId: f.baskaProjeId })).rejects.toThrow('Projede ekran ya da servis yok');
  const { veri: once } = await hazirla(genelGirdi(f));
  const yeniId = ekranKaydet(vt, { projeId: f.projeId, anahtar: 'yeni-ekran', ad: 'Yeni Ekran' });
  const { veri: sonra } = await hazirla(genelGirdi(f));
  expect(sonra.secilenler!.ekranlar.length).toBe(once.secilenler!.ekranlar.length + 1);
  expect(sonra.secilenler!.ekranlar.some((e) => e.id === yeniId)).toBe(true);
  expect(sonra.genel!.kapsam.aciklar.some((a) => a.yer === 'Yeni Ekran')).toBe(true);
  vt.calistir("UPDATE ekranlar SET durum = 'silindi' WHERE id = ?", [yeniId]);
  const { veri: silindi } = await hazirla(genelGirdi(f));
  expect(silindi.secilenler!.ekranlar.some((e) => e.id === yeniId)).toBe(false);
});

test('maskeleme: genel raporun HTML\'inde gizli değer, gizli sütun, e-posta, uzun rakam, ortam adresi ve gövde yok; güvenli HTML', async () => {
  for (const ek of [{}, { ortamId: f.ortamId }, { karsilastir: false }, { secenekler: { hatalar: false, adres: false, goruntuler: false } }]) {
    const { html } = await hazirla(genelGirdi(f, ek));
    for (const sizinti of GENEL_SIZINTILAR) expect(html, `${JSON.stringify(ek)}: ${sizinti}`).not.toContain(sizinti);
    expect(html).not.toMatch(/<script/i);
    expect(html).not.toMatch(/(src|href)="https?:/i);
    expect(html).not.toMatch(/@import|url\(/i);
    expect(html).toContain("default-src 'none'");
  }
  const { html } = await hazirla(genelGirdi(f));
  expect(html).toContain('Genel Rapor — Tüm Proje');
  expect(html).toContain('Gece koşusu •••'); // kural adındaki gizli sütun değeri maskeli
  expect(html).toContain('parola=•••');
  for (const bolum of ['Tek bakışta', 'Ele alınması gerekenler', 'Bağlantılı sorunlar (ekran ↔ servis)', 'Sorunlar ve eğilimleri', 'Eğilim', 'Ekranlar ve ortak akışlar',
    'Servisler', 'Servis akışları ve uçtan uca akışlar', 'Planlı koşular', 'Kararsız testler', 'Test verisi sağlığı', 'Kapsam ve açıklar', 'Ortamlara göre',
    'Yöntem', 'Gizlilik.', '(ortak akış)', 'Uçtan uca akış', 'Planlı koşu güvenilirliği', 'Sonraki aşama']) {
    expect(html, bolum).toContain(bolum);
  }
  // Tek ortam seçilince "Ortamlara göre" bölümü yok; karşılaştırma kapalıysa önceki dönem sütunları yok.
  expect((await hazirla(genelGirdi(f, { ortamId: f.ortamId }))).html).not.toContain('Ortamlara göre');
  expect((await hazirla(genelGirdi(f, { karsilastir: false }))).html).toContain('<b>Karşılaştırılan dönem</b>Kapalı');
});

test('PDF: %PDF, sayfa > 1, dış istek yok; gizli değer PDF\'te yok', async () => {
  test.setTimeout(180_000);
  const r = await raporPdf(vt, genelGirdi(f), b());
  expect(r.pdf.subarray(0, 5).toString('latin1')).toBe('%PDF-');
  expect(r.sayfa).toBeGreaterThan(1);
  expect(r.engellenenIstek).toBe(0);
  for (const sizinti of GENEL_SIZINTILAR) expect(r.pdf.toString('latin1')).not.toContain(sizinti);
  // İsteğe bağlı: görsel inceleme için örnek PDF + HTML (yalnız ortam değişkeni verilince).
  const ornek = process.env.PDF_RAPOR_ORNEK_KLASORU;
  if (ornek) {
    mkdirSync(ornek, { recursive: true });
    writeFileSync(join(ornek, r.dosyaAdi), r.pdf);
    writeFileSync(join(ornek, 'genel.html'), (await hazirla(genelGirdi(f))).html);
  }
});

test('arşiv: genel rapor kaydedilir; yeniden oluşturma o anki tüm öğelerle çalışır', async () => {
  test.setTimeout(180_000);
  const r = await raporPdf(vt, genelGirdi(f, { kaydet: true }), b());
  expect(r.raporId).toBeTruthy();
  const satir = raporlariListele(vt, f.projeId).find((x) => x.id === r.raporId);
  expect(satir).toMatchObject({ kapsam: 'genel' });
  expect(satir!.meta).toMatchObject({ kapsam: 'genel', secim: { id: '', ad: 'Tüm proje', genel: true, ekranSayisi: 4, servisSayisi: 3 }, ozet: { test: 120 + 87 } });
  // Sonradan eklenen servis yeniden oluşturmada kapsanır.
  servisKaydet(vt, { projeId: f.projeId, anahtar: 'sonraki-servis', ad: 'Sonraki Servis', tur: 'rest' });
  const y = await raporYenidenOlustur(vt, { projeId: f.projeId, id: r.raporId }, { medyaKlasoru: medya, simdi: new Date(2026, 9, 5, 9) });
  const yeni = raporlariListele(vt, f.projeId).find((x) => x.id === y.raporId);
  expect(yeni?.kapsam).toBe('genel');
  expect(yeni?.meta.secim).toMatchObject({ ad: 'Tüm proje', genel: true, ekranSayisi: 4, servisSayisi: 4 });
  expect(yeni?.meta.donem).toMatchObject({ tur: 'son14', gun: 14 });
});
