// UÇTAN UCA (yerel) — model koşucusu: sayfa paketiyle eklenen, test kodu OLMAYAN senaryolar gerçek Nöbetçi
// sunucusunun koşu ucundan (/platform/senaryolar/calistir) model spec'iyle koşar; sonuçlar gerçek platform
// raporlayıcısıyla GEÇİCİ veritabanına ve şifreli medya deposuna yazılır.
//
// Güvenlik: şirket sitesine HİÇBİR istek gitmez. Ortamın (TEST) adresi 127.0.0.1'deki örnek başvuru fikstürüdür
// (model-fikstur.ts); CANLI ortamın adresi yasaklı kalıba uyan SAHTE bir .invalid adrestir ve yasaklı adres
// koruması (NOBETCI_YASAK_ADRESLER: "*yasak-ornek*") koşuyu tarayıcı açılmadan
// reddeder. Geçici veritabanı/medya kendi klasöründedir (MODEL_UCTAN_UCA_KLASORU verilirse onun altında).
//
// Yavaş (her senaryo ayrı "playwright test" süreci) olduğu için isteğe bağlıdır: MODEL_UCTAN_UCA=1 ile koşar.
// Port: MODEL_UCTAN_UCA_PORT (varsayılan 5581; gerçek Nöbetçi 5566'ya dokunulmaz).
// MODEL_EKRAN_KLASORU verilirse Senaryolar listesinin ve koşu panelinin ekran görüntüleri oraya yazılır.
import { spawn, type ChildProcess } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { expect, test, type Browser } from '@playwright/test';
import { kasaOlustur, parolayiDogrula } from '../../scripts/platform/kasa.mjs';
import { veritabaniAc } from '../../scripts/platform/veritabani/baglanti.mjs';
import { veritabaniniHazirla } from '../../scripts/platform/veritabani/depo.mjs';
import { MODEL_SPEC_DOSYASI, modelGrepDeseni } from '../../scripts/platform/senaryolar/model-kosusu.mjs';
import { geciciDosyaKoku } from '../../scripts/platform/dosyalar/gecici-dosyalar.mjs';
import { readdirSync } from 'node:fs';
import { SIRKET_DESENI, korumaliTarayici, yerelSunucu } from './giris-fikstur';
import {
  IS_KURALI_MESAJI, ORNEK_KULLANICI, ORNEK_PAROLA, ORNEK_TOTP_ANAHTARI, OrnekBasvuruUygulamasi, ornekBasvuruPaketi, ornekGirisTarifi
} from './model-fikstur';
import { HIZLI_KDF } from './platform-ortak';

type Nesne = Record<string, unknown>;
type Yanit = Nesne & { basarili?: boolean; mesaj?: string };
const KOK = resolve(__dirname, '..', '..');
const ETKIN = process.env.MODEL_UCTAN_UCA === '1';
const PORT = Number(process.env.MODEL_UCTAN_UCA_PORT) || 5581;
const EKRAN_KLASORU = process.env.MODEL_EKRAN_KLASORU;
/** CANLI ortamın SAHTE adresi: yasaklı kalıba ("*yasak-ornek*") uyar, .invalid olduğu için hiçbir zaman çözülmez. */
const YASAKLI_SAHTE_ADRES = 'https://portal.yasak-ornek.invalid';
const PAROLA = `Gecici-Model-${randomBytes(6).toString('hex')}`;
const BELGE = 'Sahte belge içeriği.\n';
/** Şifreli depoya yüklenen (senaryo dosyası) sahte belge: koşuda geçici klasöre çözülür, koşu bitince silinir. */
const SIFRELI_BELGE = 'SAHTE-SIFRELI-BELGE-ICERIGI\n'.repeat(5);

/** Yasaklı adres kalıbı: "*yasak-ornek*" (sahte CANLI adresi buna uyar). */
function yasakliKaliplar(): string {
  return '*yasak-ornek*';
}

type Nobetci = { adres: string; token: string; surec: ChildProcess; cikti: string[] };

