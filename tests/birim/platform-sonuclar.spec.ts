// KORUMA TESTLERİ — koşu sonuçları (şema v5), şifreli medya deposu ve "test verisinin tüm alanları hassas" kararı.
// Tarayıcı açmaz, siteye bağlanmaz; her test kendi geçici klasöründe çalışır (repo içindeki sonuç klasörlerine DOKUNMAZ).
import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, utimesSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import type { Veritabani } from '../../scripts/platform/veritabani/baglanti.mjs';
import {
  MEDYA_ANAHTARI_META, kasaOlustur, medyaAnahtariniHazirla, parolaDegistir, zarfMi
} from '../../scripts/platform/kasa.mjs';
import {
  degisiklikGecmisiListele, ekranKaydet, projeKaydet, senaryoKaydet, testVerisiProfiliGetir,
  testVerisiProfiliKaydet, testVerisiTuruKaydet, veritabaniniHazirla
} from '../../scripts/platform/veritabani/depo.mjs';
import {
  hataKaliplari, kosuDetayi, kosuKaydet, kosudakiSonucuBul, kosuyuBitir, medyaGetir, sonucDetayi, sonucKaydet, sonucOzeti
} from '../../scripts/platform/veritabani/sonuc-deposu.mjs';
import {
  MedyaHatasi, PARCA_BOYUTU, medyaBoyutu, medyaCoz, medyaSaklamaTemizligi, medyaSifrele, medyaTamamenCoz
} from '../../scripts/platform/medya.mjs';
import { playwrightDurumuEsle } from '../../scripts/platform/sonuclar/siniflandirma.mjs';
import { atlananAlanlariAyristir, medyaTuru } from '../../scripts/platform/raporlayici.mjs';
import { HIZLI_KDF, geciciKlasor } from './platform-ortak';

const PAROLA = 'Sonuclar-Kasa-Parolasi-51';
const PNG_IMZASI = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const WEBM_IMZASI = Buffer.from([0x1a, 0x45, 0xdf, 0xa3]);

async function kasaliVeritabani(klasor: string): Promise<Veritabani> {
  const vt = await veritabaniniHazirla(join(klasor, 'platform.db'));
  await kasaOlustur(vt, PAROLA, { kdf: HIZLI_KDF });
  return vt;
}

/** Sahte PNG/WebM içerik: gerçek imza + rastgele gövde (şifreli dosyada ikisi de görünmemeli). */
const sahtePng = (boyut: number): Buffer => Buffer.concat([PNG_IMZASI, randomBytes(Math.max(0, boyut - PNG_IMZASI.length))]);
const sahteWebm = (boyut: number): Buffer => Buffer.concat([WEBM_IMZASI, randomBytes(Math.max(0, boyut - WEBM_IMZASI.length))]);

