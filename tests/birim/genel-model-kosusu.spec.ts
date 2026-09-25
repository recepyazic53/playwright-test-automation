// UÇTAN UCA (yerel) — GENEL YOL: elle oluşturulan (aktarımla gelmemiş, hiçbir adaptöre bağlı olmayan) bir projenin
// test kodu olmayan senaryoları Nöbetçi'nin koşu ucundan (/platform/senaryolar/calistir) playwright.model.config.ts
// ile, proje ve ortam KİMLİKLERİYLE koşar; sonuç, ekran görüntüsü ve video gerçek raporlayıcıyla GEÇİCİ veritabanına
// ve şifreli medya deposuna yazılır. Proje, ortam, giriş profili, giriş tarifi, bağlam profilleri, sayfa paketi ve
// formdan yeni senaryo — hepsi kullanıcının yapacağı gibi sunucunun uçlarıyla kurulur.
//
// Güvenlik: şirket sitesine HİÇBİR istek gitmez. Ortamın adresi 127.0.0.1'deki örnek başvuru fikstürüdür
// (model-fikstur.ts); yasaklı adres koruması açıktır ("*nippon*" + yerel .env'deki gerçek ortam host'ları). Ayrı bir
// Nöbetçi örneği boş bir portta, geçici veritabanıyla çalışır (gerçek Nöbetçi'ye ve veri/ klasörüne dokunulmaz).
import { spawn, type ChildProcess } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { parse as envAyristir } from 'dotenv';
import { expect, test } from '@playwright/test';
import { kasaOlustur } from '../../scripts/platform/kasa.mjs';
import { veritabaniniHazirla } from '../../scripts/platform/veritabani/depo.mjs';
import { MODEL_SPEC_DOSYASI } from '../../scripts/platform/senaryolar/model-kosusu.mjs';
import { SIRKET_DESENI, yerelSunucu } from './giris-fikstur';
import {
  ORNEK_KULLANICI, ORNEK_PAROLA, ORNEK_TOTP_ANAHTARI, OrnekBasvuruUygulamasi, ornekBasvuruPaketi, ornekGirisTarifi
} from './model-fikstur';
import { HIZLI_KDF } from './platform-ortak';

type Nesne = Record<string, unknown>;
type Yanit = Nesne & { basarili?: boolean; mesaj?: string };
const KOK = resolve(__dirname, '..', '..');
const PAROLA = `Gecici-Genel-${randomBytes(6).toString('hex')}`;
/** Ortamın adı ŞİFRELİ saklanır: sunucunun düz metin loguna yazılmamalıdır. */
const ORTAM_ADI = 'Deneme Ortamı Gizli-Ad';
const BELGE = 'Sahte belge içeriği.\n';
const FORM_BASLIGI = 'Formdan / Yetkili / Avrupa / peşin';

/** "*nippon*" + yerel .env'deki gerçek ortam host'ları (değerler dosyaya/loga yazılmaz). */
function yasakliKaliplar(): string {
  const kaliplar = ['*nippon*'];
  const env = join(KOK, '.env');
  if (existsSync(env)) {
    const d = envAyristir(readFileSync(env));
    for (const a of [d.TEST_BASE_URL, d.CANLI_BASE_URL]) {
      try { if (a) kaliplar.push(new URL(/^https?:\/\//.test(a) ? a : `http://${a}`).hostname); } catch { /* yok */ }
    }
  }
  return kaliplar.join(',');
}

function bosPort(): Promise<number> {
  return new Promise((coz, reddet) => {
    const s = createServer();
    s.once('error', reddet);
    s.listen(0, '127.0.0.1', () => {
      const adres = s.address();
      const port = typeof adres === 'object' && adres ? adres.port : 0;
      s.close(() => coz(port));
    });
  });
}

type Nobetci = { adres: string; token: string; surec: ChildProcess };

async function nobetciBaslat(klasor: string, vtYolu: string, yuklemeKlasoru: string): Promise<Nobetci> {
  const env: NodeJS.ProcessEnv = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (/^(TEST_WORKER_INDEX|TEST_PARALLEL_INDEX|PW_|PLATFORM_|TEST_SUNUCU_|TEST_ENV$|KOSU_KIMLIGI|NOBETCI_)/.test(k)) continue;
    env[k] = v;
  }
  const port = await bosPort();
  const surec = spawn(process.execPath, [join(KOK, 'scripts', 'test-sunucu.mjs')], {
    cwd: KOK,
    env: {
      ...env, TEST_SUNUCU_PORT: String(port), PLATFORM_VERITABANI: vtYolu, PLATFORM_YEDEK_KLASORU: join(klasor, 'yedekler'),
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
  const adres = `http://127.0.0.1:${port}`;
  const html = await (await fetch(`${adres}/`)).text();
  const token = /name="oturum-tokeni" content="([^"]+)"/.exec(html)?.[1] ?? '';
  expect(token, 'oturum token').not.toBe('');
  return { adres, token, surec };
}

let nobetci: Nobetci;
let uygulama: OrnekBasvuruUygulamasi;
let fikstur: Awaited<ReturnType<typeof yerelSunucu>>;
let klasor = '';
let projeId = '';
let ortamId = '';
let oturumDosyasi = '';
const senaryolar = new Map<string, string>(); // başlık → id
const sonuclar = new Map<string, Nesne>(); // başlık → sonuç ayrıntısı

async function api(yol: string, govde?: Nesne): Promise<Yanit> {
  const r = await fetch(`${nobetci.adres}${yol}`, govde
    ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...govde, token: nobetci.token }) }
    : { headers: { 'x-test-sunucu-token': nobetci.token } });
  return (await r.json()) as Yanit;
}

