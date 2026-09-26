// KORUMA TESTİ — "Eski proje dosyalarını aktar" (Galaksi adaptörü) EŞDEĞERLİĞİ ve "veri YALNIZCA
// veritabanında" kuralı. SAHTE değerli örnek eski dosyalar (tests/birim/fixtures/ornek-eski-dosyalar/)
// ve sahte ortam değişkenleriyle çalışır; gerçek proje verisine dokunmaz, siteye bağlanmaz.
// Geçici bir veritabanına (rastgele, yazdırılmayan kasa parolasıyla) aktarılır; ardından:
//   - test listesi aktarım sırasında GEÇİCİ bir veritabanı üzerinden alınır (testler dosya okumaz) ve
//     veritabanındaki senaryolar = veritabanıyla alınan "playwright test --list" (her iki ortam),
//   - veritabanından okunan yükleyiciler (ortak, ürün verileri, taban adres, giriş bilgisi, ekran
//     modeli) örnek dosyaların içeriğiyle DERİN EŞİT (anahtar sırası dahil),
//   - koşu listesi filtresi (varsayılan liste) yalnızca "Koşuda" olmayanları çıkarır,
//   - veritabanı ya da kasa anahtarı yokken açık Türkçe hata ("Veritabanı hazır değil — ..."),
//   - gizli değerler veritabanı dosyasında düz metin değil,
//   - ikinci aktarım hiçbir şey eklemez/değiştirmez; kaynak klasörde .env varsa değerleri önceliklidir.
import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { cpSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { expect, test } from '@playwright/test';
import { kasaOlustur, parolayiDogrula } from '../../scripts/platform/kasa.mjs';
import { veritabaniniHazirla } from '../../scripts/platform/veritabani/depo.mjs';
import { aktarimiUygula } from '../../scripts/platform/aktarim/motor.mjs';
import { adaptorBul } from '../../projeler/index.mjs';
import { ekranModeliniKur, ekranModeliniYukle } from '../support/ekran-modeli';
import {
  getEnvironment, girisKimligi, girisTarifi, hasCredentials, type EnvironmentName
} from '../support/environments';
import { galaksiGirisTarifi } from '../../projeler/galaksi/giris-tarifi.mjs';
import { girisTarifiniDogrula } from '../../scripts/platform/giris/tarif.mjs';
import { kasaAnahtariniHazirla } from '../support/platform-kasa';
import { VERITABANI_HAZIR_DEGIL, platformOnbelleginiSifirla, platformVerisi } from '../support/platform-veri';
import {
  loadJetDaskData, loadJetIlkAtesKonutData, loadJetKaskoData, loadJetKaskoYkData, loadJetKobiData, loadJetKonutData,
  loadJetSaglikData, loadJetSeyahatData, loadOrtakData
} from '../support/test-data';
import { HIZLI_KDF, ORNEK_ESKI_DOSYALAR, ORNEK_MODEL_DOSYASI, SAHTE_ORTAM_DEGISKENLERI, geciciKlasor, ornekVeri } from './platform-ortak';

const KOK = resolve(__dirname, '..', '..');
const ORTAMLAR: EnvironmentName[] = ['test', 'canli'];
/** Test verisi profili olarak aktarılan ortak bölümler (projeler/galaksi/aktarim.mjs > VERI_BOLUMLERI). */
const TEST_VERISI_BOLUMLERI: ReadonlyArray<readonly string[]> = [['kimlikBilgileri'], ['adresBilgileri'], ['odeme', 'krediKarti']];
/** Yükleyici → eski dosya adı. */
const URUN_YUKLEYICILERI: ReadonlyArray<[string, (o: EnvironmentName) => unknown]> = [
  ['jet-dask', loadJetDaskData], ['jet-ilk-ates-konut', loadJetIlkAtesKonutData], ['jet-kasko', loadJetKaskoData],
  ['jet-kasko-yk', loadJetKaskoYkData], ['jet-kobi', loadJetKobiData], ['jet-konut', loadJetKonutData],
  ['jet-saglik', loadJetSaglikData], ['jet-seyahat', loadJetSeyahatData]
];

/** İç içe Playwright (bu birim worker'ından) için temiz ortam. */
function altSurecOrtami(ek: Record<string, string>): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (/^(TEST_WORKER_INDEX|TEST_PARALLEL_INDEX|PW_|PLAYWRIGHT_(?!BROWSERS_PATH)|PLATFORM_|TEST_SUNUCU_)/.test(k)) continue;
    env[k] = v;
  }
  return { ...env, ...ek };
}

