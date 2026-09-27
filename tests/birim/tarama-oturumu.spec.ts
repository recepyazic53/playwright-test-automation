// KORUMA TESTLERİ — Ayarlar > Koşu > Tarama ve akış kaydı > "Tarama ve akış kaydında giriş":
//   "Her seferinde baştan giriş yap" (varsayılan) ↔ "Koşunun saklanan oturumunu kullan" (koşunun ortam + giriş profili için
//   şifreli sakladığı oturum; geçerliyse giriş atlanır, değilse baştan giriş + aynı dosyaya atomik güncelleme).
// Girişli sahte uygulama 127.0.0.1'de (giriş sayacı, oturum geçersiz kılma, oturum sayfasında gecikme); tarama alt süreci
// yalnız bu kökene istek atabilir ve DNS çözümlemez. Veritabanı ve oturum dosyaları geçici klasörde (veri/ klasörüne ve
// çalışan Nöbetçi'ye dokunulmaz).
import { spawn } from 'node:child_process';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { expect, test, type Browser } from '@playwright/test';
import { acikAnahtar, kasaOlustur } from '../../scripts/platform/kasa.mjs';
import type { Veritabani } from '../../scripts/platform/veritabani/baglanti.mjs';
import {
  girisProfiliKaydet, ortamKaydet, ortamVarsayilanGirisProfiliId, projeKaydet, veritabaniniHazirla
} from '../../scripts/platform/veritabani/depo.mjs';
import { girisTarifiKaydet } from '../../scripts/platform/giris/tarif-deposu.mjs';
import { KOSU_AYAR_TANIMLARI, kosuAyarlariniKaydet } from '../../scripts/platform/ayarlar/kosu-ayarlari.mjs';
import {
  oturumAnahtariTuret, oturumDosyaYolu, oturumDosyasiniOku, oturumDosyasinaYaz, oturumuKokenlereSinirla
} from '../../scripts/platform/giris/oturum-dosyasi.mjs';
import { IZIN_TANIMLARI } from '../../scripts/platform/guvenlik/izin-tanimlari.mjs';
import { taramaIsteginiIsle, taramaYoneticisiOlustur, type IsGorunumu, type TaramaYoneticisi } from '../../scripts/platform/tarama/yonetici.mjs';
import { girisKokenleri, girisTarifiniDogrula } from '../../scripts/platform/giris/tarif.mjs';
import { girisYap } from '../support/giris-motoru';
import { oturumuSifreliOku, oturumuSifreliYaz } from '../support/oturum-kasasi';
import { hataMi, platformOkuyucusunuCalistir } from '../support/platform-veri';
import { korumaliTarayici, yerelSunucu, type FiksturIstegi, type FiksturYaniti } from './giris-fikstur';
import { nobetciApi, nobetciBaslat, type Nobetci } from './nobetci-sunucusu';
import { HIZLI_KDF, geciciKlasor, izinleriAc } from './platform-ortak';

type Yanit = Record<string, unknown> & { basarili?: boolean; mesaj?: string; kod?: string };
const KOK = resolve(__dirname, '..', '..');
const TOKEN = 'oturum-tokeni-deneme';
const KULLANICI = 'oturum.kullanici';
const PAROLA = 'Oturum-Sahte-Parola-4';
const KASA_PAROLASI = 'Gecici-Tarama-Oturumu-1';

// ---------------------------------------------------------------------------------------------------------------------------
// Girişli sahte uygulama
// ---------------------------------------------------------------------------------------------------------------------------

const html = (baslik: string, govde: string, basliklar: Record<string, string> = {}): FiksturYaniti => ({
  tur: 'text/html; charset=utf-8', basliklar,
  govde: `<!doctype html><html lang="tr"><head><meta charset="utf-8"><title>${baslik}</title></head><body>${govde}</body></html>`
});
const yonlendir = (adres: string, basliklar: Record<string, string> = {}): FiksturYaniti =>
  html('Yönlendiriliyor', `<script>location.replace(${JSON.stringify(adres)});</script>`, basliklar);

class OturumluUygulama {
  /** POST /giris ile yapılan (başarılı) giriş sayısı. */
  girisSayisi = 0;
  /** Geçerli oturum belirteçleri (sunucu tarafı). */
  readonly gecerli = new Set<string>();
  /** /panel'de "Hoş geldiniz"in çizilmesi için gecikme (oturum kontrolü süresi denemesi). */
  panelGecikmeMs = 0;
  /** Sunucuya ulaşan yazma istekleri (giriş dışı POST olmamalı). */
  readonly postlar: string[] = [];

  /** Tüm oturumları geçersiz kılar (sunucu tarafında oturum süresi doldu). */
  oturumlariGecersizKil(): void { this.gecerli.clear(); }

