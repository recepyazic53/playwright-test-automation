// KORUMA TESTLERİ — şifreli senaryo dosyaları (ör. senaryoya yüklenen Excel), koşuya özel geçici dosya klasörleri ve
// Ayarlar > Güvenlik > "Yasak adresler".
// Tüm veriler SAHTEDİR (dosya içeriği "SAHTE-…" metni); her test kendi geçici klasöründe, nötr bir örnek projeyle
// (depo işlevleriyle kurulur) çalışır. Gerçek veritabanına dokunulmaz: sunucu testi ayrı bir Nöbetçi örneğidir
// (boş port, geçici veritabanı, TEST_SUNUCU_KOSU_KAPALI=1) ve yalnızca 127.0.0.1'e istek atar.
import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { expect, test } from '@playwright/test';
import type { Veritabani } from '../../scripts/platform/veritabani/baglanti.mjs';
import { kasaOlustur, parolayiDogrula } from '../../scripts/platform/kasa.mjs';
import {
  ekranKaydet, ekranModeliEkle, ortamKaydet, projeKaydet, senaryoKaydet as depoSenaryoKaydet, veritabaniniHazirla
} from '../../scripts/platform/veritabani/depo.mjs';
import { medyaKlasoru } from '../../scripts/platform/medya.mjs';
import {
  SENARYO_DOSYASI_TURU, dosyaReferansi, referansCoz, referanslariCoz, sahipsizSenaryoDosyalariniTemizle, senaryoDosyasiBilgisi,
  senaryoDosyasiEkle
} from '../../scripts/platform/dosyalar/senaryo-dosyalari.mjs';
import {
  DOSYA_KLASORU_DEGISKENI, artikKlasorleriTemizle, geciciDosyaKoku, kosuKlasoruGecerliMi, kosuKlasoruOlustur, kosuKlasorunuSil, sahipYaz
} from '../../scripts/platform/dosyalar/gecici-dosyalar.mjs';
import { etkinYasakAdresler, etkinYasakDesenleri, yasakAdresleriKaydet, yasakAdresleriniNormallestir } from '../../scripts/platform/guvenlik/yasak-adresler.mjs';
import { calistirmaHedefiCoz } from '../../scripts/platform/senaryolar/senaryo-servisi.mjs';
import { yedekDosyasiYaz } from '../../scripts/platform/yedek.mjs';
import globalTeardown from '../support/global-teardown';
import { ornekBasvuruModeli } from './model-fikstur';
import { HIZLI_KDF, POSIX_IZINLERI, geciciKlasor } from './platform-ortak';

const KOK = resolve(__dirname, '..', '..');
const PAROLA = 'Senaryo-Dosyasi-Kasa-Parolasi-5';
/** Ekran ayarındaki düz (henüz şifreli depoya alınmamış) dosya yolu. */
const DUZ_YOL = 'tests/fixtures/ornek-basvuru/urun-listesi.xlsx';
/** Sahte "Excel": zip imzası + sahte metin (gerçek kişi verisi yok). */
const sahteExcel = (etiket: string): Buffer => Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.from(`SAHTE-MUSTERI-LISTESI-${etiket}-${'x'.repeat(300)}`)]);
const IZ = 'SAHTE-MUSTERI-LISTESI';

/** Klasördeki tüm dosyalarda düz metin iz var mı? */
function duzMetinVarMi(klasor: string): string[] {
  if (!existsSync(klasor)) return [];
  const bulunan: string[] = [];
  for (const ad of readdirSync(klasor, { recursive: true }) as string[]) {
    const yol = join(klasor, ad);
    if (statSync(yol).isFile() && readFileSync(yol).includes(IZ)) bulunan.push(ad);
  }
  return bulunan;
}

/** Örnek başvuru modeli; "belge" dosya alanı yalnızca .xlsx kabul eder. */
function dosyaAlanliModel(): Record<string, unknown> {
  const model = ornekBasvuruModeli() as { adimlar: Array<{ bolumler?: Array<{ alanlar: Array<Record<string, unknown>> }> }> };
  for (const adim of model.adimlar) for (const b of adim.bolumler ?? []) for (const a of b.alanlar) if (a.id === 'belge') a.kabul = '.xlsx';
  return model as unknown as Record<string, unknown>;
}

interface NotrKurulum { vt: Veritabani; yol: string; projeId: string; ortamId: string; ekranId: string }