test.describe('Şifreli medya deposu', () => {
  test('parçalı AES-GCM: gidiş-dönüş, aralık (Range), imza/düz metin yok, kurcalama ve yanlış anahtar reddedilir', async () => {
    const k = geciciKlasor('medya');
    try {
      const anahtar = randomBytes(32);
      const medyaKlasoru = join(k.yol, 'medya');
      for (const boyut of [0, 1, PARCA_BOYUTU - 1, PARCA_BOYUTU, PARCA_BOYUTU + 1, 3 * PARCA_BOYUTU + 17]) {
        const duz = sahtePng(boyut);
        const kaynakDosya = join(k.yol, `kaynak-${boyut}.png`);
        writeFileSync(kaynakDosya, duz);
        for (const kaynak of [duz, kaynakDosya]) {
          const { dosya, boyut: yazilan } = await medyaSifrele(anahtar, medyaKlasoru, kaynak);
          expect(yazilan).toBe(duz.length);
          expect(dosya).toMatch(/^[a-f0-9]{32}\.medya$/);
          const yol = join(medyaKlasoru, dosya);
          const sifreli = readFileSync(yol);
          expect(sifreli.subarray(0, 7).toString('ascii')).toBe('TAMEDYA');
          if (duz.length >= 8) expect(sifreli.includes(PNG_IMZASI), 'PNG imzası şifreli dosyada olmamalı').toBe(false);
          if (duz.length >= 64) expect(sifreli.includes(duz.subarray(16, 48)), 'düz içerik parçası şifreli dosyada olmamalı').toBe(false);
          expect((await medyaBoyutu(yol)).duzBoyut).toBe(duz.length);
          expect((await medyaTamamenCoz(anahtar, yol)).equals(duz)).toBe(true);
          if (duz.length > 2) {
            for (let i = 0; i < 5; i++) {
              const a = Math.floor(Math.random() * duz.length);
              const b = a + Math.floor(Math.random() * (duz.length - a));
              const parcalar: Buffer[] = [];
              for await (const p of medyaCoz(anahtar, yol, { baslangic: a, bitis: b })) parcalar.push(p);
              expect(Buffer.concat(parcalar).equals(duz.subarray(a, b + 1)), `aralık ${a}-${b}`).toBe(true);
            }
          }
        }
        expect(readFileSync(kaynakDosya).equals(duz), 'kaynak dosyaya dokunulmamalı').toBe(true);
      }
      // Kurcalama / yanlış anahtar / kesilmiş dosya → doğrulanamaz.
      const { dosya } = await medyaSifrele(anahtar, medyaKlasoru, sahteWebm(2 * PARCA_BOYUTU + 5));
      const yol = join(medyaKlasoru, dosya);
      const sifreli = readFileSync(yol);
      expect(sifreli.includes(WEBM_IMZASI)).toBe(false);
      await expect(medyaTamamenCoz(randomBytes(32), yol)).rejects.toBeInstanceOf(MedyaHatasi);
      const bozuk = Buffer.from(sifreli);
      bozuk[100] ^= 0xff;
      writeFileSync(yol, bozuk);
      await expect(medyaTamamenCoz(anahtar, yol)).rejects.toBeInstanceOf(MedyaHatasi);
      writeFileSync(yol, sifreli.subarray(0, sifreli.length - (PARCA_BOYUTU % 1000) - 100));
      await expect(medyaTamamenCoz(anahtar, yol)).rejects.toBeInstanceOf(MedyaHatasi);
    } finally {
      k.temizle();
    }
  });

  test('medya ana anahtarı kasada sarılı durur; parola değişince yeniden sarılır, eski medya okunmaya devam eder', async () => {
    const k = geciciKlasor('medya-anahtar');
    try {
      const vt = await kasaliVeritabani(k.yol);
      const zarf = vt.metaOku(MEDYA_ANAHTARI_META);
      expect(zarfMi(zarf)).toBe(true);
      const ana = medyaAnahtariniHazirla(vt);
      const { dosya } = await medyaSifrele(ana, join(k.yol, 'medya'), sahtePng(5000));
      await parolaDegistir(vt, PAROLA, `${PAROLA}-yeni`, { kdf: HIZLI_KDF });
      expect(vt.metaOku(MEDYA_ANAHTARI_META)).not.toBe(zarf);
      const yeniAna = medyaAnahtariniHazirla(vt);
      expect(yeniAna.equals(ana)).toBe(true);
      expect((await medyaTamamenCoz(yeniAna, join(k.yol, 'medya', dosya))).subarray(0, 8).equals(PNG_IMZASI)).toBe(true);
      vt.kapat();
    } finally {
      k.temizle();
    }
  });
});