async function basarili(yol: string, govde: Nesne): Promise<Yanit> {
  const y = await api(yol, govde);
  expect(y.basarili, `${yol}: ${y.mesaj ?? ''}`).toBe(true);
  return y;
}

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  test.setTimeout(120_000);
  klasor = mkdtempSync(join(tmpdir(), 'genel-model-kosusu-'));
  const yukleme = join(klasor, 'yuklenecek');
  mkdirSync(yukleme);
  writeFileSync(join(yukleme, 'ornek-belge.txt'), BELGE);

  uygulama = new OrnekBasvuruUygulamasi({ totp: true });
  fikstur = await yerelSunucu(uygulama.isle);
  // Yalnızca kasa: proje ve her şey kullanıcının yapacağı gibi Nöbetçi'nin uçlarıyla kurulur (aktarım YOK).
  const vtYolu = join(klasor, 'platform.db');
  const vt = await veritabaniniHazirla(vtYolu);
  await kasaOlustur(vt, PAROLA, { kdf: HIZLI_KDF });
  vt.kapat();

  nobetci = await nobetciBaslat(klasor, vtYolu, yukleme);
  await basarili('/platform/kasa/ac', { parola: PAROLA });
  projeId = String(((await basarili('/platform/proje/kaydet', { ad: 'Elle Proje' })).proje as Nesne).id);
  ortamId = String(((await basarili('/platform/ortam/kaydet', { projeId, ad: ORTAM_ADI, tabanUrl: fikstur.adres, varsayilan: true })).ortam as Nesne).id);
  await basarili('/platform/giris-profili/kaydet', {
    projeId, ortamId, ad: 'Deneme kullanıcısı', kullaniciAdi: ORNEK_KULLANICI, parola: ORNEK_PAROLA, ikiAsamaliTur: 'totp', totpGizli: ORNEK_TOTP_ANAHTARI
  });
  const { profiller } = await api(`/platform/giris-profilleri?projeId=${projeId}`) as { profiller: Array<{ id: string }> };
  oturumDosyasi = join(KOK, 'playwright', '.auth', `genel-${ortamId.replace(/[^A-Za-z0-9-]/g, '').slice(0, 36)}-${profiller[0].id.replace(/[^A-Za-z0-9-]/g, '').slice(0, 36)}.json`);
  rmSync(oturumDosyasi, { force: true });
  await basarili('/platform/giris-tarifi/kaydet', { projeId, ortamId, tarif: ornekGirisTarifi() });
  for (const [ad, subeKodu] of [['Merkez', 'S01'], ['Yetkili', 'S02']]) {
    await basarili('/platform/baglam-profili/kaydet', { projeId, tur: 'Şube', ad, alanlar: { subeKodu } });
  }
  // Sayfa paketi → ekran + model v1 + iki senaryo (mutlu yol + iş kuralı).
  await basarili('/platform/sayfa-paketi/ekle', { projeId, paket: ornekBasvuruPaketi(), senaryoIndeksleri: [0, 1], ortamIdleri: [ortamId] });
  const liste = await api(`/platform/senaryolar?projeId=${projeId}&ortamId=${ortamId}`) as { ekranlar: Array<{ id: string; olusturulabilir: boolean }>; senaryolar: Array<{ id: string; baslik: string }> };
  for (const s of liste.senaryolar) senaryolar.set(s.baslik, s.id);
  expect(senaryolar.size).toBe(2);
  // Formdan YENİ senaryo (aynı ekran; kodlu test yok → model koşucusuyla çalışır).
  const ekran = liste.ekranlar[0];
  expect(ekran.olusturulabilir).toBe(true);
  const yeni = await basarili('/platform/senaryo/kaydet', {
    projeId, ekranId: ekran.id, baslik: FORM_BASLIGI, ortamIdleri: [ortamId],
    veri: { urun: 'A', adSoyad: 'Form Kişi', baslangic: '2026-11-01', kampanya: false, subeProfili: 'Yetkili', kapsam: 'AVRUPA', odemeTipi: 'pesin', indirimOrani: '7', onayAdimiDahil: false }
  });
  senaryolar.set(FORM_BASLIGI, String(yeni.id));
  await basarili('/platform/senaryo/kosuya-dahil', { projeId, idler: [...senaryolar.values()], dahil: true });
});

