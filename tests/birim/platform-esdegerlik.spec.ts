// KORUMA TESTİ — "mevcut proje dosyalarını aktar" EŞDEĞERLİĞİ (gerçek proje dosyalarıyla).
// Geçici bir veritabanına (rastgele, yazdırılmayan kasa parolasıyla) tests/data + .env aktarılır;
// ardından her iki ortam için:
//   - veritabanından okunan yükleyiciler (loadOrtakData, ürün yükleyicileri, taban adres, giriş
//     bilgisi) dosya yükleyicileriyle DERİN EŞİT olmalı,
//   - "playwright test --list --reporter=json" çıktısı (başlıklar, sıra, annotation'lar) dosya ve
//     veritabanı kaynağında AYNI olmalı (TEST_SUNUCU_TUM_LISTE=1 ile ve koşu listesi filtresiyle),
//   - veritabanı dosyasında .env/ortak.json'daki gizli değerler düz metin olarak geçmemeli,
//   - ikinci aktarım hiçbir şey eklememeli/değiştirmemeli.
// Proje dosyaları yoksa (ör. başka bir projede) atlanır. Gerçek dosyalara YAZMAZ; siteye bağlanmaz.
import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { expect, test } from '@playwright/test';
import { parse as dotenvAyristir } from 'dotenv';
import { kasaOlustur, parolayiDogrula } from '../../scripts/platform/kasa.mjs';
import { veritabaniniHazirla } from '../../scripts/platform/veritabani/depo.mjs';
import { aktarimiUygula } from '../../scripts/platform/aktarim/motor.mjs';
import { adaptorBul } from '../../projeler/index.mjs';
import {
  credentialsFromEnvironment, getEnvironment, hasCredentials, type EnvironmentName
} from '../support/environments';
import { kasaAnahtariniHazirla } from '../support/platform-kasa';
import { platformOnbelleginiSifirla, platformVerisi } from '../support/platform-veri';
import {
  loadJetDaskData, loadJetIlkAtesKonutData, loadJetKaskoData, loadJetKaskoYkData, loadJetKobiData, loadJetKonutData,
  loadJetSaglikData, loadJetSeyahatData, loadOrtakData
} from '../support/test-data';
import { HIZLI_KDF, geciciKlasor } from './platform-ortak';

const KOK = resolve(__dirname, '..', '..');
const DOSYALAR_VAR = existsSync(join(KOK, 'tests', 'data', 'test', 'ortak.json'));
const ORTAMLAR: EnvironmentName[] = ['test', 'canli'];
const HASSAS_ORTAK_ALANLARI = new Set([
  'tcKimlikNo', 'vergiKimlikNo', 'pasaportNo', 'yabanciKimlikNo', 'dogumTarihi', 'cepTelefonu', 'ad', 'soyad', 'babaAdi', 'kartNo', 'guvenlikKodu'
]);
const GIZLI_ORTAM_DEGISKENLERI = ['TEST_BASE_URL', 'CANLI_BASE_URL', 'LOGIN_USERNAME', 'TEST_USERNAME', 'TEST_PASSWORD', 'CANLI_PASSWORD', 'CANLI_AUTH_SECRET', 'CANLI_AUTH_CODE'];

/** İç içe Playwright (bu birim worker'ından) için temiz ortam. */
function altSurecOrtami(ek: Record<string, string>): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (/^(TEST_WORKER_INDEX|TEST_PARALLEL_INDEX|PW_|PLAYWRIGHT_(?!BROWSERS_PATH)|PLATFORM_)/.test(k)) continue;
    env[k] = v;
  }
  return { ...env, ...ek };
}

function testListesi(ek: Record<string, string>): string[] {
  const r = spawnSync(process.execPath, [join(KOK, 'node_modules', '@playwright', 'test', 'cli.js'), 'test', '--list', '--reporter=json'], {
    cwd: KOK, env: altSurecOrtami(ek), encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, windowsHide: true
  });
  type Suite = { file?: string; suites?: Suite[]; specs?: Array<{ file?: string; title: string; tests: Array<{ annotations: unknown[] }> }> };
  const veri = JSON.parse(r.stdout) as Suite;
  const liste: string[] = [];
  (function gez(s: Suite, ust?: string): void {
    const dosya = s.file ?? ust;
    for (const alt of s.suites ?? []) gez(alt, dosya);
    for (const sp of s.specs ?? []) liste.push(`${sp.file ?? dosya}::${sp.title}::${JSON.stringify(sp.tests.map((t) => t.annotations))}`);
  })(veri);
  return liste;
}

