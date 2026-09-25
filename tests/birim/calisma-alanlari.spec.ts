// KORUMA TESTLERİ — çalışma alanları (her biri ayrı veritabanı + medya + yedekler + kasa parolası) ve bir çalışma alanında
// birden çok proje. Tarayıcı açmaz, siteye bağlanmaz; her test kendi GEÇİCİ veri kökünde (NOBETCI_VERI_KOKU) çalışır —
// deponun veri/ klasörüne dokunulmaz. Sunucu uçları, sahte koşuculu küçük bir yardımcı sunucuyla (fixtures/
// calisma-alani-sunucusu.mjs; 127.0.0.1) denenir: gerçek test koşusu başlatılmaz.
import { spawn, type ChildProcess } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { expect, test } from '@playwright/test';
import {
  CalismaAlaniHatasi, alanKaldir, alanOlustur, alanYenidenAdlandir, alanYollari, calismaAlaniniCoz, kayitDefteriniHazirla,
  kayitDefteriniOku, veriKoku
} from '../../scripts/platform/calisma-alanlari.mjs';
import { DEGISIKLIK_SAYACI_META, veritabaniYolu } from '../../scripts/platform/veritabani/baglanti.mjs';
import { kasaOlustur } from '../../scripts/platform/kasa.mjs';
import {
  ekranKaydet, ortamKaydet, projeKaydet, projeleriListele, senaryoKaydet, veritabaniniHazirla
} from '../../scripts/platform/veritabani/depo.mjs';
import { hataKaliplari, kosuKaydet, sonucKaydet, sonucOzeti } from '../../scripts/platform/veritabani/sonuc-deposu.mjs';
import { ekranListesi } from '../../scripts/platform/ekranlar/ekran-servisi.mjs';
import { kodKaldirilmisSenaryolar, senaryoListesi } from '../../scripts/platform/senaryolar/senaryo-servisi.mjs';
import { projeSilmeOnizlemesi, projeyiSil, varsayilanProjeAyarla, varsayilanProjeKimligi } from '../../scripts/platform/proje-yonetimi.mjs';
import { aktarimiUygula } from '../../scripts/platform/aktarim/motor.mjs';
import { adaptorBul } from '../../projeler/index.mjs';
import { HIZLI_KDF, ORNEK_ESKI_DOSYALAR, SAHTE_ORTAM_DEGISKENLERI, geciciKlasor } from './platform-ortak';

const KOK = resolve(__dirname, '..', '..');
const PAROLA_A = 'Alan-A-Kasa-Parolasi-1';
const PAROLA_B = 'Alan-B-Kasa-Parolasi-2';
/** Örnek projenin "kodda tanımlı" testleri (Playwright listesi yerine). */
const KOD_TESTLERI = [{ dosya: 'scenarios/trafik/jet-trafik.spec.ts', ad: 'Trafik kod testi' }];

/** Klasördeki her dosyanın göreli yolu + SHA-256'sı (taşınma/değişme denetimi). */
function dosyaIzi(kok: string): Record<string, string> {
  const iz: Record<string, string> = {};
  for (const ad of readdirSync(kok, { recursive: true }).map(String)) {
    const tam = join(kok, ad);
    if (statSync(tam).isFile()) iz[relative(kok, tam)] = createHash('sha256').update(readFileSync(tam)).digest('hex');
  }
  return iz;
}

/** Eski tek-veritabanı düzeni: <kök>/platform.db (kasa + proje) + medya/ + yedekler/ + eski-dosyalar/. */
async function eskiDuzen(kok: string): Promise<void> {
  const vt = await veritabaniniHazirla(join(kok, 'platform.db'));
  await kasaOlustur(vt, PAROLA_A, { kdf: HIZLI_KDF });
  projeKaydet(vt, { ad: 'Eski proje' });
  vt.kapat();
  mkdirSync(join(kok, 'medya'), { recursive: true });
  writeFileSync(join(kok, 'medya', `${'a'.repeat(32)}.medya`), randomBytes(64));
  mkdirSync(join(kok, 'yedekler'), { recursive: true });
  writeFileSync(join(kok, 'yedekler', 'otomatik-20260101-000000-000.tayedek'), randomBytes(64));
  mkdirSync(join(kok, 'eski-dosyalar', '20260101-0000'), { recursive: true });
  writeFileSync(join(kok, 'eski-dosyalar', '20260101-0000', 'not.txt'), 'eski');
}

