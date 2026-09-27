// KORUMA TESTLERİ — yan yana koşu karşılaştırması: saf hesap (değişim sınıfları, yalnız bir tarafta olan senaryo, adım hizalama,
// kontrol / yakalanan mesaj farkı), veri uçları (geçici veritabanında iki sahte ekran koşusu ve iki sahte servis koşusu; gerçek
// koşu yok) ve HTML karşılaştırma raporu (kaçışlama, maskeleme, görüntüler varsayılan kapalı).
import { randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { kasaOlustur } from '../../scripts/platform/kasa.mjs';
import { veritabaniniHazirla } from '../../scripts/platform/veritabani/depo.mjs';
import {
  adimlariKarsilastir, degisimSinifi, degistiMi, kontrolleriKarsilastir, ozetFarki, senaryolariKarsilastir, yakalananlariKarsilastir
} from '../../scripts/platform/sonuclar/karsilastirma-hesabi.mjs';
import {
  karsilastirmaAdaylari, karsilastirmaRaporuOlustur, karsilastirmaSenaryosu, karsilastirmaVerisi
} from '../../scripts/platform/sonuclar/karsilastirma.mjs';
import { karsilastirmaRaporuUret, type KarsilastirmaRaporVerisi } from '../../scripts/platform/sonuclar/html-rapor.mjs';
import { GIZLI_PAROLA, PNG_1X1, karsilastirmaVerisiKur } from './karsilastirma-fikstur';
import { HIZLI_KDF } from './platform-ortak';

test.describe('Karşılaştırma hesabı (saf)', () => {
  test('değişim sınıfları: yeni kalan, düzelen, hep kalan, hep geçen, yalnız A / B, durum değişti, aynı', () => {
    expect(degisimSinifi('basarili', 'basarisiz')).toBe('yeni-kalan');
    expect(degisimSinifi('atlanan', 'hata')).toBe('yeni-kalan');
    expect(degisimSinifi('basarisiz', 'basarili')).toBe('duzelen');
    expect(degisimSinifi('hata', 'basarisiz')).toBe('hep-kalan');
    expect(degisimSinifi('basarili', 'basarili')).toBe('hep-gecen');
    expect(degisimSinifi('basarili', null)).toBe('yalniz-a');
    expect(degisimSinifi(null, 'basarisiz')).toBe('yalniz-b');
    expect(degisimSinifi('basarili', 'atlanan')).toBe('degisti');
    expect(degisimSinifi('basarisiz', 'durduruldu')).toBe('degisti');
    expect(degisimSinifi('atlanan', 'atlanan')).toBe('ayni');
    expect(degisimSinifi(null, null)).toBeNull();
    expect(['yeni-kalan', 'duzelen', 'yalniz-a', 'yalniz-b', 'degisti'].every(degistiMi)).toBe(true);
    expect(['hep-kalan', 'hep-gecen', 'ayni'].some(degistiMi)).toBe(false);
  });

  test('senaryo eşleme: yalnız bir tarafta olanlar, yinelenen anahtar, sıralama, sayım ve süre farkı', () => {
    const s = (anahtar: string, durum: string, sureMs: number | null = 100) => ({ anahtar, baslik: anahtar.toUpperCase(), grup: 'G', durum, sureMs });
    const a = [s('k1', 'basarili', 1000), s('k2', 'basarisiz'), s('k3', 'basarili'), s('eski', 'basarili'), s('cift', 'basarili'), s('cift', 'basarili')];
    const b = [s('k1', 'basarisiz', 1500), s('k2', 'basarili'), s('k3', 'basarili', null), s('yeni', 'basarisiz'), s('cift', 'basarili')];
    const r = senaryolariKarsilastir(a, b);
    const bul = (k: string) => r.senaryolar.find((x) => x.anahtar === k);
    expect(bul('k1')?.degisim).toBe('yeni-kalan');
    expect(bul('k1')?.sureFarkiMs).toBe(500);
    expect(bul('k2')?.degisim).toBe('duzelen');
    expect(bul('k3')?.degisim).toBe('hep-gecen');
    expect(bul('k3')?.sureFarkiMs).toBeNull();
    expect(bul('eski')).toMatchObject({ degisim: 'yalniz-a', b: null, baslik: 'ESKI' });
    expect(bul('yeni')).toMatchObject({ degisim: 'yalniz-b', a: null });
    // Aynı anahtar A'da iki kez: ikincisi "#2" olur ve B'de karşılığı yoktur.
    expect(bul('cift')?.degisim).toBe('hep-gecen');
    expect(bul('cift#2')?.degisim).toBe('yalniz-a');
    // Sıra: önce yeni kalan, sonra yalnız B, …, en sonda hep geçen.
    expect(r.senaryolar[0].degisim).toBe('yeni-kalan');
    expect(r.senaryolar[1].degisim).toBe('yalniz-b');
    expect(r.senaryolar[r.senaryolar.length - 1].degisim).toBe('hep-gecen');
    expect(r.sayim).toMatchObject({ 'yeni-kalan': 1, duzelen: 1, 'hep-gecen': 2, 'yalniz-a': 2, 'yalniz-b': 1 });
    expect(r.degisen).toBe(5);
  });

  test('adımlar ada göre hizalanır (araya giren adım yalnız B), kontroller VEYA altıyla, yakalanan mesajlar kaynak + kalıpla', () => {
    const adim = (ad: string, durum = 'basarili') => ({ ad, durum, sureMs: 10 });
    const r = adimlariKarsilastir([adim('Aç'), adim('Doldur'), adim('Kaydet')], [adim('Aç'), adim('Çerez'), adim('doldur'), adim('Kaydet', 'basarisiz')]);
    expect(r.map((x) => [x.ad, x.degisim])).toEqual([['Aç', 'hep-gecen'], ['Çerez', 'yalniz-b'], ['doldur', 'hep-gecen'], ['Kaydet', 'yeni-kalan']]);

    const k = kontrolleriKarsilastir(
      [{ ad: 'Kod', gecti: true }, { tur: 'veya', gecti: true, alt: [{ ad: 'Alan', gecti: true }] }],
      [{ ad: 'Kod', gecti: false, aciklama: 'gelen 500' }, { tur: 'veya', gecti: false, alt: [{ ad: 'Alan', gecti: false }] }, { ad: 'Süre', gecti: true }]
    );
    expect(k.map((x) => [x.ad, x.degisim])).toEqual([
      ['Kod', 'yeni-kalan'], ['Şunlardan biri (VEYA)', 'yeni-kalan'], ['Şunlardan biri (VEYA) › Alan', 'yeni-kalan'], ['Süre', 'yalniz-b']
    ]);
    expect(k[0].b?.aciklama).toBe('gelen 500');

    const y = yakalananlariKarsilastir(
      [{ kaynak: 'konsol', kalip: 'x #', metin: 'x 1' }, { kaynak: 'ag', kalip: 'GET #', metin: 'GET 1', sayi: 2 }],
      [{ kaynak: 'ag', kalip: 'GET #', metin: 'GET 2' }, { kaynak: 'diyalog', kalip: 'Uyarı', metin: 'Uyarı', beklenen: true }]
    );
    expect(y.map((m) => [m.kaynak, m.durum])).toEqual([['diyalog', 'yalniz-b'], ['konsol', 'yalniz-a'], ['ag', 'ikisinde']]);
    expect(y[2]).toMatchObject({ sayiA: 2, sayiB: 1, metinA: 'GET 1', metinB: 'GET 2' });
  });

  test('özet farkı: B − A (oran puan, süre ms; biri yoksa null)', () => {
    const a = { sayilar: { basarili: 8, kalan: 2, atlanan: 1, durduruldu: 0 }, oran: 73, sureMs: 1000 };
    const b = { sayilar: { basarili: 9, kalan: 1, atlanan: 1, durduruldu: 1 }, oran: 82, sureMs: null };
    expect(ozetFarki(a, b)).toEqual({ basarili: 1, kalan: -1, atlanan: 0, durduruldu: 1, oran: 9, sureMs: null });
  });
});

test.describe('HTML karşılaştırma raporu (saf)', () => {
  const veri = (): KarsilastirmaRaporVerisi => ({
    tur: 'ekran', proje: 'Örnek <b>Proje</b>', ortamAdresi: 'https://test.ornek.invalid/app',
    a: { etiket: 'tam · Genel', baslangic: '2026-09-20T09:00:00.000Z', bitis: null, sureMs: 1000, ortam: 'TEST', kapsam: 'tam · Genel', sayilar: { basarili: 2, kalan: 1, atlanan: 0, durduruldu: 0 }, oran: 67 },
    b: { etiket: 'tam · Genel', baslangic: '2026-09-21T09:00:00.000Z', bitis: null, sureMs: 900, ortam: 'TEST', kapsam: 'tam · Genel', sayilar: { basarili: 1, kalan: 2, atlanan: 0, durduruldu: 0 }, oran: 33 },
    sayim: { 'yeni-kalan': 1, 'hep-gecen': 1 },
    senaryolar: [
      {
        baslik: '<script>alert(1)</script> Kayıt', grup: 'Başvuru', degisim: 'yeni-kalan', degisti: true, sureFarkiMs: 200,
        a: { durum: 'basarili', sureMs: 100 },
        b: { durum: 'basarisiz', sureMs: 300, hata: `Error: x\nExpected: "Tamam"\nReceived: "parola=${GIZLI_PAROLA} https://test.ornek.invalid/app/giris?t=1"`, kalinanAdim: 'Kaydet',
          goruntuler: [{ ad: 'g.png', icerikTuru: 'image/png', base64: PNG_1X1 }] }
      },
      { baslik: 'Liste', grup: 'Başvuru', degisim: 'hep-gecen', degisti: false, sureFarkiMs: 0, a: { durum: 'basarili', sureMs: 10 }, b: { durum: 'basarili', sureMs: 10 } }
    ],
    olusturma: '2026-09-27T09:00:00.000Z'
  });

  test('kaçışlanır, maskelenir, A | B | fark ve değişim ayrıntısı; görüntüler yalnız seçenek açıkken', () => {
    const html = karsilastirmaRaporuUret(veri(), { gizliDegerler: [GIZLI_PAROLA] });
    expect(html).not.toMatch(/<script/i);
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt; Kayıt');
    expect(html).not.toContain('<b>Proje</b>');
    for (const sizinti of [GIZLI_PAROLA, 'test.ornek.invalid', 't=1']) expect(html, sizinti).not.toContain(sizinti);
    expect(html).toContain('Nöbetçi karşılaştırma raporu');
    expect(html).toContain('yeni kalan');
    expect(html).toContain('<dt>Beklenen</dt><dd>&quot;Tamam&quot;</dd>');
    expect(html).toContain('↓ 34 puan'); // oran 67 → 33
    expect(html).not.toContain('<img');
    expect(html).not.toMatch(/(src|href)="https?:/i);
    const gorselli = karsilastirmaRaporuUret(veri(), { goruntuler: true });
    expect(gorselli.match(/<img /g)?.length).toBe(1);
    expect(karsilastirmaRaporuUret(veri(), { hatalar: false })).not.toContain('Expected');
  });
});

test.describe('Karşılaştırma uçları (geçici veritabanı, sahte koşular)', () => {
  test('ekran: özet, değişim sınıfları, adım / hata / görüntü / yakalanan farkı; maskeleme; adaylar; rapor', async () => {
    const klasor = mkdtempSync(join(tmpdir(), 'karsilastirma-'));
    try {
      const vtYolu = join(klasor, 'platform.db');
      const vt = await veritabaniniHazirla(vtYolu);
      await kasaOlustur(vt, `Gecici-${randomBytes(6).toString('hex')}`, { kdf: HIZLI_KDF });
      const f = await karsilastirmaVerisiKur(vt, vtYolu);
      const q = (o: Record<string, string>) => new URLSearchParams({ projeId: f.projeId, ...o });

      const v = karsilastirmaVerisi(vt, q({ tur: 'ekran', a: f.kosuA, b: f.kosuB }));
      expect(v.a.sayilar).toEqual({ basarili: 3, kalan: 1, atlanan: 0, durduruldu: 0 });
      expect(v.b.sayilar).toEqual({ basarili: 2, kalan: 2, atlanan: 0, durduruldu: 0 });
      expect(v.fark).toMatchObject({ basarili: -1, kalan: 1, oran: -25 });
      expect(v.a).toMatchObject({ ortam: 'TEST', kapsam: 'tam · Genel' });
      const durum = Object.fromEntries(v.senaryolar.map((s) => [s.baslik, s.degisim]));
      expect(durum).toEqual({ Kayıt: 'yeni-kalan', Yeni: 'yalniz-b', Onay: 'duzelen', Eski: 'yalniz-a', Liste: 'hep-gecen' });
      expect(v.senaryolar.find((s) => s.baslik === 'Liste')?.sureFarkiMs).toBe(-500);
      expect(v.degisen).toBe(4);

      const kayit = v.senaryolar.find((s) => s.baslik === 'Kayıt');
      const d = karsilastirmaSenaryosu(vt, q({ tur: 'ekran', a: String(kayit?.a?.ref), b: String(kayit?.b?.ref) }));
      expect(d.adimlar.map((a) => [a.ad, a.degisim])).toEqual([
        ['Sayfayı aç', 'hep-gecen'], ['Çerez uyarısını kapat', 'yalniz-b'], ['Formu doldur', 'hep-gecen'], ['Kaydet', 'yeni-kalan']
      ]);
      expect((d.b as { gorseller: unknown[] }).gorseller).toHaveLength(1);
      expect(d.yakalanan?.[0]).toMatchObject({ kaynak: 'konsol', durum: 'yalniz-b', sayiB: 2 });
      const metin = JSON.stringify(d);
      expect(metin).not.toContain(GIZLI_PAROLA);
      expect(metin).not.toContain('4111111111111111');
      expect(metin).toContain('kayıt reddedildi');
      // Onay (düzelen): A tarafında Beklenen / Görülen, gizli değer maskeli.
      const onay = v.senaryolar.find((s) => s.baslik === 'Onay');
      const d2 = karsilastirmaSenaryosu(vt, q({ tur: 'ekran', a: String(onay?.a?.ref), b: String(onay?.b?.ref) }));
      expect((d2.a as { beklenenGorulen: { beklenen: string } }).beklenenGorulen.beklenen).toBe('"Onaylandı"');
      expect(JSON.stringify(d2)).not.toContain(GIZLI_PAROLA);
      // Yalnız bir taraf.
      const yeni = v.senaryolar.find((s) => s.baslik === 'Yeni');
      expect(karsilastirmaSenaryosu(vt, q({ tur: 'ekran', b: String(yeni?.b?.ref) })).a).toBeNull();

      // Adaylar: aynı proje, en yeniler önce, referans hariç; kapsam anahtarı süzgeç içindir.
      const ad = karsilastirmaAdaylari(vt, q({ tur: 'ekran', kosu: f.kosuB }));
      expect(ad.referans).toMatchObject({ id: f.kosuB, ortamId: f.ortamId, kapsamAnahtari: 'tam · Genel' });
      expect(ad.kosular.map((k) => [k.id, k.kapsamAnahtari])).toEqual([[f.tekilKosu, 'tekil'], [f.kosuA, 'tam · Genel']]);

      // Koruma: aynı koşu, başka proje, bozuk kimlik.
      expect(() => karsilastirmaVerisi(vt, q({ tur: 'ekran', a: f.kosuA, b: f.kosuA }))).toThrow('kendisiyle');
      expect(() => karsilastirmaVerisi(vt, new URLSearchParams({ projeId: f.baskaProjeId, a: f.kosuA, b: f.kosuB }))).toThrow('Koşu bulunamadı');
      expect(() => karsilastirmaVerisi(vt, q({ a: '../x', b: f.kosuB }))).toThrow('geçersiz');
      expect(() => karsilastirmaSenaryosu(vt, new URLSearchParams({ projeId: f.baskaProjeId, a: f.sonucA1 }))).toThrow('Sonuç bulunamadı');

      // HTML karşılaştırma raporu: görüntüler varsayılan kapalı; açıkken şifreli görüntü çözülüp gömülür.
      const medyaKlasoru = join(klasor, 'medya');
      const r = await karsilastirmaRaporuOlustur(vt, q({ tur: 'ekran', id: f.kosuA, b: f.kosuB }), { medyaKlasoru });
      expect(r.dosyaAdi).toMatch(/^nobetci-karsilastirma-karsilastirma-projesi-test-\d{4}-\d{2}-\d{2}-\d{4}\.html$/);
      expect(r.html).toContain('yeni kalan');
      expect(r.html).not.toContain('<img');
      for (const sizinti of [GIZLI_PAROLA, 'test.ornek.invalid']) expect(r.html, sizinti).not.toContain(sizinti);
      const g = await karsilastirmaRaporuOlustur(vt, q({ tur: 'ekran', id: f.kosuA, b: f.kosuB, goruntuler: '1' }), { medyaKlasoru });
      expect(g.goruntu.eklenen).toBeGreaterThanOrEqual(1);
      expect(g.html).toContain(`data:image/png;base64,${PNG_1X1}`);
      vt.kapat();
    } finally {
      rmSync(klasor, { recursive: true, force: true });
    }
  });

  test('servis: senaryo = servis senaryosu, adım = istek (HTTP kodu, kontrol farkı); gövdeler ve gizli değerler dönmez', async () => {
    const klasor = mkdtempSync(join(tmpdir(), 'karsilastirma-servis-'));
    try {
      const vtYolu = join(klasor, 'platform.db');
      const vt = await veritabaniniHazirla(vtYolu);
      await kasaOlustur(vt, `Gecici-${randomBytes(6).toString('hex')}`, { kdf: HIZLI_KDF });
      const f = await karsilastirmaVerisiKur(vt, vtYolu);
      const q = (o: Record<string, string>) => new URLSearchParams({ projeId: f.projeId, tur: 'servis', ...o });
      const v = karsilastirmaVerisi(vt, q({ a: f.servisKosuA, b: f.servisKosuB }));
      expect(v.a).toMatchObject({ kosuTuru: 'servis', kapsam: 'Kayıt Servisi', ortam: 'TEST' });
      expect(Object.fromEntries(v.senaryolar.map((s) => [s.baslik, s.degisim]))).toEqual({ 'Kayıt oluştur': 'yeni-kalan', 'Kayıt sorgula': 'duzelen' });
      const olustur = v.senaryolar.find((s) => s.baslik === 'Kayıt oluştur');
      expect(olustur?.a?.httpKodu).toBe(200);
      expect(olustur?.b?.httpKodu).toBe(400);
      const d = karsilastirmaSenaryosu(vt, q({ a: String(olustur?.a?.ref), b: String(olustur?.b?.ref) }));
      expect(d.adimlar).toHaveLength(1);
      expect(d.adimlar[0].a?.httpKodu).toBe(200);
      expect(d.adimlar[0].kontroller?.map((k) => [k.ad, k.degisim])).toEqual([
        ['Durum kodu', 'yeni-kalan'], ['Şunlardan biri (VEYA)', 'yalniz-b'], ['Şunlardan biri (VEYA) › Alan: kod', 'yalniz-b']
      ]);
      const sorgu = v.senaryolar.find((s) => s.baslik === 'Kayıt sorgula');
      const d2 = JSON.stringify(karsilastirmaSenaryosu(vt, q({ a: String(sorgu?.a?.ref), b: String(sorgu?.b?.ref) })));
      expect(d2).toContain('beklenen 200, gelen 500');
      for (const sizinti of [GIZLI_PAROLA, 'govde-icerigi-gorunmemeli', '"parola"']) expect(d2, sizinti).not.toContain(sizinti);
      expect(JSON.stringify(v)).not.toContain(GIZLI_PAROLA);
      const ad = karsilastirmaAdaylari(vt, q({ kosu: f.servisKosuB }));
      expect(ad.kosular.map((k) => k.id)).toEqual([f.servisKosuA]);
      // Akış: senaryo = akış senaryosu (tek satır), adımlar = akışın istekleri; servis ↔ akış karşılaştırılamaz.
      const akis = karsilastirmaVerisi(vt, q({ a: f.akisKosuA, b: f.akisKosuB }));
      expect(akis.a.kosuTuru).toBe('akis');
      expect(akis.senaryolar.map((s) => [s.baslik, s.degisim])).toEqual([['Kayıt akışı senaryosu', 'yeni-kalan']]);
      const akisAdimlari = karsilastirmaSenaryosu(vt, q({ a: f.akisKosuA, b: f.akisKosuB }));
      expect(akisAdimlari.adimlar.map((a) => [a.ad, a.degisim, a.b?.httpKodu])).toEqual([['Giriş', 'hep-gecen', 200], ['Kayıt', 'yeni-kalan', 503]]);
      expect(akisAdimlari.adimlar[1].kontroller?.[0]).toMatchObject({ ad: 'Durum kodu', degisim: 'yeni-kalan' });
      expect(() => karsilastirmaVerisi(vt, q({ a: f.servisKosuA, b: f.akisKosuB }))).toThrow('akış koşusu');
      expect(karsilastirmaAdaylari(vt, q({ kosu: f.akisKosuB })).kosular.map((k) => k.id)).toEqual([f.akisKosuA]);
      const r = await karsilastirmaRaporuOlustur(vt, q({ id: f.servisKosuA, b: f.servisKosuB }), { medyaKlasoru: join(klasor, 'medya') });
      expect(r.html).toContain('Servis koşuları');
      expect(r.html).toContain('HTTP 400');
      for (const sizinti of [GIZLI_PAROLA, 'govde-icerigi-gorunmemeli']) expect(r.html, sizinti).not.toContain(sizinti);
      vt.kapat();
    } finally {
      rmSync(klasor, { recursive: true, force: true });
    }
  });
});