/** Yükleyicilerin bir ortam için ürettiği her şey (kimlik bilgisi dahil — yalnızca karşılaştırılır, yazdırılmaz). */
function tumYukleyiciler(ortam: EnvironmentName): Record<string, unknown> {
  let kimlik: unknown;
  try {
    kimlik = credentialsFromEnvironment(ortam);
  } catch (hata) {
    kimlik = { hata: 'kimlik bilgisi yok' };
  }
  return {
    ortak: loadOrtakData(ortam),
    jetDask: loadJetDaskData(ortam),
    jetIlkAtesKonut: loadJetIlkAtesKonutData(ortam),
    jetKasko: loadJetKaskoData(ortam),
    jetKaskoYk: loadJetKaskoYkData(ortam),
    jetKobi: loadJetKobiData(ortam),
    jetKonut: loadJetKonutData(ortam),
    jetSaglik: loadJetSaglikData(ortam),
    jetSeyahat: loadJetSeyahatData(ortam),
    tabanUrl: getEnvironment(ortam).baseURL,
    kimlikVar: hasCredentials(ortam),
    kimlik
  };
}

/**
 * ortak.json'daki HASSAS alan değerleri (kimlik no, telefon, doğum tarihi, kart...), en az 4 karakter.
 * NOT: Acente kodları (kullaniciDegistir) veritabanında şifreli saklanır ama aynı kodlar Git'teki
 * ekran modelinde ve test başlıklarında da açıkça geçtiği için bu bayt kontrolüne katılmaz.
 */
function ortakGizlileri(ortak: unknown): string[] {
  const sonuc: string[] = [];
  const gez = (d: unknown, anahtar: string): void => {
    if (Array.isArray(d)) d.forEach((x) => gez(x, anahtar));
    else if (typeof d === 'object' && d !== null) for (const [k, v] of Object.entries(d)) gez(v, k);
    else if (typeof d === 'string' && d.length >= 4 && HASSAS_ORTAK_ALANLARI.has(anahtar)) sonuc.push(d);
  };
  gez(ortak, '');
  return sonuc;
}

