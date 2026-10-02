// Hızlı test kayıt planı (saf kurallar): tablo grupları, seçim alanlarının TÜM seçenekleri, senaryo önerileri, önizleme (birleştirme).
import { randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { kasaOlustur } from '../../scripts/platform/kasa.mjs';
import { projeKaydet, veritabaniniHazirla } from '../../scripts/platform/veritabani/depo.mjs';
import { pinAnahtari, pinSecimi, planKur, planOnizle, planYaz, senaryoOnerileri, varsayilanSecim } from '../../scripts/platform/hizli-test/kayit-plani.mjs';
import { tabloKaydet, tablolariListele } from '../../scripts/platform/tablolar/tablo-deposu.mjs';
import { SATIR_KIMLIGI, basvuruCoz, basvuruyuCoz } from '../../scripts/platform/tablolar/tablo-secimi.mjs';
import { tabloSecimleriniAyikla } from '../../scripts/platform/tablolar/ekran-basvurulari.mjs';
import { HIZLI_KDF } from './platform-ortak';

const alanlar = [
  { anahtar: 'ad', tur: 'text', etiket: 'Ad soyad' },
  { anahtar: 'tel', tur: 'tel', etiket: 'Telefon' },
  { anahtar: 'ulke', tur: 'select', etiket: 'GİDİLECEK ÜLKE', secenekler: [{ deger: 'TR', metin: 'Türkiye' }, { deger: 'DE', metin: 'Almanya' }, { deger: 'FR', metin: 'Fransa' }] },
  { anahtar: 'kanal', tur: 'radio', etiket: 'Kanal', radyolar: [{ deger: 'w', metin: 'Web' }, { deger: 'm', metin: 'Mobil' }] }
];
const degerler = { ad: { deger: 'Ali Veli' }, tel: { deger: '5321234567' }, ulke: { deger: 'DE' } };

test('plan: kişi alanları tek tabloda, seçim alanı kendi tablosunda TÜM seçenekleriyle; değer yazılmayan seçim alanı da liste tablosu olur', () => {
  const p = planKur({ baslik: 'Kayıt', alanlar, degerler });
  expect(p.tablolar.map((t) => t.ad).sort()).toEqual(['GİDİLECEK ÜLKE', 'Kanal', 'Kişi bilgileri']);
  const ulke = p.tablolar.find((t) => t.ad === 'GİDİLECEK ÜLKE');
  expect(ulke?.tur).toBe('liste');
  expect(ulke?.satirlar).toHaveLength(3);
  expect(ulke?.secilen).toEqual({ 'GİDİLECEK ÜLKE': 'Almanya' });
  expect(p.tablolar.find((t) => t.ad === 'Kanal')?.secilen).toBeNull();
  const kisi = p.tablolar.find((t) => t.ad === 'Kişi bilgileri');
  expect(kisi?.tur).toBe('kayit');
  expect(kisi?.sutunlar.map((s) => s.ad)).toEqual(expect.arrayContaining(['Ad soyad', 'Telefon']));
});

test('senaryo önerileri: ilki yapılan senaryo (seçili); seçilen liste alanının diğer seçenekleri seçilmemiş alternatif', () => {
  const p = planKur({ baslik: 'Kayıt', alanlar, degerler });
  const o = senaryoOnerileri(p, 'Kayıt');
  expect(o[0]).toMatchObject({ indeks: 0, baslik: 'Kayıt', varsayilanSecili: true, alt: null });
  expect(o.slice(1).map((x) => x.alt?.degisiklikler.map((d) => d.deger).join()).sort()).toEqual(['Fransa', 'Türkiye']);
  expect(o.slice(1).every((x) => !x.varsayilanSecili)).toBe(true);
});

// Güncelleme gerekçesi: zincir artık TEK tabloda (sütun = halka, satır = gözlenen geçerli kombinasyon); planKur ilişkileri ve gözlemleri alır.
// Öneriler: koşullu dal (Kurumsal → değeri olmayan Vergi no açılır: "veri gerekli", kaydedilmez) + zincir satırları × Yapı ikili kapsamı.
test('senaryo önerileri: zincir yalnız zincir tablosunun SATIRLARIYLA bütün olarak değişir; koşullu dal veri gerekli; Yapı × zincir ikili kapsamı; her aday en az bir kez', () => {
  const s = (deger: string, metin = deger) => ({ deger, metin });
  const alanlar2: Array<Record<string, any>> = [
    { anahtar: 'il', tur: 'select', etiket: 'İl', secenekler: [s('', 'Seçiniz'), s('01', 'Adana'), s('06', 'Ankara'), s('34', 'İstanbul')] },
    { anahtar: 'ilce', tur: 'select', etiket: 'İlçe', secenekler: [s('0601', 'Çankaya'), s('0602', 'Keçiören')] },
    { anahtar: 'mah', tur: 'select', etiket: 'Mahalle', secenekler: [s('Etlik')] },
    { anahtar: 'tip', tur: 'radio', etiket: 'Müşteri tipi', hazir: true, mevcut: 'Bireysel', radyolar: [s('B', 'Bireysel'), s('K', 'Kurumsal')] },
    { anahtar: 'vergi', tur: 'text', etiket: 'Vergi no', kosul: { secim: 'tip', degerler: ['K'] } },
    { anahtar: 'yapi', tur: 'select', etiket: 'Yapı', hazir: true, mevcut: 'Kagir', secenekler: [s('k', 'Kagir'), s('b', 'Betonarme'), s('c', 'Çelik')] }
  ];
  const gozlemler: Array<{ anahtar: string; secimler: Record<string, string>; secenekler: Array<{ deger: string; metin: string }> }> = [
    { anahtar: 'ilce', secimler: { il: '01' }, secenekler: [s('0101', 'Seyhan'), s('0102', 'Çukurova')] },
    { anahtar: 'mah', secimler: { il: '01', ilce: '0101' }, secenekler: [s('Reşatbey')] },
    { anahtar: 'ilce', secimler: { il: '34' }, secenekler: [s('3401', 'Kadıköy')] },
    { anahtar: 'mah', secimler: { il: '34', ilce: '3401' }, secenekler: [s('Moda')] },
    { anahtar: 'mah', secimler: { il: '06', ilce: '0602' }, secenekler: [s('Etlik')] }
  ];
  // Tablolarda zincirin gözlenen seçenekleri de bulunur (hızlı test planı kurarken ekler).
  const ekli = alanlar2.map((a) => a.anahtar === 'ilce' ? { ...a, secenekler: [...a.secenekler, s('0101', 'Seyhan'), s('0102', 'Çukurova'), s('3401', 'Kadıköy')] }
    : a.anahtar === 'mah' ? { ...a, secenekler: [...a.secenekler, s('Reşatbey'), s('Moda')] } : a);
  const iliskiler = [{ ust: 'il', alt: 'ilce' }, { ust: 'ilce', alt: 'mah' }];
  const p = planKur({ baslik: 'Adres', alanlar: ekli, degerler: { il: { deger: '06' }, ilce: { deger: '0602' }, mah: { deger: 'Etlik' } }, iliskiler, gozlemler });
  // Zincir tek tablo: kullanıcının yolu + gözlenen tam yollar (Çukurova'nın mahallesi gözlenmedi: satır yok).
  const zincir = p.tablolar.find((t) => t.zincir);
  expect(zincir?.ad).toBe('İl - İlçe - Mahalle');
  expect(zincir?.sutunlar.map((s) => s.ad)).toEqual(['İl', 'İlçe', 'Mahalle']);
  expect(zincir?.satirlar).toEqual([
    { 'İl': 'Ankara', 'İlçe': 'Keçiören', Mahalle: 'Etlik' }, { 'İl': 'Adana', 'İlçe': 'Seyhan', Mahalle: 'Reşatbey' }, { 'İl': 'İstanbul', 'İlçe': 'Kadıköy', Mahalle: 'Moda' }
  ]);
  expect(zincir?.secilen).toEqual({ 'İl': 'Ankara', 'İlçe': 'Keçiören', Mahalle: 'Etlik' });
  expect(zincir?.sutunlar[0].karsiliklar).toMatchObject({ Ankara: { sayfa: '06' }, Adana: { sayfa: '01' } });
  expect(p.tablolar.map((t) => t.ad)).not.toContain('İlçe'); // halkalar ayrı tablo değil
  const o = senaryoOnerileri(p, 'Adres', { enCok: 5, alanlar: ekli, iliskiler, gozlemler, degerler: { il: '06', ilce: '0602', mah: 'Etlik' } });
  const degisim = (x: (typeof o)[number]) => Object.fromEntries((x.alt?.degisiklikler ?? []).map((d) => [d.oturumAnahtar, d.deger]));
  // 1) Koşullu dal: Kurumsal → değeri girilmemiş Vergi no açılır: öneri "veri gerekli" (değer üretilmez).
  expect(o[1]).toMatchObject({ veriGerekli: ['Vergi no'], varsayilanSecili: false });
  expect(degisim(o[1])).toEqual({ tip: 'Kurumsal' });
  expect(o[1].gerekce).toContain('“Müşteri tipi” = “Kurumsal” dalı (Vergi no alanları)');
  // 2) Zincir × Yapı ikili kapsamı: her alternatif erken (Adana ve İstanbul yolları, Betonarme ve Çelik ilk iki öneride).
  expect(o.slice(2).map(degisim)).toEqual([
    { il: 'Adana', ilce: 'Seyhan', mah: 'Reşatbey', yapi: 'Betonarme' },
    { il: 'İstanbul', ilce: 'Kadıköy', mah: 'Moda', yapi: 'Çelik' },
    { il: 'Adana', ilce: 'Seyhan', mah: 'Reşatbey', yapi: 'Çelik' },
    { il: 'İstanbul', ilce: 'Kadıköy', mah: 'Moda', yapi: 'Betonarme' }
  ]);
  expect(o).toHaveLength(6); // enCok = 5 alternatif
  // Hiçbir öneride geçersiz zincir yok: zincir değişikliği tablonun bir satırının tamamı.
  for (const x of o.slice(1)) {
    const d = degisim(x);
    if (d.il || d.ilce || d.mah) expect(zincir?.satirlar).toContainEqual({ 'İl': d.il, 'İlçe': d.ilce, Mahalle: d.mah });
  }
  expect(o[2].baslik).toBe('Adres — İl: Adana / Seyhan / Reşatbey · Yapı: Betonarme');
  expect(o[2].gerekce).toBe('Farklı İl zinciri: Adana › Seyhan › Reşatbey; “Yapı” = “Betonarme” — İl zinciri × Yapı ikili kapsamı; diğer değerler aynı');
});

test('birleştirme: yalnız gizli sütunlu değer (Vergi no) mevcut "Kişi bilgileri"ne YENİ satır olarak eklenir, şifreli yazılır; senaryo o satıra satır kimliğiyle sabitlenir', async () => {
  const k = mkdtempSync(join(tmpdir(), 'hizli-kayit-plani-'));
  try {
    const vt = await veritabaniniHazirla(join(k, 'p.db'));
    await kasaOlustur(vt, `Gecici-Plan-${randomBytes(6).toString('hex')}`, { kdf: HIZLI_KDF });
    const p = String(projeKaydet(vt, { ad: 'Plan' }));
    // Başka bir ekranın daha önce yazdığı aynı adlı tablo: ilk satırda Vergi no boş.
    tabloKaydet(vt, { projeId: p, ad: 'Kişi bilgileri', tur: 'kayit', sutunlar: [{ ad: 'Ad soyad' }, { ad: 'Vergi no', gizli: true }], satirlar: [{ ad: 'Başka ekran', degerler: { 'Ad soyad': 'Başka Kişi' } }] });
    const plan = planKur({ baslik: 'Etkinlik', alanlar: [{ anahtar: 'vergi', tur: 'text', etiket: 'Vergi no' }], degerler: { vergi: { deger: '1234567890' } } });
    const kisi = plan.tablolar.find((t) => t.ad === 'Kişi bilgileri');
    expect(kisi?.sutunlar).toEqual([expect.objectContaining({ ad: 'Vergi no', gizli: true })]);
    expect(kisi?.secilen).toBeNull();
    const onizleme = planOnizle(vt, p, plan, null, { vergi: 'vergiNo' });
    expect(onizleme.tablolar[0].mevcut?.eklenecekSatir).toBe(1);
    const secim = varsayilanSecim(onizleme);
    expect(secim.tablolar['Kişi bilgileri']).toEqual({ islem: 'birlestir' });
    const [y] = planYaz(vt, p, plan, secim, { ekranAdi: 'Etkinlik' });
    expect(y).toMatchObject({ islem: 'birlestir', eklenenSatir: 1, tur: 'kayit' });
    expect(y.satirId).toBeTruthy();
    const pin = pinSecimi(y);
    expect(pin).toEqual({ [SATIR_KIMLIGI]: y.satirId });
    // Gizli değer diskte şifreli (açık metin yok); çözülünce yeni satırda.
    const ham = vt.tumu('SELECT degerler_json FROM test_verisi_profilleri WHERE id = ?', [String(y.satirId)]).map((r) => String(r.degerler_json)).join();
    expect(ham).not.toContain('1234567890');
    const cozulmus = tablolariListele(vt, p, { cozulsun: true });
    const b = basvuruCoz('Kişi bilgileri.Vergi no');
    if (!b) throw new Error('başvuru çözülemedi');
    const sabit = basvuruyuCoz(cozulmus, b, { [pinAnahtari(y.id)]: pin ?? {} });
    expect('deger' in sabit ? sabit.deger : sabit.hata).toBe('1234567890');
    // Sabitleme olmadan (eski davranış) ilk satır alınırdı: "Vergi no boş".
    const sabitsiz = basvuruyuCoz(cozulmus, b, {});
    expect('hata' in sabitsiz ? sabitsiz.hata : '').toContain('boş');
    // Senaryo kaydındaki doğrulama satır kimliğini kabul eder; olmayan satır reddedilir.
    const liste = tablolariListele(vt, p);
    expect(tabloSecimleriniAyikla({ [pinAnahtari(y.id)]: pin }, liste)).toEqual({ secimler: { [pinAnahtari(y.id)]: pin }, hatalar: [] });
    expect(tabloSecimleriniAyikla({ [pinAnahtari(y.id)]: { [SATIR_KIMLIGI]: 'yok-boyle-satir' } }, liste).hatalar[0]).toContain('satır yok');
    // Açık değeri birebir aynı satır zaten varsa satır eklenmez; senaryo o mevcut satıra sabitlenir.
    const plan2 = planKur({ baslik: 'Başka', alanlar: [{ anahtar: 'ad', tur: 'text', etiket: 'Ad soyad' }], degerler: { ad: { deger: 'Başka Kişi' } } });
    const [y2] = planYaz(vt, p, plan2, varsayilanSecim(planOnizle(vt, p, plan2, null, {})), { ekranAdi: 'Başka' });
    expect(y2.eklenenSatir).toBe(0);
    expect(y2.satirId).toBe(liste.find((t) => t.ad === 'Kişi bilgileri')?.satirlar.find((r) => r.ad === 'Başka ekran')?.id);
    vt.kapat();
  } finally { rmSync(k, { recursive: true, force: true }); }
});