test.describe('Kayıt defteri', () => {
  test('mevcut platform.db YERİNDE ilk çalışma alanı olur; hiçbir dosya taşınmaz/değişmez', async () => {
    const k = geciciKlasor('alan-yerinde');
    try {
      await eskiDuzen(k.yol);
      const once = dosyaIzi(k.yol);
      const { defter, yerindeKaydedildi } = kayitDefteriniHazirla(k.yol);
      expect(yerindeKaydedildi).toBe(true);
      expect(defter.sonAcilan).toBe('ilk');
      expect(defter.alanlar).toHaveLength(1);
      expect(defter.alanlar[0]).toMatchObject({ id: 'ilk', ad: 'Çalışma alanı 1', veritabani: 'platform.db', medya: 'medya', yedekler: 'yedekler' });
      expect(alanYollari(k.yol, defter.alanlar[0])).toEqual({
        veritabani: join(k.yol, 'platform.db'), medya: join(k.yol, 'medya'), yedekler: join(k.yol, 'yedekler')
      });
      // Tek yeni dosya kayıt defteridir; diğer tüm dosyalar aynı yerde, aynı içerikte.
      const sonra = dosyaIzi(k.yol);
      expect(Object.keys(sonra).sort()).toEqual([...Object.keys(once), 'calisma-alanlari.json'].sort());
      for (const [yol, hash] of Object.entries(once)) expect(sonra[yol], yol).toBe(hash);
      // Kayıt defterinde gizli değer yok (yalnızca ad, göreli yollar, zamanlar, proje sayısı).
      const metin = readFileSync(join(k.yol, 'calisma-alanlari.json'), 'utf8');
      expect(metin).not.toContain(PAROLA_A);
      expect(Object.keys(JSON.parse(metin).alanlar[0]).sort()).toEqual(['ad', 'id', 'medya', 'olusturulma', 'projeSayisi', 'sonAcilma', 'veritabani', 'yedekler']);
      expect((statSync(join(k.yol, 'calisma-alanlari.json')).mode & 0o777).toString(8)).toBe('600');
      // İkinci çağrı hiçbir şeyi değiştirmez.
      expect(kayitDefteriniHazirla(k.yol).yerindeKaydedildi).toBe(false);
      expect(dosyaIzi(k.yol)).toEqual(sonra);
    } finally {
      k.temizle();
    }
  });

  test('veritabaniYolu: NOBETCI_VERI_KOKU + kayıt defteri (son açılan / NOBETCI_CALISMA_ALANI); PLATFORM_VERITABANI her şeyi ezer', async () => {
    const k = geciciKlasor('alan-yol');
    const eski = { kok: process.env.NOBETCI_VERI_KOKU, alan: process.env.NOBETCI_CALISMA_ALANI, vt: process.env.PLATFORM_VERITABANI };
    try {
      delete process.env.PLATFORM_VERITABANI;
      delete process.env.NOBETCI_CALISMA_ALANI;
      process.env.NOBETCI_VERI_KOKU = k.yol;
      expect(veriKoku(KOK)).toBe(k.yol);
      // Kayıt defteri yok → eski yol.
      expect(veritabaniYolu(KOK)).toBe(join(k.yol, 'platform.db'));
      await eskiDuzen(k.yol);
      kayitDefteriniHazirla(k.yol);
      const b = alanOlustur(k.yol, 'İkinci');
      expect(veritabaniYolu(KOK)).toBe(join(k.yol, 'platform.db')); // son açılan: ilk
      process.env.NOBETCI_CALISMA_ALANI = 'ikinci'; // ad, büyük/küçük harf duyarsız
      expect(veritabaniYolu(KOK)).toBe(join(k.yol, 'calisma-alanlari', b.id, 'platform.db'));
      expect(calismaAlaniniCoz(k.yol)?.kaynak).toBe('degisken');
      process.env.NOBETCI_CALISMA_ALANI = b.id; // kimlik
      expect(calismaAlaniniCoz(k.yol)?.alan.ad).toBe('İkinci');
      process.env.NOBETCI_CALISMA_ALANI = 'yok-boyle-bir-alan';
      expect(() => veritabaniYolu(KOK)).toThrow(/bulunamadı.*"Çalışma alanı 1", "İkinci"/);
      process.env.PLATFORM_VERITABANI = join(k.yol, 'baska.db');
      expect(veritabaniYolu(KOK)).toBe(join(k.yol, 'baska.db'));
    } finally {
      for (const [ad, deger] of [['NOBETCI_VERI_KOKU', eski.kok], ['NOBETCI_CALISMA_ALANI', eski.alan], ['PLATFORM_VERITABANI', eski.vt]] as const) {
        if (deger === undefined) delete process.env[ad]; else process.env[ad] = deger;
      }
      k.temizle();
    }
  });

  test('oluştur / yeniden adlandır / kaldır (adı yazarak onay; yerindeki alanda yalnızca kendi dosyaları)', async () => {
    const k = geciciKlasor('alan-yonetim');
    try {
      await eskiDuzen(k.yol);
      kayitDefteriniHazirla(k.yol);
      expect(() => alanOlustur(k.yol, '   ')).toThrow(CalismaAlaniHatasi);
      expect(() => alanOlustur(k.yol, 'x'.repeat(61))).toThrow(/60 karakter/);
      expect(() => alanOlustur(k.yol, 'çalışma ALANI 1')).toThrow(/zaten var/);
      const b = alanOlustur(k.yol, '  Deneme   alanı ');
      expect(b.ad).toBe('Deneme alanı');
      expect(b.veritabani).toBe(`calisma-alanlari/${b.id}/platform.db`);
      expect(existsSync(join(k.yol, 'calisma-alanlari', b.id))).toBe(true);
      expect(alanYenidenAdlandir(k.yol, b.id, 'İş').ad).toBe('İş');
      // B'ye veri yaz, sonra kaldır: klasörü tümüyle silinir.
      const vt = await veritabaniniHazirla(join(k.yol, b.veritabani));
      await kasaOlustur(vt, PAROLA_B, { kdf: HIZLI_KDF });
      vt.kapat();
      mkdirSync(join(k.yol, 'calisma-alanlari', b.id, 'medya'), { recursive: true });
      writeFileSync(join(k.yol, 'calisma-alanlari', b.id, 'medya', `${'b'.repeat(32)}.medya`), randomBytes(32));
      expect(() => alanKaldir(k.yol, b.id, 'yanlış ad')).toThrow(/birebir/);
      expect(alanKaldir(k.yol, b.id, 'İş').silinenDosya).toBeGreaterThanOrEqual(2);
      expect(existsSync(join(k.yol, 'calisma-alanlari', b.id))).toBe(false);
      expect(kayitDefteriniOku(k.yol)?.alanlar.map((a) => a.id)).toEqual(['ilk']);
      // Yerindeki ilk alan: platform.db, medya/, yedekler/ silinir; eski-dosyalar/ ve kayıt defteri kalır.
      alanKaldir(k.yol, 'ilk', 'Çalışma alanı 1');
      expect(existsSync(join(k.yol, 'platform.db'))).toBe(false);
      expect(existsSync(join(k.yol, 'medya'))).toBe(false);
      expect(existsSync(join(k.yol, 'yedekler'))).toBe(false);
      expect(existsSync(join(k.yol, 'eski-dosyalar', '20260101-0000', 'not.txt'))).toBe(true);
      expect(kayitDefteriniOku(k.yol)).toEqual({ surum: 1, sonAcilan: null, alanlar: [] });
    } finally {
      k.temizle();
    }
  });

  test('kayıt defterindeki yol veri kökünün dışına çıkamaz', () => {
    const k = geciciKlasor('alan-yol-disi');
    try {
      writeFileSync(join(k.yol, 'calisma-alanlari.json'), JSON.stringify({
        surum: 1, sonAcilan: 'aaaaaaaaaaaa',
        alanlar: [{ id: 'aaaaaaaaaaaa', ad: 'Kötü', veritabani: '../../etc/platform.db' }, { id: 'bbbbbbbbbbbb', ad: 'Mutlak', veritabani: '/tmp/x.db' }]
      }));
      const d = kayitDefteriniOku(k.yol);
      expect(d?.alanlar).toEqual([]);
      expect(d?.sonAcilan).toBeNull();
    } finally {
      k.temizle();
    }
  });
});