test.describe('Proje dosyası aktarımı — dosya ve veritabanı eşdeğerliği', () => {
  test.skip(!DOSYALAR_VAR, 'Proje veri dosyaları yok (tests/data/test/ortak.json).');
  test.describe.configure({ mode: 'serial' });

  test('yükleyiciler, test listesi ve koşu listesi iki kaynakta aynı; gizliler diskte düz metin değil; aktarım tekrarlanabilir', async () => {
    test.setTimeout(120_000);
    const klasor = geciciKlasor('esdegerlik');
    const envDosyasi = join(KOK, '.env');
    const envDegerleri = existsSync(envDosyasi) ? dotenvAyristir(readFileSync(envDosyasi)) : {};
    const eskiEnv = { ...process.env };
    try {
      // .env yükleyicilerin gördüğü gibi (process.env'de olmayanlar) eklenir; test sonunda geri alınır.
      for (const [k, v] of Object.entries(envDegerleri)) if (process.env[k] === undefined) process.env[k] = v;
      for (const k of Object.keys(process.env)) if (k.startsWith('PLATFORM_')) delete process.env[k];

      const yol = join(klasor.yol, 'platform.db');
      const parola = randomBytes(24).toString('base64url');
      const vt = await veritabaniniHazirla(yol);
      await kasaOlustur(vt, parola, { kdf: HIZLI_KDF });
      const adaptor = adaptorBul('galaksi');
      if (!adaptor) throw new Error('galaksi adaptörü kayıtlı değil');
      const paketUret = () => adaptor.paketOlustur(KOK, {
        ortamDegiskenleri: process.env,
        testListesi: async (ortam) => testListesi({ TEST_ENV: ortam, TEST_SUNUCU_TUM_LISTE: '1', PLATFORM_VERI_KAYNAGI: 'dosya' })
          .map((s) => { const [dosya, ad] = s.split('::'); return { dosya, ad }; })
      });
      aktarimiUygula(vt, await paketUret());
      const tekrar = aktarimiUygula(vt, await paketUret());
      expect(Object.values(tekrar.sayimlar).every((x) => x.yeni === 0 && x.guncellenecek === 0 && x.kaldirilacak === 0)).toBe(true);
      const anahtar = (await parolayiDogrula(vt, parola))?.toString('base64url');
      vt.kapat();
      if (!anahtar) throw new Error('anahtar türetilemedi');

      for (const ortam of ORTAMLAR) {
        process.env.PLATFORM_VERI_KAYNAGI = 'dosya';
        platformOnbelleginiSifirla();
        const dosyadan = tumYukleyiciler(ortam);

        delete process.env.PLATFORM_VERI_KAYNAGI;
        process.env.PLATFORM_VERITABANI = yol;
        process.env.PLATFORM_KASA_ANAHTARI = anahtar;
        platformOnbelleginiSifirla();
        expect(platformVerisi(ortam), `${ortam}: veri gerçekten veritabanından gelmeli`).not.toBeNull();
        const vtden = tumYukleyiciler(ortam);
        expect(vtden, `${ortam}: yükleyiciler derin eşit olmalı`).toEqual(dosyadan);
        expect(JSON.stringify(vtden), `${ortam}: anahtar sırası dahil aynı olmalı`).toBe(JSON.stringify(dosyadan));
        delete process.env.PLATFORM_VERITABANI;
        delete process.env.PLATFORM_KASA_ANAHTARI;
        platformOnbelleginiSifirla();

        // Test listesi: tümü (TEST_SUNUCU_TUM_LISTE=1) ve koşu listesi filtresiyle (dahil olanlar).
        for (const tum of [true, false]) {
          const ortak = { TEST_ENV: ortam, ...(tum ? { TEST_SUNUCU_TUM_LISTE: '1' } : {}) };
          const dosyaListesi = testListesi({ ...ortak, PLATFORM_VERI_KAYNAGI: 'dosya' });
          const vtListesi = testListesi({ ...ortak, PLATFORM_VERITABANI: yol, PLATFORM_KASA_ANAHTARI: anahtar });
          const anahtarsizListe = testListesi({ ...ortak, PLATFORM_VERITABANI: yol });
          expect(dosyaListesi.length, `${ortam} listesi boş olmamalı`).toBeGreaterThan(0);
          expect(vtListesi, `${ortam} (${tum ? 'tümü' : 'koşuya dahil'}) listesi aynı olmalı`).toEqual(dosyaListesi);
          expect(anahtarsizListe).toEqual(dosyaListesi);
          test.info().annotations.push({ type: 'liste', description: `${ortam} ${tum ? 'tümü' : 'dahil'}: ${dosyaListesi.length}` });
        }
      }

      // Gizli değerler veritabanı dosyasında düz metin olarak geçmemeli (değerler yazdırılmaz).
      const gizliler = new Set<string>();
      for (const ad of GIZLI_ORTAM_DEGISKENLERI) {
        const deger = process.env[ad];
        if (deger && deger.length >= 4) gizliler.add(deger);
      }
      for (const ortam of ORTAMLAR) {
        const ortakYolu = join(KOK, 'tests', 'data', ortam, 'ortak.json');
        if (existsSync(ortakYolu)) for (const g of ortakGizlileri(JSON.parse(readFileSync(ortakYolu, 'utf-8')))) gizliler.add(g);
      }
      const bayt = readFileSync(yol);
      const sizanlar = [...gizliler].filter((g) => bayt.includes(Buffer.from(g, 'utf8')));
      expect(sizanlar.length, `${sizanlar.length}/${gizliler.size} gizli değer veritabanında düz metin`).toBe(0);
      test.info().annotations.push({ type: 'gizli-kontrol', description: `${gizliler.size} değer kontrol edildi` });

      // Terminal koşusu (global-setup): TTY yoksa ve parola verilmemişse açık hata; PLATFORM_KASA_PAROLASI
      // verilirse anahtar türetilip yalnızca süreç ortamına konur ve parola değişkeni silinir.
      process.env.PLATFORM_VERITABANI = yol;
      platformOnbelleginiSifirla();
      expect(process.stdin.isTTY).toBeFalsy();
      await expect(kasaAnahtariniHazirla()).rejects.toThrow(/PLATFORM_KASA_PAROLASI/);
      process.env.PLATFORM_KASA_PAROLASI = `${parola}-yanlis`;
      await expect(kasaAnahtariniHazirla()).rejects.toThrow(/kasa açılamadı/);
      expect(process.env.PLATFORM_KASA_PAROLASI).toBeUndefined();
      process.env.PLATFORM_KASA_PAROLASI = parola;
      await kasaAnahtariniHazirla();
      expect(process.env.PLATFORM_KASA_PAROLASI).toBeUndefined();
      expect(process.env.PLATFORM_KASA_ANAHTARI === anahtar).toBe(true);
      expect(platformVerisi('test')).not.toBeNull();
    } finally {
      for (const k of Object.keys(process.env)) if (!(k in eskiEnv)) delete process.env[k];
      Object.assign(process.env, eskiEnv);
      platformOnbelleginiSifirla();
      klasor.temizle();
    }
  });
});