  readonly isle = (i: FiksturIstegi): FiksturYaniti => {
    const oturum = i.cerezler.oturum && this.gecerli.has(i.cerezler.oturum);
    if (i.yontem === 'POST') this.postlar.push(i.yol);
    if (i.yol === '/giris') {
      if (i.yontem === 'POST') {
        const f = new URLSearchParams(i.govde);
        if (f.get('kullanici') !== KULLANICI || f.get('parola') !== PAROLA) return html('Giriş', '<p role="alert">Kullanıcı adı veya parola hatalı</p>');
        this.girisSayisi++;
        const belirtec = randomBytes(8).toString('hex');
        this.gecerli.add(belirtec);
        return yonlendir('/panel', { 'set-cookie': `oturum=${belirtec}; Path=/; HttpOnly` });
      }
      return html('Giriş', `<form method="post" action="/giris"><label>Kullanıcı adı <input id="kullanici" name="kullanici"></label>
        <label>Parola <input id="parola" name="parola" type="password"></label><button id="gir" type="submit">Giriş yap</button></form>`);
    }
    if (i.yol === '/acik/') {
      // Girişsiz açılan sayfa: oturum varsa ek alan çizilir (girişsiz taramada görünmemeli).
      return html('Açık sayfa', `<form><label>Arama <input id="arama" name="arama"></label>${oturum ? '<label>Özel <input id="ozel" name="ozel"></label>' : ''}</form>`);
    }
    if (!oturum) return yonlendir('/giris');
    if (i.yol === '/panel') {
      return this.panelGecikmeMs
        ? html('Panel', `<div id="p"></div><script>setTimeout(() => { document.getElementById('p').innerHTML = '<h1>Hoş geldiniz</h1>'; }, ${this.panelGecikmeMs});</script>`)
        : html('Panel', '<h1>Hoş geldiniz</h1>');
    }
    if (i.yol === '/basvuru/') {
      return html('Başvuru', '<form method="post" action="/basvuru/kaydet"><label>Ad <input id="ad" name="ad"></label><label>Soyad <input id="soyad" name="soyad"></label><button type="submit">Gönder</button></form>');
    }
    return { durum: 404, tur: 'text/plain', govde: 'yok' };
  };
}

const TARIF = {
  girisAdresi: '/giris', oturumKontrolAdresi: '/panel',
  kullaniciAlani: '#kullanici', parolaAlani: '#parola', gonderDugmesi: '#gir',
  basariGostergesi: { tur: 'metin', deger: 'Hoş geldiniz' },
  hataGostergeleri: [{ tur: 'metin', deger: 'Kullanıcı adı veya parola hatalı' }],
  ikinciAdim: { tur: 'yok' }, zamanAsimiSn: 15
};

// ---------------------------------------------------------------------------------------------------------------------------
// Ortak kurallar (dosya adı / anahtar / atomik yazım / köken sınırı) — tarayıcısız
// ---------------------------------------------------------------------------------------------------------------------------