test.afterAll(async () => {
  nobetci?.surec.kill('SIGTERM');
  await fikstur?.kapat();
  if (oturumDosyasi) rmSync(oturumDosyasi, { force: true });
  if (klasor) rmSync(klasor, { recursive: true, force: true });
});

test('senaryolar listesi: üç senaryo da model koşucusuyla (paketten iki + formdan bir)', async () => {
  const liste = await api(`/platform/senaryolar?projeId=${projeId}&ortamId=${ortamId}`) as { senaryolar: Array<{ baslik: string; modelKosusu: boolean; paketten: boolean }> };
  expect(liste.senaryolar.map((s) => [s.baslik, s.modelKosusu]).sort()).toEqual([...senaryolar.keys()].map((b) => [b, true]).sort());
  expect(liste.senaryolar.find((s) => s.baslik === FORM_BASLIGI)?.paketten).toBe(false);
});

test('Nöbetçi koşusu (genel yol): sonuç, adımlar, ekran görüntüleri ve video şifreli depoya; tek koşu', async () => {
  test.setTimeout(300_000);
  const kosuKimligi = `genel-${Date.now()}`;
  for (const baslik of senaryolar.keys()) {
    const y = await api('/platform/senaryolar/calistir', {
      projeId, kosuId: `kosu-${randomUUID()}`, senaryoId: senaryolar.get(baslik), ortamId, kosuTuru: 'tam', kosuKimligi, kosuKapsami: 'Genel'
    });
    expect(y.basarili, `${baslik}: ${y.mesaj ?? ''}`).toBe(true);
    expect(typeof y.sonucId, `${baslik}: sonuç kimliği (${JSON.stringify(y)})`).toBe('string');
    sonuclar.set(baslik, (await api(`/platform/sonuclar/sonuc?id=${String(y.sonucId)}`)).sonuc as Nesne);
  }
  expect(Object.fromEntries([...sonuclar.entries()].map(([b, d]) => [b, d.durum]))).toEqual({
    'Yetkili / Dünya / peşin / onaylı': 'basarili',
    'Merkez / Türkiye taksitli → iş kuralı': 'basarili',
    [FORM_BASLIGI]: 'basarili'
  });
  for (const [baslik, d] of sonuclar) {
    expect(d).toMatchObject({ kosuId: kosuKimligi, senaryoId: senaryolar.get(baslik), urun: 'Örnek Başvuru', kosuTuru: 'tam' });
    expect(String(d.senaryoAnahtari)).toBe(`${MODEL_SPEC_DOSYASI}::${baslik}`);
    const medya = d.medya as Array<{ tur: string }>;
    expect(medya.filter((m) => m.tur === 'ekran_goruntusu').length, `${baslik}: ekran görüntüleri`).toBeGreaterThanOrEqual(3);
    expect(medya.some((m) => m.tur === 'video'), `${baslik}: video`).toBe(true);
  }
  // Uygulamaya gerçekten ulaşıldı: form senaryosu Yetkili şubesinde, indirimle hesaplandı; onay adımı yok.
  expect(uygulama.hesaplamalar.find((x) => x.sube === 'S02' && x.kapsam === 'AVRUPA')).toMatchObject({ adSoyad: 'Form Kişi', indirim: '7' });
  expect(uygulama.onaylar).toHaveLength(1);
  // Medya yalnızca şifreli: medya klasöründe düz PNG/WebM imzası yok.
  const medyaKlasoru = join(klasor, 'medya');
  for (const ad of readdirSync(medyaKlasoru)) {
    const bas = readFileSync(join(medyaKlasoru, ad)).subarray(0, 8);
    expect(bas.equals(Buffer.from('89504e470d0a1a0a', 'hex')) || bas.subarray(0, 4).equals(Buffer.from('1a45dfa3', 'hex'))).toBe(false);
  }
});

test('koşu kaydı ortamın kimliğini taşır; ortamın (şifreli) adı sunucu loguna yazılmaz; istekler yalnız fikstüre', async () => {
  const sonuc = [...sonuclar.values()][0];
  const kosu = (await api(`/platform/sonuclar/kosu?id=${String(sonuc.kosuId)}`)).kosu as Nesne;
  expect(kosu.ortamId).toBe(ortamId);
  const log = readFileSync(join(klasor, 'sunucu.log'), 'utf8');
  expect(log).toContain('▶ [GENEL]');
  expect(log).not.toContain(ORTAM_ADI);
  expect(log).not.toMatch(/Yasaklı adrese istek engellendi/);
  expect(uygulama.olaylar.length).toBeGreaterThan(10);
  expect(uygulama.olaylar.filter((o) => SIRKET_DESENI.test(o))).toEqual([]);
});
