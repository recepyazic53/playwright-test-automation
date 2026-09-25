// KORUMA TESTLERİ — şifreli senaryo dosyaları (ör. çoklu sorgu Excel'i), koşuya özel geçici dosya klasörleri, eski
// düz metin dosyaların aktarımı / tek seferlik "Açık dosyaları şifreli depoya taşı" işlemi (GEÇİCİ KOPYA üzerinde),
// Ayarlar > Güvenlik > "Yasak adresler" ve "kodu kaldırılmış" senaryolar.
// Tüm veriler SAHTEDİR (dosya içeriği "SAHTE-…" metni); her test kendi geçici klasöründe çalışır. Gerçek
// veritabanına, gerçek tests/fixtures'a ve şirket sitesine dokunulmaz: sunucu testi ayrı bir Nöbetçi örneğidir
// (boş port, geçici veritabanı, TEST_SUNUCU_KOSU_KAPALI=1) ve yalnızca 127.0.0.1'e istek atar.
import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { expect, test } from '@playwright/test';
import type { Veritabani } from '../../scripts/platform/veritabani/baglanti.mjs';
import { kasaOlustur, parolayiDogrula } from '../../scripts/platform/kasa.mjs';
import { ekranAyarlariniGetir, kaynakEslemesiYaz, senaryoKaydet as depoSenaryoKaydet, veritabaniniHazirla } from '../../scripts/platform/veritabani/depo.mjs';
import { aktarimiUygula } from '../../scripts/platform/aktarim/motor.mjs';
import { medyaKlasoru } from '../../scripts/platform/medya.mjs';
import {
  SENARYO_DOSYASI_TURU, dosyaReferansi, kaynaktanDosyaBul, referansCoz, referanslariCoz, sahipsizSenaryoDosyalariniTemizle, senaryoDosyasiBilgisi,
  senaryoDosyasiEkle, yollariReferansaCevir
} from '../../scripts/platform/dosyalar/senaryo-dosyalari.mjs';
import {
  DOSYA_KLASORU_DEGISKENI, artikKlasorleriTemizle, geciciDosyaKoku, kosuKlasoruGecerliMi, kosuKlasoruOlustur, kosuKlasorunuSil, sahipYaz
} from '../../scripts/platform/dosyalar/gecici-dosyalar.mjs';
import { acikDosyalariAktar, acikDosyalariBul, acikDosyalariTasi } from '../../scripts/platform/dosyalar/acik-dosyalar.mjs';
import { etkinYasakAdresler, etkinYasakDesenleri, yasakAdresleriKaydet, yasakAdresleriniNormallestir } from '../../scripts/platform/guvenlik/yasak-adresler.mjs';
import { calistirmaHedefiCoz, kodKaldirilmisSenaryolar, kodKaldirilmisSenaryolariSil, senaryoGecmisi } from '../../scripts/platform/senaryolar/senaryo-servisi.mjs';
import { yedekDosyasiYaz } from '../../scripts/platform/yedek.mjs';
import { adaptorBul } from '../../projeler/index.mjs';
import type { AktarimAdaptoru } from '../../projeler/index.d.mts';
import globalTeardown from '../support/global-teardown';
import { HIZLI_KDF, ORNEK_ESKI_DOSYALAR, POSIX_IZINLERI, SAHTE_ORTAM_DEGISKENLERI, geciciKlasor } from './platform-ortak';

const KOK = resolve(__dirname, '..', '..');
const PAROLA = 'Senaryo-Dosyasi-Kasa-Parolasi-5';
const EXCEL_YOLU = 'tests/fixtures/jet-seyahat/fma-coklu-sorgu-10-kisi.xlsx';
/** Sahte "Excel": zip imzası + sahte metin (gerçek kişi verisi yok). */
const sahteExcel = (etiket: string): Buffer => Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.from(`SAHTE-SIGORTALI-LISTESI-${etiket}-${'x'.repeat(300)}`)]);
const IZ = 'SAHTE-SIGORTALI-LISTESI';

function adaptor(): AktarimAdaptoru {
  const a = adaptorBul('galaksi');
  if (!a) throw new Error('galaksi adaptörü yok');
  return a;
}