test.describe('oturum dosyası ortak kuralları', () => {
  test('koşu ile tarama aynı dosyayı kullanır (ortam + varsayılan giriş profili); anahtar yoksa yazılmaz; başka anahtarla açılamayan dosya silinir', async () => {
    const klasor = geciciKlasor('tarama-oturumu-kural');
    const vt = await veritabaniniHazirla(join(klasor.yol, 'platform.db'));
    try {
      await kasaOlustur(vt, KASA_PAROLASI, { kdf: HIZLI_KDF });
      izinleriAc(vt);
      const projeId = projeKaydet(vt, { ad: 'Kural' });
      const ortamId = ortamKaydet(vt, { projeId, ad: 'TEST', tabanUrl: 'http://127.0.0.1:9', ayarlar: { riskli: false } });
      // Tüm ortamlar profili ÖNCE eklenir; ortama özgü profil yine de varsayılandır (koşu ve tarama aynı kural).
      const genelProfil = girisProfiliKaydet(vt, { projeId, ortamId: null, ad: 'A genel', kullaniciAdi: 'x', parola: 'y' });
      const ozelProfil = girisProfiliKaydet(vt, { projeId, ortamId, ad: 'Z özel', kullaniciAdi: KULLANICI, parola: PAROLA });
      girisProfiliKaydet(vt, { projeId, ortamId, ad: 'B ikinci özel', kullaniciAdi: 'k', parola: 'p' });
      expect(ortamVarsayilanGirisProfiliId(vt, projeId, ortamId)).toBe(ozelProfil);
      // Koşunun veri okuyucusu da aynı profili verir (oturum dosyası adı koşuda bu kimlikten).
      const d = platformOkuyucusunuCalistir(['genel', '--proje', projeId, '--ortam-id', ortamId],
        { PLATFORM_VERITABANI: String(vt.yol), PLATFORM_KASA_ANAHTARI: acikAnahtar(vt).toString('base64url') });
      expect(hataMi(d), JSON.stringify(d)).toBe(false);
      expect((d as { giris: { profilKimligi: string } }).giris.profilKimligi).toBe(ozelProfil);
      const dosya = oturumDosyaYolu(String(vt.yol), ortamId, ozelProfil);
      expect(dosya).toBe(join(klasor.yol, 'oturumlar', `genel-${ortamId.replace(/[^A-Za-z0-9-]/g, '').slice(0, 36)}-${ozelProfil.replace(/[^A-Za-z0-9-]/g, '').slice(0, 36)}.oturum`));
      expect(oturumDosyaYolu(String(vt.yol), ortamId, genelProfil)).not.toBe(dosya);

      const durum = { cookies: [{ name: 'oturum', value: 'abc', domain: '127.0.0.1', path: '/' }], origins: [] };
      // Kasa anahtarı yoksa: hiçbir şey yazılmaz / okunmaz (düz metin asla).
      expect(oturumDosyasinaYaz(dosya, null, durum)).toBe(false);
      expect(existsSync(dosya)).toBe(false);
      const anahtar = oturumAnahtariTuret(acikAnahtar(vt));
      expect(oturumDosyasinaYaz(dosya, anahtar, durum)).toBe(true);
      expect(readFileSync(dosya, 'utf8')).not.toContain('abc');
      expect(oturumDosyasiniOku(dosya, null)).toBeUndefined();
      expect(existsSync(dosya)).toBe(true);
      expect(oturumDosyasiniOku(dosya, anahtar)).toEqual(durum);
      // Koşunun okuyucusu (PLATFORM_KASA_ANAHTARI) aynı dosyayı açar.
      const onceki = process.env.PLATFORM_KASA_ANAHTARI;
      process.env.PLATFORM_KASA_ANAHTARI = acikAnahtar(vt).toString('base64url');
      try {
        expect(oturumuSifreliOku(dosya)).toEqual(durum);
      } finally {
        if (onceki === undefined) delete process.env.PLATFORM_KASA_ANAHTARI; else process.env.PLATFORM_KASA_ANAHTARI = onceki;
      }
      // Başka kasa anahtarıyla açılamayan dosya silinir (sonraki giriş yeniden yazar).
      expect(oturumDosyasiniOku(dosya, oturumAnahtariTuret(randomBytes(32)))).toBeUndefined();
      expect(existsSync(dosya)).toBe(false);
      anahtar?.fill(0);
    } finally { vt.kapat(); klasor.temizle(); }
  });

  test('köken sınırı: yalnız ortamın taban adresi ve tarifteki giriş adresinin çerezleri / yerel depolaması uygulanır', () => {
    const durum = {
      cookies: [
        { name: 'a', value: '1', domain: 'test.ornek.invalid' }, { name: 'b', value: '2', domain: '.ornek.invalid' },
        { name: 'c', value: '3', domain: 'giris.ornek.invalid' }, { name: 'd', value: '4', domain: 'baska.invalid' },
        { name: 'e', value: '5', domain: 'kotutest.ornek.invalid.baska.invalid' }
      ],
      origins: [{ origin: 'https://test.ornek.invalid', localStorage: [] }, { origin: 'https://baska.invalid', localStorage: [] }]
    };
    const kokenler = girisKokenleri('https://test.ornek.invalid/uygulama/', { girisAdresi: 'https://giris.ornek.invalid/oturum' });
    const s = oturumuKokenlereSinirla(durum, kokenler);
    expect(s?.cookies.map((c) => c.name)).toEqual(['a', 'b', 'c']);
    expect(s?.origins.map((o) => o.origin)).toEqual(['https://test.ornek.invalid']);
    expect(oturumuKokenlereSinirla({ yok: true }, kokenler)).toBeNull();
  });

  test('eşzamanlı yazım (iki süreç) dosyayı bozmaz: atomik yazım, son yazan kazanır', async () => {
    test.setTimeout(60_000);
    const klasor = geciciKlasor('tarama-oturumu-yaris');
    try {
      const kasa = randomBytes(32);
      const dosya = join(klasor.yol, 'oturumlar', 'genel-ortam-profil.oturum');
      const modul = pathToFileURL(join(KOK, 'scripts', 'platform', 'giris', 'oturum-dosyasi.mjs')).href;
      const betik = `import { oturumAnahtariTuret, oturumDosyasinaYaz } from '${modul}';
const a = oturumAnahtariTuret(Buffer.from(process.env.YARIS_ANAHTAR ?? '', 'base64url'));
let n = 0;
for (let i = 0; i < 60; i++) if (oturumDosyasinaYaz(process.env.YARIS_DOSYA ?? '', a, { cookies: [{ name: 'yazan', value: process.env.YARIS_AD + '-' + i + '-' + 'x'.repeat(4000), domain: '127.0.0.1' }], origins: [] })) n++;
process.stdout.write(String(n));`;
      const ciktilar: string[] = [];
      const basarili: number[] = [];
      const yazici = (ad: string) => new Promise<number>((coz) => {
        const s = spawn(process.execPath, ['--input-type=module', '-e', betik], {
          stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, YARIS_ANAHTAR: kasa.toString('base64url'), YARIS_DOSYA: dosya, YARIS_AD: ad }
        });
        s.stdout?.on('data', (p: Buffer) => basarili.push(Number(p.toString('utf8'))));
        s.stderr?.on('data', (p: Buffer) => ciktilar.push(p.toString('utf8')));
        s.on('close', (kod) => coz(kod ?? -1));
      });
      const anahtar = oturumAnahtariTuret(kasa);
      let okunan = 0;
      let bitti = false;
      const okuyucu = (async () => {
        while (!bitti) {
          // Okuma sırasında dosya hiçbir zaman yarım görülmez: çözülemeyen dosya silinirdi (aşağıda son dosya var olmalı).
          if (oturumDosyasiniOku(dosya, anahtar)) okunan++;
          await new Promise((c) => setTimeout(c, 10));
        }
      })();
      const kodlar = await Promise.all([yazici('kosu'), yazici('tarama')]);
      bitti = true;
      await okuyucu;
      // Yazım hiçbir zaman hata fırlatmaz (oturum önbellektir; kilitliyse o yazım atlanır); yazımların çoğu başarılı.
      expect(kodlar, ciktilar.join('\n')).toEqual([0, 0]);
      expect(basarili.reduce((x, y) => x + y, 0)).toBeGreaterThan(60);
      const son = oturumDosyasiniOku(dosya, anahtar);
      expect(son?.cookies[0].value).toMatch(/^(kosu|tarama)-\d+-x{4000}$/);
      expect(okunan).toBeGreaterThan(0);
    } finally { klasor.temizle(); }
  });

  test('ayar tanımı: varsayılan "Her seferinde baştan giriş yap"; oturum kontrolü yalnız ikinci seçenekte etkin; izin açıklaması oturum kullanımını da kapsar', () => {
    const kip = KOSU_AYAR_TANIMLARI.find((t) => t.anahtar === 'taramaGirisKipi');
    expect(kip).toMatchObject({ grup: 'Tarama ve akış kaydı', etiket: 'Tarama ve akış kaydında giriş', tur: 'secim', varsayilan: 'bastan',
      secenekler: [['bastan', 'Her seferinde baştan giriş yap'], ['saklananOturum', 'Koşunun saklanan oturumunu kullan']] });
    expect(kip?.env).toBeUndefined();
    expect(KOSU_AYAR_TANIMLARI.find((t) => t.anahtar === 'taramaOturumKontrolSn')?.etkinKosul).toEqual({
      anahtar: 'taramaGirisKipi', deger: 'saklananOturum', pasifAciklama: 'Yalnız "Koşunun saklanan oturumunu kullan" seçiliyken kullanılır.'
    });
    const izin = IZIN_TANIMLARI.find((t) => t.anahtar === 'giris-bilgisi');
    expect(izin?.aciklama).toContain('koşunun saklanan oturumunu kullanmak da giriş sayılır');
    expect(izin?.yapabilecekleri.some((y) => y.includes('saklanan oturumunu'))).toBe(true);
  });
});