test.describe('Değişiklik sayacı', () => {
  test('satır değiştiren işlem sayacı artırır; okuma ve sayacsizIslem artırmaz', async () => {
    const k = geciciKlasor('alan-sayac');
    try {
      const vt = await veritabaniniHazirla(join(k.yol, 'platform.db'));
      await kasaOlustur(vt, PAROLA_A, { kdf: HIZLI_KDF });
      const sayac = () => Number(vt.metaOku(DEGISIKLIK_SAYACI_META) ?? 0);
      const bas = sayac();
      projeKaydet(vt, { ad: 'P1' });
      expect(sayac()).toBe(bas + 1);
      vt.islem(() => vt.tumu('SELECT * FROM projeler'));
      expect(sayac()).toBe(bas + 1);
      vt.sayacsizIslem(() => vt.metaYaz('son_disa_aktarma', JSON.stringify({ sayac: sayac() })));
      expect(sayac()).toBe(bas + 1);
      vt.calistir("UPDATE projeler SET ad = 'P1' WHERE ad = 'yok'"); // 0 satır
      expect(sayac()).toBe(bas + 1);
      vt.kapat();
    } finally {
      k.temizle();
    }
  });
});

test.describe('Aynı çalışma alanında birden çok proje', () => {
  test('listeler proje kapsamlı; kod testleri yalnızca kendi projesinde; proje silme yalnızca kendi verisini siler', async () => {
    const k = geciciKlasor('alan-projeler');
    try {
      const vt = await veritabaniniHazirla(join(k.yol, 'platform.db'));
      await kasaOlustur(vt, PAROLA_A, { kdf: HIZLI_KDF });
      // Proje A: örnek eski dosyalardan aktarılan (kodda tanımlı testler dahil).
      const adaptor = adaptorBul('galaksi');
      if (!adaptor) throw new Error('adaptör yok');
      const paket = await adaptor.paketOlustur(ORNEK_ESKI_DOSYALAR, { projeKoku: KOK, ortamDegiskenleri: { ...SAHTE_ORTAM_DEGISKENLERI }, testListesi: async () => KOD_TESTLERI });
      const a = aktarimiUygula(vt, paket).projeId;
      const ortamA = String(vt.tek("SELECT varlik_id FROM kaynak_eslemeleri WHERE proje_id = ? AND varlik_turu = 'ortam' AND kaynak_anahtari = 'test'", [a])?.varlik_id);
      // Proje B: elle (ortam, ekran, bir senaryo).
      const b = projeKaydet(vt, { ad: 'Proje B' });
      const ortamB = ortamKaydet(vt, { projeId: b, ad: 'TEST', tabanUrl: 'https://b.ornek.invalid', varsayilan: true });
      const ekranB = ekranKaydet(vt, { projeId: b, anahtar: 'giris', ad: 'Giriş ekranı' });
      const senaryoB = senaryoKaydet(vt, { projeId: b, ekranId: ekranB, baslik: 'B senaryosu', icerik: { ortamlar: { [ortamB]: { veri: {} } } } });
      // Sonuçlar ve medya: her projede bir koşu.
      const medyaKlasoru = join(k.yol, 'medya');
      mkdirSync(medyaKlasoru, { recursive: true });
      const dosyaA = `${'a'.repeat(32)}.medya`;
      const dosyaB = `${'b'.repeat(32)}.medya`;
      writeFileSync(join(medyaKlasoru, dosyaA), randomBytes(40));
      writeFileSync(join(medyaKlasoru, dosyaB), randomBytes(40));
      kosuKaydet(vt, { id: 'kosu-a', projeId: a, ortamId: ortamA, tur: 'tam' });
      sonucKaydet(vt, { kosuId: 'kosu-a', projeId: a, senaryoBaslik: 'A sonucu', durum: 'basarisiz', hataMesaji: 'A hatası',
        medya: [{ tur: 'ekran_goruntusu', ad: 'a.png', icerikTuru: 'image/png', boyut: 40, dosya: dosyaA }] });
      kosuKaydet(vt, { id: 'kosu-b', projeId: b, ortamId: ortamB, tur: 'tam' });
      sonucKaydet(vt, { kosuId: 'kosu-b', projeId: b, senaryoId: senaryoB, senaryoBaslik: 'B senaryosu', durum: 'basarisiz', hataMesaji: 'B hatası',
        medya: [{ tur: 'ekran_goruntusu', ad: 'b.png', icerikTuru: 'image/png', boyut: 40, dosya: dosyaB }] });

      const aBasliklari = new Set(vt.tumu('SELECT baslik FROM senaryolar WHERE proje_id = ?', [a]).map((s) => String(s.baslik)));
      expect(aBasliklari.size).toBeGreaterThan(3);
      // Senaryolar: B'nin listesinde A'nın (kodda tanımlı dahil) hiçbir senaryosu yok; tersi de.
      const listeB = senaryoListesi(vt, b, ortamB, null, { kodDosyasiVar: () => true });
      expect(listeB.senaryolar.map((s) => s.baslik)).toEqual(['B senaryosu']);
      expect(listeB.ekranlar.map((e) => e.ad)).toEqual(['Giriş ekranı']);
      const listeA = senaryoListesi(vt, a, ortamA, adaptor, { kodDosyasiVar: () => true });
      expect(listeA.senaryolar.some((s) => s.baslik === 'B senaryosu')).toBe(false);
      expect(listeA.senaryolar.some((s) => !s.veriGudumlu), 'A projesinde kodda tanımlı testler var').toBe(true);
      // "Kodu kaldırılmış" denetimi yalnızca kendi projesinin kod testlerine bakar.
      const kodB = kodKaldirilmisSenaryolar(vt, b, ortamB, { kodDosyasiVar: () => false, testListesi: [] });
      expect(kodB.senaryolar.every((s) => !aBasliklari.has(s.baslik))).toBe(true);
      // Ekranlar, Sonuçlar, hata kalıpları.
      expect(ekranListesi(vt, b).ekranlar.map((e) => e.ad)).toEqual(['Giriş ekranı']);
      expect(ekranListesi(vt, a).ekranlar.some((e) => e.ad === 'Giriş ekranı')).toBe(false);
      expect(sonucOzeti(vt, b).kosuGecmisi.map((x) => x.id)).toEqual(['kosu-b']);
      expect(sonucOzeti(vt, a).kosuGecmisi.map((x) => x.id)).toEqual(['kosu-a']);
      expect(hataKaliplari(vt, b).kaliplar.map((x) => x.kalip).join()).not.toContain('A hatası');

      // Varsayılan proje.
      expect(varsayilanProjeKimligi(vt)).toBeNull();
      varsayilanProjeAyarla(vt, b);
      expect(varsayilanProjeKimligi(vt)).toBe(b);

      // Proje B'yi sil: yalnızca B'nin verisi ve medya dosyası gider.
      const aSayilari = projeSilmeOnizlemesi(vt, a).sayilar;
      const o = projeSilmeOnizlemesi(vt, b);
      expect(o.sayilar).toMatchObject({ ortam: 1, ekran: 1, senaryo: 1, kosu: 1, sonuc: 1, medya: 1 });
      expect(o.sonProje).toBe(false);
      const r = projeyiSil(vt, b, { medyaKlasoru });
      expect(r.silinen.medyaDosyasi).toBe(1);
      expect(existsSync(join(medyaKlasoru, dosyaB))).toBe(false);
      expect(existsSync(join(medyaKlasoru, dosyaA))).toBe(true);
      expect(projeleriListele(vt).map((p) => p.id)).toEqual([a]);
      expect(Number(vt.tek('SELECT COUNT(*) AS n FROM kosular WHERE proje_id IS NULL')?.n)).toBe(0);
      expect(projeSilmeOnizlemesi(vt, a).sayilar).toEqual(aSayilari);
      expect(varsayilanProjeKimligi(vt)).toBeNull();
      expect(projeSilmeOnizlemesi(vt, a).sonProje).toBe(true);
      vt.kapat();
    } finally {
      k.temizle();
    }
  });
});