test.describe('Koşu sonuçları deposu', () => {
  test('kartlar (Genel = her ürünün son tam koşusu), önceki koşu farkı, trend, tekil koşu kartı etkilemez, yeniden deneme yerine geçer', async () => {
    const k = geciciKlasor('sonuc');
    try {
      const vt = await kasaliVeritabani(k.yol);
      const proje = projeKaydet(vt, { ad: 'Proje' });
      const ekranA = ekranKaydet(vt, { projeId: proje, anahtar: 'a', ad: 'Ürün A' });
      ekranKaydet(vt, { projeId: proje, anahtar: 'b', ad: 'Ürün B' });
      const s1 = senaryoKaydet(vt, { projeId: proje, ekranId: ekranA, baslik: 'A1', icerik: {} });
      const zaman = (dk: number) => new Date(Date.UTC(2026, 0, 1, 10, dk)).toISOString();
      const sonuc = (kosuId: string, baslik: string, durum: string, ek: Record<string, unknown> = {}) => sonucKaydet(vt, {
        kosuId, projeId: proje, senaryoBaslik: baslik, durum, testKimligi: `${baslik}-id`, bitis: zaman(0), ...ek
      });
      // 1) tam, Genel: A1 geçti (senaryo kimliğiyle), A2 kaldı (ürün adıyla), B1 geçti
      kosuKaydet(vt, { id: 'kosu-1', projeId: proje, tur: 'tam', kapsam: 'Genel', baslangic: zaman(0) });
      sonuc('kosu-1', 'A1', 'basarili', { senaryoId: s1 });
      sonuc('kosu-1', 'A2', 'basarisiz', { urunAdi: 'Ürün A', hataMesaji: 'Error: expect(locator).toBeVisible() failed\n\nLocator: getByRole(\'button\')\nExpected: visible\nReceived: hidden' });
      sonuc('kosu-1', 'B1', 'basarili', { urunAdi: 'Ürün B' });
      kosuyuBitir(vt, 'kosu-1', { durum: 'tamamlandi', bitis: zaman(5) });
      // 2) tekil: A2 yine kaldı (kartları etkilememeli)
      kosuKaydet(vt, { id: 'kosu-2', projeId: proje, tur: 'tekil', baslangic: zaman(10) });
      sonuc('kosu-2', 'A2', 'basarisiz', { urunAdi: 'Ürün A', hataMesaji: 'Siparis 250166487 onaylanamadı' });
      kosuyuBitir(vt, 'kosu-2', { durum: 'tamamlandi', bitis: zaman(12) });
      // 3) tam, kapsam Ürün A: iki A testi geçti; A2 önce kaldı sonra yeniden denemede geçti
      kosuKaydet(vt, { id: 'kosu-3', projeId: proje, tur: 'tam', kapsam: 'Ürün A', baslangic: zaman(20) });
      sonuc('kosu-3', 'A1', 'basarili', { senaryoId: s1 });
      const ilk = sonuc('kosu-3', 'A2', 'basarisiz', { urunAdi: 'Ürün A', hataMesaji: 'x', medya: [{ tur: 'ekran_goruntusu', ad: 'g', icerikTuru: 'image/png', boyut: 1, dosya: `${'a'.repeat(32)}.medya` }] });
      const ikinci = sonuc('kosu-3', 'A2', 'basarili', { urunAdi: 'Ürün A', deneme: 1 });
      expect(ilk.id).not.toBe(ikinci.id);
      expect(ikinci.silinecekMedyaDosyalari).toEqual([`${'a'.repeat(32)}.medya`]);
      kosuyuBitir(vt, 'kosu-3', { durum: 'tamamlandi', bitis: zaman(25) });

      const genel = sonucOzeti(vt, proje);
      expect(genel.kart?.son).toMatchObject({ basarili: 3, basarisiz: 0 });
      expect(genel.kart?.onceki).toMatchObject({ basarili: 2, basarisiz: 1 });
      expect(genel.trend.map((t) => t.kosuId)).toEqual(['kosu-1']); // yalnızca Genel kapsamlı tam koşular
      expect(genel.kosuGecmisi.map((g) => [g.id, g.tur])).toEqual([['kosu-3', 'tam'], ['kosu-2', 'tekil'], ['kosu-1', 'tam']]);
      const urunA = sonucOzeti(vt, proje, { urun: ekranA });
      expect(urunA.kart?.son).toMatchObject({ kosuId: 'kosu-3', basarili: 2, basarisiz: 0 });
      expect(urunA.kart?.onceki).toMatchObject({ kosuId: 'kosu-1', basarili: 1, basarisiz: 1 });
      expect(urunA.trend.map((t) => t.kosuId)).toEqual(['kosu-1', 'kosu-3']);
      expect(sonucOzeti(vt, proje, { urun: 'ad:Yok' }).kart).toBeNull();

      const detay = kosuDetayi(vt, 'kosu-1');
      expect(detay?.sonuclar[0]).toMatchObject({ senaryoBaslik: 'A2', durum: 'basarisiz', urun: 'Ürün A', hataKategorisi: 'Doğrulama (Assertion) Hatası' });
      const a2 = sonucDetayi(vt, detay?.sonuclar[0].id ?? '');
      expect(a2?.beklenenGorulen).toEqual({ beklenen: 'visible', gorulen: 'hidden' });
      // Hata kalıpları: sayılar "#" olur; tarih filtresi uygulanır.
      const kaliplar = hataKaliplari(vt, proje);
      expect(kaliplar.toplam).toBe(2);
      expect(kaliplar.kaliplar.map((x) => x.kalip)).toContain('Siparis # onaylanamadı');
      expect(hataKaliplari(vt, proje, { baslangic: zaman(1) }).toplam).toBe(0); // bitis alanı zaman(0)
      vt.kapat();
    } finally {
      k.temizle();
    }
  });

  test('saklama: süresi dolan videolar silinir (satır "silinme" ile kalır), ekran görüntüleri kalır; sahipsiz eski dosya temizlenir', async () => {
    const k = geciciKlasor('saklama');
    try {
      const vt = await kasaliVeritabani(k.yol);
      const proje = projeKaydet(vt, { ad: 'Proje' });
      const ana = medyaAnahtariniHazirla(vt);
      const klasor = join(k.yol, 'medya');
      const video = await medyaSifrele(ana, klasor, sahteWebm(1000));
      const gorsel = await medyaSifrele(ana, klasor, sahtePng(1000));
      const sahipsiz = await medyaSifrele(ana, klasor, sahtePng(10));
      const eski = new Date(Date.now() - 40 * 24 * 3600 * 1000);
      utimesSync(join(klasor, sahipsiz.dosya), eski, eski);
      kosuKaydet(vt, { id: 'k1', projeId: proje, tur: 'tam' });
      const { id } = sonucKaydet(vt, {
        kosuId: 'k1', projeId: proje, senaryoBaslik: 'S', durum: 'basarisiz', hataMesaji: 'h',
        medya: [
          { tur: 'video', ad: 'video', icerikTuru: 'video/webm', boyut: 1000, dosya: video.dosya, olusturulma: eski.toISOString() },
          { tur: 'ekran_goruntusu', ad: 'g', icerikTuru: 'image/png', boyut: 1000, dosya: gorsel.dosya, olusturulma: eski.toISOString() }
        ]
      });
      const sonuc = medyaSaklamaTemizligi(vt, klasor, { videoGun: 30 });
      expect(sonuc).toEqual({ silinenVideo: 1, silinenSahipsiz: 1 });
      expect(existsSync(join(klasor, video.dosya))).toBe(false);
      expect(existsSync(join(klasor, gorsel.dosya))).toBe(true);
      const medya = sonucDetayi(vt, id)?.medya ?? [];
      expect(medya.find((m) => m.tur === 'video')?.silinme).toBeTruthy();
      expect(medyaGetir(vt, medya[1].id)?.dosya).toBe(gorsel.dosya);
      expect(kosudakiSonucuBul(vt, 'k1', { senaryoBaslik: 'S' })?.videoId).toBeNull();
      vt.kapat();
    } finally {
      k.temizle();
    }
  });

  test('raporlayıcı yardımcıları: durum eşleme (kesinti = durduruldu), medya türü, atlanan alanlar', () => {
    expect(playwrightDurumuEsle('passed', null)).toBe('basarili');
    expect(playwrightDurumuEsle('failed', 'Error: x')).toBe('basarisiz');
    expect(playwrightDurumuEsle('timedOut', 'Test timeout of 30000ms exceeded.')).toBe('basarisiz');
    expect(playwrightDurumuEsle('failed', '')).toBe('durduruldu');
    expect(playwrightDurumuEsle('failed', 'Test was interrupted.')).toBe('durduruldu');
    expect(playwrightDurumuEsle('interrupted', null)).toBe('durduruldu');
    expect(playwrightDurumuEsle('skipped', null)).toBe('atlanan');
    expect(playwrightDurumuEsle('failed', 'beklenen', 'failed')).toBe('basarili');
    expect(medyaTuru({ name: 'screenshot', contentType: 'image/png' })).toBe('ekran_goruntusu');
    expect(medyaTuru({ name: 'video', contentType: 'video/webm' })).toBe('video');
    expect(medyaTuru({ name: 'trace', contentType: 'application/zip' })).toBe('iz');
    expect(medyaTuru({ name: 'error-context', contentType: 'text/markdown' })).toBe('diger');
    expect(atlananAlanlariAyristir('["il", {"alan": "ilçe", "neden": "liste boş"}]')).toEqual([{ alan: 'il' }, { alan: 'ilçe', neden: 'liste boş' }]);
    expect(atlananAlanlariAyristir('cadde, sokak\nkat')).toEqual([{ alan: 'cadde' }, { alan: 'sokak' }, { alan: 'kat' }]);
  });
});

