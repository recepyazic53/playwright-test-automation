// Oracle THICK mod (Ayarlar > Koşu > Gelişmiş > "Oracle Instant Client klasörü"): klasör boşken Thin kalır (initOracleClient
// çağrılmaz); NJS-116 (eski 10G parola biçimi) hatası ayarı öneren ipucuyla döner; klasör verilince sürücü süreçte BİR KEZ o klasörle
// başlatılır, yüklenemezse açık hata; klasör sonradan değişirse yeniden başlatma iletisi. Ayar: boş ya da tam klasör yolu; koşu
// sürecine NOBETCI_ORACLE_ISTEMCI_KLASORU olarak geçer. Gerçek veritabanına / Instant Client'a dokunulmaz (taklit sürücü).
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { kasaOlustur } from '../../scripts/platform/kasa.mjs';
import { veritabaniniHazirla } from '../../scripts/platform/veritabani/depo.mjs';
import { kosuAyarlariniKaydet, kosuOrtamDegiskenleri } from '../../scripts/platform/ayarlar/kosu-ayarlari.mjs';
import { oracleIstemciKaynagiAyarla, oracleIstemciKlasoru, surucuYukleyiciAyarla, veritabaniSorgusu } from '../../scripts/platform/entegrasyonlar/veritabani-suruculeri.mjs';
import { HIZLI_KDF, geciciKlasor } from './platform-ortak';

test.describe.configure({ mode: 'serial' });

const AYAR = { surucu: 'oracle' as const, sunucu: 'ora.ornek.invalid', veritabani: 'SERVIS', kullanici: 'okur', parola: 'ora-parolasi-71c' };
const ENV = 'NOBETCI_ORACLE_ISTEMCI_KLASORU';
const baslatmalar: string[] = [];
let baslatmaHatasi: string | null = null;
const eskiParola = true;

test.beforeAll(() => {
  // Gerçek import gibi tek modül nesnesi (Thick başlatma süreç boyunca kalır).
  const mod = {
    thin: true, OUT_FORMAT_ARRAY: 4001, STRING: 2001, BUFFER: 2006,
    initOracleClient(o: { libDir: string }) {
      if (baslatmaHatasi) throw new Error(`${baslatmaHatasi}\nayrıntı satırı`);
      baslatmalar.push(o.libDir);
      mod.thin = false;
    },
    async getConnection() {
      // Thin modda eski parola biçimi reddedilir (gerçek sürücünün NJS-116 iletisi).
      if (mod.thin && eskiParola) throw Object.assign(new Error('NJS-116: password verifier type 0x939 is not supported by node-oracledb in Thin mode'), { code: 'NJS-116' });
      return {
        callTimeout: 0,
        async execute() { return { metaData: [{ name: 'X' }], rows: [[1]] }; },
        async rollback() { /* yok */ },
        async close() { /* yok */ }
      };
    }
  };
  surucuYukleyiciAyarla(async (paket) => {
    expect(paket).toBe('oracledb');
    return mod;
  });
});
test.afterAll(() => {
  surucuYukleyiciAyarla(null);
  oracleIstemciKaynagiAyarla(null);
  delete process.env[ENV];
});

test('klasör boş: Thin kalır; NJS-116 hatası Instant Client ayarını öneren ipucuyla döner (parola maskeli)', async () => {
  delete process.env[ENV];
  expect(oracleIstemciKlasoru()).toBe('');
  const hata = await veritabaniSorgusu(AYAR, 'SELECT 1 FROM DUAL', {}).catch((e: Error) => e);
  expect(String(hata)).toContain('NJS-116');
  expect(String(hata)).toContain('Oracle Instant Client klasörü');
  expect(String(hata)).not.toContain(AYAR.parola);
  expect(baslatmalar).toEqual([]);
});

test('Instant Client yüklenemezse açık hata (ilk satır + oci.dll / VC++ notu); sürücü Thin kalır', async () => {
  process.env[ENV] = 'C:\\yok\\instantclient';
  baslatmaHatasi = 'DPI-1047: Cannot locate a 64-bit Oracle Client library';
  const hata = await veritabaniSorgusu(AYAR, 'SELECT 1 FROM DUAL', {}).catch((e: Error) => e);
  expect(String(hata)).toContain('Oracle Instant Client yüklenemedi (C:\\yok\\instantclient): DPI-1047');
  expect(String(hata)).toContain('oci.dll');
  expect(String(hata)).not.toContain('ayrıntı satırı');
  expect(baslatmalar).toEqual([]);
  baslatmaHatasi = null;
});

test('klasör verilince sürücü bir kez Thick başlatılır ve eski parola biçimli kullanıcı bağlanır; klasör değişirse yeniden başlatma iletisi', async () => {
  // Sunucuda klasör ayardan gelir (ortam değişkeni yokken).
  delete process.env[ENV];
  oracleIstemciKaynagiAyarla(() => 'C:\\oracle\\instantclient_23_9');
  expect(await veritabaniSorgusu(AYAR, 'SELECT 1 FROM DUAL', {})).toEqual({ sutunlar: ['X'], satirlar: [[1]], kesildi: false });
  expect(await veritabaniSorgusu(AYAR, 'SELECT 1 FROM DUAL', {})).toEqual({ sutunlar: ['X'], satirlar: [[1]], kesildi: false });
  expect(baslatmalar).toEqual(['C:\\oracle\\instantclient_23_9']);
  // Koşu sürecindeki ortam değişkeni ayardan önce gelir.
  process.env[ENV] = 'D:\\baska\\instantclient';
  expect(oracleIstemciKlasoru()).toBe('D:\\baska\\instantclient');
  await expect(veritabaniSorgusu(AYAR, 'SELECT 1 FROM DUAL', {})).rejects.toThrow('yeniden başlatın');
  expect(baslatmalar).toHaveLength(1);
});

test('ayar: boş ya da tam klasör yolu; koşu sürecine ortam değişkeni olarak geçer', async () => {
  const klasor = geciciKlasor('oracle-thick');
  const vt = await veritabaniniHazirla(join(klasor.yol, 'platform.db'));
  try {
    await kasaOlustur(vt, 'Gecici-Oracle-Thick-1', { kdf: HIZLI_KDF });
    expect(kosuAyarlariniKaydet(vt, { oracleIstemciKlasoru: '' }).oracleIstemciKlasoru).toBe('');
    const a = kosuAyarlariniKaydet(vt, { oracleIstemciKlasoru: '  C:\\Users\\Kullanici\\Desktop\\oracle\\instantclient_23_26  ' });
    expect(a.oracleIstemciKlasoru).toBe('C:\\Users\\Kullanici\\Desktop\\oracle\\instantclient_23_26');
    expect(kosuOrtamDegiskenleri(a)[ENV]).toBe('C:\\Users\\Kullanici\\Desktop\\oracle\\instantclient_23_26');
    for (const yanlis of ['oracle\\instantclient', 'C:\\a|b', 'x'.repeat(401)]) {
      expect(() => kosuAyarlariniKaydet(vt, { oracleIstemciKlasoru: yanlis })).toThrow('tam bir klasör yolu');
    }
  } finally {
    vt.kapat();
    klasor.temizle();
  }
});