/**
 * Nötr örnek proje: kasa + proje + "Test" ortamı (https://test.ornek.invalid — hiç istek atılmaz) + modelli ekran. Ekranın
 * ayarlarında ortama özel düz bir dosya yolu (DUZ_YOL) bulunur.
 */
async function notrVeritabani(klasor: string): Promise<NotrKurulum> {
  const yol = join(klasor, 'platform.db');
  const vt = await veritabaniniHazirla(yol);
  await kasaOlustur(vt, PAROLA, { kdf: HIZLI_KDF });
  const projeId = projeKaydet(vt, { ad: 'Örnek proje' });
  const ortamId = ortamKaydet(vt, { projeId, ad: 'Test', tabanUrl: 'https://test.ornek.invalid', varsayilan: true, ayarlar: { riskli: false } });
  const ekranId = ekranKaydet(vt, { projeId, anahtar: 'ornek-basvuru', ad: 'Örnek Başvuru', ayarlar: { ortamlar: { [ortamId]: { urunListesi: DUZ_YOL } } } });
  ekranModeliEkle(vt, { ekranId, model: dosyaAlanliModel() });
  return { vt, yol, projeId, ortamId, ekranId };
}

/** Ortamda tanımlı bir model senaryosu (veri: ortamın senaryo verisi). */
function modelSenaryosuEkle(k: NotrKurulum, baslik: string, veri: Record<string, unknown>): string {
  return depoSenaryoKaydet(k.vt, { projeId: k.projeId, ekranId: k.ekranId, baslik, icerik: { kosucu: 'model', ortamlar: { [k.ortamId]: { veri: { baslik, ...veri } } } } });
}

// ---------------------------------------------------------------------------------------
// Şifreli depo + koşu anında çözme
// ---------------------------------------------------------------------------------------