// ---------------------------------------------------------------------------------------------------------------------
// Sunucu uçları (yardımcı sunucu; geçici veri kökü)
// ---------------------------------------------------------------------------------------------------------------------
type Yardimci = { adres: string; token: string; surec: ChildProcess };

async function yardimciBaslat(veriKokuYolu: string): Promise<Yardimci> {
  const env: NodeJS.ProcessEnv = {};
  for (const [a, d] of Object.entries(process.env)) if (!/^(PLATFORM_|NOBETCI_|TEST_SUNUCU_|PW_|TEST_WORKER_INDEX|TEST_PARALLEL_INDEX)/.test(a)) env[a] = d;
  const surec = spawn(process.execPath, [join(__dirname, 'fixtures', 'calisma-alani-sunucusu.mjs')], {
    cwd: KOK, env: { ...env, NOBETCI_VERI_KOKU: veriKokuYolu }, stdio: ['ignore', 'pipe', 'pipe']
  });
  const ilk = await new Promise<string>((coz, reddet) => {
    let tampon = '';
    const zaman = setTimeout(() => reddet(new Error(`yardımcı sunucu başlamadı: ${tampon}`)), 20_000);
    surec.stdout?.on('data', (p: Buffer) => {
      tampon += p.toString('utf8');
      const satir = tampon.split('\n').find((x) => x.startsWith('{'));
      if (satir) { clearTimeout(zaman); coz(satir); }
    });
    surec.stderr?.on('data', (p: Buffer) => { tampon += p.toString('utf8'); });
    surec.once('exit', (kod) => { clearTimeout(zaman); reddet(new Error(`yardımcı sunucu kapandı (${kod}): ${tampon}`)); });
  });
  const { port, token } = JSON.parse(ilk) as { port: number; token: string };
  return { adres: `http://127.0.0.1:${port}`, token, surec };
}