async function nobetciBaslat(klasor: string, vtYolu: string, yuklemeKlasoru: string): Promise<Nobetci> {
  const env: NodeJS.ProcessEnv = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (/^(TEST_WORKER_INDEX|TEST_PARALLEL_INDEX|PW_|PLATFORM_|TEST_SUNUCU_|TEST_ENV$|KOSU_KIMLIGI|NOBETCI_)/.test(k)) continue;
    env[k] = v;
  }
  const surec = spawn(process.execPath, [join(KOK, 'scripts', 'test-sunucu.mjs')], {
    cwd: KOK,
    env: {
      ...env, TEST_SUNUCU_PORT: String(PORT), PLATFORM_VERITABANI: vtYolu, PLATFORM_YEDEK_KLASORU: join(klasor, 'yedekler'),
      TEST_SUNUCU_LOG_DOSYASI: join(klasor, 'sunucu.log'), NOBETCI_YASAK_ADRESLER: yasakliKaliplar(), NOBETCI_YUKLEME_KLASORU: yuklemeKlasoru
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  const cikti: string[] = [];
  await new Promise<void>((coz, reddet) => {
    const zaman = setTimeout(() => reddet(new Error(`Nöbetçi başlamadı:\n${cikti.join('')}`)), 30_000);
    const dinle = (p: Buffer): void => {
      cikti.push(p.toString('utf8'));
      if (cikti.join('').includes('Nöbetçi hazır')) { clearTimeout(zaman); coz(); }
    };
    surec.stdout?.on('data', dinle);
    surec.stderr?.on('data', dinle);
    surec.once('exit', (kod) => { clearTimeout(zaman); reddet(new Error(`Nöbetçi kapandı (${kod}):\n${cikti.join('')}`)); });
  });
  const adres = `http://127.0.0.1:${PORT}`;
  const html = await (await fetch(`${adres}/`)).text();
  const token = /name="oturum-tokeni" content="([^"]+)"/.exec(html)?.[1] ?? '';
  expect(token, 'oturum token').not.toBe('');
  return { adres, token, surec, cikti };
}

let nobetci: Nobetci;
let uygulama: OrnekBasvuruUygulamasi;
let fikstur: Awaited<ReturnType<typeof yerelSunucu>>;
let klasor = '';
let vtYolu = '';
let projeId = '';
let testOrtami = '';
let canliOrtami = '';
let oturumDosyasi = '';
const senaryolar = new Map<string, string>(); // başlık → id
const sonuclar = new Map<string, Nesne>(); // başlık → sonuç ayrıntısı

async function api(yol: string, govde?: Nesne): Promise<Yanit> {
  const r = await fetch(`${nobetci.adres}${yol}`, govde
    ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...govde, token: nobetci.token }) }
    : { headers: { 'x-test-sunucu-token': nobetci.token } });
  return (await r.json()) as Yanit;
}

test.describe.configure({ mode: 'serial' });
test.skip(!ETKIN, 'Uçtan uca model koşusu isteğe bağlıdır (MODEL_UCTAN_UCA=1).');

