// KORUMA TESTLERİ — senaryo önerilerinin risk verisi (oneri-baglami.mjs → oneriGecmisi SQL sorgusu) GERÇEKÇİ kayıtlarla: geçici
// veritabanına koşu kayıt kodunun (sonuc-deposu.mjs: kosuKaydet / sonucKaydet / kosuyuBitir) yazdığı biçimde sentetik koşular,
// sonuçlar, adım adları (model koşucusunun test.step adları: "Ekran açılır", adım başlıkları) ve yakalanan uyarılar yazılır.
// Doğrulanan: başarısız senaryo + hatanın alındığı adım sayılır; görülen uyarı kalıba göre gruplanır; süre sınırı (14 / 90 gün)
// dışındaki, başka ortamdaki, başka ekrandaki ve iş kuralı uyarısı sayılmayan kaynaktaki kayıtlar sayılmaz; çıktı öneri
// fonksiyonunda başarısız değerleri "risk" olarak öne alır ve uyarı için "uyari" türü öneri üretir. Tarayıcı ve ağ yok; değerler SAHTEDİR.
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { gorunurlukleriHesapla, senaryoyuDogrula, type DogrulamaModeli } from '../../scripts/dogrulama/senaryo-dogrulayici.mjs';
import { formSemasiOlustur } from '../../scripts/platform/senaryolar/model-formu.mjs';
import { HATA_GUNU, UYARI_GUNU, oneriGecmisi } from '../../scripts/platform/senaryolar/oneri-baglami.mjs';
import { senaryoOnerileri, type OneriGecmisi, type OneriSenaryosu } from '../../scripts/platform/senaryolar/senaryo-onerileri.mjs';
import type { Veritabani } from '../../scripts/platform/veritabani/baglanti.mjs';
import { veritabaniniHazirla } from '../../scripts/platform/veritabani/depo.mjs';
import { kosuKaydet, kosuyuBitir, sonucKaydet, type SonucGirdisi } from '../../scripts/platform/veritabani/sonuc-deposu.mjs';
import { siparisModeli, tabanVerisi } from './senaryo-onerileri-fikstur';

const SIMDI = new Date('2026-09-28T10:00:00.000Z');
const GUN = 86_400_000;
const once = (gun: number, saat = 0) => new Date(SIMDI.getTime() - gun * GUN - saat * 3_600_000).toISOString();
const STOK = 'Stokta yeterli ürün yok.';