// ---------------------------------------------------------------------------------------------------------------------------
// Tarama / akış kaydı (gerçek alt süreç)
// ---------------------------------------------------------------------------------------------------------------------------

test.describe('tarama ve akış kaydında giriş kipi', () => {
  test.describe.configure({ mode: 'serial' });

  let klasor: ReturnType<typeof geciciKlasor>;
  let vt: Veritabani;
  let projeId = '';
  let ortamId = '';
  let profilId = '';
  let uygulama: OturumluUygulama;
  let fs: Awaited<ReturnType<typeof yerelSunucu>>;
  let yonetici: TaramaYoneticisi;
  let sunucu: Server;
  let adres = '';
  let tarayici: Browser;
  let sira = 0;

  function govdeOku(req: IncomingMessage, sinir: number): Promise<string | null> {
    return new Promise((coz) => {
      const p: Buffer[] = [];
      let n = 0;
      req.on('data', (b: Buffer) => { n += b.length; if (n <= sinir) p.push(b); });
      req.on('end', () => coz(n > sinir ? null : Buffer.concat(p).toString('utf8')));
    });
  }
  function jsonGonder(res: ServerResponse, durum: number, govde: unknown): void {
    res.writeHead(durum, { 'content-type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(govde));
  }
  async function api(yol: string, govde?: Record<string, unknown>): Promise<{ durum: number; y: Yanit }> {
    const r = await fetch(`${adres}${yol}`, govde
      ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...govde, token: TOKEN }) }
      : { headers: { 'x-test-sunucu-token': TOKEN } });
    return { durum: r.status, y: (await r.json()) as Yanit };
  }
  async function bekle(id: string, kosul: (d: IsGorunumu) => boolean, sureMs = 120_000): Promise<IsGorunumu> {
    const son = Date.now() + sureMs;
    for (;;) {
      const d = (await api(`/platform/tarama/durum?id=${id}`)).y.is as IsGorunumu;
      if (kosul(d)) return d;
      if (Date.now() > son) throw new Error(`Beklenen durum gelmedi: ${JSON.stringify(d)}`);
      await new Promise((c) => setTimeout(c, 250));
    }
  }
  /** Taramayı başlatır ve bitmesini bekler. */
  async function tara(ek: Record<string, unknown> = {}): Promise<IsGorunumu> {
    const b = await api('/platform/tarama/baslat', { projeId, ekranAdi: `Oturum Denemesi ${++sira}`, ortamId, hedef: '/basvuru/', kesif: false, onay: true, ...ek });
    expect(b.durum, JSON.stringify(b.y)).toBe(202);
    const son = await bekle(String(b.y.isId), (d) => d.durum !== 'suruyor');
    expect(son.hata, JSON.stringify(son)).toBeNull();
    return son;
  }
  const dosya = (profil = profilId): string => oturumDosyaYolu(String(vt.yol), ortamId, profil);
  const dosyaIcerigi = (d = dosya()): string | null => (existsSync(d) ? readFileSync(d, 'utf8') : null);
  const girisMesaji = (d: IsGorunumu): string => String(d.adimlar.find((a) => a.anahtar === 'giris')?.mesaj ?? '');

  /** Koşunun yaptığının aynısı (model-kosucu.ts): giriş motoruyla giriş + oturum-kasasi ile şifreli yazım. */
  async function kosuGirisi(): Promise<void> {
    const onceki = process.env.PLATFORM_KASA_ANAHTARI;
    process.env.PLATFORM_KASA_ANAHTARI = acikAnahtar(vt).toString('base64url');
    const baglam = await tarayici.newContext({ baseURL: fs.adres });
    try {
      const tarif = girisTarifiniDogrula(TARIF).tarif;
      if (!tarif) throw new Error('tarif geçersiz');
      const page = await baglam.newPage();
      await girisYap(page, tarif, { kullaniciAdi: KULLANICI, parola: PAROLA, totpGizli: null, sabitKod: null, smsKipi: null }, { izinliKokenler: girisKokenleri(fs.adres, tarif) });
      expect(await oturumuSifreliYaz(baglam, dosya())).toBe(true);
    } finally {
      await baglam.close();
      if (onceki === undefined) delete process.env.PLATFORM_KASA_ANAHTARI; else process.env.PLATFORM_KASA_ANAHTARI = onceki;
    }
  }
  /** Dosyadaki oturumun belirteci (koşunun okuyucusuyla). */
  function dosyadakiBelirtec(): string | null {
    const onceki = process.env.PLATFORM_KASA_ANAHTARI;
    process.env.PLATFORM_KASA_ANAHTARI = acikAnahtar(vt).toString('base64url');
    try {
      return oturumuSifreliOku(dosya())?.cookies.find((c) => c.name === 'oturum')?.value ?? null;
    } finally {
      if (onceki === undefined) delete process.env.PLATFORM_KASA_ANAHTARI; else process.env.PLATFORM_KASA_ANAHTARI = onceki;
    }
  }

  test.beforeAll(async () => {
    test.setTimeout(120_000);
    klasor = geciciKlasor('tarama-oturumu');
    uygulama = new OturumluUygulama();
    fs = await yerelSunucu(uygulama.isle);
    vt = await veritabaniniHazirla(join(klasor.yol, 'platform.db'));
    await kasaOlustur(vt, KASA_PAROLASI, { kdf: HIZLI_KDF });
    izinleriAc(vt);
    projeId = projeKaydet(vt, { ad: 'Oturum Deneme' });
    ortamId = ortamKaydet(vt, { projeId, ad: 'TEST', tabanUrl: fs.adres, varsayilan: true, ayarlar: { riskli: false } });
    profilId = girisProfiliKaydet(vt, { projeId, ortamId, ad: 'TEST kullanıcısı', kullaniciAdi: KULLANICI, parola: PAROLA, ikiAsamaliTur: 'yok', smsAyari: {} });
    girisTarifiKaydet(vt, projeId, ortamId, TARIF);
    yonetici = taramaYoneticisiOlustur({
      projeKoku: KOK, zamanAsimiMs: 120_000,
      ortamDegiskenleri: { ...process.env, NOBETCI_TARAMA_IZINLI_KOKENLER: fs.adres, NOBETCI_YASAK_ADRESLER: '*yasak-ornek*', NOBETCI_KAYIT_BASSIZ: '1' }
    });
    sunucu = createServer((req, res) => {
      const url = new URL(req.url ?? '/', 'http://127.0.0.1');
      void taramaIsteginiIsle(req, res, {
        token: TOKEN,
        disTokenGecerli: req.headers['x-test-sunucu-token'] === TOKEN || url.searchParams.get('token') === TOKEN,
        jsonGonder,
        jsonGovde: async (sinir = 64 * 1024) => {
          const m = await govdeOku(req, sinir);
          if (m === null) { jsonGonder(res, 413, { basarili: false, mesaj: 'büyük' }); return null; }
          return m ? JSON.parse(m) as Record<string, unknown> : {};
        },
        acikVeritabani: async () => vt,
        projeKoku: KOK,
        yonetici
      }).then((eslesti) => { if (!eslesti) jsonGonder(res, 404, { basarili: false }); }).catch((h: unknown) => {
        jsonGonder(res, 400, { basarili: false, mesaj: h instanceof Error ? h.message : String(h) });
      });
    });
    await new Promise<void>((coz) => sunucu.listen(0, '127.0.0.1', coz));
    adres = `http://127.0.0.1:${(sunucu.address() as AddressInfo).port}`;
    tarayici = await korumaliTarayici();
  });

  test.afterAll(async () => {
    yonetici?.kapat();
    await tarayici?.close();
    sunucu?.closeAllConnections();
    await new Promise<void>((coz) => (sunucu ? sunucu.close(() => coz()) : coz()));
    await fs?.kapat();
    vt?.kapat();
    klasor?.temizle();
  });

  test.afterEach(() => {
    // Tarama siteye giriş dışında hiçbir yazma isteği göndermez (saklanan oturum bu korumayı gevşetmez).
    expect(uygulama.postlar.filter((p) => p !== '/giris')).toEqual([]);
  });

  test('varsayılan "Her seferinde baştan giriş yap": koşunun oturumu olsa da her taramada giriş yapılır, oturum dosyasına dokunulmaz', async () => {
    test.setTimeout(240_000);
    await kosuGirisi();
    expect(uygulama.girisSayisi).toBe(1);
    const kosuDosyasi = dosyaIcerigi();
    expect(kosuDosyasi).not.toBeNull();

    const b = await api('/platform/tarama/baslat', { projeId, ekranAdi: `Oturum Denemesi ${++sira}`, ortamId, hedef: '/basvuru/', kesif: false, onay: true });
    expect(b.durum, JSON.stringify(b.y)).toBe(202);
    // Girdide saklanan oturum yok; güncelleme hedefi yok.
    const kayit = yonetici.isler.get(String(b.y.isId)) as { girdi: Record<string, unknown> | null; oturumYazimi: unknown };
    expect(kayit.oturumYazimi).toBeNull();
    if (kayit.girdi) expect('oturum' in kayit.girdi).toBe(false);
    const d1 = await bekle(String(b.y.isId), (d) => d.durum !== 'suruyor');
    expect(d1.hata).toBeNull();
    expect(d1.giris).toEqual({ kip: 'bastan', yontem: 'bastanGiris', oturumSaklandi: null, oturumGuncellendi: false });
    expect(girisMesaji(d1)).toBe('Baştan giriş yapıldı.');
    const d2 = await tara();
    expect(d2.giris?.yontem).toBe('bastanGiris');
    expect(uygulama.girisSayisi).toBe(3);
    expect(dosyaIcerigi()).toBe(kosuDosyasi);
  });

  test('"Koşunun saklanan oturumunu kullan": koşunun oturumu geçerliyse giriş atlanır; dosya değişmez', async () => {
    test.setTimeout(180_000);
    kosuAyarlariniKaydet(vt, { taramaGirisKipi: 'saklananOturum' });
    const once = dosyaIcerigi();
    const son = await tara();
    expect(son.giris).toEqual({ kip: 'saklananOturum', yontem: 'saklananOturum', oturumSaklandi: true, oturumGuncellendi: false });
    expect(girisMesaji(son)).toBe('Saklanan oturum kullanıldı (giriş atlandı).');
    expect(son.profiller[0].alanSayisi).toBe(2);
    expect(uygulama.girisSayisi).toBe(3);
    expect(dosyaIcerigi()).toBe(once);
  });

  test('saklanan oturum geçersizse baştan giriş yapılır ve oturum aynı şifreli dosyaya yazılır (koşu da yeni oturumu kullanır)', async () => {
    test.setTimeout(180_000);
    uygulama.oturumlariGecersizKil();
    const once = dosyaIcerigi();
    const son = await tara();
    expect(son.giris).toEqual({ kip: 'saklananOturum', yontem: 'bastanGiris', oturumSaklandi: true, oturumGuncellendi: true });
    expect(girisMesaji(son)).toBe('Baştan giriş yapıldı. Oturum saklandı (koşu da kullanır).');
    expect(son.olaylar.map((o) => o.mesaj)).toContain('Saklanan oturum geçersiz; baştan giriş yapılıyor.');
    expect(uygulama.girisSayisi).toBe(4);
    const sonra = dosyaIcerigi();
    expect(sonra).not.toBeNull();
    expect(sonra).not.toBe(once);
    // Koşunun okuyucusu yeni (geçerli) oturumu görür (dosyada düz metin yok); sonraki tarama girişi atlar.
    const belirtec = dosyadakiBelirtec();
    expect(belirtec && uygulama.gecerli.has(belirtec)).toBe(true);
    expect(sonra).not.toContain(String(belirtec));
    expect((await tara()).giris?.yontem).toBe('saklananOturum');
    expect(uygulama.girisSayisi).toBe(4);
    // Oturum dosyası yoksa da: baştan giriş + dosya oluşur.
    rmSync(dosya(), { force: true });
    const yeni = await tara();
    expect(yeni.giris).toEqual({ kip: 'saklananOturum', yontem: 'bastanGiris', oturumSaklandi: false, oturumGuncellendi: true });
    expect(yeni.olaylar.map((o) => o.mesaj)).toContain('Saklanan oturum yok; baştan giriş yapılıyor.');
    expect(uygulama.girisSayisi).toBe(5);
    expect(existsSync(dosya())).toBe(true);
  });

  test('"Girişte oturum kontrolü" süresi ikinci seçenekte uygulanır', async () => {
    test.setTimeout(240_000);
    // Oturum geçerli ama başarı göstergesi 3 sn sonra çiziliyor.
    uygulama.panelGecikmeMs = 3_000;
    try {
      kosuAyarlariniKaydet(vt, { taramaOturumKontrolSn: 1 });
      const kisa = await tara();
      expect(kisa.giris?.yontem).toBe('bastanGiris');
      expect(uygulama.girisSayisi).toBe(6);
      kosuAyarlariniKaydet(vt, { taramaOturumKontrolSn: 10 });
      const uzun = await tara();
      expect(uzun.giris?.yontem).toBe('saklananOturum');
      expect(uygulama.girisSayisi).toBe(6);
    } finally {
      uygulama.panelGecikmeMs = 0;
      kosuAyarlariniKaydet(vt, { taramaOturumKontrolSn: 15 });
    }
  });

  test('"Giriş yapmadan aç" saklanan oturumu kullanmaz ve güncellemez', async () => {
    test.setTimeout(180_000);
    const once = dosyaIcerigi();
    expect(once).not.toBeNull();
    const b = await api('/platform/tarama/baslat', { projeId, ekranAdi: `Oturum Denemesi ${++sira}`, ortamId, hedef: '/acik/', kesif: false, onay: true, girissiz: true });
    expect(b.durum, JSON.stringify(b.y)).toBe(202);
    const kayit = yonetici.isler.get(String(b.y.isId)) as { girdi: Record<string, unknown> | null; oturumYazimi: unknown };
    expect(kayit.oturumYazimi).toBeNull();
    if (kayit.girdi) expect('oturum' in kayit.girdi).toBe(false);
    const son = await bekle(String(b.y.isId), (d) => d.durum !== 'suruyor');
    expect(son.hata).toBeNull();
    expect(son.giris).toBeNull();
    // Oturum çerezi gitmedi: yalnız girişsiz sayfanın alanı görüldü.
    expect(son.profiller[0].alanSayisi).toBe(1);
    expect(uygulama.girisSayisi).toBe(6);
    expect(dosyaIcerigi()).toBe(once);
  });

  test('farklı giriş profilinin oturumu kullanılmaz (anahtar: ortam + giriş profili)', async () => {
    test.setTimeout(180_000);
    // Tüm ortamlar için ikinci profil: bu ortamın varsayılanı ortama özgü profil kalır.
    const baskaProfil = girisProfiliKaydet(vt, { projeId, ortamId: null, ad: 'Başka kullanıcı', kullaniciAdi: 'baska', parola: 'baska-parola' });
    expect(ortamVarsayilanGirisProfiliId(vt, projeId, ortamId)).toBe(profilId);
    // Geçerli oturum başka profilin dosyasında; bu profilin dosyası yok.
    writeFileSync(dosya(baskaProfil), readFileSync(dosya()));
    rmSync(dosya(), { force: true });
    const baskaOnce = dosyaIcerigi(dosya(baskaProfil));
    const son = await tara();
    expect(son.giris).toMatchObject({ yontem: 'bastanGiris', oturumSaklandi: false, oturumGuncellendi: true });
    expect(uygulama.girisSayisi).toBe(7);
    expect(dosyaIcerigi(dosya(baskaProfil))).toBe(baskaOnce);
    expect(existsSync(dosya())).toBe(true);
  });

  test('akış kaydı da aynı seçimi kullanır: saklanan oturum geçerliyse giriş atlanır', async () => {
    test.setTimeout(180_000);
    const b = await api('/platform/tarama/baslat', { projeId, ekranAdi: `Kayıt Denemesi ${++sira}`, ortamId, hedef: '/basvuru/', onay: true, kip: 'kayit' });
    expect(b.durum, JSON.stringify(b.y)).toBe(202);
    const id = String(b.y.isId);
    const d = await bekle(id, (x) => x.durum !== 'suruyor' || x.adimlar.find((a) => a.anahtar === 'giris')?.durum === 'tamam');
    expect(d.hata).toBeNull();
    expect(d.giris).toMatchObject({ kip: 'saklananOturum', yontem: 'saklananOturum' });
    expect(girisMesaji(d)).toBe('Saklanan oturum kullanıldı (giriş atlandı).');
    expect(uygulama.girisSayisi).toBe(7);
    await api('/platform/tarama/iptal', { id });
    await bekle(id, (x) => x.durum !== 'suruyor');
    kosuAyarlariniKaydet(vt, { taramaGirisKipi: 'bastan' });
  });
});