test.beforeAll(async () => {
  test.setTimeout(180_000);
  const kok = process.env.MODEL_UCTAN_UCA_KLASORU ? resolve(process.env.MODEL_UCTAN_UCA_KLASORU) : tmpdir();
  mkdirSync(kok, { recursive: true });
  klasor = mkdtempSync(join(kok, 'model-uctan-uca-'));
  const yukleme = join(klasor, 'yuklenecek');
  mkdirSync(yukleme);
  writeFileSync(join(yukleme, 'ornek-belge.txt'), BELGE);

  uygulama = new OrnekBasvuruUygulamasi({ totp: true });
  fikstur = await yerelSunucu(uygulama.isle);
  // Yalnızca kasa: proje, ortamlar, giriş profili ve her şey kullanıcının yapacağı gibi Nöbetçi'nin uçlarıyla kurulur.
  vtYolu = join(klasor, 'platform.db');
  const vt = await veritabaniniHazirla(vtYolu);
  await kasaOlustur(vt, PAROLA, { kdf: HIZLI_KDF });
  vt.kapat();

  nobetci = await nobetciBaslat(klasor, vtYolu, yukleme);
  expect((await api('/platform/kasa/ac', { parola: PAROLA })).basarili).toBe(true);
  const proje = await api('/platform/proje/kaydet', { ad: 'Model Uçtan Uca Projesi' });
  expect(proje.basarili, proje.mesaj).toBe(true);
  projeId = String((proje.proje as Nesne).id);
  const ortam = async (govde: Nesne): Promise<string> => {
    const y = await api('/platform/ortam/kaydet', { projeId, ...govde });
    expect(y.basarili, y.mesaj).toBe(true);
    return String((y.ortam as Nesne).id);
  };
  testOrtami = await ortam({ ad: 'TEST', tabanUrl: fikstur.adres, varsayilan: true });
  canliOrtami = await ortam({ ad: 'CANLI', tabanUrl: YASAKLI_SAHTE_ADRES, canli: true });
  // Giriş profili (TOTP), giriş tarifi (şube bağlamı) ve bağlam profilleri — hepsi Ayarlar uçlarıyla.
  expect((await api('/platform/giris-profili/kaydet', {
    projeId, ortamId: testOrtami, ad: 'TEST kullanıcısı', kullaniciAdi: ORNEK_KULLANICI, parola: ORNEK_PAROLA,
    ikiAsamaliTur: 'totp', totpGizli: ORNEK_TOTP_ANAHTARI
  })).basarili).toBe(true);
  const { profiller } = await api(`/platform/giris-profilleri?projeId=${projeId}`) as { profiller: Array<{ id: string; ortamId: string | null }> };
  const girisProfili = profiller.find((p) => p.ortamId === testOrtami);
  if (!girisProfili) throw new Error('TEST giriş profili yok');
  const temiz = (x: string): string => x.replace(/[^A-Za-z0-9-]/g, '').slice(0, 36);
  oturumDosyasi = join(klasor, 'oturumlar', `genel-${temiz(testOrtami)}-${temiz(girisProfili.id)}.json`);
  rmSync(oturumDosyasi, { force: true });
  // Tarif her iki ortamda da tanımlı: CANLI koşusu tarif eksikliğinden değil, yalnız yasaklı adres korumasıyla durmalı.
  for (const ortamId of [testOrtami, canliOrtami]) {
    expect((await api('/platform/giris-tarifi/kaydet', { projeId, ortamId, tarif: ornekGirisTarifi() })).basarili).toBe(true);
  }
  for (const [ad, subeKodu] of [['Merkez', 'S01'], ['Yetkili', 'S02']]) {
    expect((await api('/platform/baglam-profili/kaydet', { projeId, tur: 'Şube', ad, alanlar: { subeKodu } })).basarili).toBe(true);
  }
  // Sayfa paketi → ekran + model v1 + beş senaryo (TEST ve CANLI ortamlarında; Koşuda kapalı).
  const ek = await api('/platform/sayfa-paketi/ekle', { projeId, paket: ornekBasvuruPaketi(), senaryoIndeksleri: [0, 1, 2, 3, 4], ortamIdleri: [testOrtami, canliOrtami] });
  expect(ek.basarili, ek.mesaj).toBe(true);
  const liste = await api(`/platform/senaryolar?projeId=${projeId}&ortamId=${testOrtami}`) as { senaryolar: Array<{ id: string; baslik: string; ekranAdi: string | null; modelKosusu: boolean; paketten: boolean; kosuyaDahil: boolean; veriGudumlu: boolean }> };
  for (const s of liste.senaryolar.filter((x) => x.ekranAdi === 'Örnek Başvuru')) senaryolar.set(s.baslik, s.id);
  expect(senaryolar.size).toBe(5);
  const modelSatirlari = liste.senaryolar.filter((x) => x.modelKosusu);
  expect(modelSatirlari.map((x) => x.baslik).sort()).toEqual([...senaryolar.keys()].sort());
  expect(modelSatirlari.every((x) => x.paketten && !x.kosuyaDahil)).toBe(true); // paketten: Koşuda kapalı başlar
  expect(liste.senaryolar.every((x) => x.modelKosusu)).toBe(true); // her senaryo model senaryosudur
  // "Mutlaka görünmeli" (senaryo kuralı) + Koşuda açık.
  const mutlaka = senaryolar.get('Merkez / indirim mutlaka görünmeli') as string;
  expect((await api('/platform/senaryo/kaydet', { projeId, id: mutlaka, baslik: 'Merkez / indirim mutlaka görünmeli', mutlakaGorunmeli: ['indirimOrani'] })).basarili).toBe(true);
  // Şifreli senaryo dosyası: "onay adımı hariç" senaryosunun belgesi arayüzün yükleme ucuyla ŞİFRELİ depoya yüklenir
  // (düz metin diske yazılmaz); senaryo verisinde yalnızca referans durur. Koşuda geçici klasöre çözülür.
  const hedefBaslik = 'Yetkili / onay adımı hariç';
  const hedefId = senaryolar.get(hedefBaslik) as string;
  const detay = (await api(`/platform/senaryo?id=${hedefId}&ortamId=${testOrtami}`)).senaryo as { veri: Nesne; ekranId: string; ortamlar: string[] };
  const yuklemeYaniti = await fetch(`${nobetci.adres}/platform/senaryo-dosyasi/yukle?projeId=${projeId}&ekranId=${detay.ekranId}&alan=belge`, {
    method: 'POST', headers: { 'x-test-sunucu-token': nobetci.token, 'x-dosya-adi': encodeURIComponent('sifreli-belge.txt'), 'content-type': 'application/octet-stream' },
    body: new Uint8Array(Buffer.from(SIFRELI_BELGE))
  });
  const yuklenen = (await yuklemeYaniti.json()) as { dosya?: { referans: string } };
  expect(yuklenen.dosya?.referans).toMatch(/^nobetci-dosya:\/\/[0-9a-f-]{36}\/sifreli-belge\.txt$/);
  const kayit = await api('/platform/senaryo/kaydet', {
    projeId, id: hedefId, ekranId: detay.ekranId, baslik: hedefBaslik, veri: { ...detay.veri, belge: yuklenen.dosya?.referans }, ortamIdleri: detay.ortamlar
  });
  expect(kayit.basarili, kayit.mesaj).toBe(true);
  expect(readdirSync(join(klasor, 'medya')).map((ad) => readFileSync(join(klasor, 'medya', ad)).includes('SAHTE-SIFRELI-BELGE')).some(Boolean)).toBe(false);
  expect((await api('/platform/senaryo/kosuya-dahil', { projeId, idler: [...senaryolar.values()], dahil: true })).basarili).toBe(true);
});

