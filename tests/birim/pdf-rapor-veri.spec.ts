// KORUMA TESTLERİ — PDF raporu verisi, şablonu, PDF basımı ve rapor arşivi (veritabanı fikstürüyle; ağ YOK):
// iki dönemde sahte koşular → beklenen sorun durumları ve sayılar (tek ekran, tek servis); maskeleme (gizli değer, e-posta, uzun
// rakam, ortam adresi, istek / yanıt gövdesi rapor HTML'inde yok); PDF (%PDF, sayfa > 0, dış istek engelli ve yapılmıyor);
// arşiv (kaydet → liste, indir → aynı bayt, yeniden oluştur → dönem bugüne kaydırılmış yeni satır, sil, saklama süresi, proje
// silinince raporlar ve şifreli dosyaları gider, yedekte raporlar tablosu).
import { randomBytes } from 'node:crypto';
import { existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { kasaOlustur } from '../../scripts/platform/kasa.mjs';
import { veritabaniniHazirla } from '../../scripts/platform/veritabani/depo.mjs';
import type { Veritabani } from '../../scripts/platform/veritabani/baglanti.mjs';
import { raporGirdisiDogrula, raporHazirla, raporIndir, raporListesi, raporPdf, raporSaklamaTemizligi, raporSilUc, raporYenidenOlustur, raporOnizle, raporSecenekleri, pdfDosyaAdi } from '../../scripts/platform/sonuclar/rapor-uclari.mjs';
import { eskiRaporlariSil, raporlariListele } from '../../scripts/platform/sonuclar/rapor-arsivi.mjs';
import type { DonemRaporuVerisi, RaporSorunu } from '../../scripts/platform/sonuclar/donem-raporu.mjs';
import { htmldenPdf, pdfSayfaSayisi, pdfTarayicisiniKapat } from '../../scripts/platform/sonuclar/pdf-rapor/pdf.mjs';
import { kosuAyarlariniKaydet } from '../../scripts/platform/ayarlar/kosu-ayarlari.mjs';
import { projeyiSil } from '../../scripts/platform/proje-yonetimi.mjs';
import { yedekOlustur } from '../../scripts/platform/yedek.mjs';
import { HIZLI_KDF } from './platform-ortak';
import { RAPOR_SIMDI, SIZINTILAR, raporGirdisi, raporVerisiKur, type RaporFiksturu } from './pdf-rapor-fikstur';

test.describe.configure({ mode: 'serial' });

let klasor = '';
let medya = '';
let vt: Veritabani;
let f: RaporFiksturu;
const b = () => ({ medyaKlasoru: medya, simdi: RAPOR_SIMDI });

test.beforeAll(async () => {
  klasor = mkdtempSync(join(tmpdir(), 'pdf-rapor-'));
  medya = join(klasor, 'medya');
  vt = await veritabaniniHazirla(join(klasor, 'platform.db'));
  await kasaOlustur(vt, `Gecici-${randomBytes(6).toString('hex')}`, { kdf: HIZLI_KDF });
  f = raporVerisiKur(vt);
});

test.afterAll(async () => {
  await pdfTarayicisiniKapat();
  vt?.kapat();
  if (klasor) rmSync(klasor, { recursive: true, force: true });
});

const sorun = (v: DonemRaporuVerisi, parca: string): RaporSorunu => {
  const s = v.sorunlar.filter((x) => x.baslik.includes(parca) || x.nerede.includes(parca));
  expect(s, `sorun: ${parca}`).toHaveLength(1);
  return s[0];
};

test('tek ekran: tam koşu sayıları, sorun durumları, kararsızlık, rozet, bölümler', async () => {
  const { veri: v } = await raporHazirla(vt, raporGirdisiDogrula(raporGirdisi(f, 'ekran')), b());
  expect(v.tur).toBe('ekran');
  expect(v.donem).toMatchObject({ gun: 14, etiket: '15.09.2026 – 28.09.2026', oncekiEtiket: '01.09.2026 – 14.09.2026', kirilim: 'gunluk' });
  // 14 günlük koşu × 6 senaryo + 6 "Filtre" koşusu; tekil koşu orana girmez.
  expect(v.ozet).toMatchObject({ test: 90, basarisiz: 18, atlanan: 14, tamKosu: 20, oncekiTest: 84, oncekiBasarisiz: 13, tekilSonuc: 1, kararsizSenaryo: 1 });
  expect(v.ozet.basari).toBeCloseTo((58 / 90) * 100, 5);
  expect(v.ozet.oncekiBasari).toBeCloseTo((57 / 84) * 100, 5);
  expect(sorun(v, '"Kaydet"')).toMatchObject({ durum: 'yeni', n: 4, nOnceki: 0, senaryo: 1, sinif: 'uygulama', tekrarRozeti: true }); // 3 tam + 1 tekil
  expect(sorun(v, 'Giriş')).toMatchObject({ durum: 'cozulen', n: 0, nOnceki: 2, puan: 0 });
  expect(sorun(v, 'Onayla')).toMatchObject({ durum: 'artan', n: 6, nOnceki: 2, maruz: 14, maruzOnceki: 14, sinif: 'ortam' });
  expect(sorun(v, 'Listele')).toMatchObject({ durum: 'azalan', n: 1, nOnceki: 6, sinif: 'bakim' });
  expect(sorun(v, 'Raporla')).toMatchObject({ durum: 'tekrar', n: 2, nOnceki: 0 });
  expect(sorun(v, 'Detay aç')).toMatchObject({ durum: 'suregelen', n: 3, nOnceki: 3 });
  expect(sorun(v, 'Filtrele')).toMatchObject({ durum: 'kararsiz', sinif: 'kararsiz', n: 3 });
  expect(v.durumSayim).toMatchObject({ yeni: 1, artan: 1, azalan: 1, tekrar: 1, suregelen: 1, kararsiz: 1, cozulen: 1 });
  expect(v.sorunlar.find((s) => s.durum === 'artan')?.seri).toHaveLength(14);
  // Başarı %64,4 < sarı eşik %75 → Kritik.
  expect(v.rozet.durum).toBe('kritik');
  // Aksiyonlar puana göre; çözülen yok; her koşuda atlanan senaryo sabit puanlı P3 ek aksiyon.
  expect(v.aksiyonlar.some((a) => a.durum === 'cozulen')).toBe(false);
  expect(v.aksiyonlar.map((a) => a.puan)).toEqual([...v.aksiyonlar.map((a) => a.puan)].sort((x, y) => y - x));
  expect(v.aksiyonlar.find((a) => a.baslik.includes('Arama'))).toMatchObject({ bant: 'P3', tur: 'ek' });
  expect(v.bantSayim.P1 + v.bantSayim.P2 + v.bantSayim.P3).toBe(7); // 6 açık sorun + 1 ek aksiyon
  const e = v.ekran!;
  expect(e.kapsam).toMatchObject({ senaryo: 8, kosuyaDahil: 8, hicKosmayan: 1, hepAtlanan: 1 });
  expect(e.matris.etiketler).toHaveLength(12);
  expect(e.matris.satirlar.find((s) => s.ad === 'Filtre')?.not).toContain('Kararsız');
  expect(e.matris.satirlar.find((s) => s.ad === 'Silme')?.not).toBe('Dönemde koşmadı');
  expect(e.senaryolar.find((s) => s.ad === 'Arama')).toMatchObject({ hepAtlandi: true, kosu: 14 });
  expect(e.isiHaritasi[0]).toMatchObject({ ad: 'Onayla' });
  expect(e.isiHaritasi[0].seri.reduce((x, y) => x + y, 0)).toBe(6);
  expect(v.egilim.kovalar).toHaveLength(14);
  expect(v.egilim.kovalar[12].adet).toBe(12); // günlük 6 + "Filtre" 6
  expect(e.sonHata).toMatchObject({ senaryo: 'Kayıt', adim: 'Kaydet', beklenen: '"Kaydedildi"', ortam: 'TEST' });
  expect(e.yakalanan).toHaveLength(1);
  expect(e.yakalanan[0]).toMatchObject({ kaynak: 'konsol', test: 3, kalanTest: 3 });
  // Ortam süzgeci aynı sonucu verir (tek ortam); başka projenin ekranı / olmayan ortam reddedilir.
  const { veri: v2 } = await raporHazirla(vt, raporGirdisiDogrula(raporGirdisi(f, 'ekran', { ortamId: f.ortamId })), b());
  expect(v2.ozet.test).toBe(90);
  expect(v2.ortam?.ad).toBe('TEST');
  await expect(raporHazirla(vt, raporGirdisiDogrula(raporGirdisi(f, 'ekran', { ortamId: 'yok' })), b())).rejects.toThrow('Ortam bulunamadı');
  await expect(raporHazirla(vt, raporGirdisiDogrula({ ...raporGirdisi(f, 'ekran'), projeId: f.baskaProjeId }), b())).rejects.toThrow('Ekran bulunamadı');
});

test('tek servis: çağrı sayıları, metot yüzdelikleri ve yavaşlama, metot × hata türü, kontroller, akışlar', async () => {
  const { veri: v } = await raporHazirla(vt, raporGirdisiDogrula(raporGirdisi(f, 'servis')), b());
  expect(v.tur).toBe('servis');
  // Akış adımı satırları (2 bu dönem) servis sayılarına karışmaz.
  expect(v.ozet).toMatchObject({ cagri: 57, kalan: 5, oncekiCagri: 56, oncekiKalan: 3, yavaslayan: 1 });
  expect(v.ozet.basari).toBeCloseTo((52 / 57) * 100, 5);
  expect(v.ozet.enYavas).toMatchObject({ metot: 'POST /kayit', p95: 450, oncekiP95: 200 });
  const s = v.servis!;
  const post = s.metotlar.find((m) => m.ad === 'POST /kayit');
  expect(post).toMatchObject({ cagri: 29, n: 28, p50: 450, p95: 450, p99: 450, oncekiP95: 200, yavas: true, kalan: 5 });
  expect(s.metotlar.find((m) => m.ad === 'GET /kayit/${id}')).toMatchObject({ cagri: 28, basari: 100, yavas: false });
  expect(s.hataMatrisi.find((m) => m.metot === 'POST /kayit')).toMatchObject({ toplam: 5, onceki: 0, sayilar: { h5: 4, zaman: 1, kontrol: 0 } });
  expect(s.hataMatrisi.find((m) => m.metot === 'GET /kayit/${id}')).toMatchObject({ toplam: 0, onceki: 3 });
  expect(sorun(v, 'HTTP 5xx')).toMatchObject({ durum: 'yeni', n: 4, sinif: 'ortam', kalip: 'HTTP durum kodu' });
  expect(sorun(v, 'Zaman aşımı')).toMatchObject({ durum: 'yeni', n: 1, sinif: 'ortam' });
  const cozulen = sorun(v, 'GET /kayit');
  expect(cozulen).toMatchObject({ durum: 'cozulen', nOnceki: 3, kalip: 'JSON eşit: veri.durum' });
  expect(s.kontrolTurleri.find((k) => k.tur === 'durumKodu')).toMatchObject({ toplam: 28, gecen: 24 });
  expect(s.kontrolTurleri.find((k) => k.tur === 'jsonEsit')).toMatchObject({ toplam: 28, gecen: 28 });
  expect(s.kalanKontroller).toEqual([{ etiket: 'HTTP durum kodu', sayi: 4 }]);
  expect(s.akislar).toEqual([expect.objectContaining({ ad: 'Kayıt akışı', kosu: 2, basari: 50, oncekiBasari: 100, son: 'K' })]);
  expect(s.sureEgilimi.p95).toHaveLength(14);
  // %91,2 ≥ yeşil eşik %90 ve P1 yok → Sağlıklı.
  expect(v.bantSayim.P1).toBe(0);
  expect(v.rozet.durum).toBe('saglikli');
});

test('maskeleme: gizli değer, e-posta, uzun rakam, ortam adresi ve gövde rapor HTML\'inde yok; güvenli HTML', async () => {
  for (const kapsam of ['ekran', 'servis'] as const) {
    for (const ek of [{}, { ortamId: f.ortamId }]) {
      const { html } = await raporHazirla(vt, raporGirdisiDogrula(raporGirdisi(f, kapsam, ek)), b());
      for (const sizinti of SIZINTILAR) expect(html, `${kapsam} ${JSON.stringify(ek)}: ${sizinti}`).not.toContain(sizinti);
      expect(html).not.toMatch(/<script/i);
      expect(html).not.toMatch(/(src|href)="https?:/i);
      expect(html).not.toMatch(/@import|url\(/i);
      expect(html).toContain("default-src 'none'");
      expect(html).toContain('<html lang="tr">');
    }
  }
  const { html: ekran } = await raporHazirla(vt, raporGirdisiDogrula(raporGirdisi(f, 'ekran')), b());
  expect(ekran).toContain('parola=•••'); // adım adındaki gizli değer maskeli
  expect(ekran).toContain('Tek bakışta');
  expect(ekran).toContain('Ele alınması gerekenler');
  expect(ekran).toContain('Sorunlar ve eğilimleri');
  expect(ekran).toContain('Senaryo matrisi');
  expect(ekran).toContain('Adım × gün');
  expect(ekran).toContain('✗ KRİTİK');
  expect(ekran).toContain('Beklenen / görülen');
  // Ekran görüntüsü seçeneği kapalı: gömülü görüntü yok.
  expect(ekran).not.toMatch(/data:image\//);
  // Adres açık + tek ortam: ortam adresi (sorgu dizesi olmadan) görünür; gizli değerler yine maskeli.
  const { html: adresli } = await raporHazirla(vt, raporGirdisiDogrula(raporGirdisi(f, 'servis', { ortamId: f.ortamId, secenekler: { adres: true, hatalar: true } })), b());
  expect(adresli).toContain('test.ornek.invalid');
  expect(adresli).not.toContain('anahtar=');
  expect(adresli).not.toContain('Cok-Gizli-Parola-9');
  // Hata ayrıntısı kapalı: hata kalıbı ve beklenen / görülen rapora girmez.
  const { html: hatasiz } = await raporHazirla(vt, raporGirdisiDogrula(raporGirdisi(f, 'ekran', { secenekler: { hatalar: false } })), b());
  expect(hatasiz).not.toContain('toHaveText');
  expect(hatasiz).toContain('Hata ayrıntısı seçenekte kapalı');
  // Karşılaştırma kapalı: önceki dönem sütunları yok.
  const { html: karsilastirmasiz } = await raporHazirla(vt, raporGirdisiDogrula(raporGirdisi(f, 'ekran', { karsilastir: false })), b());
  expect(karsilastirmasiz).toContain('<b>Karşılaştırılan dönem</b>Kapalı');
  expect(karsilastirmasiz).not.toContain('önceki dönem ortalaması');
});

test('girdi doğrulama ve dosya adı', () => {
  expect(() => raporGirdisiDogrula({ ...raporGirdisi(f, 'ekran'), kapsam: 'genel' })).toThrow('yalnız "Tek ekran" ve "Tek servis"');
  expect(() => raporGirdisiDogrula({ ...raporGirdisi(f, 'ekran'), donem: { tur: 'dun' } })).toThrow('Dönem');
  expect(() => raporGirdisiDogrula({ ...raporGirdisi(f, 'ekran'), id: '../x' })).toThrow('geçersiz');
  expect(raporGirdisiDogrula({ projeId: f.projeId, kapsam: 'servis', id: f.servisId })).toMatchObject({
    donem: { tur: 'son14' }, karsilastir: true, ortamId: null, secenekler: { hatalar: true, adres: false, goruntuler: false }
  });
  expect(pdfDosyaAdi('ekran', 'Başvuru Ekranı', RAPOR_SIMDI)).toBe('nobetci-rapor-ekran-basvuru-ekrani-2026-09-28.pdf');
  expect(raporSecenekleri(vt, new URLSearchParams({ projeId: f.projeId }))).toMatchObject({
    ekranlar: [{ ad: 'Başvuru' }], servisler: [{ ad: 'Kayıt Servisi' }], ortamlar: [{ ad: 'TEST' }]
  });
});

test('PDF: %PDF başlığı, sayfa > 0, rapor dış istek yapmaz; route dış kaynağı engeller (yerel sunucuya istek ulaşmaz)', async () => {
  test.setTimeout(120_000);
  const r = await raporPdf(vt, raporGirdisi(f, 'ekran'), b());
  expect(r.pdf.subarray(0, 5).toString('latin1')).toBe('%PDF-');
  expect(r.sayfa).toBeGreaterThan(0);
  expect(pdfSayfaSayisi(r.pdf)).toBe(r.sayfa);
  expect(r.engellenenIstek).toBe(0);
  expect(r.raporId).toBeNull(); // kaydet istenmedi
  for (const sizinti of SIZINTILAR) expect(r.pdf.toString('latin1')).not.toContain(sizinti);
  const s = await raporPdf(vt, raporGirdisi(f, 'servis'), b());
  expect(s.sayfa).toBeGreaterThan(0);
  // İsteğe bağlı: görsel inceleme için örnek PDF'ler (yalnız ortam değişkeni verilince; varsayılan yazılmaz).
  const ornek = process.env.PDF_RAPOR_ORNEK_KLASORU;
  if (ornek) {
    writeFileSync(join(ornek, r.dosyaAdi), r.pdf);
    writeFileSync(join(ornek, s.dosyaAdi), s.pdf);
    for (const kapsam of ['ekran', 'servis'] as const) writeFileSync(join(ornek, `${kapsam}.html`), (await raporHazirla(vt, raporGirdisiDogrula(raporGirdisi(f, kapsam)), b())).html);
  }
  expect(s.dosyaAdi).toBe('nobetci-rapor-servis-kayit-servisi-2026-09-28.pdf');
  // Şablona dış kaynak sızsa bile istek yapılmaz: yerel sunucu hiç istek almaz, engellenen sayılır.
  let gelen = 0;
  const sunucu: Server = createServer((_q, y) => { gelen++; y.end('x'); });
  await new Promise<void>((coz) => sunucu.listen(0, '127.0.0.1', () => coz()));
  const adres = sunucu.address();
  const port = typeof adres === 'object' && adres ? adres.port : 0;
  try {
    const d = await htmldenPdf(`<html><body><img src="http://127.0.0.1:${port}/x.png"><link rel="stylesheet" href="http://127.0.0.1:${port}/s.css">Merhaba</body></html>`);
    expect(d.pdf.subarray(0, 5).toString('latin1')).toBe('%PDF-');
    expect(d.engellenenIstek).toBeGreaterThan(0);
    expect(gelen).toBe(0);
  } finally {
    sunucu.close();
  }
});

test('önizleme: HTML döner, saklanmaz (arşive satır yazılmaz)', async () => {
  const r = await raporOnizle(vt, raporGirdisi(f, 'ekran'), b());
  expect(r.html).toContain('Ekran Raporu — Başvuru');
  expect(r.onizlemeId).toMatch(/^[a-f0-9]{32}$/);
  expect(r.dosyaAdi).toBe('nobetci-rapor-ekran-basvuru-2026-09-28.pdf');
  expect(raporlariListele(vt, f.projeId)).toHaveLength(0);
});

test('arşiv: kaydet → liste (meta), indir → aynı bayt, yeniden oluştur → bugüne kaydırılmış yeni satır, sil (onaylı)', async () => {
  test.setTimeout(120_000);
  const r = await raporPdf(vt, raporGirdisi(f, 'ekran', { kaydet: true, donem: { tur: 'ozel', baslangic: '2026-09-01', bitis: '2026-09-10' } }), b());
  expect(r.raporId).toBeTruthy();
  const [satir] = raporListesi(vt, new URLSearchParams({ projeId: f.projeId })).raporlar;
  expect(satir).toMatchObject({ id: r.raporId, kapsam: 'ekran', dosyaVar: true, boyut: r.pdf.length });
  expect(satir.meta).toMatchObject({
    kapsam: 'ekran', secim: { id: f.ekranId, ad: 'Başvuru' }, donem: { tur: 'ozel', baslangic: '2026-09-01', bitis: '2026-09-10', gun: 10 },
    karsilastir: true, ortam: null, secenekler: { hatalar: true, adres: false, goruntuler: false }, dosyaAdi: r.dosyaAdi
  });
  expect(['saglikli', 'dikkat', 'kritik']).toContain(satir.meta.rozet);
  expect(satir.meta.ozet).toEqual(expect.objectContaining({ bantlar: expect.any(Object), durumlar: expect.any(Object) }));
  // İndirme: kasadan çözülen PDF, üretilenle bayt bayt aynı.
  const indirilen = await raporIndir(vt, new URLSearchParams({ projeId: f.projeId, id: String(r.raporId) }), b());
  expect(indirilen.pdf.equals(r.pdf)).toBe(true);
  expect(indirilen.dosyaAdi).toBe(r.dosyaAdi);
  // Medya klasöründe yalnız şifreli dosya (düz PDF yok).
  for (const ad of readdirSync(medya)) expect(ad).toMatch(/^[a-f0-9]{32}\.medya$/);
  // Aynı seçimlerle yeniden oluştur: 10 günlük özel dönem, bugün (05.10) biten 10 güne kaydırılır.
  const y = await raporYenidenOlustur(vt, { projeId: f.projeId, id: r.raporId }, { medyaKlasoru: medya, simdi: new Date(2026, 9, 5, 9) });
  const liste = raporlariListele(vt, f.projeId);
  expect(liste).toHaveLength(2);
  const yeni = liste.find((x) => x.id === y.raporId);
  expect(yeni?.meta.donem).toMatchObject({ tur: 'ozel', baslangic: '2026-09-26', bitis: '2026-10-05', gun: 10 });
  expect(yeni?.meta.secim).toEqual(satir.meta.secim);
  // Sil: onaysız reddedilir; onaylı satır + medya satırı + şifreli dosya gider.
  expect(() => raporSilUc(vt, { projeId: f.projeId, id: y.raporId }, b())).toThrow('onaylayın');
  const dosyaSayisi = readdirSync(medya).length;
  raporSilUc(vt, { projeId: f.projeId, id: y.raporId, onay: true }, b());
  expect(raporlariListele(vt, f.projeId)).toHaveLength(1);
  expect(readdirSync(medya)).toHaveLength(dosyaSayisi - 1);
  expect(Number(vt.tek("SELECT COUNT(*) AS n FROM medya WHERE sahip_turu = 'rapor'")?.n)).toBe(1);
  // Başka projenin kimliğiyle indirilemez.
  await expect(raporIndir(vt, new URLSearchParams({ projeId: f.baskaProjeId, id: String(r.raporId) }), b())).rejects.toThrow('Rapor bulunamadı');
});

test('saklama süresi: eski raporlar günlük temizlikte silinir (saat enjekte); sınırsız seçilirse silinmez', async () => {
  const [satir] = raporlariListele(vt, f.projeId);
  const olusturulma = new Date(satir.olusturulma).getTime();
  // 30 gün sonra, 90 günlük (varsayılan) saklamada silinmez.
  expect(raporSaklamaTemizligi(vt, { medyaKlasoru: medya, simdi: olusturulma + 30 * 86_400_000 })).toEqual({ rapor: 0, sahipsiz: 0 });
  // Sınırsız: 1000 gün sonra bile silinmez.
  kosuAyarlariniKaydet(vt, { raporSaklamaGun: '0' });
  expect(raporSaklamaTemizligi(vt, { medyaKlasoru: medya, simdi: olusturulma + 1000 * 86_400_000 }).rapor).toBe(0);
  // 30 gün seçilince 31. gün silinir (satır + şifreli dosya).
  kosuAyarlariniKaydet(vt, { raporSaklamaGun: '30' });
  const once = readdirSync(medya).length;
  expect(raporSaklamaTemizligi(vt, { medyaKlasoru: medya, simdi: olusturulma + 31 * 86_400_000 })).toEqual({ rapor: 1, sahipsiz: 0 });
  expect(raporlariListele(vt, f.projeId)).toHaveLength(0);
  expect(readdirSync(medya)).toHaveLength(once - 1);
  expect(eskiRaporlariSil(vt, 90, { medyaKlasoru: medya })).toEqual({ rapor: 0, sahipsiz: 0 });
  kosuAyarlariniKaydet(vt, { raporSaklamaGun: '90' });
});

test('yedek raporlar tablosunu içerir; proje silinince raporlar gider, sahipsiz rapor dosyası temizlikte silinir', async () => {
  test.setTimeout(120_000);
  await raporPdf(vt, raporGirdisi(f, 'servis', { kaydet: true }), b());
  expect(yedekOlustur(vt).manifest.sayimlar.raporlar).toBe(1);
  const medyaSatiri = vt.tek("SELECT dosya FROM medya WHERE sahip_turu = 'rapor'");
  const dosya = join(medya, String(medyaSatiri?.dosya));
  expect(existsSync(dosya)).toBe(true);
  projeyiSil(vt, f.projeId, { medyaKlasoru: medya });
  expect(Number(vt.tek('SELECT COUNT(*) AS n FROM raporlar')?.n)).toBe(0);
  // Proje silme zinciri rapor medyasını henüz tanımıyorsa günlük temizlik sahipsiz rapor medyasını ve dosyasını siler.
  raporSaklamaTemizligi(vt, { medyaKlasoru: medya });
  expect(Number(vt.tek("SELECT COUNT(*) AS n FROM medya WHERE sahip_turu = 'rapor'")?.n)).toBe(0);
  expect(existsSync(dosya)).toBe(false);
});