/** "playwright test --list" (dosya::başlık) + çıktı metni (hata mesajları için). */
function testListesi(ek: Record<string, string>): { liste: string[]; cikti: string } {
  const r = spawnSync(process.execPath, [join(KOK, 'node_modules', '@playwright', 'test', 'cli.js'), 'test', '--list', '--reporter=json'], {
    cwd: KOK, env: altSurecOrtami(ek), encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, windowsHide: true
  });
  type Suite = { file?: string; suites?: Suite[]; specs?: Array<{ file?: string; title: string }>; errors?: Array<{ message?: string }> };
  const liste: string[] = [];
  let veri: Suite | undefined;
  try { veri = JSON.parse(r.stdout) as Suite; } catch { veri = undefined; }
  if (veri) {
    (function gez(s: Suite, ust?: string): void {
      const dosya = s.file ?? ust;
      for (const alt of s.suites ?? []) gez(alt, dosya);
      for (const sp of s.specs ?? []) liste.push(`${sp.file ?? dosya}::${sp.title}`);
    })(veri);
  }
  const hatalar = (veri?.errors ?? []).map((e) => e.message ?? '').join('\n');
  return { liste, cikti: `${r.stdout ?? ''}\n${r.stderr ?? ''}\n${hatalar}` };
}

/** Test verisi profillerindeki tüm alan değerleri (en az 4 karakterlik metinler; 4 haneli sayılar hariç). */
function ortakGizlileri(ortak: unknown): string[] {
  const sonuc: string[] = [];
  const gez = (d: unknown): void => {
    if (Array.isArray(d)) d.forEach(gez);
    else if (typeof d === 'object' && d !== null) Object.values(d).forEach(gez);
    else if (typeof d === 'string' && d.length >= 4 && !/^\d{4}$/.test(d)) sonuc.push(d);
  };
  for (const yol of TEST_VERISI_BOLUMLERI) {
    gez(yol.reduce<unknown>((n, k) => (typeof n === 'object' && n !== null ? (n as Record<string, unknown>)[k] : undefined), ortak));
  }
  return sonuc;
}

/** Tasarım gereği düz metin kalan kaynakların metni (ekran modelleri, adaptörün alan etiketleri, test başlıkları). */
function acikKaynakMetni(ekler: string[]): string {
  const klasor = join(ORNEK_ESKI_DOSYALAR, 'tests', 'ekran-modelleri');
  const modeller = readdirSync(klasor).filter((d) => d.endsWith('.json')).map((d) => readFileSync(join(klasor, d), 'utf-8')).join('\n');
  return `${modeller}\n${readFileSync(join(KOK, 'projeler', 'galaksi', 'aktarim.mjs'), 'utf-8')}\n${ekler.join('\n')}`;
}