/** Sahte eski dosyaların GEÇİCİ kopyası + tests/fixtures altında sahte Excel'ler. */
function eskiDosyaKopyasi(kok: string): string {
  const hedef = join(kok, 'eski-dosyalar');
  cpSync(ORNEK_ESKI_DOSYALAR, hedef, { recursive: true });
  mkdirSync(join(hedef, 'tests', 'fixtures', 'jet-seyahat', 'yuklenen'), { recursive: true });
  writeFileSync(join(hedef, EXCEL_YOLU), sahteExcel('URUN'));
  writeFileSync(join(hedef, 'tests', 'fixtures', 'jet-seyahat', 'yuklenen', 'ozel.xlsx'), sahteExcel('OZEL'));
  return hedef;
}

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

async function galaksiVeritabani(klasor: string, kaynak = ORNEK_ESKI_DOSYALAR): Promise<{ vt: Veritabani; yol: string; projeId: string; ortamId: string; ekranId: string }> {
  const yol = join(klasor, 'platform.db');
  const vt = await veritabaniniHazirla(yol);
  await kasaOlustur(vt, PAROLA, { kdf: HIZLI_KDF });
  const { projeId } = aktarimiUygula(vt, await adaptor().paketOlustur(kaynak, { projeKoku: KOK, ortamDegiskenleri: { ...SAHTE_ORTAM_DEGISKENLERI }, testListesi: async () => [] }));
  const ortamId = String(vt.tek("SELECT varlik_id FROM kaynak_eslemeleri WHERE varlik_turu = 'ortam' AND kaynak_anahtari = 'test'")?.varlik_id);
  const ekranId = String(vt.tek("SELECT id FROM ekranlar WHERE anahtar = 'jet-seyahat'")?.id);
  return { vt, yol, projeId, ortamId, ekranId };
}

/** Ekran ayarlarındaki ürün varsayılan dosyası (jet-seyahat.json > jetSeyahat.cokluSorguDosyasi). */
function urunDosyasi(vt: Veritabani, ekranId: string, ortamId: string): unknown {
  const a = ekranAyarlariniGetir(vt, ekranId) as { ortamlar: Record<string, { dosyalar: Record<string, { jetSeyahat: { cokluSorguDosyasi: unknown } }> }> };
  return a.ortamlar[ortamId].dosyalar['jet-seyahat'].jetSeyahat.cokluSorguDosyasi;
}

// ---------------------------------------------------------------------------------------
// Şifreli depo + koşu anında çözme
// ---------------------------------------------------------------------------------------