test.describe('Şifreli senaryo dosyaları', () => {
  test('yükleme şifreli yazılır; referans çözülünce koşuya özel 0600 dosya; eksik dosya açık "EKSIK-" yoluna çevrilir', async () => {
    const k = geciciKlasor('senaryo-dosyasi');
    try {
      const { vt, yol, projeId } = await notrVeritabani(k.yol);
      const medya = medyaKlasoru(yol);
      const icerik = sahteExcel('YUKLEME');
      const d = await senaryoDosyasiEkle(vt, { klasor: medya, icerik: Buffer.from(icerik), ad: '../../gizli/liste.xlsx', kabul: '.xlsx', sahipTuru: 'senaryo' });
      expect(d.ad).toBe('liste.xlsx');
      expect(referansCoz(d.referans)).toEqual({ id: d.id, ad: 'liste.xlsx' });
      expect(senaryoDosyasiBilgisi(vt, d.id)).toMatchObject({ ad: 'liste.xlsx', boyut: icerik.length, sahipTuru: 'senaryo' });
      expect(String(vt.tek('SELECT tur FROM medya WHERE id = ?', [d.id])?.tur)).toBe(SENARYO_DOSYASI_TURU);
      // Diskte düz metin YOK (medya klasöründe yalnızca şifreli dosya).
      expect(duzMetinVarMi(medya)).toEqual([]);
      // Uzantı ve boyut denetimi
      await expect(senaryoDosyasiEkle(vt, { klasor: medya, icerik: Buffer.from('a'), ad: 'x.exe', kabul: '.xlsx' })).rejects.toThrow(/yalnızca \.xlsx/);
      await expect(senaryoDosyasiEkle(vt, { klasor: medya, icerik: Buffer.alloc(0), ad: 'x.xlsx', kabul: '.xlsx' })).rejects.toThrow(/Boş dosya/);

      const kok = geciciDosyaKoku(yol, k.yol);
      const kosu = kosuKlasoruOlustur(kok, 'deneme-kosusu');
      expect(kosuKlasoruGecerliMi(kosu, kok)).toBe(true);
      expect(kosuKlasoruGecerliMi(join(kosu, '..', '..'), kok)).toBe(false);
      const eksikRef = dosyaReferansi('00000000-0000-4000-8000-000000000000', 'yok.xlsx');
      const r = await referanslariCoz(vt, { a: { b: d.referans, c: [d.referans, 'düz metin'] }, eksik: eksikRef }, { medyaKlasoru: medya, hedefKlasor: kosu });
      const deger = r.deger as { a: { b: string; c: string[] }; eksik: string };
      expect(deger.a.b).toBe(join(kosu, d.id, 'liste.xlsx'));
      expect(deger.a.c).toEqual([deger.a.b, 'düz metin']);
      expect(readFileSync(deger.a.b).equals(icerik)).toBe(true);
      if (POSIX_IZINLERI) {
        expect(statSync(deger.a.b).mode & 0o777).toBe(0o600);
        expect(statSync(join(kosu, d.id)).mode & 0o777).toBe(0o700);
        expect(statSync(kosu).mode & 0o777).toBe(0o700);
      }
      expect(r.eksikler).toEqual(['yok.xlsx']);
      expect(deger.eksik).toMatch(/EKSIK-yok\.xlsx$/);
      expect(existsSync(deger.eksik)).toBe(false);

      // Koşu bitti: klasör ezilip silinir; kök dışındaki bir yol asla silinmez.
      expect(kosuKlasorunuSil(kosu, kok)).toBe(true);
      expect(existsSync(kosu)).toBe(false);
      expect(kosuKlasorunuSil(k.yol, kok)).toBe(false);
      expect(existsSync(k.yol)).toBe(true);

      // Sahipsiz (kaydedilmemiş) ve 1 günden eski dosya temizlenir; kullanılan kalır.
      const kullanilmayan = await senaryoDosyasiEkle(vt, { klasor: medya, icerik: sahteExcel('SAHIPSIZ'), ad: 'b.xlsx' });
      depoSenaryoKaydet(vt, { projeId, baslik: 'dosyalı', icerik: { veri: { dosya: d.referans } } });
      const temizlik = sahipsizSenaryoDosyalariniTemizle(vt, medya, { simdi: Date.now() + 2 * 24 * 60 * 60 * 1000 });
      expect(temizlik.silinen).toBe(1);
      expect(senaryoDosyasiBilgisi(vt, kullanilmayan.id)).toBeNull();
      expect(senaryoDosyasiBilgisi(vt, d.id)).not.toBeNull();

      // Yedek: senaryo dosyası medya seçiminden bağımsız HER ZAMAN (şifreli haliyle) yedeğe girer.
      const y = await yedekDosyasiYaz(vt, join(k.yol, 'yedek.tayedek'), { ekranGoruntuleriDahil: false, videolarDahil: false, izDosyalariDahil: false, medyaKlasoru: medya });
      expect(y.manifest.medya?.dosyaSayisi).toBe(1);
      expect(readFileSync(join(k.yol, 'yedek.tayedek')).includes(IZ)).toBe(false);
      vt.kapat();
    } finally { k.temizle(); }
  });

  test('veri okuyucu (genel kip): senaryo dosyası koşu klasörüne çözülür (yalnızca geçerli klasöre); klasör yoksa referans aynen kalır; teardown siler', async () => {
    test.setTimeout(60_000);
    const k = geciciKlasor('veri-oku-dosya');
    let kokSil = '';
    try {
      const kurulum = await notrVeritabani(k.yol);
      const { vt, yol, projeId, ortamId } = kurulum;
      const d = await senaryoDosyasiEkle(vt, { klasor: medyaKlasoru(yol), icerik: sahteExcel('URUN'), ad: 'musteri-listesi.xlsx', kabul: '.xlsx', sahipTuru: 'senaryo' });
      const senaryoId = modelSenaryosuEkle(kurulum, 'Dosyalı başvuru', { belge: d.referans });
      const anahtar = (await parolayiDogrula(vt, PAROLA))?.toString('base64url') ?? '';
      vt.kapat();

      const oku = (ek: Record<string, string>): string => {
        const cikti = execFileSync(process.execPath, [join(KOK, 'scripts', 'platform', 'veri-oku.mjs'), 'genel', '--proje', projeId, '--ortam-id', ortamId], {
          cwd: KOK, env: { PATH: process.env.PATH, PLATFORM_VERITABANI: yol, PLATFORM_KASA_ANAHTARI: anahtar, ...ek }, encoding: 'utf8'
        });
        const sonuc = JSON.parse(cikti.trim().split('\n').pop() ?? '{}') as { durum?: string; model?: { senaryolar: Array<{ id: string; veri: { belge?: string } }> } };
        expect(sonuc.durum).toBe('hazir');
        return String(sonuc.model?.senaryolar.find((s) => s.id === senaryoId)?.veri.belge);
      };
      // Klasör yok → referans aynen (liste kipi); dosya diske yazılmaz.
      expect(oku({})).toBe(d.referans);
      // Kök dışındaki bir klasör → reddedilir (düz metin başka yere yazılmaz).
      const yabanci = join(k.yol, 'baska-klasor');
      mkdirSync(yabanci);
      expect(oku({ [DOSYA_KLASORU_DEGISKENI]: yabanci })).toBe(d.referans);
      expect(readdirSync(yabanci)).toEqual([]);

      // Koşu klasörü (işletim sisteminin geçici klasöründe, veritabanına özgü kök) → mutlak yol + doğru içerik.
      const kok = geciciDosyaKoku(yol);
      kokSil = kok;
      const kosu = kosuKlasoruOlustur(kok, 'terminal-deneme');
      const yolDegeri = oku({ [DOSYA_KLASORU_DEGISKENI]: kosu });
      expect(yolDegeri.startsWith(kosu)).toBe(true);
      expect(yolDegeri.endsWith(`${sep}musteri-listesi.xlsx`)).toBe(true);
      expect(readFileSync(yolDegeri).equals(sahteExcel('URUN'))).toBe(true);
      expect(tmpdir().length && kosu.startsWith(tmpdir())).toBe(true);

      // global-teardown (terminal koşusu sonu) klasörü siler.
      const eski = { vt: process.env.PLATFORM_VERITABANI, kl: process.env[DOSYA_KLASORU_DEGISKENI] };
      process.env.PLATFORM_VERITABANI = yol;
      process.env[DOSYA_KLASORU_DEGISKENI] = kosu;
      try { await globalTeardown(); } finally {
        if (eski.vt === undefined) delete process.env.PLATFORM_VERITABANI; else process.env.PLATFORM_VERITABANI = eski.vt;
        if (eski.kl === undefined) delete process.env[DOSYA_KLASORU_DEGISKENI]; else process.env[DOSYA_KLASORU_DEGISKENI] = eski.kl;
      }
      expect(existsSync(kosu)).toBe(false);
    } finally {
      if (kokSil) rmSync(kokSil, { recursive: true, force: true });
      k.temizle();
    }
  });

  test('açılış temizliği: sahibi çalışmayan ya da sahipsiz klasörler silinir, çalışan sürecinki kalır', () => {
    const k = geciciKlasor('artik-klasor');
    try {
      const kok = geciciDosyaKoku(join(k.yol, 'platform.db'), k.yol);
      const olu = kosuKlasoruOlustur(kok, 'olu');
      sahipYaz(olu, 2 ** 22 + 12345); // böyle bir süreç yok
      writeFileSync(join(olu, 'kalinti.xlsx'), sahteExcel('KALINTI'), { mode: 0o600 });
      const sahipsiz = kosuKlasoruOlustur(kok, 'sahipsiz');
      writeFileSync(join(sahipsiz, '.sahip'), 'bozuk');
      const canli = kosuKlasoruOlustur(kok, 'canli'); // sahibi bu süreç
      expect(artikKlasorleriTemizle(kok)).toBe(2);
      expect(existsSync(olu)).toBe(false);
      expect(existsSync(sahipsiz)).toBe(false);
      expect(existsSync(canli)).toBe(true);
    } finally { k.temizle(); }
  });
});