test.describe('Eski proje dosyası aktarımı — veritabanı eşdeğerliği (örnek dosyalar)', () => {
  test.describe.configure({ mode: 'serial' });

// Galaksi temizliği A aşaması: kodlu testler (tests/scenarios) silindi; bu test eski "kodlu test" yolunu sınıyor —
// C aşamasında model tabanlı örnekle yeniden yazılacak ya da kaldırılacak.
  test.fixme('liste geçici veritabanından; yükleyiciler örnek dosyalarla aynı; yalnızca veritabanı; gizliler şifreli; tekrarlanabilir', async () => {
    test.setTimeout(240_000);
    const klasor = geciciKlasor('esdegerlik');
    const eskiEnv = { ...process.env };
    try {
      for (const k of Object.keys(process.env)) if (k.startsWith('PLATFORM_')) delete process.env[k];
      const adaptor = adaptorBul('galaksi');
      if (!adaptor) throw new Error('galaksi adaptörü kayıtlı değil');
      expect(adaptor.algila(ORNEK_ESKI_DOSYALAR)).toEqual({ var: true, ortamlar: ['test', 'canli'] });
      expect(adaptor.algila(klasor.yol).var).toBe(false);

      // 1) Aktarım: test listesi verilmez → paket geçici bir veritabanına uygulanıp liste oradan alınır.
      const paket = await adaptor.paketOlustur(ORNEK_ESKI_DOSYALAR, { projeKoku: KOK, ortamDegiskenleri: { ...SAHTE_ORTAM_DEGISKENLERI } });
      expect(paket.uyarilar.filter((u) => /test listesi alınamadı/.test(u)), paket.uyarilar.join('\n')).toEqual([]);
      const yol = join(klasor.yol, 'platform.db');
      const parola = randomBytes(24).toString('base64url');
      const vt = await veritabaniniHazirla(yol);
      await kasaOlustur(vt, parola, { kdf: HIZLI_KDF });
      aktarimiUygula(vt, paket);
      // İkinci aktarım (aynı liste): hiçbir şey eklenmez/değişmez/kaldırılmaz.
      const listeler = Object.fromEntries(ORTAMLAR.map((o) => [o, paket.senaryolar
        .filter((s) => (s.icerik.ortamlar as Record<string, unknown>)[o] !== undefined)
        .map((s) => s.icerik.kaynak as { dosya: string; ad: string })]));
      const tekrar = aktarimiUygula(vt, await adaptor.paketOlustur(ORNEK_ESKI_DOSYALAR, {
        projeKoku: KOK, ortamDegiskenleri: { ...SAHTE_ORTAM_DEGISKENLERI }, testListesi: async (o) => listeler[o] ?? []
      }));
      expect(Object.values(tekrar.sayimlar).every((x) => x.yeni === 0 && x.guncellenecek === 0 && x.kaldirilacak === 0)).toBe(true);
      const anahtar = (await parolayiDogrula(vt, parola))?.toString('base64url');
      const dahilOlmayanlar = new Set(vt.tumu('SELECT icerik_json FROM senaryolar WHERE kosuya_dahil = 0')
        .map((s) => { const k = JSON.parse(String(s.icerik_json)).kaynak as { dosya: string; ad: string }; return `${k.dosya}::${k.ad}`; }));
      vt.kapat();
      if (!anahtar) throw new Error('anahtar türetilemedi');
      expect(dahilOlmayanlar.size, 'örnek koşu listesinde hariç tutulan senaryo olmalı').toBeGreaterThan(0);

      const modelDosyadan = ekranModeliniYukle(ORNEK_MODEL_DOSYASI);
      const tumBasliklar: string[] = [];
      for (const ortam of ORTAMLAR) {
        // 2) Yükleyiciler veritabanından (anahtar + geçici veritabanı): örnek dosyalarla derin eşit.
        process.env.PLATFORM_VERITABANI = yol;
        process.env.PLATFORM_KASA_ANAHTARI = anahtar;
        platformOnbelleginiSifirla();
        expect(JSON.stringify(loadOrtakData(ortam)), `${ortam}: ortak`).toBe(JSON.stringify(ornekVeri(ortam, 'ortak')));
        for (const [dosya, yukle] of URUN_YUKLEYICILERI) {
          expect(JSON.stringify(yukle(ortam)), `${ortam}: ${dosya}`).toBe(JSON.stringify(ornekVeri(ortam, dosya)));
        }
        const buyukAd = ortam.toUpperCase() as 'TEST' | 'CANLI';
        expect(getEnvironment(ortam).baseURL).toBe(SAHTE_ORTAM_DEGISKENLERI[`${buyukAd}_BASE_URL`]);
        expect(hasCredentials(ortam)).toBe(true);
        const kimlik = girisKimligi(ortam);
        expect(kimlik.kullaniciAdi).toBe(SAHTE_ORTAM_DEGISKENLERI.LOGIN_USERNAME);
        expect(kimlik.parola).toBe(SAHTE_ORTAM_DEGISKENLERI[`${buyukAd}_PASSWORD`]);
        if (ortam === 'canli') expect(kimlik.totpGizli).toBe(SAHTE_ORTAM_DEGISKENLERI.CANLI_AUTH_SECRET);
        else expect(kimlik.totpGizli).toBeNull();
        // Giriş tarifi: aktarımda ortam ayarlarına yazılan Galaksi tarifi (eski LoginPage davranışı).
        const beklenenTarif = girisTarifiniDogrula(galaksiGirisTarifi({
          ortamAnahtari: ortam, basariMetni: ornekVeri<{ login: { basariGostergeMetni: string } }>(ortam, 'ortak').login.basariGostergeMetni,
          ikiAsamaliTur: ortam === 'canli' ? 'totp' : null
        })).tarif;
        expect(girisTarifi(ortam)).toEqual(beklenenTarif);
        expect(platformVerisi(ortam).girisTarifi?.kaynak).toBe('kayitli');
        expect(girisTarifi(ortam).ikinciAdim.tur).toBe(ortam === 'canli' ? 'totp' : 'yok');
        const modelVtden = ekranModeliniKur('jet-seyahat.model.json', platformVerisi(ortam).ekranModelleri);
        expect(modelVtden.model).toEqual(modelDosyadan.model);
        expect(modelVtden.altModeller).toEqual(modelDosyadan.altModeller);
        delete process.env.PLATFORM_VERITABANI;
        delete process.env.PLATFORM_KASA_ANAHTARI;
        platformOnbelleginiSifirla();

        // 3) Playwright listesi veritabanından: tümü = veritabanındaki senaryolar; varsayılan = tümü − "Koşuda" olmayanlar.
        const ortakEnv = { TEST_ENV: ortam, PLATFORM_VERITABANI: yol, PLATFORM_KASA_ANAHTARI: anahtar };
        const tumu = testListesi({ ...ortakEnv, TEST_SUNUCU_TUM_LISTE: '1' });
        expect(tumu.liste.length, `${ortam} listesi boş olmamalı`).toBeGreaterThan(0);
        expect([...tumu.liste].sort()).toEqual(listeler[ortam].map((k) => `${k.dosya}::${k.ad}`).sort());
        const varsayilan = testListesi(ortakEnv);
        expect(varsayilan.liste).toEqual(tumu.liste.filter((b) => !dahilOlmayanlar.has(b)));
        tumBasliklar.push(...tumu.liste);
        test.info().annotations.push({ type: 'liste', description: `${ortam}: tümü ${tumu.liste.length}, koşuda ${varsayilan.liste.length}` });
      }

      // 4) Yalnızca veritabanı: anahtar yoksa ya da veritabanı yoksa açık hata (dosyaya düşülmez).
      const anahtarsiz = testListesi({ TEST_ENV: 'test', TEST_SUNUCU_TUM_LISTE: '1', PLATFORM_VERITABANI: yol });
      expect(anahtarsiz.liste).toEqual([]);
      expect(anahtarsiz.cikti).toContain(VERITABANI_HAZIR_DEGIL);
      expect(anahtarsiz.cikti).toContain('kasa anahtarı yok');
      const vtYok = testListesi({ TEST_ENV: 'test', PLATFORM_VERITABANI: join(klasor.yol, 'yok.db'), PLATFORM_KASA_ANAHTARI: anahtar });
      expect(vtYok.liste).toEqual([]);
      expect(vtYok.cikti).toContain(VERITABANI_HAZIR_DEGIL);
      process.env.PLATFORM_VERITABANI = join(klasor.yol, 'yok.db');
      platformOnbelleginiSifirla();
      expect(() => platformVerisi('test')).toThrow(VERITABANI_HAZIR_DEGIL);
      process.env.PLATFORM_VERITABANI = yol;
      platformOnbelleginiSifirla();
      expect(() => platformVerisi('test')).toThrow(/kasa anahtarı yok/);

      // 5) Gizli değerler veritabanı dosyasında düz metin olarak geçmemeli (değerler yazdırılmaz).
      const gizliler = new Set<string>(Object.values(SAHTE_ORTAM_DEGISKENLERI).filter((d) => d.length >= 4));
      const acikMetin = acikKaynakMetni(tumBasliklar);
      let acikKaynaktaGecen = 0;
      for (const ortam of ORTAMLAR) {
        for (const g of ortakGizlileri(ornekVeri(ortam, 'ortak'))) {
          if (acikMetin.includes(g)) acikKaynaktaGecen++;
          else gizliler.add(g);
        }
      }
      const bayt = readFileSync(yol);
      const sizanlar = [...gizliler].filter((g) => bayt.includes(Buffer.from(g, 'utf8')));
      expect(sizanlar.length, `${sizanlar.length}/${gizliler.size} gizli değer veritabanında düz metin`).toBe(0);
      test.info().annotations.push({ type: 'gizli-kontrol', description: `${gizliler.size} değer kontrol edildi (açık kaynakta da geçen ${acikKaynaktaGecen} değer hariç)` });
      expect(gizliler.size, 'test verisi profillerinden kontrol edilecek değer bulunmalı').toBeGreaterThan(10);

      // 6) Terminal koşusu (global-setup): TTY yoksa ve parola verilmemişse açık hata; PLATFORM_KASA_PAROLASI
      // verilirse anahtar türetilip yalnızca süreç ortamına konur ve parola değişkeni silinir.
      expect(process.stdin.isTTY).toBeFalsy();
      await expect(kasaAnahtariniHazirla()).rejects.toThrow(/PLATFORM_KASA_PAROLASI/);
      process.env.PLATFORM_KASA_PAROLASI = `${parola}-yanlis`;
      await expect(kasaAnahtariniHazirla()).rejects.toThrow(/kasa açılamadı/);
      expect(process.env.PLATFORM_KASA_PAROLASI).toBeUndefined();
      process.env.PLATFORM_KASA_PAROLASI = parola;
      await kasaAnahtariniHazirla();
      expect(process.env.PLATFORM_KASA_PAROLASI).toBeUndefined();
      expect(process.env.PLATFORM_KASA_ANAHTARI === anahtar).toBe(true);
      expect(platformVerisi('test').tabanUrl).toBe(SAHTE_ORTAM_DEGISKENLERI.TEST_BASE_URL);
      process.env.PLATFORM_VERITABANI = join(klasor.yol, 'yok.db');
      delete process.env.PLATFORM_KASA_ANAHTARI;
      platformOnbelleginiSifirla();
      await expect(kasaAnahtariniHazirla()).rejects.toThrow(VERITABANI_HAZIR_DEGIL);

      // 7) Kaynak klasör seçimi: klasördeki .env değerleri önceliklidir (başka makinede eski dosyalarla aktarım).
      const kopya = join(klasor.yol, 'baska-makine');
      cpSync(ORNEK_ESKI_DOSYALAR, kopya, { recursive: true });
      writeFileSync(join(kopya, '.env'), 'TEST_BASE_URL=https://klasor.ornek.invalid\n');
      const klasorPaketi = await adaptor.paketOlustur(kopya, { projeKoku: KOK, ortamDegiskenleri: { ...SAHTE_ORTAM_DEGISKENLERI }, testListesi: async () => [] });
      expect(klasorPaketi.ortamlar.find((o) => o.anahtar === 'test')?.tabanUrl).toBe('https://klasor.ornek.invalid');
      expect(klasorPaketi.ortamlar.find((o) => o.anahtar === 'canli')?.tabanUrl).toBe(SAHTE_ORTAM_DEGISKENLERI.CANLI_BASE_URL);
    } finally {
      for (const k of Object.keys(process.env)) if (!(k in eskiEnv)) delete process.env[k];
      Object.assign(process.env, eskiEnv);
      platformOnbelleginiSifirla();
      klasor.temizle();
    }
  });
});
