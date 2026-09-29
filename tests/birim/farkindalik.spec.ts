// KORUMA TESTLERİ — Sonuçlar > Genel > Özet: farkındalık kartlarının toplama hesabı (sonuclar/farkindalik.mjs; veritabanı fikstürüyle, ağ YOK).
// Fikstür PDF rapor A4'ünkidir (iki dönem sahte ekran / servis / akış koşuları, zamanlanmış kural geçmişi, kritik işaretleri); üstüne
// modelli bir ekran (koşul dalları + geçmiş sabit tarihli senaryo), bekleyen bulgu, türü seçilmemiş ortam ve adında gizli değer geçen
// servis eklenir. Denetlenenler: her sinyalin doğru maddesi ve adresi, eşik ayarlarının etkisi, özet kutularının genel raporla aynı
// hesaptan gelmesi, maskeleme (gizli değer / gizli sütun değeri adlarda yok), boş projede "sorun yok", saf yardımcılar.
import { randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { kasaOlustur } from '../../scripts/platform/kasa.mjs';
import { ekranKaydet, ekranModeliEkle, ortamKaydet, projeKaydet, veritabaniniHazirla } from '../../scripts/platform/veritabani/depo.mjs';
import type { Veritabani } from '../../scripts/platform/veritabani/baglanti.mjs';
import { servisKaydet, servisSenaryosuKaydet } from '../../scripts/platform/servisler/servis-deposu.mjs';
import { kosuAyarlariniKaydet } from '../../scripts/platform/ayarlar/kosu-ayarlari.mjs';
import { senaryoKaydet as senaryoyuKaydet } from '../../scripts/platform/senaryolar/senaryo-servisi.mjs';
import { izinDegistir } from '../../scripts/platform/guvenlik/izinler.mjs';
import { donemRaporuVerisi } from '../../scripts/platform/sonuclar/donem-raporu.mjs';
import {
  aralikDonemi, farkindalikOnbelleginiTemizle, farkindalikVerisi, kirmiziSeriBaslangici, tetiklemeNedeni, yavaslayanMetotlar,
  type FarkindalikKarti, type FarkindalikVerisi
} from '../../scripts/platform/sonuclar/farkindalik.mjs';
import { HIZLI_KDF } from './platform-ortak';
import { GIZLI_PAROLA, KUPON_GIZLISI, RAPOR_SIMDI, a4VeriKur, cokluVeriKur, genelVeriKur, raporVerisiKur, type A4Fikstur } from './pdf-rapor-fikstur';
import { siparisModeli, tabanVerisi } from './senaryo-onerileri-fikstur';

test.describe.configure({ mode: 'serial' });

const SIMDI = RAPOR_SIMDI;
/** Fikstürün bu dönemi: 15.09–28.09 (yerel gün; Sonuçlar ekranının tarih aralığı biçiminde ISO). */
const ARALIK = { baslangic: new Date(2026, 8, 15).toISOString(), bitis: new Date(2026, 8, 28, 23, 59).toISOString() };
const ESKI = '2026-07-01T09:00:00.000Z';
const YAKIN_YEDEK = '2026-09-28T08:00:00.000Z';

let klasor = '';
let vt: Veritabani;
let f: A4Fikstur;
let siparisId = '';
let tarihliSenaryo = '';
let gizliServisId = '';

const hesapla = (ek: Partial<Parameters<typeof farkindalikVerisi>[2]> = {}): Promise<FarkindalikVerisi> =>
  farkindalikVerisi(vt, f.projeId, { aralik: ARALIK, simdi: SIMDI, sonYedek: YAKIN_YEDEK, onbellek: false, ...ek });
const bul = (k: FarkindalikKarti, parca: string) => k.maddeler.find((m) => `${m.ad} ${m.ayrinti}`.includes(parca));
const hepsi = (k: FarkindalikKarti, parca: string) => k.maddeler.filter((m) => `${m.ad} ${m.ayrinti}`.includes(parca));

test.beforeAll(async () => {
  klasor = mkdtempSync(join(tmpdir(), 'farkindalik-'));
  vt = await veritabaniniHazirla(join(klasor, 'platform.db'));
  await kasaOlustur(vt, `Gecici-${randomBytes(6).toString('hex')}`, { kdf: HIZLI_KDF });
  f = a4VeriKur(vt, genelVeriKur(vt, cokluVeriKur(vt, raporVerisiKur(vt))), { surumler: false });
  const { projeId } = f;
  // Modelli ekran: koşul dalları (kategoriye göre beden / renk; hediye paketi → hediye notu) ve geçmişte kalmış sabit teslimat tarihi.
  siparisId = ekranKaydet(vt, { projeId, anahtar: 'siparis', ad: 'Sipariş formu' });
  ekranModeliEkle(vt, { ekranId: siparisId, model: siparisModeli() });
  // Senaryo bugün geçerli bir tarihle kaydedilir (doğrulayıcıdan geçer), sonra tarih eskimiş gibi kayıttaki değer geçmişe çekilir.
  const ileri = new Date();
  ileri.setDate(ileri.getDate() + 10);
  const iki = (n: number) => String(n).padStart(2, '0');
  const gecerli = `${iki(ileri.getDate())}.${iki(ileri.getMonth() + 1)}.${ileri.getFullYear()}`;
  tarihliSenaryo = senaryoyuKaydet(vt, { projeId, ekranId: siparisId, baslik: 'Kitap siparişi', veri: tabanVerisi(gecerli), ortamIdleri: [f.ortamId] }).id;
  const icerik = String(vt.tek('SELECT icerik_json FROM senaryolar WHERE id = ?', [tarihliSenaryo])?.icerik_json);
  expect(icerik).toContain(gecerli);
  vt.calistir('UPDATE senaryolar SET icerik_json = ? WHERE id = ?', [icerik.split(gecerli).join('01.01.2020'), tarihliSenaryo]);
  // Bekleyen bulgu: Talep ekranının karar bekleyen analizi (iki bulgu).
  ekranKaydet(vt, { id: f.ekran2Id, projeId, anahtar: 'talep', ad: 'Talep', ayarlar: { analiz: { bekleyen: { id: 'analiz-1', zaman: ESKI, bulgular: [{ tur: 'yeniAlan' }, { tur: 'etiketDegisikligi' }] } } } });
  // Türü seçilmemiş (eski) ortam.
  ortamKaydet(vt, { projeId, ad: 'ESKI ORTAM', tabanUrl: 'https://eski.ornek.invalid/', ayarlar: {} });
  // Adında bilinen gizli değer (giriş parolası) geçen servis ve hiç koşmayan senaryosu.
  gizliServisId = servisKaydet(vt, { projeId, anahtar: 'gizli-adli', ad: `Servis ${GIZLI_PAROLA}`, tur: 'rest' });
  servisSenaryosuKaydet(vt, { projeId, servisId: gizliServisId, baslik: `Sorgu ${KUPON_GIZLISI}`, icerik: { operasyon: 'sorgu', govde: '', kontroller: [], http: { metot: 'GET', yol: '/sorgu' } } });
  // Senaryolar 30 günden önce oluşturulmuş sayılsın (koşmayan senaryo denetimi oluşturulma tarihine bakar).
  vt.calistir('UPDATE senaryolar SET olusturulma = ? WHERE proje_id = ?', [ESKI, projeId]);
  vt.calistir('UPDATE servis_senaryolari SET olusturulma = ? WHERE proje_id = ?', [ESKI, projeId]);
});

test.afterAll(() => {
  vt?.kapat();
  if (klasor) rmSync(klasor, { recursive: true, force: true });
});

test('saf yardımcılar: kırmızı serisi, yavaşlama eşiği, tarih aralığı → dönem, tetikleme nedeni', () => {
  expect(kirmiziSeriBaslangici([])).toBeNull();
  expect(kirmiziSeriBaslangici([{ zaman: 1, kirmizi: true }, { zaman: 2, kirmizi: false }])).toBeNull();
  expect(kirmiziSeriBaslangici([{ zaman: 3, kirmizi: true }, { zaman: 1, kirmizi: true }, { zaman: 2, kirmizi: false }, { zaman: 4, kirmizi: true }])).toBe(3);
  expect(kirmiziSeriBaslangici([{ zaman: 5, kirmizi: true }, { zaman: 2, kirmizi: true }])).toBe(2);
  const m = [{ ad: 'a', p95: 130, oncekiP95: 100, n: 20 }, { ad: 'b', p95: 129, oncekiP95: 100, n: 50 }, { ad: 'c', p95: 500, oncekiP95: 100, n: 19 }, { ad: 'd', p95: 300, oncekiP95: null, n: 40 }];
  expect(yavaslayanMetotlar(m, 30).map((x) => [x.ad, x.artis])).toEqual([['a', 30]]);
  expect(yavaslayanMetotlar(m, 20).map((x) => x.ad)).toEqual(['a', 'b']);
  expect(aralikDonemi({ baslangic: null, bitis: null }, SIMDI)).toEqual({ secim: { tur: 'son30' }, tumu: true });
  expect(aralikDonemi(ARALIK, SIMDI)).toEqual({ secim: { tur: 'ozel', baslangic: '2026-09-15', bitis: '2026-09-28' }, tumu: false });
  // Bitiş yoksa bugün; 366 günden uzun aralık kırpılır.
  expect(aralikDonemi({ baslangic: new Date(2020, 0, 1).toISOString(), bitis: null }, SIMDI).secim).toEqual({ tur: 'ozel', baslangic: '2025-09-28', bitis: '2026-09-28' });
  expect(tetiklemeNedeni({ durum: 'atlandi', mesaj: 'Atlandı: koşu sürüyordu.' })).toBe('atlandı: başka koşu sürüyordu');
  expect(tetiklemeNedeni({ durum: 'atlandi', mesaj: 'Atlandı: izin kapalı: Arka plan çalışması.' })).toBe('atlandı: izin kapalı');
  expect(tetiklemeNedeni({ durum: 'yarida', mesaj: '' })).toMatch(/^yarıda kaldı/);
});

test('özet kutuları genel raporun toplamlarıyla aynı (ekran testi, servis çağrısı, uçtan uca koşu; önceki eşit dönem)', async () => {
  const v = await hesapla();
  expect(v.donem).toEqual({ etiket: '15.09.2026 – 28.09.2026', oncekiEtiket: '01.09.2026 – 14.09.2026', gun: 14, tumu: false });
  expect(v.ozet.ekran).toMatchObject({ adet: 120, kalan: 20, birim: 'test' });
  expect(v.ozet.ekran?.basari).toBeCloseTo((86 / 120) * 100, 5);
  expect(v.ozet.servis).toMatchObject({ adet: 87, kalan: 5, basarili: 82, birim: 'çağrı' });
  expect(v.ozet.servis?.basari).toBeCloseTo((82 / 87) * 100, 5);
  // Uçtan uca kayıt: bu dönem 2 başarılı koşu, önceki dönem 1 hata.
  expect(v.ozet.uctanUca).toMatchObject({ basari: 100, oncekiBasari: 0, adet: 2, oncekiAdet: 1, basarili: 2, kalan: 0, birim: 'koşu' });
  expect(v.hesaplanamayan).toEqual([]);
});

test('Dikkat: kritik ve uzun süredir kırmızı akış tek maddede, P1 sorunlu öğeler, yavaşlayan metot, kaçan / atlanan zamanlanmış koşu', async () => {
  const v = await hesapla();
  const k = v.kartlar.dikkat;
  expect(k.toplam).toBe(k.maddeler.length);
  // Kayıt akışı: kritik işaretli, son koşusu (23.09 15:00) kaldı → 28.09 12:00'de 4 gündür kırmızı; ilk sırada ve tek madde.
  expect(k.maddeler[0]).toEqual({ tur: 'kritik', ad: 'Kayıt akışı', ayrinti: 'Servis akışı · kritik · son koşusunda kaldı · 4 gündür kırmızı', adres: `#/sonuclar/servisler/a/${f.akisId}` });
  expect(hepsi(k, 'Kayıt akışı')).toHaveLength(1);
  // P1: genel raporun P1 aksiyonlarının öğeleri (aynı hesap).
  const rapor = await donemRaporuVerisi(vt, { projeId: f.projeId, kapsam: 'genel', id: '', donem: { tur: 'ozel', baslangic: '2026-09-15', bitis: '2026-09-28' }, karsilastir: true, ortamId: null,
    secenekler: { hatalar: false, adres: false, goruntuler: false } }, { maskele: (m) => String(m), simdi: SIMDI });
  const p1 = new Map<string, number>();
  for (const s of rapor.sorunlar) if (s.bant === 'P1' && s.durum !== 'cozulen' && s.durum !== 'dogrulanamadi') p1.set(s.ogeAd, (p1.get(s.ogeAd) ?? 0) + 1);
  expect(p1.size).toBeGreaterThan(0);
  for (const [ad, n] of p1) {
    const madde = k.maddeler.find((m) => m.ad === ad);
    expect(madde?.ayrinti, ad).toContain(`${n} P1 sorun`);
    expect(madde?.adres).toMatch(/^#\/sonuclar\/(u|s)\//);
  }
  // Yavaşlayan: POST /kayit p95 200 → 450 ms (%125; eşik %30).
  expect(bul(k, 'Yavaşladı')).toEqual({ tur: 'yavas', ad: 'Kayıt Servisi › POST /kayit', ayrinti: expect.stringMatching(/^Yavaşladı · p95 %125 arttı \(\d+ ölçüm\)$/), adres: `#/sonuclar/s/${f.servisId}` });
  // Zamanlanmış kural: 25.09 atlandı, 26.09 yarıda, 27–28.09 kaçtı; adı maskeli (gizli sütun değeri).
  const z = k.maddeler.find((m) => m.tur === 'zamanlanmis');
  expect(z?.ad).toBe('Gece koşusu •••');
  expect(z?.ayrinti).toBe('Zamanlanmış koşu · 2 kaçtı (Nöbetçi kapalı ya da kasa kilitliydi), 1 yarıda kaldı (kasa kilitlendi ya da çalışma alanı değişti), 1 atlandı');
  expect(z?.adres).toBe('#/ayarlar/kosu');
});

test('eşikler Ayarlar\'dan: kırmızı gün ve yavaşlama yüzdesi yükselince maddeler düşer', async () => {
  kosuAyarlariniKaydet(vt, { ozetKirmiziGun: 5, ozetYavaslamaYuzde: 200 });
  try {
    const v = await hesapla();
    expect(v.esikler).toMatchObject({ kirmiziGun: 5, yavaslamaYuzde: 200 });
    expect(bul(v.kartlar.dikkat, 'gündür kırmızı')).toBeUndefined();
    expect(bul(v.kartlar.dikkat, 'Yavaşladı')).toBeUndefined();
    // Kritik madde kalır (eşikten bağımsız).
    expect(bul(v.kartlar.dikkat, 'Kayıt akışı')?.ayrinti).toBe('Servis akışı · kritik · son koşusunda kaldı');
  } finally {
    kosuAyarlariniKaydet(vt, { ozetKirmiziGun: 3, ozetYavaslamaYuzde: 30 });
  }
});

test('Bakım: geçmiş sabit tarih, koşmayan senaryolar (eşikli), bekleyen bulgu, test verisi sağlığı', async () => {
  const v = await hesapla();
  const k = v.kartlar.bakim;
  expect(bul(k, 'Sabit tarih')).toEqual({ tur: 'tarih', ad: 'Sipariş formu › Kitap siparişi', ayrinti: 'Sabit tarih geçmişte · 1 alan', adres: `#/senaryolar/duzenle/${tarihliSenaryo}` });
  const kosmayan = k.maddeler.filter((m) => m.tur === 'kosmayan');
  // Hiçbir ortamda tanımlı olmayan (koşuya giremeyen) fikstür senaryoları sayılmaz; Senaryolar listesindeki "Koşuda" kuralı.
  expect(kosmayan.map((m) => m.ad).sort()).toEqual(['Arşiv Servisi › Arşivle', 'Servis ••• › Sorgu •••', 'Sipariş formu › Kitap siparişi'].sort());
  expect(kosmayan.every((m) => m.ayrinti === 'Hiç koşmadı')).toBe(true);
  expect(kosmayan.find((m) => m.ad === 'Sipariş formu › Kitap siparişi')?.adres).toBe(`#/senaryolar/duzenle/${tarihliSenaryo}`);
  expect(kosmayan.find((m) => m.ad === 'Arşiv Servisi › Arşivle')?.adres).toMatch(new RegExp(`^#/servisler/s/${f.arsivServisId}/senaryo/`));
  expect(bul(k, 'bekleyen bulgu')).toEqual({ tur: 'bulgu', ad: 'Talep', ayrinti: '2 bekleyen bulgu', adres: `#/ekranlar/e/${f.ekran2Id}/bulgular` });
  expect(bul(k, 'Kullanılmayan tablo')).toEqual({ tur: 'veri', ad: 'Kullanılmayan tablo', ayrinti: 'Test verisi sağlığı · 1', adres: '#/veri' });
  expect(bul(k, 'Kırık tablo başvurusu')?.ayrinti).toBe('Test verisi sağlığı · 1');
  // Koşmayan eşiği 365 gün: senaryolar (01.07.2026) o kadar eski değil → madde yok.
  kosuAyarlariniKaydet(vt, { ozetKosmayanGun: 365 });
  try {
    expect((await hesapla()).kartlar.bakim.maddeler.filter((m) => m.tur === 'kosmayan')).toEqual([]);
  } finally {
    kosuAyarlariniKaydet(vt, { ozetKosmayanGun: 30 });
  }
});

test('Kapsam ve güvenlik: senaryosuz metot, denenmemiş koşul dalı, yedek yaşı (eşikli), açık riskli izin, türü seçilmemiş ortam', async () => {
  let v = await hesapla();
  let k = v.kartlar.kapsam;
  expect(bul(k, 'metodun senaryosu yok')).toEqual({ tur: 'metot', ad: 'Arşiv Servisi', ayrinti: '1 / 2 metodun senaryosu yok', adres: `#/servisler/s/${f.arsivServisId}/sozlesme` });
  const dal = bul(k, 'koşul dalı denenmedi');
  expect(dal).toMatchObject({ tur: 'dal', ad: 'Sipariş formu', adres: `#/senaryolar/oneriler/${siparisId}` });
  expect(dal?.ayrinti).toMatch(/^\d+ \/ \d+ koşul dalı denenmedi$/);
  expect(bul(k, 'ESKI ORTAM')).toEqual({ tur: 'ortam', ad: 'ESKI ORTAM', ayrinti: 'Ortam türü seçilmemiş (Canlı sayılır)', adres: '#/ayarlar/proje' });
  expect(k.maddeler.filter((m) => m.tur === 'yedek' || m.tur === 'izin')).toEqual([]);
  // Yedek: hiç yok / eşikten (7 gün) eski / yeni.
  expect(bul((await hesapla({ sonYedek: null })).kartlar.kapsam, 'Hiç yedek')).toMatchObject({ tur: 'yedek', adres: '#/ayarlar/yedekleme' });
  expect(bul((await hesapla({ sonYedek: '2026-09-18T09:00:00.000Z' })).kartlar.kapsam, 'Son yedek')?.ayrinti).toBe('10 gün önce alındı');
  kosuAyarlariniKaydet(vt, { ozetYedekGun: 14 });
  try {
    expect(bul((await hesapla({ sonYedek: '2026-09-18T09:00:00.000Z' })).kartlar.kapsam, 'Son yedek')).toBeUndefined();
  } finally {
    kosuAyarlariniKaydet(vt, { ozetYedekGun: 7 });
  }
  // Riskli izin açıkken hatırlatılır; riski düşük izin (web erişimi) listelenmez.
  izinDegistir(vt, 'canli-ortam', true, { onay: true });
  izinDegistir(vt, 'web-erisimi', true, { onay: true });
  try {
    v = await hesapla();
    k = v.kartlar.kapsam;
    expect(k.maddeler.filter((m) => m.tur === 'izin')).toEqual([{ tur: 'izin', ad: 'Canlı ortamda çalıştırma', ayrinti: 'Riskli izin açık', adres: '#/ayarlar/izinler/canli-ortam' }]);
  } finally {
    izinDegistir(vt, 'canli-ortam', false, { onay: true });
    izinDegistir(vt, 'web-erisimi', false, { onay: true });
  }
});

test('maskeleme: bilinen gizli değerler ve gizli sütun değerleri hiçbir madde adında yok; yalnız ad ve sayı', async () => {
  const v = await hesapla({ sonYedek: null });
  const metin = JSON.stringify(v);
  for (const gizli of [GIZLI_PAROLA, KUPON_GIZLISI, 'rapor.kullanici', 'ali.veli@', '4111111111111111', 'test.ornek.invalid', 'govde-icerigi']) expect(metin, gizli).not.toContain(gizli);
  expect(bul(v.kartlar.bakim, 'Servis •••')?.ad).toBe('Servis ••• › Sorgu •••');
  // Maddelerde yalnız ad / ayrıntı / adres / tür alanları var (değer taşıyan alan yok).
  for (const kart of Object.values(v.kartlar)) for (const m of kart.maddeler) expect(Object.keys(m).sort()).toEqual(['ad', 'adres', 'ayrinti', 'tur']);
});

test('boş proje: kartlar "sorun yok" (madde yok), özet kutuları boş, hesaplanamayan yok; önbellek aynı yanıtı döndürür', async () => {
  const bosProje = projeKaydet(vt, { ad: 'Boş proje' });
  const v = await farkindalikVerisi(vt, bosProje, { aralik: ARALIK, simdi: SIMDI, sonYedek: YAKIN_YEDEK, onbellek: false });
  expect(v.kartlar).toEqual({ dikkat: { toplam: 0, maddeler: [] }, bakim: { toplam: 0, maddeler: [] }, kapsam: { toplam: 0, maddeler: [] } });
  expect(v.ozet).toEqual({ ekran: null, servis: null, uctanUca: null });
  expect(v.hesaplanamayan).toEqual([]);
  farkindalikOnbelleginiTemizle();
  const a = await farkindalikVerisi(vt, bosProje, { aralik: ARALIK, simdi: SIMDI, sonYedek: YAKIN_YEDEK });
  const b = await farkindalikVerisi(vt, bosProje, { aralik: ARALIK, simdi: new Date(SIMDI.getTime() + 1000), sonYedek: YAKIN_YEDEK });
  expect(b).toBe(a);
  await expect(farkindalikVerisi(vt, 'yok-boyle', { aralik: ARALIK, simdi: SIMDI })).rejects.toThrow(/Proje bulunamadı/);
});