type Yanit = { durum: number; govde: Record<string, unknown> };
async function istek(y: Yardimci, yol: string, govde?: Record<string, unknown>): Promise<Yanit> {
  const r = await fetch(`${y.adres}${yol}`, govde
    ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...govde, token: y.token }) }
    : { headers: { 'x-test-sunucu-token': y.token } });
  return { durum: r.status, govde: (await r.json()) as Record<string, unknown> };
}
type Alan = { id: string; ad: string; aktif: boolean; beklemeSaniye: number; projeSayisi: number | null; veritabaniVar: boolean };
const alanlar = async (y: Yardimci): Promise<Alan[]> => (await istek(y, '/platform/calisma-alanlari')).govde.alanlar as Alan[];
const durumAl = async (y: Yardimci): Promise<Record<string, unknown>> => (await istek(y, '/platform/durum')).govde;

test.describe('Sunucu: çalışma alanı aç / kapat / değiştir', () => {
  test.describe.configure({ mode: 'serial' });
  let k: ReturnType<typeof geciciKlasor>;
  let y: Yardimci;
  let bId = '';
  /** B'nin dışa aktarılan yedeği (yeni çalışma alanına içe aktarma testi). */
  let yedekB: Buffer = Buffer.alloc(0);
  test.beforeAll(async () => {
    test.setTimeout(90_000);
    k = geciciKlasor('alan-sunucu');
    await eskiDuzen(k.yol);
    y = await yardimciBaslat(k.yol);
  });
  test.afterAll(() => {
    y?.surec.kill('SIGTERM');
    k?.temizle();
  });

  test('açılış: eski veritabanı yerinde ilk çalışma alanı, kilitli; ikinci alan oluşturulur, kasası kurulur', async () => {
    test.setTimeout(60_000);
    const d = await durumAl(y);
    expect(d.calismaAlani).toEqual({ id: 'ilk', ad: 'Çalışma alanı 1', sabit: false });
    expect((d.kasa as { acik: boolean }).acik).toBe(false);
    expect(existsSync(join(k.yol, 'platform.db'))).toBe(true);
    // Açık iş yokken yeni alan: açık alan kapatılır, boş yeni alan açılır.
    const r = await istek(y, '/platform/calisma-alani/olustur', { ad: 'İkinci' });
    expect(r.durum).toBe(200);
    bId = String((r.govde.calismaAlani as { id: string }).id);
    expect((await durumAl(y)).calismaAlani).toMatchObject({ id: bId, ad: 'İkinci' });
    expect((await istek(y, '/platform/kasa/olustur', { parola: PAROLA_B })).durum).toBe(200);
    expect(existsSync(join(k.yol, 'calisma-alanlari', bId, 'platform.db'))).toBe(true);
    expect((await istek(y, '/platform/proje/kaydet', { ad: 'B projesi' })).durum).toBe(200);
    const liste = await alanlar(y);
    expect(liste.map((a) => a.ad).sort()).toEqual(['Çalışma alanı 1', 'İkinci']);
    expect(liste.find((a) => a.id === bId)).toMatchObject({ aktif: true, projeSayisi: 1 });
  });

  test('değişiklik izi: hiç dışa aktarılmadıysa "değişti"; dışa aktarınca temiz; yeni değişiklik tekrar "değişti"', async () => {
    test.setTimeout(60_000);
    expect((await durumAl(y)).degisiklik).toMatchObject({ degisti: true, sonDisaAktarma: null });
    const r = await istek(y, '/platform/yedek/disa-aktar', { parola: PAROLA_B, ekranGoruntuleriDahil: false });
    expect(r.durum).toBe(202);
    for (let i = 0; i < 100; i++) {
      const is = (await istek(y, `/platform/yedek/disa-aktar/${String(r.govde.isId)}`)).govde.is as { durum: string };
      if (is.durum !== 'hazirlaniyor') { expect(is.durum).toBe('hazir'); break; }
      await new Promise((c) => setTimeout(c, 100));
    }
    const indir = await fetch(`${y.adres}/platform/yedek/disa-aktar/${String(r.govde.isId)}/indir?token=${y.token}`);
    expect(indir.status).toBe(200);
    yedekB = Buffer.from(await indir.arrayBuffer());
    expect(yedekB.length).toBeGreaterThan(100);
    const temiz = (await durumAl(y)).degisiklik as { degisti: boolean; sonDisaAktarma: string | null };
    expect(temiz.degisti).toBe(false);
    expect(temiz.sonDisaAktarma).toMatch(/^\d{4}-/);
    // Kilitleyip açmak değişiklik sayılmaz.
    await istek(y, '/platform/kasa/kilitle', {});
    expect((await istek(y, '/platform/kasa/ac', { parola: PAROLA_B })).durum).toBe(200);
    expect(((await durumAl(y)).degisiklik as { degisti: boolean }).degisti).toBe(false);
    await istek(y, '/platform/proje/kaydet', { ad: 'B projesi 2' });
    expect(((await durumAl(y)).degisiklik as { degisti: boolean }).degisti).toBe(true);
  });

  test('iş sürerken (koşu) kapatma, değiştirme, yeni alan ve proje silme açık mesajla reddedilir', async () => {
    await istek(y, '/test/mesgul', { deger: true });
    try {
      for (const [yol, govde] of [
        ['/platform/calisma-alani/kapat', {}], ['/platform/calisma-alani/ac', { id: 'ilk', parola: PAROLA_A }], ['/platform/calisma-alani/olustur', { ad: 'Üçüncü' }]
      ] as const) {
        const r = await istek(y, yol, govde);
        expect(r.durum, yol).toBe(409);
        expect(r.govde).toMatchObject({ kod: 'MESGUL' });
        expect(String(r.govde.mesaj)).toContain('test koşusu sürüyor');
      }
      const projeId = String(((await istek(y, '/platform/projeler')).govde.projeler as Array<{ id: string }>)[0].id);
      const sil = await istek(y, '/platform/proje/sil', { id: projeId, onayAdi: 'B projesi' });
      expect(sil.durum).toBe(400);
      expect(String(sil.govde.mesaj)).toContain('koşusu sürüyor');
      expect((await durumAl(y)).calismaAlani).toMatchObject({ id: bId });
      expect((await alanlar(y)).map((a) => a.ad)).not.toContain('Üçüncü');
    } finally {
      await istek(y, '/test/mesgul', { deger: false });
    }
  });

  test('yanlış parola beklemesi çalışma alanı başına; doğru parolayla değiştirilir; açık olan kaldırılamaz', async () => {
    test.setTimeout(60_000);
    const yanlis = await istek(y, '/platform/calisma-alani/ac', { id: 'ilk', parola: 'yanlis-parola-123' });
    expect(yanlis.durum).toBe(403);
    expect(yanlis.govde.kod).toBe('PAROLA_YANLIS');
    // Açık alan (B) değişmedi; "ilk" için bekleme var, B için yok.
    expect((await durumAl(y)).calismaAlani).toMatchObject({ id: bId });
    const liste = await alanlar(y);
    expect(liste.find((a) => a.id === 'ilk')?.beklemeSaniye).toBeGreaterThan(0);
    expect(liste.find((a) => a.id === bId)?.beklemeSaniye).toBe(0);
    const bekle = await istek(y, '/platform/calisma-alani/ac', { id: 'ilk', parola: PAROLA_A });
    expect(bekle.durum).toBe(429);
    expect(bekle.govde.kod).toBe('COK_DENEME');
    // B'nin kasa kilidi bekleme yok (sayaç alan başına).
    await istek(y, '/platform/kasa/kilitle', {});
    expect((await istek(y, '/platform/kasa/ac', { parola: PAROLA_B })).durum).toBe(200);
    await new Promise((c) => setTimeout(c, 1100));
    const ac = await istek(y, '/platform/calisma-alani/ac', { id: 'ilk', parola: PAROLA_A });
    expect(ac.durum).toBe(200);
    const d = await durumAl(y);
    expect(d.calismaAlani).toMatchObject({ id: 'ilk' });
    expect((d.kasa as { acik: boolean }).acik).toBe(true);
    expect(((await istek(y, '/platform/projeler')).govde.projeler as Array<{ ad: string }>).map((p) => p.ad)).toEqual(['Eski proje']);
    const kaldir = await istek(y, '/platform/calisma-alani/kaldir', { id: 'ilk', onayAdi: 'Çalışma alanı 1' });
    expect(kaldir.durum).toBe(409);
    expect(kaldir.govde.kod).toBe('ACIK');
    expect(kayitDefteriniOku(k.yol)?.sonAcilan).toBe('ilk');
  });

  test('yedeği YENİ bir çalışma alanına yükle: alan oluşturulur, yedeğin parolası o alanın kasa parolası olur', async () => {
    test.setTimeout(60_000);
    const r = await istek(y, '/platform/calisma-alani/olustur', { ad: 'Üçüncü' });
    const ucId = String((r.govde.calismaAlani as { id: string }).id);
    const yukle = await fetch(`${y.adres}/platform/yedek/ice-aktar`, {
      method: 'POST', body: new Uint8Array(yedekB),
      headers: { 'content-type': 'application/octet-stream', 'x-test-sunucu-token': y.token, 'x-kasa-parola': encodeURIComponent(PAROLA_B) }
    });
    expect(yukle.status).toBe(202);
    const isId = String(((await yukle.json()) as { isId: string }).isId);
    let durum = '';
    for (let i = 0; i < 200 && durum !== 'hazir'; i++) {
      durum = String(((await istek(y, `/platform/yedek/ice-aktar/${isId}`)).govde.is as { durum: string }).durum);
      if (durum === 'hata') throw new Error('içe aktarma hazırlığı başarısız');
      if (durum !== 'hazir') await new Promise((c) => setTimeout(c, 100));
    }
    expect((await istek(y, `/platform/yedek/ice-aktar/${isId}/uygula`, { tumu: true })).durum).toBe(200);
    expect(existsSync(join(k.yol, 'calisma-alanlari', ucId, 'platform.db'))).toBe(true);
    expect(((await istek(y, '/platform/projeler')).govde.projeler as Array<{ ad: string }>).map((p) => p.ad)).toEqual(['B projesi']);
    expect((await alanlar(y)).find((a) => a.id === ucId)).toMatchObject({ aktif: true, veritabaniVar: true, projeSayisi: 1 });
    // Diğer alanlar etkilenmedi.
    expect(existsSync(join(k.yol, 'calisma-alanlari', bId, 'platform.db'))).toBe(true);
    // Kapat ve kaldır (sonraki test iki alanla sürer).
    expect((await istek(y, '/platform/calisma-alani/kapat', {})).durum).toBe(200);
    expect((await istek(y, '/platform/calisma-alani/kaldir', { id: ucId, onayAdi: 'Üçüncü' })).durum).toBe(200);
    expect((await istek(y, '/platform/calisma-alani/ac', { id: 'ilk', parola: PAROLA_A })).durum).toBe(200);
  });

  test('kapat: kasa kilitlenir, başlangıç ekranı (açık alan yok), açılışta da seçim; kapalı alan kaldırılabilir', async () => {
    const r = await istek(y, '/platform/calisma-alani/kapat', {});
    expect(r.durum).toBe(200);
    const d = await durumAl(y);
    expect(d.calismaAlani).toBeNull();
    expect(d.veritabaniVar).toBe(false);
    expect(kayitDefteriniOku(k.yol)?.sonAcilan).toBeNull();
    // Açık alan yokken kasa/ayar uçları açık bir hata döner.
    const p = await istek(y, '/platform/projeler');
    expect(p.durum).toBe(409);
    // Yarım kalmış (kasası olmayan) alan kapatılınca iz bırakmaz.
    const bos = await istek(y, '/platform/calisma-alani/olustur', { ad: 'Yarım' });
    const bosId = String((bos.govde.calismaAlani as { id: string }).id);
    expect(existsSync(join(k.yol, 'calisma-alanlari', bosId))).toBe(true);
    await istek(y, '/platform/calisma-alani/kapat', {});
    expect(existsSync(join(k.yol, 'calisma-alanlari', bosId))).toBe(false);
    expect((await alanlar(y)).map((a) => a.ad).sort()).toEqual(['Çalışma alanı 1', 'İkinci']);
    // B'yi kaldır (onay adı gerekli).
    expect((await istek(y, '/platform/calisma-alani/kaldir', { id: bId, onayAdi: 'ikinci' })).durum).toBe(400);
    expect((await istek(y, '/platform/calisma-alani/kaldir', { id: bId, onayAdi: 'İkinci' })).durum).toBe(200);
    expect(existsSync(join(k.yol, 'calisma-alanlari', bId))).toBe(false);
    expect(existsSync(join(k.yol, 'platform.db'))).toBe(true);
  });
});