test.afterAll(async () => {
  nobetci?.surec.kill('SIGTERM');
  await fikstur?.kapat();
  if (oturumDosyasi) rmSync(oturumDosyasi, { force: true });
  if (klasor && !process.env.MODEL_UCTAN_UCA_KLASORU) rmSync(klasor, { recursive: true, force: true });
});

async function calistir(baslik: string, ortamId: string, kosuKimligi: string): Promise<Yanit> {
  return api('/platform/senaryolar/calistir', {
    projeId, kosuId: `kosu-${randomUUID()}`, senaryoId: senaryolar.get(baslik), ortamId, kosuTuru: 'tam', kosuKimligi, kosuKapsami: 'Genel'
  });
}

test('beş model senaryosu sunucunun koşu ucuyla, gerçek raporlayıcıyla (Koşuyu başlat gibi sırayla, tek koşu)', async () => {
  test.setTimeout(600_000);
  const kosuKimligi = `model-${Date.now()}`;
  for (const baslik of senaryolar.keys()) {
    const y = await calistir(baslik, testOrtami, kosuKimligi);
    expect(y.basarili, `${baslik}: ${y.mesaj ?? ''}`).toBe(true);
    expect(typeof y.sonucId, `${baslik}: sonuç kimliği (${JSON.stringify(y)})`).toBe('string');
    const d = (await api(`/platform/sonuclar/sonuc?id=${String(y.sonucId)}`)).sonuc as Nesne;
    sonuclar.set(baslik, d);
  }
  expect(Object.fromEntries([...sonuclar.entries()].map(([b, d]) => [b, d.durum]))).toEqual({
    'Merkez / indirim alanı atlanır': 'basarili',
    'Merkez / indirim mutlaka görünmeli': 'basarisiz',
    'Merkez / Türkiye taksitli → iş kuralı': 'basarili',
    'Yetkili / Dünya / peşin / onaylı': 'basarili',
    'Yetkili / onay adımı hariç': 'basarili'
  });
  // Hepsi aynı koşuda, senaryo kimliği ve ekranla; kodlu testler koşmadı.
  for (const [baslik, d] of sonuclar) {
    expect(d).toMatchObject({ kosuId: kosuKimligi, senaryoId: senaryolar.get(baslik), urun: 'Örnek Başvuru', kosuTuru: 'tam' });
    expect(String(d.senaryoAnahtari)).toBe(`${MODEL_SPEC_DOSYASI}::${baslik}`);
    const medya = d.medya as Array<{ tur: string; ad: string }>;
    expect(medya.filter((m) => m.tur === 'ekran_goruntusu').length, `${baslik}: ekran görüntüleri`).toBeGreaterThanOrEqual(3);
    expect(medya.some((m) => m.tur === 'video'), `${baslik}: video`).toBe(true);
  }
});