// ---------------------------------------------------------------------------------------
// Yasak adresler (ayarlar)
// ---------------------------------------------------------------------------------------

test.describe('Yasak adresler (Ayarlar > Güvenlik)', () => {
  test('normalleştirme, ayar + ortam değişkeni birleşimi, koşu hedefi reddi; varsayılan boş', async () => {
    const k = geciciKlasor('yasak-adres');
    try {
      expect(yasakAdresleriniNormallestir(' *.Ornek-Sirket.invalid \nhttps://uretim.ornek.invalid/giris?a=1\n\n*.ornek-sirket.invalid')).toEqual(['*.ornek-sirket.invalid', 'uretim.ornek.invalid']);
      expect(() => yasakAdresleriniNormallestir(['*'])).toThrow(/geçerli bir host kalıbı değil/);
      expect(() => yasakAdresleriniNormallestir(['a b/c'])).toThrow();
      const kurulum = await notrVeritabani(k.yol);
      const { vt, projeId, ortamId } = kurulum;
      const senaryoId = modelSenaryosuEkle(kurulum, 'Temel başvuru', { urun: 'A' });
      expect(etkinYasakAdresler(vt, {})).toEqual([]);
      expect(() => calistirmaHedefiCoz(vt, projeId, senaryoId, ortamId, { yasakDesenleri: etkinYasakDesenleri(vt, {}) })).not.toThrow();
      // Sahte test ortamının adresi: test.ornek.invalid
      expect(yasakAdresleriKaydet(vt, ['*.ornek.invalid'])).toEqual(['*.ornek.invalid']);
      expect(etkinYasakAdresler(vt, { NOBETCI_YASAK_ADRESLER: 'baska.invalid, *.ornek.invalid' })).toEqual(['*.ornek.invalid', 'baska.invalid']);
      expect(() => calistirmaHedefiCoz(vt, projeId, senaryoId, ortamId, { yasakDesenleri: etkinYasakDesenleri(vt, {}) })).toThrow(/yasaklı adres kalıbına \("\*\.ornek\.invalid"\)/);
      yasakAdresleriKaydet(vt, []);
      expect(etkinYasakAdresler(vt, {})).toEqual([]);
      vt.kapat();
    } finally { k.temizle(); }
  });
});