// ---------------------------------------------------------------------------------------------------------------------------
// Arayüz: Ayarlar > Koşu > Tarama ve akış kaydı
// ---------------------------------------------------------------------------------------------------------------------------

test.describe('Ayarlar > Koşu arayüzü: tarama ve akış kaydında giriş', () => {
  let klasor: ReturnType<typeof geciciKlasor>;
  let nobetci: Nobetci;
  let tarayici: Browser;

  test.beforeAll(async () => {
    test.setTimeout(120_000);
    klasor = geciciKlasor('tarama-oturumu-arayuz');
    const vtYolu = join(klasor.yol, 'platform.db');
    const v = await veritabaniniHazirla(vtYolu);
    await kasaOlustur(v, KASA_PAROLASI, { kdf: HIZLI_KDF });
    v.kapat();
    nobetci = await nobetciBaslat(klasor.yol, vtYolu);
    await nobetciApi(nobetci, '/platform/kasa/ac', { parola: KASA_PAROLASI });
    await nobetciApi(nobetci, '/platform/proje/kaydet', { ad: 'Arayüz Projesi' });
    tarayici = await korumaliTarayici();
  });
  test.afterAll(async () => {
    await tarayici?.close();
    nobetci?.surec.kill('SIGTERM');
    klasor?.temizle();
  });

  test('ilk seçenekte "Girişte oturum kontrolü" pasif ve açıklamalı; ikinci seçenekte etkin; kaydedilir; masaüstü ve 390 px taşmasız', async ({}, testInfo) => {
    test.setTimeout(90_000);
    const baglam = await tarayici.newContext({ baseURL: nobetci.adres, viewport: { width: 1400, height: 1000 } });
    const istekler: string[] = [];
    baglam.on('request', (r) => { istekler.push(r.url()); });
    const page = await baglam.newPage();
    const hatalar: string[] = [];
    page.on('pageerror', (e) => hatalar.push(String(e)));
    const tasma = () => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    await page.goto('/#/ayarlar/kosu');
    const form = page.getByRole('form', { name: 'Koşu ayarları' });
    const kip = form.getByLabel('Tarama ve akış kaydında giriş');
    const kontrol = form.getByLabel('Girişte oturum kontrolü (sn)');
    const not = form.getByText('Yalnız "Koşunun saklanan oturumunu kullan" seçiliyken kullanılır.');
    await expect(kip).toHaveValue('bastan');
    await expect(kontrol).toBeDisabled();
    await expect(kontrol).toHaveValue('15');
    await expect(not).toBeVisible();
    // Açıklama erişilebilir açıklamaya bağlı.
    expect(await kontrol.getAttribute('aria-describedby')).toContain('-pasif');
    expect(await tasma()).toBeLessThanOrEqual(0);
    await page.screenshot({ path: testInfo.outputPath('tarama-girisi-pasif-masaustu.png'), fullPage: true });

    await kip.selectOption('saklananOturum');
    await expect(kontrol).toBeEnabled();
    await expect(not).toBeHidden();
    await kontrol.fill('9');
    await form.getByRole('button', { name: 'Kaydet' }).click();
    await expect(form.getByText('Koşu ayarları kaydedildi')).toBeVisible();
    const y = await nobetciApi(nobetci, '/platform/kosu-ayarlari') as { ayarlar: Record<string, unknown> };
    expect(y.ayarlar).toMatchObject({ taramaGirisKipi: 'saklananOturum', taramaOturumKontrolSn: 9 });

    // Geri ilk seçenek: alan pasifleşir, değer korunur ve kaydedilir.
    await kip.selectOption('bastan');
    await expect(kontrol).toBeDisabled();
    await expect(not).toBeVisible();
    await form.getByRole('button', { name: 'Kaydet' }).click();
    await expect(form.getByText('Koşu ayarları kaydedildi')).toBeVisible();
    const y2 = await nobetciApi(nobetci, '/platform/kosu-ayarlari') as { ayarlar: Record<string, unknown> };
    expect(y2.ayarlar).toMatchObject({ taramaGirisKipi: 'bastan', taramaOturumKontrolSn: 9 });

    await page.setViewportSize({ width: 390, height: 844 });
    await page.reload();
    await expect(kontrol).toBeDisabled();
    await not.scrollIntoViewIfNeeded();
    await expect(not).toBeVisible();
    expect(await tasma()).toBeLessThanOrEqual(0);
    // Açıklama kutusu kendi alanından taşmaz.
    const kutu = await not.boundingBox();
    expect(kutu && kutu.x >= 0 && kutu.x + kutu.width <= 390).toBe(true);
    await page.screenshot({ path: testInfo.outputPath('tarama-girisi-pasif-390.png'), fullPage: true });
    expect(hatalar).toEqual([]);
    expect(istekler.filter((u) => !u.startsWith(nobetci.adres) && !u.startsWith('data:') && !u.startsWith('blob:'))).toEqual([]);
    await baglam.close();
  });
});