test('mutlu yol: tüm alanlar (ok düğmeli kapsam, radyo, onay kutusu, tarih, dosya, bağlama göre görünen indirim) + isteğe bağlı onay', () => {
  const d = sonuclar.get('Yetkili / Dünya / peşin / onaylı') as Nesne;
  expect((d.adimlar as Array<{ ad: string; durum: string }>).map((a) => [a.ad, a.durum])).toEqual([
    ['Sisteme giriş yapılır', 'basarili'], ['Bağlam değiştirilir (Yetkili)', 'basarili'], ['Ekran açılır', 'basarili'],
    ['Başvuru bilgileri girilir', 'basarili'], ['Prim hesaplanır', 'basarili'], ['Başvuru onaylanır', 'basarili']
  ]);
  expect(d.atlananAlanlar).toEqual([]);
  const h = uygulama.hesaplamalar.find((x) => x.sube === 'S02' && x.kapsam === 'DÜNYA');
  expect(h).toMatchObject({ urun: 'A', adSoyad: 'Deneme Kişi', baslangic: '2026-10-01', kapsam: 'DÜNYA', odeme: 'pesin', kampanya: true, indirim: '10', belge: `ornek-belge.txt:${Buffer.byteLength(BELGE)}` });
  expect(uygulama.onaylar).toHaveLength(1);
  expect((d.medya as Array<{ ad: string }>).map((m) => m.ad)).toEqual(expect.arrayContaining(['06 - Başvuru onaylanır', '05 - Prim hesaplanır']));
});

test('iş kuralı hatası beklenir: toleranslı mesaj eşleşmesi, onay adımına geçilmez', () => {
  const d = sonuclar.get('Merkez / Türkiye taksitli → iş kuralı') as Nesne;
  expect(d.durum).toBe('basarili');
  expect((d.adimlar as Array<{ ad: string }>).map((a) => a.ad).at(-1)).toBe('Prim hesaplanır');
  expect(uygulama.hesaplamalar.some((x) => x.kapsam === 'TÜRKİYE' && x.odeme === 'taksit' && x.sube === 'S01')).toBe(true);
  expect(IS_KURALI_MESAJI).toContain('“Taksitli”'); // senaryo düz tırnak + küçük harf bekliyordu
});

test('görünmeyen alan atlanır ve "atlanan alanlar"a yazılır; "mutlaka görünmeli" ise Beklenen/Görülen ile düşer', () => {
  const atlanan = sonuclar.get('Merkez / indirim alanı atlanır') as Nesne;
  expect(atlanan.durum).toBe('basarili');
  expect(atlanan.atlananAlanlar).toEqual([{ alan: 'İndirim oranı', neden: 'ekranda görünmüyor (bağlam profili: Merkez)' }]);
  expect(uygulama.hesaplamalar.some((x) => x.urun === 'B' && x.sube === 'S01' && x.indirim === null)).toBe(true);

  const dusen = sonuclar.get('Merkez / indirim mutlaka görünmeli') as Nesne;
  expect(dusen.durum).toBe('basarisiz');
  expect(String(dusen.hataMesaji)).toContain('Başvuru bilgileri girilir adımında beklenen sonuç doğrulanamadı.');
  expect(String(dusen.hataMesaji)).toContain('Beklenen: "İndirim oranı alanı ekranda görünür (mutlaka görünmeli)" — Görülen: "İndirim oranı alanı ekranda görünmüyor (bağlam profili: Merkez)"');
  const adimlar = dusen.adimlar as Array<{ ad: string; durum: string }>;
  expect(adimlar.at(-1)).toMatchObject({ ad: 'Başvuru bilgileri girilir', durum: 'basarisiz' });
  expect((dusen.medya as Array<{ ad: string }>).some((m) => m.ad.startsWith('❌ HATA ANI'))).toBe(true);
});