// ---------------------------------------------------------------------------------------
// Sunucu (ayrı Nöbetçi örneği; geçici veritabanı; yalnızca 127.0.0.1)
// ---------------------------------------------------------------------------------------

function bosPort(): Promise<number> {
  return new Promise((coz, reddet) => {
    const s = createServer();
    s.once('error', reddet);
    s.listen(0, '127.0.0.1', () => {
      const a = s.address();
      const port = typeof a === 'object' && a ? a.port : 0;
      s.close(() => coz(port));
    });
  });
}

test.describe('Sunucu uçları', () => {
  test('açılışta artık klasör temizliği; dosya yükleme şifreli, bilgi uçları içerik vermez, medya ucu senaryo dosyası sunmaz; yasak adres ayarı', async () => {
    test.setTimeout(90_000);
    const k = geciciKlasor('sunucu-dosya');
    let surec: ChildProcess | null = null;
    let kokSil = '';
    try {
      const { vt, yol, projeId, ekranId } = await notrVeritabani(k.yol);
      vt.kapat();
      const kok = geciciDosyaKoku(yol);
      kokSil = kok;
      const artik = kosuKlasoruOlustur(kok, 'coken-kosu');
      sahipYaz(artik, 2 ** 22 + 54321);
      writeFileSync(join(artik, 'kalinti.xlsx'), sahteExcel('COKEN'));

      const port = await bosPort();
      const env: NodeJS.ProcessEnv = {};
      for (const [a, v] of Object.entries(process.env)) if (!/^(TEST_WORKER_INDEX|TEST_PARALLEL_INDEX|PW_|PLATFORM_|TEST_SUNUCU_|NOBETCI_)/.test(a)) env[a] = v;
      surec = spawn(process.execPath, [join(KOK, 'scripts', 'test-sunucu.mjs')], {
        cwd: KOK, stdio: ['ignore', 'pipe', 'pipe'],
        env: { ...env, TEST_SUNUCU_PORT: String(port), TEST_SUNUCU_KOSU_KAPALI: '1', PLATFORM_VERITABANI: yol, PLATFORM_YEDEK_KLASORU: join(k.yol, 'yedekler'), TEST_SUNUCU_LOG_DOSYASI: join(k.yol, 'sunucu.log') }
      });
      const cikti: string[] = [];
      await new Promise<void>((coz, reddet) => {
        const z = setTimeout(() => reddet(new Error(`Nöbetçi başlamadı:\n${cikti.join('')}`)), 20_000);
        const d = (p: Buffer): void => { cikti.push(p.toString('utf8')); if (cikti.join('').includes('Nöbetçi hazır')) { clearTimeout(z); coz(); } };
        surec?.stdout?.on('data', d);
        surec?.stderr?.on('data', d);
      });
      expect(existsSync(artik)).toBe(false);
      expect(cikti.join('')).toMatch(/kalan 1 geçici dosya klasörü silindi/);

      const adres = `http://127.0.0.1:${port}`;
      const token = /name="oturum-tokeni" content="([^"]+)"/.exec(await (await fetch(`${adres}/`)).text())?.[1] ?? '';
      const post = async (y: string, govde: Record<string, unknown>) => (await fetch(`${adres}${y}`, { method: 'POST', headers: { 'content-type': 'application/json', origin: adres }, body: JSON.stringify({ ...govde, token }) })).json();
      const get = async (y: string) => (await fetch(`${adres}${y}`, { headers: { 'x-test-sunucu-token': token } })).json();
      expect((await post('/platform/kasa/ac', { parola: PAROLA })).basarili).toBe(true);

      const yukle = async (alan: string, ad: string, icerik: Buffer) => {
        const r = await fetch(`${adres}/platform/senaryo-dosyasi/yukle?projeId=${projeId}&ekranId=${ekranId}&alan=${encodeURIComponent(alan)}`, {
          method: 'POST', headers: { 'x-test-sunucu-token': token, 'x-dosya-adi': encodeURIComponent(ad), 'content-type': 'application/octet-stream', origin: adres }, body: new Uint8Array(icerik)
        });
        return { durum: r.status, govde: await r.json() as { basarili?: boolean; mesaj?: string; dosya?: { id: string; ad: string; boyut: number; referans: string } } };
      };
      expect((await yukle('belge', 'liste.csv', sahteExcel('CSV'))).govde.mesaj).toMatch(/yalnızca \.xlsx/);
      expect((await yukle('kapsam', 'liste.xlsx', sahteExcel('X'))).govde.mesaj).toMatch(/dosya alanı yok/);
      const y = await yukle('belge', 'Müşteriler ğüş.xlsx', sahteExcel('SUNUCU'));
      expect(y.durum).toBe(200);
      expect(y.govde.dosya).toMatchObject({ ad: 'Müşteriler ğüş.xlsx', boyut: sahteExcel('SUNUCU').length });
      expect(duzMetinVarMi(medyaKlasoru(yol))).toEqual([]);
      const id = String(y.govde.dosya?.id);
      const bilgi = await get(`/platform/senaryo-dosyalari?idler=${id}`);
      expect(bilgi.dosyalar[id]).toEqual({ id, ad: 'Müşteriler ğüş.xlsx', boyut: sahteExcel('SUNUCU').length });
      expect(JSON.stringify(bilgi)).not.toContain(IZ);
      const medyaYaniti = await fetch(`${adres}/platform/medya/${id}?token=${token}`);
      expect(medyaYaniti.status).toBe(403);
      expect(await medyaYaniti.text()).not.toContain(IZ);

      // Ekran dosyaları: ekran ayarındaki düz dosya yolu listelenir; yükleme onu şifreli referansla değiştirir.
      const ekranDosyalari = await get(`/platform/ekran-dosyalari?projeId=${projeId}`);
      const urun = ekranDosyalari.ekranlar.find((e: { id: string }) => e.id === ekranId)?.dosyalar.find((d: { anahtar: string }) => d.anahtar === 'urunListesi');
      expect(urun).toMatchObject({ eskiYol: DUZ_YOL, dosya: null });
      const degistir = await fetch(`${adres}/platform/ekran-dosyasi/yukle?projeId=${projeId}&ekranId=${ekranId}&yol=${encodeURIComponent(JSON.stringify(urun.yol))}`, {
        method: 'POST', headers: { 'x-test-sunucu-token': token, 'x-dosya-adi': encodeURIComponent('yeni-varsayilan.xlsx'), 'content-type': 'application/octet-stream', origin: adres }, body: new Uint8Array(sahteExcel('YENI'))
      });
      expect(degistir.status).toBe(200);
      const sonra = await get(`/platform/ekran-dosyalari?projeId=${projeId}`);
      expect(sonra.ekranlar.find((e: { id: string }) => e.id === ekranId)?.dosyalar.find((d: { anahtar: string; ortamId: string | null }) => d.anahtar === 'urunListesi' && d.ortamId === urun.ortamId))
        .toMatchObject({ eskiYol: null, dosya: { ad: 'yeni-varsayilan.xlsx' } });

      // Yasak adresler: varsayılan boş; kaydet + oku.
      const g0 = await get('/platform/guvenlik');
      expect(g0.yasakAdresler).toEqual([]);
      const kayit = await post('/platform/guvenlik/kaydet', { yasakAdresler: ['*.Ornek-Sirket.invalid', ''] });
      expect(kayit.yasakAdresler).toEqual(['*.ornek-sirket.invalid']);
      expect((await get('/platform/guvenlik')).yasakAdresler).toEqual(['*.ornek-sirket.invalid']);
      expect((await post('/platform/guvenlik/kaydet', { yasakAdresler: ['*'] })).basarili).toBe(false);
    } finally {
      surec?.kill('SIGTERM');
      await new Promise((r) => setTimeout(r, 400));
      if (kokSil) rmSync(kokSil, { recursive: true, force: true });
      k.temizle();
    }
  });
});