test.describe('öneri geçmişi (risk sorgusu) gerçekçi koşu kayıtlarıyla', () => {
  test.describe.configure({ mode: 'serial' });
  let klasor = '';
  let vt: Veritabani;
  const projeId = randomUUID();
  const ekranId = randomUUID();
  const digerEkran = randomUUID();
  const ortamId = randomUUID();
  const digerOrtam = randomUUID();
  const s = { kitap: randomUUID(), elektronik: randomUUID(), giyim: randomUUID(), digerEkranda: randomUUID() };
  const veriler: Record<keyof typeof s, Record<string, unknown>> = {
    kitap: tabanVerisi('03.10.2026'),
    elektronik: { ...tabanVerisi('03.10.2026'), baslik: 'Elektronik beyaz', kategori: 'elektronik', renk: 'beyaz' },
    giyim: { ...tabanVerisi('03.10.2026'), baslik: 'Giyim mavi', kategori: 'giyim', renk: 'mavi', beden: 'M' },
    digerEkranda: { baslik: 'Başka ekran' }
  };
  const basliklar: Record<keyof typeof s, string> = { kitap: 'Kitap siparişi', elektronik: 'Elektronik beyaz', giyim: 'Giyim mavi', digerEkranda: 'Başka ekran' };

  /** Model koşucusunun adım adları: "Ekran açılır" + adım başlıkları; ilk başarısız adımdan sonrası koşmaz (kayıtta yok). */
  const adimlar = (hataAdimi: string | null): SonucGirdisi['adimlar'] => {
    const liste: NonNullable<SonucGirdisi['adimlar']> = [{ ad: 'Ekran açılır', durum: 'basarili', sureMs: 900 }];
    for (const ad of ['Ürün seçimi', 'Teslimat bilgileri']) {
      if (ad === hataAdimi) { liste.push({ ad, durum: 'basarisiz', sureMs: 5_000, hataMesaji: `İş kuralı uyarısı: ${STOK}` }); break; }
      liste.push({ ad, durum: 'basarili', sureMs: 1_200 });
    }
    return liste;
  };
  /** Bir koşu: başlangıç, sonuçlar (senaryo, durum, hata adımı, yakalanan mesajlar) ve bitiş; raporlayıcının yazdığı biçimde. */
  const kosu = (ortam: string | null, baslangic: string, sonuclar: Array<{ senaryo: keyof typeof s; durum: 'basarili' | 'basarisiz' | 'durduruldu'; hataAdimi?: string | null;
    mesajlar?: NonNullable<SonucGirdisi['yakalananMesajlar']> }>) => {
    const kosuId = randomUUID();
    kosuKaydet(vt, { id: kosuId, projeId, ortamId: ortam, tur: 'tam', kapsam: 'Genel', baslangic, kaynak: 'raporlayici' });
    let t = new Date(baslangic).getTime();
    for (const r of sonuclar) {
      const bas = new Date(t).toISOString();
      t += 30_000;
      sonucKaydet(vt, {
        kosuId, projeId, testKimligi: randomUUID(), senaryoAnahtari: `model-senaryolari.spec.ts::${basliklar[r.senaryo]}`, senaryoId: s[r.senaryo],
        senaryoBaslik: basliklar[r.senaryo], urunAdi: r.senaryo === 'digerEkranda' ? 'Başka ekran' : 'Sipariş formu', durum: r.durum, hamDurum: r.durum === 'basarili' ? 'passed' : 'failed',
        sureMs: 30_000, hataMesaji: r.durum === 'basarisiz' ? `İş kuralı uyarısı: ${STOK}` : null, deneme: 0, baslangic: bas, bitis: new Date(t).toISOString(),
        adimlar: adimlar(r.durum === 'basarisiz' ? r.hataAdimi ?? null : null), yakalananMesajlar: r.mesajlar ?? []
      });
    }
    kosuyuBitir(vt, kosuId, { durum: 'tamamlandi', bitis: new Date(t).toISOString() });
  };
  const mesaj = (kaynak: string, metin: string, adim: string, zaman: string, beklenen = false) => ({ kaynak, metin, adim, sayi: 1, ilk: zaman, son: zaman, beklenen });

  test.beforeAll(async () => {
    klasor = mkdtempSync(join(tmpdir(), 'oneri-gecmisi-'));
    vt = await veritabaniniHazirla(join(klasor, 'platform.db'));
    const z = once(200);
    vt.calistir('INSERT INTO projeler (id, ad, ayarlar_json, olusturulma, guncellenme) VALUES (?, ?, ?, ?, ?)', [projeId, 'Öneri Projesi', '{}', z, z]);
    for (const [id, ad] of [[ortamId, 'Deneme'], [digerOrtam, 'Diğer']]) {
      vt.calistir('INSERT INTO ortamlar (id, proje_id, ad, taban_url, olusturulma, guncellenme) VALUES (?, ?, ?, ?, ?, ?)', [id, projeId, ad, 'http://127.0.0.1:9', z, z]);
    }
    for (const [id, ad] of [[ekranId, 'Sipariş formu'], [digerEkran, 'Başka ekran']]) {
      vt.calistir('INSERT INTO ekranlar (id, proje_id, anahtar, ad, olusturulma, guncellenme) VALUES (?, ?, ?, ?, ?, ?)', [id, projeId, ad, ad, z, z]);
    }
    for (const k of Object.keys(s) as Array<keyof typeof s>) {
      vt.calistir('INSERT INTO senaryolar (id, proje_id, ekran_id, baslik, icerik_json, olusturulma, guncellenme) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [s[k], projeId, k === 'digerEkranda' ? digerEkran : ekranId, basliklar[k], JSON.stringify({ veri: veriler[k] }), z, z]);
    }

    // SAYILANLAR — bu ortam, son 14 gün: elektronik iki kez "Ürün seçimi"nde kaldı (biri ortamı bilinmeyen koşuda); kitap geçti.
    // Stok uyarısı iki sonuçta (hata göstergesi + diyalog) görüldü; 30 gün önceki teslimat uyarısı 90 gün sınırı içinde.
    kosu(ortamId, once(2), [
      { senaryo: 'kitap', durum: 'basarili' },
      { senaryo: 'elektronik', durum: 'basarisiz', hataAdimi: 'Ürün seçimi', mesajlar: [mesaj('hata-gostergesi', STOK, 'Ürün seçimi', once(2)), mesaj('konsol', 'TypeError: x is undefined', 'Ürün seçimi', once(2))] }
    ]);
    kosu(null, once(5), [
      { senaryo: 'elektronik', durum: 'basarisiz', hataAdimi: 'Ürün seçimi', mesajlar: [mesaj('diyalog', STOK, 'Ürün seçimi', once(5))] }
    ]);
    kosu(ortamId, once(30), [
      { senaryo: 'kitap', durum: 'basarili', mesajlar: [mesaj('hata-gostergesi', 'Teslimat tarihi en az yarın olmalıdır.', 'Teslimat bilgileri', once(30))] }
    ]);
    // SAYILMAYANLAR — süre sınırı dışında: giyim 20 gün önce kaldı (14 gün dışı), 100 gün önceki uyarı (90 gün dışı); sınırın hemen
    // dışı: 14 gün + 1 saat önce biten başarısız sonuç. Başka ortam, başka ekran, durdurulan sonuç ve iş kuralı sayılmayan kaynak.
    kosu(ortamId, once(20), [{ senaryo: 'giyim', durum: 'basarisiz', hataAdimi: 'Teslimat bilgileri' }]);
    kosu(ortamId, once(HATA_GUNU, 1), [{ senaryo: 'giyim', durum: 'basarisiz', hataAdimi: 'Ürün seçimi' }]);
    kosu(ortamId, once(100), [{ senaryo: 'giyim', durum: 'basarili', mesajlar: [mesaj('hata-gostergesi', 'Kampanya süresi doldu.', 'Ürün seçimi', once(100))] }]);
    kosu(digerOrtam, once(1), [{ senaryo: 'giyim', durum: 'basarisiz', hataAdimi: 'Ürün seçimi', mesajlar: [mesaj('diyalog', 'Diğer ortam uyarısı.', 'Ürün seçimi', once(1))] }]);
    kosu(ortamId, once(1), [{ senaryo: 'digerEkranda', durum: 'basarisiz', hataAdimi: 'Ürün seçimi', mesajlar: [mesaj('diyalog', 'Başka ekran uyarısı.', 'Ürün seçimi', once(1))] }]);
    kosu(ortamId, once(3), [{ senaryo: 'giyim', durum: 'durduruldu', mesajlar: [mesaj('ag', 'GET /api → HTTP 500', 'Ürün seçimi', once(3))] }]);
  });

  test.afterAll(() => {
    vt?.kapat();
    if (klasor) rmSync(klasor, { recursive: true, force: true });
  });

  test('sorgu: başarısız senaryo + adım ve görülen uyarılar sayılır; süre sınırı, ortam, ekran ve kaynak dışındakiler sayılmaz', () => {
    const g = oneriGecmisi(vt, projeId, ekranId, ortamId, SIMDI);
    expect(g).toMatchObject({ hataGunu: HATA_GUNU, uyariGunu: UYARI_GUNU });
    expect(g.hatalar).toEqual([{ senaryoId: s.elektronik, adim: 'Ürün seçimi', sayi: 2 }]);
    expect(g.uyarilar).toEqual([
      { metin: STOK, adim: 'Ürün seçimi', sayi: 2, beklenen: false, senaryoIdleri: [s.elektronik] },
      { metin: 'Teslimat tarihi en az yarın olmalıdır.', adim: 'Teslimat bilgileri', sayi: 1, beklenen: false, senaryoIdleri: [s.kitap] }
    ]);
    // Pencere kayınca: 30 gün sonra hiçbir başarısız sonuç kalmaz (uyarılar 90 gün içinde); 2 saat önceki pencerede 14 gün + 1 saat
    // önce kalan sonuç içeride kalır.
    const ileride = oneriGecmisi(vt, projeId, ekranId, ortamId, new Date(SIMDI.getTime() + 30 * GUN));
    expect(ileride.hatalar).toEqual([]);
    expect(ileride.uyarilar.map((u) => u.metin)).toEqual([STOK, 'Teslimat tarihi en az yarın olmalıdır.']);
    const ikiSaatOnce = oneriGecmisi(vt, projeId, ekranId, ortamId, new Date(SIMDI.getTime() - 2 * 3_600_000));
    expect(ikiSaatOnce.hatalar).toContainEqual({ senaryoId: s.giyim, adim: 'Ürün seçimi', sayi: 1 });
    expect(ikiSaatOnce.hatalar).not.toContainEqual(expect.objectContaining({ adim: 'Teslimat bilgileri' }));
    const yuzGunOnce = oneriGecmisi(vt, projeId, ekranId, ortamId, new Date(SIMDI.getTime() - 20 * GUN));
    expect(yuzGunOnce.uyarilar.map((u) => u.metin)).toContain('Kampanya süresi doldu.');
    expect(oneriGecmisi(vt, projeId, ekranId, ortamId, new Date(SIMDI.getTime() + 100 * GUN)).uyarilar).toEqual([]);
  });

  test('öneriler: başarısız değer riski öne alır, görülen uyarı "uyari" türü öneri üretir; pencere dışı geçmiş risk üretmez', () => {
    const model = siparisModeli();
    const girdi = (gecmis: OneriGecmisi) => {
      const baglam = { model: model as DogrulamaModeli, altModeller: {}, kaynak: 'kayit' as const, simdi: SIMDI };
      const senaryolar: OneriSenaryosu[] = [
        { id: s.kitap, baslik: basliklar.kitap, veri: veriler.kitap, sonDurum: 'basarili' },
        { id: s.elektronik, baslik: basliklar.elektronik, veri: veriler.elektronik, sonDurum: 'basarisiz' }
      ];
      return senaryoOnerileri({
        model, sema: formSemasiOlustur(model, {}), senaryolar, simdi: SIMDI, ustSinir: 1000, kombinasyonAlanlari: ['kategori', 'beden', 'renk', 'hediyePaketi'],
        gorunurlukHesapla: (veri) => gorunurlukleriHesapla(veri, baglam), dogrula: (veri) => senaryoyuDogrula(veri, baglam), gecmis
      });
    };
    const r = girdi(oneriGecmisi(vt, projeId, ekranId, ortamId, SIMDI));
    expect(r.oneriler[0].neden).toBe('risk');
    const riskli = r.oneriler.filter((o) => o.tur === 'kombinasyon' && o.neden === 'risk');
    expect(riskli.length).toBeGreaterThan(0);
    expect(riskli[0].gerekce).toMatch(/“Kategori: Elektronik” son 14 günde 2 başarısız koşuda yer aldı/);
    const pairwise = r.oneriler.filter((o) => o.neden === 'pairwise');
    if (pairwise.length) expect(Math.min(...riskli.map((o) => o.puan))).toBeGreaterThan(Math.max(...pairwise.map((o) => o.puan)));
    expect(r.oneriler.find((o) => o.kimlik === 'zorunlu:adet')?.gerekce).toContain('“Ürün seçimi” adımı son 14 günde 2 kez hata verdi');
    const uyari = r.oneriler.find((o) => o.tur === 'uyari' && o.baslik.includes('Stokta'));
    expect(uyari).toMatchObject({
      neden: 'risk', gerekce: `“${STOK}” uyarısını beklenen sonuç olarak taşıyan senaryo yok (son 90 günde 2 kez görüldü)`,
      beklenen: { tur: 'hata', adim: 'urun', mesaj: STOK }
    });
    expect(uyari?.veri).toMatchObject({ kategori: 'elektronik', renk: 'beyaz' });
    expect(r.oneriler.filter((o) => o.tur === 'uyari').map((o) => o.baslik)).toHaveLength(2);
    // Pencere dışı: 30 gün sonra başarısız sonuç kalmaz → kombinasyon riski ve adım eki yok; uyarılar hâlâ (90 gün içinde).
    const sonra = girdi(oneriGecmisi(vt, projeId, ekranId, ortamId, new Date(SIMDI.getTime() + 30 * GUN)));
    expect(sonra.oneriler.some((o) => o.tur === 'kombinasyon' && o.neden === 'risk')).toBe(false);
    expect(sonra.oneriler.find((o) => o.kimlik === 'zorunlu:adet')?.gerekce ?? '').not.toContain('hata verdi');
    // 100 gün sonra uyarılar da düşer: "uyari" önerisi yok.
    const cokSonra = girdi(oneriGecmisi(vt, projeId, ekranId, ortamId, new Date(SIMDI.getTime() + 100 * GUN)));
    expect(cokSonra.oneriler.some((o) => o.tur === 'uyari')).toBe(false);
  });

  test('koşuda "beklenen" işaretli uyarı beklenen olarak döner ve aynı kalıpta gruplanır', () => {
    kosu(ortamId, once(0, 2), [{ senaryo: 'kitap', durum: 'basarili', mesajlar: [mesaj('hata-gostergesi', STOK, 'Ürün seçimi', once(0, 2), true)] }]);
    expect(oneriGecmisi(vt, projeId, ekranId, ortamId, SIMDI).uyarilar[0]).toEqual({ metin: STOK, adim: 'Ürün seçimi', sayi: 3, beklenen: true, senaryoIdleri: [s.elektronik, s.kitap] });
  });
});