test('isteğe bağlı adım hariç: prim hesaplanınca biter, onay isteği gitmez; şifreli belge çözülüp yüklendi, geçici klasör silindi', () => {
  const d = sonuclar.get('Yetkili / onay adımı hariç') as Nesne;
  expect(d.durum).toBe('basarili');
  // Şifreli senaryo dosyası koşuda çözüldü ve sayfaya yüklendi (ad + boyut); koşu bitince geçici klasör kalmadı.
  expect(uygulama.hesaplamalar.find((x) => x.sube === 'S02' && x.kapsam === 'AVRUPA')).toMatchObject({ belge: `sifreli-belge.txt:${Buffer.byteLength(SIFRELI_BELGE)}` });
  const kok = geciciDosyaKoku(vtYolu);
  expect(existsSync(kok) ? readdirSync(kok) : []).toEqual([]);
  expect((d.adimlar as Array<{ ad: string }>).map((a) => a.ad)).not.toContain('Başvuru onaylanır');
  expect(uygulama.onaylar).toHaveLength(1); // yalnızca mutlu yolun onayı
  expect(uygulama.hesaplamalar).toHaveLength(4); // "mutlaka görünmeli" senaryosu hesaplamaya ulaşmadı
});

test('yasaklı adres: CANLI (…yasak-ornek… host) koşusu sunucuda ve doğrudan CLI\'da tarayıcı açılmadan reddedilir', async () => {
  test.setTimeout(180_000);
  const baslik = 'Yetkili / onay adımı hariç';
  const onceki = uygulama.olaylar.length;
  const y = await calistir(baslik, canliOrtami, `yasak-${Date.now()}`);
  expect(y.basarili).toBe(false);
  expect(y.mesaj).toMatch(/^Koşu reddedildi: ortamın adresi \(portal\.yasak-ornek\.invalid\) yasaklı adres kalıbına \("\*yasak-ornek\*"\)/);
  const log = readFileSync(join(klasor, 'sunucu.log'), 'utf8');
  expect(log).not.toContain('▶ [CANLI]'); // hiç süreç başlatılmadı

  // Doğrudan CLI (sunucu atlanırsa): model koşucusu aynı korumayla tarayıcı açmadan durur.
  const bakis = await veritabaniAc(vtYolu, { saltOkunur: true });
  const anahtar = await parolayiDogrula(bakis, PAROLA);
  bakis.kapat();
  if (!anahtar) throw new Error('kasa anahtarı türetilemedi');
  const env: NodeJS.ProcessEnv = {};
  for (const [k, v] of Object.entries(process.env)) if (!/^(TEST_WORKER_INDEX|TEST_PARALLEL_INDEX|PW_|PLATFORM_|TEST_SUNUCU_|KOSU_KIMLIGI)/.test(k)) env[k] = v;
  const cikti = await new Promise<{ kod: number | null; metin: string }>((coz) => {
    const alt = spawn(process.execPath, [join(KOK, 'node_modules', '@playwright', 'test', 'cli.js'), 'test', MODEL_SPEC_DOSYASI.replace(/^/, 'tests/'),
      `--output=${join(klasor, 'cli-cikti')}`], {
      cwd: KOK,
      env: {
        ...env, NOBETCI_PROJE_ID: projeId, NOBETCI_ORTAM_ID: canliOrtami, PLATFORM_VERITABANI: vtYolu, PLATFORM_KASA_ANAHTARI: anahtar.toString('base64url'),
        TEST_SUNUCU_GREP_DESENI: modelGrepDeseni(senaryolar.get(baslik) as string), NOBETCI_YASAK_ADRESLER: yasakliKaliplar()
      },
      stdio: ['ignore', 'pipe', 'pipe']
    });
    let metin = '';
    alt.stdout?.on('data', (p: Buffer) => { metin += p.toString('utf8'); });
    alt.stderr?.on('data', (p: Buffer) => { metin += p.toString('utf8'); });
    alt.on('close', (kod) => coz({ kod, metin }));
  });
  anahtar.fill(0);
  expect(cikti.kod).not.toBe(0);
  expect(cikti.metin).toContain('Koşu reddedildi: ortamın adresi (portal.yasak-ornek.invalid)');
  expect(cikti.metin).toContain('Tarayıcı hiçbir yere gitmedi');
  expect(uygulama.olaylar.length).toBe(onceki); // fikstüre de hiçbir istek gitmedi
});