test.describe('Şifreli senaryo dosyaları', () => {
  test('yükleme şifreli yazılır; referans çözülünce koşuya özel 0600 dosya; eksik dosya açık "EKSIK-" yoluna çevrilir', async () => {
    const k = geciciKlasor('senaryo-dosyasi');
    try {
      const { vt, yol } = await galaksiVeritabani(k.yol);
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
      depoSenaryoKaydet(vt, { projeId: String(vt.tek('SELECT id FROM projeler')?.id), baslik: 'dosyalı', icerik: { veri: { dosya: d.referans } } });
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

  test('veri okuyucu: ürün dosyası koşu klasörüne çözülür (yalnızca geçerli klasöre); klasör yoksa referans aynen kalır; teardown siler', async () => {
    test.setTimeout(60_000);
    const k = geciciKlasor('veri-oku-dosya');
    let kokSil = '';
    try {
      const kaynak = eskiDosyaKopyasi(k.yol);
      const { vt, yol, projeId, ortamId, ekranId } = await galaksiVeritabani(k.yol, kaynak);
      await acikDosyalariAktar(vt, projeId, acikDosyalariBul(vt, adaptor(), [{ kok: kaynak, konum: 'kaynak' }]), { medyaKlasoru: medyaKlasoru(yol) });
      const ref = String(urunDosyasi(vt, ekranId, ortamId));
      expect(referansCoz(ref)?.ad).toBe('fma-coklu-sorgu-10-kisi.xlsx');
      const anahtar = (await parolayiDogrula(vt, PAROLA))?.toString('base64url') ?? '';
      vt.kapat();

      const oku = (ek: Record<string, string>): { veri: { dosyalar: Record<string, { jetSeyahat: { cokluSorguDosyasi: string } }> }; yasakAdresler: string[] } => {
        const cikti = execFileSync(process.execPath, [join(KOK, 'scripts', 'platform', 'aktarim', 'veri-oku.mjs'), 'veri', '--ortam', 'test', '--adaptor', 'galaksi'], {
          cwd: KOK, env: { PATH: process.env.PATH, PLATFORM_VERITABANI: yol, PLATFORM_KASA_ANAHTARI: anahtar, ...ek }, encoding: 'utf8'
        });
        return JSON.parse(cikti.trim().split('\n').pop() ?? '{}');
      };
      // Klasör yok → referans aynen (liste kipi); dosya diske yazılmaz.
      expect(oku({}).veri.dosyalar['jet-seyahat'].jetSeyahat.cokluSorguDosyasi).toBe(ref);
      // Kök dışındaki bir klasör → reddedilir (düz metin başka yere yazılmaz).
      const yabanci = join(k.yol, 'baska-klasor');
      mkdirSync(yabanci);
      expect(oku({ [DOSYA_KLASORU_DEGISKENI]: yabanci }).veri.dosyalar['jet-seyahat'].jetSeyahat.cokluSorguDosyasi).toBe(ref);
      expect(readdirSync(yabanci)).toEqual([]);

      // Koşu klasörü (işletim sisteminin geçici klasöründe, veritabanına özgü kök) → mutlak yol + doğru içerik.
      const kok = geciciDosyaKoku(yol);
      kokSil = kok;
      const kosu = kosuKlasoruOlustur(kok, 'terminal-deneme');
      const yolDegeri = oku({ [DOSYA_KLASORU_DEGISKENI]: kosu }).veri.dosyalar['jet-seyahat'].jetSeyahat.cokluSorguDosyasi;
      expect(yolDegeri.startsWith(kosu)).toBe(true);
      expect(yolDegeri.endsWith(`${sep}fma-coklu-sorgu-10-kisi.xlsx`)).toBe(true);
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
// Eski düz metin dosyalar: aktarım ve tek seferlik taşıma (GEÇİCİ kopya)
// ---------------------------------------------------------------------------------------

test.describe('Eski düz metin dosyalar', () => {
  test('Galaksi aktarımı: tests/fixtures/** şifreli depoya alınır, yol değerleri referansa çevrilir; tekrar çalıştırmak çift kayıt üretmez; düz metin silinmez', async () => {
    const k = geciciKlasor('eski-excel');
    try {
      const kaynak = eskiDosyaKopyasi(k.yol);
      const { vt, yol, projeId, ortamId, ekranId } = await galaksiVeritabani(k.yol, kaynak);
      expect(urunDosyasi(vt, ekranId, ortamId)).toBe(EXCEL_YOLU);
      // Özel dosya kullanan bir senaryo (eski panelden yüklenmiş gibi)
      const senaryoId = depoSenaryoKaydet(vt, {
        projeId, ekranId, baslik: 'Çoklu sorgu (özel dosya)',
        icerik: { kaynak: { dosya: 'scenarios/jet-seyahat/prim-hesaplama.spec.ts', ad: 'Çoklu sorgu (özel dosya)' }, veri: { dosya: 'jet-seyahat', yol: 'jetSeyahat.senaryolar' },
          ortamlar: { [ortamId]: { sira: 99, veri: { sorguTipi: 'coklu', cokluSorguDosyasi: 'tests/fixtures/jet-seyahat/yuklenen/ozel.xlsx', cokluSorguKisiSayisi: 3 } } } }
      });
      const bulunan = acikDosyalariBul(vt, adaptor(), [{ kok: kaynak, konum: 'kaynak' }]);
      expect(bulunan.map((d) => d.goreliYol).sort()).toEqual([EXCEL_YOLU, 'tests/fixtures/jet-seyahat/yuklenen/ozel.xlsx']);
      expect(bulunan.every((d) => !d.sifreliKopyaVar)).toBe(true);

      const r = await acikDosyalariAktar(vt, projeId, bulunan, { medyaKlasoru: medyaKlasoru(yol) });
      expect(r).toMatchObject({ aktarilan: 2, zatenVardi: 0, hatalar: [] });
      expect(r.referans.ekran).toBe(1);
      expect(r.referans.senaryo).toBeGreaterThanOrEqual(1);
      const urunRef = String(urunDosyasi(vt, ekranId, ortamId));
      expect(referansCoz(urunRef)?.id).toBe(kaynaktanDosyaBul(vt, EXCEL_YOLU)?.id);
      const senaryo = JSON.parse(String(vt.tek('SELECT icerik_json FROM senaryolar WHERE id = ?', [senaryoId])?.icerik_json));
      const ozelRef = senaryo.ortamlar[ortamId].veri.cokluSorguDosyasi as string;
      expect(referansCoz(ozelRef)?.ad).toBe('ozel.xlsx');
      expect(String(vt.tek('SELECT sahip_id FROM medya WHERE id = ?', [referansCoz(ozelRef)?.id])?.sahip_id)).toBe(senaryoId);
      // Düz metinler yerinde; tekrar: yeni kayıt yok.
      expect(existsSync(join(kaynak, EXCEL_YOLU))).toBe(true);
      const tekrar = await acikDosyalariAktar(vt, projeId, acikDosyalariBul(vt, adaptor(), [{ kok: kaynak, konum: 'kaynak' }]), { medyaKlasoru: medyaKlasoru(yol) });
      expect(tekrar).toMatchObject({ aktarilan: 0, zatenVardi: 2 });
      expect(Number(vt.tek('SELECT COUNT(*) AS n FROM medya WHERE tur = ?', [SENARYO_DOSYASI_TURU])?.n)).toBe(2);
      // Kaynak yeniden düz yol yazarsa (ör. aktarım güncellemesi) aynı kayda çevrilir.
      yollariReferansaCevir(vt, projeId, new Map([[EXCEL_YOLU, urunRef]]));
      vt.kapat();
    } finally { k.temizle(); }
  });

  test('"Açık dosyaları şifreli depoya taşı": doğrulanan düz metin ezilip silinir, boş klasörler kalkar; farklı içerikli kopya silinmez', async () => {
    const k = geciciKlasor('acik-tasima');
    try {
      const kaynak = eskiDosyaKopyasi(k.yol);
      // Proje kökünün GEÇİCİ kopyası: tests/fixtures altında aynı ürün dosyası (aynı içerik) + farklı içerikli ikinci kopya.
      const proje = join(k.yol, 'proje-kopyasi');
      mkdirSync(join(proje, 'tests', 'fixtures', 'jet-seyahat'), { recursive: true });
      writeFileSync(join(proje, EXCEL_YOLU), sahteExcel('URUN'));
      const ikinci = join(k.yol, 'ikinci-yedek');
      mkdirSync(join(ikinci, 'tests', 'fixtures', 'jet-seyahat'), { recursive: true });
      writeFileSync(join(ikinci, EXCEL_YOLU), sahteExcel('FARKLI'));

      const { vt, yol, projeId, ortamId, ekranId } = await galaksiVeritabani(k.yol, kaynak);
      const kokler = [{ kok: proje, konum: 'proje' }, { kok: kaynak, konum: 'eski-dosyalar/a' }, { kok: ikinci, konum: 'eski-dosyalar/b' }];
      const onizleme = acikDosyalariBul(vt, adaptor(), kokler);
      expect(onizleme.length).toBe(4);
      // Önizleme hiçbir şeyi değiştirmez.
      expect(Number(vt.tek('SELECT COUNT(*) AS n FROM medya')?.n)).toBe(0);

      const sonuc = await acikDosyalariTasi(vt, projeId, onizleme, { medyaKlasoru: medyaKlasoru(yol), bosKlasorKoku: (d) => join(d.kok, 'tests', 'fixtures') });
      expect(sonuc.aktarilan).toBe(2);
      expect(sonuc.silinen).toBe(3);
      expect(sonuc.atlanan).toEqual([expect.objectContaining({ goreliYol: EXCEL_YOLU, konum: 'eski-dosyalar/b', neden: expect.stringMatching(/farklı/) })]);
      expect(existsSync(join(proje, EXCEL_YOLU))).toBe(false);
      expect(existsSync(join(kaynak, EXCEL_YOLU))).toBe(false);
      expect(existsSync(join(proje, 'tests', 'fixtures', 'jet-seyahat'))).toBe(false); // boşalan klasör kaldırıldı
      expect(existsSync(join(proje, 'tests', 'fixtures'))).toBe(true); // kök kalır
      expect(existsSync(join(ikinci, EXCEL_YOLU))).toBe(true); // farklı içerik: silinmedi
      expect(duzMetinVarMi(medyaKlasoru(yol))).toEqual([]);
      expect(referansCoz(urunDosyasi(vt, ekranId, ortamId))).not.toBeNull();
      // Taşınan dosya koşuda aynı içerikle çözülür.
      const kosu = kosuKlasoruOlustur(geciciDosyaKoku(yol, k.yol), 'dogrula');
      const r = await referanslariCoz(vt, urunDosyasi(vt, ekranId, ortamId), { medyaKlasoru: medyaKlasoru(yol), hedefKlasor: kosu });
      expect(readFileSync(String(r.deger)).equals(sahteExcel('URUN'))).toBe(true);
      vt.kapat();
    } finally { k.temizle(); }
  });
});

// ---------------------------------------------------------------------------------------
// Yasak adresler (ayarlar) ve kodu kaldırılmış senaryolar
// ---------------------------------------------------------------------------------------

test.describe('Yasak adresler (Ayarlar > Güvenlik)', () => {
  test('normalleştirme, ayar + ortam değişkeni birleşimi, koşu hedefi reddi; varsayılan boş', async () => {
    const k = geciciKlasor('yasak-adres');
    try {
      expect(yasakAdresleriniNormallestir(' *.Ornek-Sirket.invalid \nhttps://uretim.ornek.invalid/giris?a=1\n\n*.ornek-sirket.invalid')).toEqual(['*.ornek-sirket.invalid', 'uretim.ornek.invalid']);
      expect(() => yasakAdresleriniNormallestir(['*'])).toThrow(/geçerli bir host kalıbı değil/);
      expect(() => yasakAdresleriniNormallestir(['a b/c'])).toThrow();
      const { vt, projeId, ortamId } = await galaksiVeritabani(k.yol);
      const senaryoId = String(vt.tek("SELECT id FROM senaryolar WHERE icerik_json LIKE '%prim-hesaplama%' LIMIT 1")?.id);
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

test.describe('Kodu kaldırılmış senaryolar', () => {
  test('spec dosyası yok ya da başlık listede yok → listelenir; Kaldır yalnızca bunları siler, geçmiş korunur; model senaryosu asla', async () => {
    const k = geciciKlasor('kodu-kaldirilmis');
    try {
      const { vt, projeId, ortamId, ekranId } = await galaksiVeritabani(k.yol);
      const ortamlar = { [ortamId]: {} };
      const ekle = (baslik: string, dosya: string, ek: Record<string, unknown> = {}, esleme = true): string => {
        const id = depoSenaryoKaydet(vt, { projeId, ekranId, baslik, icerik: { kaynak: { dosya, ad: baslik }, ortamlar, ...ek } });
        if (esleme) kaynakEslemesiYaz(vt, { id: `e-${id}`, projeId, varlikTuru: 'senaryo', kaynakAnahtari: `${dosya}::${baslik}`, varlikId: id, kaynakOzeti: null });
        return id;
      };
      const satis = ekle('Jet Satış akışı', 'scenarios/jet-satis/satis.spec.ts');
      const baslikYok = ekle('Eski başlık', 'scenarios/jet-kasko/yeni-kayit.spec.ts');
      const duran = ekle('Duran test', 'scenarios/jet-kasko/yeni-kayit.spec.ts');
      const model = ekle('Model senaryosu', 'scenarios/yok/model.spec.ts', { paket: { kaynak: 'sayfa-paketi' } }, false);
      const kodDosyasiVar = (d: string) => !d.startsWith('scenarios/jet-satis/') && !d.startsWith('scenarios/yok/');
      const testListesi = [{ dosya: 'scenarios/jet-kasko/yeni-kayit.spec.ts', ad: 'Duran test' }];

      const yalnizDosya = kodKaldirilmisSenaryolar(vt, projeId, ortamId, { kodDosyasiVar });
      expect(yalnizDosya.baslikDenetlendi).toBe(false);
      expect(yalnizDosya.senaryolar.map((x) => [x.id, x.neden])).toEqual([[satis, 'dosya-yok']]);
      const tam = kodKaldirilmisSenaryolar(vt, projeId, ortamId, { kodDosyasiVar, testListesi });
      expect(new Map(tam.senaryolar.map((x) => [x.id, x.neden]))).toEqual(new Map([[satis, 'dosya-yok'], [baslikYok, 'baslik-yok']]));
      expect(tam.senaryolar.some((x) => x.id === model || x.id === duran)).toBe(false);

      // Kodu duran bir senaryo listedeyse HİÇBİRİ silinmez.
      expect(() => kodKaldirilmisSenaryolariSil(vt, projeId, ortamId, [satis, duran], { kodDosyasiVar, testListesi })).toThrow(/kodu hâlâ duruyor/);
      expect(vt.tek('SELECT 1 AS v FROM senaryolar WHERE id = ?', [satis])).toBeTruthy();
      // Koşan senaryo silinmez.
      expect(() => kodKaldirilmisSenaryolariSil(vt, projeId, ortamId, [satis], { kodDosyasiVar, testListesi, kosuyorMu: () => true })).toThrow(/koşuyor/);
      expect(kodKaldirilmisSenaryolariSil(vt, projeId, ortamId, [satis, baslikYok], { kodDosyasiVar, testListesi, yapan: 'test' })).toEqual({ silinen: 2 });
      expect(vt.tek('SELECT 1 AS v FROM senaryolar WHERE id = ?', [satis])).toBeFalsy();
      expect(senaryoGecmisi(vt, satis).some((g) => g.islem === 'sil')).toBe(true);
      expect(vt.tek('SELECT 1 AS v FROM senaryolar WHERE id = ?', [model])).toBeTruthy();
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
      const { vt, yol, projeId, ekranId } = await galaksiVeritabani(k.yol);
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
      expect((await yukle('cokluSorguDosyasi', 'liste.csv', sahteExcel('CSV'))).govde.mesaj).toMatch(/yalnızca \.xlsx/);
      expect((await yukle('kapsam', 'liste.xlsx', sahteExcel('X'))).govde.mesaj).toMatch(/dosya alanı yok/);
      const y = await yukle('cokluSorguDosyasi', 'Sigortalılar ğüş.xlsx', sahteExcel('SUNUCU'));
      expect(y.durum).toBe(200);
      expect(y.govde.dosya).toMatchObject({ ad: 'Sigortalılar ğüş.xlsx', boyut: sahteExcel('SUNUCU').length });
      expect(duzMetinVarMi(medyaKlasoru(yol))).toEqual([]);
      const id = String(y.govde.dosya?.id);
      const bilgi = await get(`/platform/senaryo-dosyalari?idler=${id}`);
      expect(bilgi.dosyalar[id]).toEqual({ id, ad: 'Sigortalılar ğüş.xlsx', boyut: sahteExcel('SUNUCU').length });
      expect(JSON.stringify(bilgi)).not.toContain(IZ);
      const medyaYaniti = await fetch(`${adres}/platform/medya/${id}?token=${token}`);
      expect(medyaYaniti.status).toBe(403);
      expect(await medyaYaniti.text()).not.toContain(IZ);

      // Ekran dosyaları: ürünün varsayılan dosyası (sahte örnekte düz yol) listelenir.
      const ekranDosyalari = await get(`/platform/ekran-dosyalari?projeId=${projeId}`);
      const urun = ekranDosyalari.ekranlar.find((e: { id: string }) => e.id === ekranId)?.dosyalar.find((d: { anahtar: string }) => d.anahtar === 'cokluSorguDosyasi');
      expect(urun).toMatchObject({ eskiYol: EXCEL_YOLU, dosya: null });
      const degistir = await fetch(`${adres}/platform/ekran-dosyasi/yukle?projeId=${projeId}&ekranId=${ekranId}&yol=${encodeURIComponent(JSON.stringify(urun.yol))}`, {
        method: 'POST', headers: { 'x-test-sunucu-token': token, 'x-dosya-adi': encodeURIComponent('yeni-varsayilan.xlsx'), 'content-type': 'application/octet-stream', origin: adres }, body: new Uint8Array(sahteExcel('YENI'))
      });
      expect(degistir.status).toBe(200);
      const sonra = await get(`/platform/ekran-dosyalari?projeId=${projeId}`);
      expect(sonra.ekranlar.find((e: { id: string }) => e.id === ekranId)?.dosyalar.find((d: { anahtar: string; ortamId: string | null }) => d.anahtar === 'cokluSorguDosyasi' && d.ortamId === urun.ortamId))
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