test.describe('Test verisi: tüm alanlar hassas (kullanıcı kararı)', () => {
  test('yeni tür alanları varsayılan hassas; hassaslık değişince profil değerleri ve geçmişi dönüştürülür', async () => {
    const k = geciciKlasor('hassas');
    try {
      const vt = await kasaliVeritabani(k.yol);
      const proje = projeKaydet(vt, { ad: 'Proje' });
      const ADRES = 'Cadde-Degeri-8841';
      const SAHIP = 'Kart Sahibi 8841';
      // Varsayılan: hassas (açıkça false verilmedikçe).
      const varsayilanTur = testVerisiTuruKaydet(vt, { projeId: proje, ad: 'Kart', alanlar: [{ ad: 'isim' }] });
      const kart = testVerisiProfiliKaydet(vt, { projeId: proje, turId: varsayilanTur, ad: 'ortak', degerler: { isim: SAHIP } });
      expect(testVerisiProfiliGetir(vt, kart)?.hassasAlanlar).toEqual(['isim']);
      // Eski durum: alan açıkça hassas değil → düz metin (profil + geçmiş).
      const tur = testVerisiTuruKaydet(vt, { projeId: proje, ad: 'Adres', alanlar: [{ ad: 'cadde', hassas: false }] });
      const profil = testVerisiProfiliKaydet(vt, { projeId: proje, turId: tur, ad: 'adres1', degerler: { cadde: ADRES } });
      const dbYolu = join(k.yol, 'platform.db');
      expect(readFileSync(dbYolu).includes(Buffer.from(ADRES))).toBe(true);
      // Hassas yapılır → profil + geçmişi şifrelenir.
      testVerisiTuruKaydet(vt, { id: tur, projeId: proje, ad: 'Adres', alanlar: [{ ad: 'cadde', hassas: true }] });
      const bayt = readFileSync(dbYolu);
      for (const deger of [ADRES, SAHIP]) expect(bayt.includes(Buffer.from(deger)), 'düz metin kalmamalı').toBe(false);
      expect(testVerisiProfiliGetir(vt, profil, { coz: true })?.degerler).toEqual({ cadde: ADRES });
      const gecmis = degisiklikGecmisiListele(vt, 'test_verisi_profili', profil);
      expect(zarfMi(JSON.parse(String(gecmis[0].sonraki?.degerler_json)).cadde)).toBe(true);
      // Kullanıcı hassaslığı kaldırırsa değerler çözülür (düz metin kalır — bilinçli tercih).
      testVerisiTuruKaydet(vt, { id: tur, projeId: proje, ad: 'Adres', alanlar: [{ ad: 'cadde', hassas: false }] });
      expect(testVerisiProfiliGetir(vt, profil)?.degerler).toEqual({ cadde: ADRES });
      vt.kapat();
    } finally {
      k.temizle();
    }
  });
});