test('ağ: tüm koşuların istekleri yalnızca 127.0.0.1 fikstürüne gitti; yasak örnek alan adına istek yok', () => {
  expect(uygulama.olaylar.length).toBeGreaterThan(20);
  expect(uygulama.olaylar.filter((o) => SIRKET_DESENI.test(o))).toEqual([]);
  const log = readFileSync(join(klasor, 'sunucu.log'), 'utf8');
  expect(log).not.toMatch(/Yasaklı adrese istek engellendi/);
});

test('arayüz: Senaryolar listesi (model rozeti yok; her senaryo model) ve bir fikstür koşusunun paneli', async () => {
  test.setTimeout(180_000);
  const tarayici: Browser = await korumaliTarayici();
  try {
    const baglam = await tarayici.newContext({ baseURL: nobetci.adres, viewport: { width: 1440, height: 1000 }, colorScheme: 'dark' });
    const istekler: string[] = [];
    baglam.on('request', (r) => { istekler.push(r.url()); });
    const page = await baglam.newPage();
    const ekranId = await (async () => {
      const l = await api(`/platform/senaryolar?projeId=${projeId}&ortamId=${testOrtami}`) as { ekranlar: Array<{ id: string; ad: string }> };
      return l.ekranlar.find((e) => e.ad === 'Örnek Başvuru')?.id ?? '';
    })();
    await page.goto(`/#/senaryolar/u/${encodeURIComponent(ekranId)}`);
    const tablo = page.locator('.senaryo-karti');
    await expect(tablo.locator('tbody tr')).toHaveCount(5, { timeout: 15_000 });
    await expect(tablo.locator('.rozet', { hasText: /^model$/ })).toHaveCount(0);
    await expect(tablo.locator('.rozet', { hasText: /^paketten$/ })).toHaveCount(5); // beşi de sayfa paketinden
    if (EKRAN_KLASORU) {
      mkdirSync(EKRAN_KLASORU, { recursive: true });
      for (const renk of ['dark', 'light'] as const) {
        await page.emulateMedia({ colorScheme: renk });
        await page.waitForTimeout(150);
        await page.locator('main').screenshot({ path: join(EKRAN_KLASORU, `01-senaryolar-listesi-${renk === 'dark' ? 'koyu' : 'acik'}.png`) });
      }
      await page.emulateMedia({ colorScheme: 'dark' });
    }
    await page.getByRole('button', { name: 'Çalıştır: Yetkili / onay adımı hariç' }).click();
    const onay = page.locator('dialog[open]');
    if (await onay.count()) await onay.getByRole('button', { name: /Çalıştır|Başlat|Evet/ }).first().click();
    const panel = page.getByRole('region', { name: 'Canlı koşu paneli' });
    await expect(panel).toBeVisible({ timeout: 15_000 });
    // Koşu sürerken adımlar canlı listelenir (çalışan adım sarı); bitince sonucun adımları kalır.
    await expect(panel.locator('.kosu-adimlari .adim-listesi li').first()).toBeVisible({ timeout: 60_000 });
    await expect(panel.getByText('Başarılı').first()).toBeVisible({ timeout: 150_000 });
    await expect(panel.locator('.kosu-adimlari')).toContainText('başarılı', { timeout: 15_000 });
    await expect.poll(async () => panel.locator('.kosu-adimlari li.basarili').count(), { timeout: 15_000 }).toBeGreaterThanOrEqual(3);
    await expect(panel.locator('.kosu-adimlari li.calisiyor')).toHaveCount(0);
    if (EKRAN_KLASORU) {
      for (const renk of ['dark', 'light'] as const) {
        await page.emulateMedia({ colorScheme: renk });
        await page.waitForTimeout(200);
        await panel.screenshot({ path: join(EKRAN_KLASORU, `02-kosu-paneli-model-${renk === 'dark' ? 'koyu' : 'acik'}.png`) });
      }
    }
    expect(istekler.filter((u) => !u.startsWith(nobetci.adres) && !u.startsWith('data:') && !u.startsWith('blob:'))).toEqual([]);
  } finally {
    await tarayici.close();
  }
});
