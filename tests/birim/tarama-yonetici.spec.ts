// OTOMATİK TARAMA İŞ YÖNETİCİSİ (sunucu uçları + gerçek Playwright alt süreci) — scripts/platform/tarama/yonetici.mjs.
// Geçici veritabanı (kasa, proje, ortamlar, giriş profilleri, giriş tarifleri, bağlam profilleri) ile /platform/tarama/*
// uçları yerel bir http sunucusundan çağrılır; iş, tarama.config.ts ile ayrı bir süreç grubunda koşar.
// Güvenlik: ortam adresleri 127.0.0.1'deki fikstürlerdir; alt süreç yalnızca bu kökenlere istek atabilir ve tarayıcısı
// DNS çözümlemez (NOBETCI_TARAMA_IZINLI_KOKENLER). Yasaklı adres kalıbına uyan ortam tarayıcı açılmadan reddedilir.
// Gerçek veritabanına (veri/platform.db) ve medya klasörüne dokunulmaz.
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { expect, test } from '@playwright/test';
import { kasaOlustur } from '../../scripts/platform/kasa.mjs';
import type { Veritabani } from '../../scripts/platform/veritabani/baglanti.mjs';
import {
  baglamProfiliKaydet, girisProfiliKaydet, ortamKaydet, projeKaydet, veritabaniniHazirla
} from '../../scripts/platform/veritabani/depo.mjs';
import { girisTarifiKaydet } from '../../scripts/platform/giris/tarif-deposu.mjs';
import { tabanAdresiIslemi } from '../../scripts/platform/servisler/taban-adresleri.mjs';
import { yasakAdresleriKaydet } from '../../scripts/platform/guvenlik/yasak-adresler.mjs';
import { kosuAyarlariniKaydet } from '../../scripts/platform/ayarlar/kosu-ayarlari.mjs';
import { sayfaPaketiniDogrula } from '../../scripts/platform/ekranlar/sayfa-paketi.mjs';
import { analizGetir, analizYukle, paketOnizle, sayfaEkle } from '../../scripts/platform/ekranlar/ekran-servisi.mjs';
import { taramaIsteginiIsle, taramaYoneticisiOlustur, type IsGorunumu, type TaramaYoneticisi } from '../../scripts/platform/tarama/yonetici.mjs';
import { TARAMA_TOKEN_BASLIGI } from '../../scripts/platform/tarama/protokol.mjs';
import { SIRKET_DESENI, yerelSunucu } from './giris-fikstur';
import { HIZLI_KDF, geciciKlasor, izinleriAc } from './platform-ortak';
import { TARAMA_KULLANICI, TARAMA_PAROLA, TARAMA_SMS_KODU, TaramaFiksturu, YASAKLI_GORSEL_HOST, taramaGirisTarifi } from './tarama-fikstur';

type Yanit = Record<string, unknown> & { basarili?: boolean; mesaj?: string; kod?: string };
const KOK = resolve(__dirname, '..', '..');
const TOKEN = 'oturum-tokeni-deneme';

test.describe.configure({ mode: 'serial' });

let klasor: ReturnType<typeof geciciKlasor>;
let vt: Veritabani;
let projeId = '';
const ortamlar: Record<string, string> = {};
let fikstur: TaramaFiksturu;
let smsFikstur: TaramaFiksturu;
let fs1: Awaited<ReturnType<typeof yerelSunucu>>;
let fs2: Awaited<ReturnType<typeof yerelSunucu>>;
let yonetici: TaramaYoneticisi;
let sunucu: Server;
let adres = '';
let ekranId = '';

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

async function yoneticiyiKur(y: TaramaYoneticisi): Promise<void> {
  yonetici = y;
  sunucu?.closeAllConnections();
  await new Promise<void>((coz) => (sunucu ? sunucu.close(() => coz()) : coz()));
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
      yonetici: y
    }).then((eslesti) => { if (!eslesti) jsonGonder(res, 404, { basarili: false }); }).catch((h: unknown) => {
      jsonGonder(res, 400, { basarili: false, mesaj: h instanceof Error ? h.message : String(h) });
    });
  });
  await new Promise<void>((coz) => sunucu.listen(0, '127.0.0.1', coz));
  adres = `http://127.0.0.1:${(sunucu.address() as AddressInfo).port}`;
}

function yeniYonetici(ek: { zamanAsimiMs?: number; yasak?: string } = {}): TaramaYoneticisi {
  return taramaYoneticisiOlustur({
    projeKoku: KOK, zamanAsimiMs: ek.zamanAsimiMs ?? 120_000,
    ortamDegiskenleri: { ...process.env, NOBETCI_TARAMA_IZINLI_KOKENLER: `${fs1.adres},${fs2.adres}`, NOBETCI_YASAK_ADRESLER: ek.yasak ?? `*yasak-ornek*,${YASAKLI_GORSEL_HOST}` }
  });
}

async function api(yol: string, govde?: Record<string, unknown>): Promise<{ durum: number; y: Yanit }> {
  const r = await fetch(`${adres}${yol}`, govde
    ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...govde, token: TOKEN }) }
    : { headers: { 'x-test-sunucu-token': TOKEN } });
  return { durum: r.status, y: (await r.json()) as Yanit };
}

async function durum(id: string): Promise<IsGorunumu> {
  return (await api(`/platform/tarama/durum?id=${id}`)).y.is as IsGorunumu;
}

async function bekle(id: string, kosul: (d: IsGorunumu) => boolean, sureMs = 120_000): Promise<IsGorunumu> {
  const son = Date.now() + sureMs;
  for (;;) {
    const d = await durum(id);
    if (kosul(d)) return d;
    if (Date.now() > son) throw new Error(`Beklenen durum gelmedi: ${JSON.stringify(d)}`);
    await new Promise((c) => setTimeout(c, 250));
  }
}

test.beforeAll(async () => {
  klasor = geciciKlasor('tarama');
  fikstur = new TaramaFiksturu();
  smsFikstur = new TaramaFiksturu({ sms: true });
  fs1 = await yerelSunucu(fikstur.isle);
  fs2 = await yerelSunucu(smsFikstur.isle);
  vt = await veritabaniniHazirla(join(klasor.yol, 'platform.db'));
  await kasaOlustur(vt, 'Gecici-Tarama-Parolasi-1', { kdf: HIZLI_KDF });
  // İzinlerden bağımsız davranış sınanıyor: Ayarlar > İzinler (varsayılan kapalı) açılır.
  izinleriAc(vt);
  projeId = projeKaydet(vt, { ad: 'Tarama Deneme' });
  ortamlar.TEST = ortamKaydet(vt, { projeId, ad: 'TEST', tabanUrl: fs1.adres, varsayilan: true, ayarlar: { riskli: false } });
  ortamlar.SMS = ortamKaydet(vt, { projeId, ad: 'SMS', tabanUrl: fs2.adres, ayarlar: { riskli: false } });
  ortamlar.YASAKLI = ortamKaydet(vt, { projeId, ad: 'YASAKLI', tabanUrl: 'https://portal.yasak-ornek.invalid' });
  for (const [ad, id] of Object.entries(ortamlar)) {
    girisProfiliKaydet(vt, { projeId, ortamId: id, ad: `${ad} kullanıcısı`, kullaniciAdi: TARAMA_KULLANICI, parola: TARAMA_PAROLA, ikiAsamaliTur: ad === 'SMS' ? 'sms' : 'yok', smsAyari: ad === 'SMS' ? { yontem: 'elle' } : {} });
    girisTarifiKaydet(vt, projeId, id, taramaGirisTarifi({ sms: ad === 'SMS' }));
  }
  baglamProfiliKaydet(vt, { projeId, tur: 'Profil', ad: 'Standart', alanlar: { profilKodu: 'P1' } });
  baglamProfiliKaydet(vt, { projeId, tur: 'Profil', ad: 'Yetkili', alanlar: { profilKodu: 'P2' } });
  await yoneticiyiKur(yeniYonetici());
});

test.afterAll(async () => {
  yonetici?.kapat();
  sunucu?.closeAllConnections();
  await new Promise<void>((coz) => (sunucu ? sunucu.close(() => coz()) : coz()));
  await fs1?.kapat();
  await fs2?.kapat();
  vt?.kapat();
  klasor?.temizle();
});

test('yeni ekran: başlat → ilerleme → sonuç → paket (önizleme ve "Ekran ekle" akışına girer)', async () => {
  test.setTimeout(180_000);
  const secenekler = (await api(`/platform/tarama/secenekler?projeId=${projeId}`)).y as { ortamlar: Array<{ ad: string; tarif: { baglamTuru: string } | null; girisProfili: unknown }>; baglamProfilleri: Array<{ tur: string; ad: string }> };
  expect(secenekler.ortamlar.find((o) => o.ad === 'TEST')).toMatchObject({ tarif: { baglamTuru: 'Profil' }, girisProfili: { ad: 'TEST kullanıcısı' } });
  expect(secenekler.baglamProfilleri.map((p) => p.ad)).toEqual(['Standart', 'Yetkili']);
  expect(JSON.stringify(secenekler)).not.toContain(TARAMA_PAROLA);
  expect(JSON.stringify(secenekler)).not.toContain('P1');

  const govde = { projeId, ekranAdi: 'Örnek Başvuru', ortamId: ortamlar.TEST, baglamProfilleri: ['Standart', 'Yetkili'], hedef: '/basvuru/', kesif: true };
  const onaysiz = await api('/platform/tarama/baslat', govde);
  expect(onaysiz).toMatchObject({ durum: 400, y: { kod: 'ONAY_GEREKLI' } });
  const b = await api('/platform/tarama/baslat', { ...govde, onay: true });
  expect(b.durum, JSON.stringify(b.y)).toBe(202);
  const isId = String(b.y.isId);
  const ikinci = await api('/platform/tarama/baslat', { ...govde, onay: true });
  expect(ikinci).toMatchObject({ durum: 409, y: { kod: 'MESGUL', isId } });
  expect((await api('/platform/tarama/aktif')).y.is).toMatchObject({ id: isId, ekran: { ad: 'Örnek Başvuru', anahtar: 'ornek-basvuru' } });

  const gorulen = new Set<string>();
  const son = await bekle(isId, (d) => {
    for (const p of d.profiller) gorulen.add(`${p.ad}:${p.durum}:${p.adim ?? ''}`);
    return d.durum !== 'suruyor';
  });
  expect(son.hata).toBeNull();
  expect(son).toMatchObject({ durum: 'tamam', mod: 'yeni', hedefYol: '/basvuru/', paketHazir: true, ozet: { alanSayisi: 15, kosulSayisi: 2, kanitSayisi: 2 } });
  expect(son.adimlar.map((a) => [a.anahtar, a.durum])).toEqual([['hazirlik', 'tamam'], ['giris', 'tamam'], ['profiller', 'tamam'], ['paket', 'tamam']]);
  expect(son.profiller).toEqual([
    expect.objectContaining({ ad: 'Standart', durum: 'tamam', alanSayisi: 14 }), expect.objectContaining({ ad: 'Yetkili', durum: 'tamam', alanSayisi: 15 })
  ]);
  expect(gorulen.has('Standart:suruyor:tarama') || gorulen.has('Standart:suruyor:kesif') || gorulen.has('Standart:suruyor:baglam')).toBe(true);
  expect(son.engellenenler.some((e) => e.neden === 'yazma' && String(e.adres).endsWith('/basvuru/otomatik-kaydet'))).toBe(true);
  expect(son.engellenenler.filter((e) => e.neden === 'izinsiz-koken')).toEqual([]);
  expect(JSON.stringify(son)).not.toContain(TARAMA_PAROLA);

  // Tek kullanımlık girdi: iş bittikten sonra aynı token'la bile alınamaz; yanlış token reddedilir.
  const kayit = yonetici.isler.get(isId) as { token: string };
  expect((await fetch(`${adres}/platform/tarama/is/${isId}/girdi`, { headers: { [TARAMA_TOKEN_BASLIGI]: kayit.token } })).status).toBe(410);
  expect((await fetch(`${adres}/platform/tarama/is/${isId}/girdi`, { headers: { [TARAMA_TOKEN_BASLIGI]: 'yanlis' } })).status).toBe(401);

  const p = await api(`/platform/tarama/paket?id=${isId}`);
  expect(p.y).toMatchObject({ mod: 'yeni', ekran: { id: null, ad: 'Örnek Başvuru', anahtar: 'ornek-basvuru' } });
  const paket = p.y.paket as Record<string, unknown>;
  expect(sayfaPaketiniDogrula(paket).hatalar).toEqual([]);
  expect(paket.meta).toMatchObject({ ekran: { anahtar: 'ornek-basvuru', ad: 'Örnek Başvuru', urlYolu: '/basvuru/' }, olusturan: 'Nöbetçi otomatik tarama', baglamProfilleri: ['Standart', 'Yetkili'] });
  const o = paketOnizle(vt, projeId, paket, { mod: 'yeni' });
  expect(o.hatalar).toEqual([]);
  expect(o.gecerli).toBe(true);
  const eklendi = await sayfaEkle(vt, projeId, paket, { medyaKlasoru: join(klasor.yol, 'medya') });
  expect(eklendi).toMatchObject({ surum: 1, kanitSayisi: 2 });
  ekranId = eklendi.ekranId;

  // Fikstüre yalnızca giriş ve profil değiştirme POST'ları ulaştı.
  expect(fikstur.postlar()).toEqual(['POST /giris', 'POST /profil', 'POST /profil']);
  expect(fikstur.kayitlar.filter((k) => SIRKET_DESENI.test(k.yol) || k.yol.startsWith('/basvuru/') && k.yol !== '/basvuru/')).toEqual([]);
});

test('mevcut ekran: son seçim hatırlanır, paket tekrar analize girer (yeni alan → bulgu)', async () => {
  test.setTimeout(180_000);
  expect(ekranId).not.toBe('');
  fikstur.ekAlan = true;
  const b = await api('/platform/tarama/baslat', { projeId, ekranId, ortamId: ortamlar.TEST, baglamProfilleri: ['Yetkili', 'Standart'], hedef: '', kesif: false, onay: true });
  expect(b.durum, JSON.stringify(b.y)).toBe(202);
  const son = await bekle(String(b.y.isId), (d) => d.durum !== 'suruyor');
  expect(son.hata).toBeNull();
  expect(son).toMatchObject({ durum: 'tamam', mod: 'analiz', hedefYol: '/basvuru/', kesif: false });
  const secenekler = (await api(`/platform/tarama/secenekler?projeId=${projeId}&ekranId=${ekranId}`)).y;
  expect(secenekler.son).toEqual({ ortamId: ortamlar.TEST, hedef: '', kesif: false, baglamProfilleri: ['Yetkili', 'Standart'] });
  expect(secenekler.ekran).toMatchObject({ id: ekranId, modelVar: true, urlYolu: '/basvuru/' });

  const p = await api(`/platform/tarama/paket?id=${String(b.y.isId)}`);
  expect(p.y.mod).toBe('analiz');
  const r = await analizYukle(vt, projeId, ekranId, p.y.paket, { medyaKlasoru: join(klasor.yol, 'medya') });
  const a = analizGetir(vt, projeId, ekranId).analiz as { bulgular: Array<{ tur: string; baslik: string }> };
  // Keşif kapalıyken koşullu alanlar görülmedi ama KALDIRILMADI; tek fark yeni "Referans kodu" alanı.
  expect(a.bulgular.map((x) => `${x.tur}: ${x.baslik}`)).toEqual(['yeniAlan: Yeni alan: Referans kodu']);
  expect(r.bulguSayisi).toBe(1);
  fikstur.ekAlan = false;
});

test('SMS "elle" kodu iş durumunda istenir ve iletilir; iptal süreci kapatır; süre sınırı', async () => {
  test.setTimeout(240_000);
  const govde = { projeId, ekranAdi: 'SMS Başvuru', ortamId: ortamlar.SMS, baglamProfilleri: ['Standart'], hedef: `${fs2.adres}/basvuru/`, kesif: false, onay: true, canliOnay: true };
  const b = await api('/platform/tarama/baslat', govde);
  expect(b.durum, JSON.stringify(b.y)).toBe(202);
  const isId = String(b.y.isId);
  const bekleyen = await bekle(isId, (d) => Boolean(d.kodIstegi) || d.durum !== 'suruyor');
  expect(bekleyen.kodIstegi?.mesaj).toContain('SMS');
  expect((await api('/platform/tarama/kod', { id: isId, kod: '12' })).y.kod).toBe('KOD');
  expect((await api('/platform/tarama/kod', { id: isId, kod: TARAMA_SMS_KODU })).y).toMatchObject({ basarili: true, iletildi: true });
  const son = await bekle(isId, (d) => d.durum !== 'suruyor');
  expect(son.hata).toBeNull();
  expect(son.durum).toBe('tamam');
  expect(smsFikstur.postlar()).toEqual(['POST /giris', 'POST /dogrulama', 'POST /profil']);

  // İptal: kod beklenirken.
  const b2 = await api('/platform/tarama/baslat', govde);
  const id2 = String(b2.y.isId);
  await bekle(id2, (d) => Boolean(d.kodIstegi));
  const kayit = yonetici.isler.get(id2) as { surec: { pid: number } | null; kodYolu: string };
  const pid = kayit.surec?.pid;
  expect((await api('/platform/tarama/iptal', { id: id2 })).y).toMatchObject({ basarili: true, iptal: true });
  const iptal = await durum(id2);
  expect(iptal).toMatchObject({ durum: 'iptal', hata: { kod: 'IPTAL' }, kodIstegi: null });
  await expect.poll(() => (yonetici.isler.get(id2) as { surec: unknown }).surec, { timeout: 15_000 }).toBeNull();
  expect(pid && (() => { try { process.kill(pid, 0); return true; } catch { return false; } })()).toBe(false);
  expect(existsSync(`${kayit.kodYolu}.istek.json`)).toBe(false);
  expect((await api('/platform/tarama/iptal', { id: id2 })).durum).toBe(409);

  // Süre sınırı: kod hiç girilmezse iş zaman aşımıyla durur.
  await yoneticiyiKur(yeniYonetici({ zamanAsimiMs: 8_000 }));
  const b3 = await api('/platform/tarama/baslat', govde);
  const zaman = await bekle(String(b3.y.isId), (d) => d.durum !== 'suruyor', 30_000);
  expect(zaman).toMatchObject({ durum: 'hata', hata: { kod: 'ZAMAN_ASIMI' } });
  expect(zaman.hata?.mesaj).toContain('süre sınırını aştı');
  await yoneticiyiKur(yeniYonetici());
});

test('yasaklı adres (ortam değişkeni ve Ayarlar > Güvenlik) ve geçersiz hedef: tarayıcı açılmadan red', async () => {
  const once = fikstur.kayitlar.length;
  const y1 = await api('/platform/tarama/baslat', { projeId, ekranAdi: 'Yasaklı', ortamId: ortamlar.YASAKLI, hedef: '/x/', onay: true, canliOnay: true });
  expect(y1).toMatchObject({ durum: 400, y: { kod: 'YASAKLI_ADRES' } });
  expect(y1.y.mesaj).toMatch(/^Tarama reddedildi: portal\.yasak-ornek\.invalid adresi yasaklı adres kalıbına \("\*yasak-ornek\*"\) uyuyor/);

  yasakAdresleriKaydet(vt, ['127.0.0.*']);
  try {
    const y2 = await api('/platform/tarama/baslat', { projeId, ekranAdi: 'Yerel', ortamId: ortamlar.TEST, hedef: '/basvuru/', onay: true });
    expect(y2).toMatchObject({ durum: 400, y: { kod: 'YASAKLI_ADRES' } });
    expect(y2.y.mesaj).toContain('127.0.0.1 adresi yasaklı adres kalıbına ("127.0.0.*")');
  } finally {
    yasakAdresleriKaydet(vt, []);
  }
  const y3 = await api('/platform/tarama/baslat', { projeId, ekranAdi: 'Başka', ortamId: ortamlar.TEST, hedef: 'http://127.0.0.2:9/form', onay: true });
  // Kayıtsız başka site: 409 + köken; sorulmadan hiçbir istek atılmaz (kayıt / tarayıcı yok).
  expect(y3).toMatchObject({ durum: 409, y: { kod: 'TABAN_KAYITLI_DEGIL', koken: 'http://127.0.0.2:9' } });
  expect(y3.y.mesaj).toBe('Bu site adresi kayıtlı değil (http://127.0.0.2:9). Taban adres olarak kaydedeyim mi? (kaydedilirse yolu ayırırım)');
  const y4 = await api('/platform/tarama/baslat', { projeId, ekranAdi: 'Bozuk', ortamId: ortamlar.TEST, hedef: 'ftp://127.0.0.2:9/form', onay: true });
  expect(y4).toMatchObject({ durum: 400, y: { kod: 'HEDEF' } });
  expect((await api('/platform/tarama/aktif')).y.is).toBeNull();
  expect(fikstur.kayitlar.length).toBe(once);
});

test('kayıtlı taban adresi olan başka sitenin tam adresi kabul edilir: taban ve yol ayrılır, ekranın adresi yol olarak kalır', async () => {
  test.setTimeout(120_000);
  // Onay gelmeden (kayıtsız) reddedilir; onaydan sonra (taban adresi kaydı) aynı istek sürer.
  const govde = { projeId, ekranAdi: 'Başka Site Formu', ortamId: ortamlar.TEST, hedef: `${fs2.adres}/basvuru/?adim=1`, kesif: false, onay: true, girissiz: true };
  expect(await api('/platform/tarama/baslat', govde)).toMatchObject({ durum: 409, y: { kod: 'TABAN_KAYITLI_DEGIL', koken: fs2.adres } });
  tabanAdresiIslemi(vt, projeId, { islem: 'ekle', ad: 'Başka Site', adresler: { [ortamlar.TEST]: fs2.adres }, onay: true });
  const b = await api('/platform/tarama/baslat', govde);
  expect(b.durum, JSON.stringify(b.y)).toBe(202);
  const son = await bekle(String(b.y.isId), (d) => d.durum !== 'suruyor');
  expect(son.hata, JSON.stringify(son.hata)).toBeNull();
  expect(son).toMatchObject({ durum: 'tamam', hedefYol: '/basvuru/?adim=1' });
});

test('girişte giriş alanı beklemesi / oturum kontrolü: Ayarlar > Koşu > Tarama ve akış kaydı (koşudaki giriş ayarlarından ayrı) alt sürece gider', async () => {
  test.setTimeout(120_000);
  // Giriş sayfasında olmayan kullanıcı adı alanı: bekleme süresi dolunca anlaşılır hata (süre ayardan).
  const tarif = { ...taramaGirisTarifi(), kullaniciAlani: '#olmayan-kullanici' };
  const ortamId = ortamKaydet(vt, { projeId, ad: 'BEKLEME', tabanUrl: fs1.adres, ayarlar: { riskli: false } });
  girisProfiliKaydet(vt, { projeId, ortamId, ad: 'BEKLEME kullanıcısı', kullaniciAdi: TARAMA_KULLANICI, parola: TARAMA_PAROLA, ikiAsamaliTur: 'yok', smsAyari: {} });
  girisTarifiKaydet(vt, projeId, ortamId, tarif);
  kosuAyarlariniKaydet(vt, { taramaGirisAlanBeklemeSn: 1, taramaOturumKontrolSn: 7, girisAlanBeklemeSn: 40 });
  try {
    const b = await api('/platform/tarama/baslat', { projeId, ekranAdi: 'Bekleme Denemesi', ortamId, hedef: '/basvuru/', kesif: false, onay: true });
    expect(b.durum, JSON.stringify(b.y)).toBe(202);
    const isId = String(b.y.isId);
    const kayit = yonetici.isler.get(isId) as { girdi: { tarayici: Record<string, unknown> } };
    expect(kayit.girdi.tarayici).toMatchObject({ oturumKontrolMs: 7_000, girisAlanBeklemeMs: 1_000 });
    const bas = Date.now();
    const son = await bekle(isId, (d) => d.durum !== 'suruyor');
    expect(son).toMatchObject({ durum: 'hata' });
    // Koşudaki "Giriş alanı beklemesi" (40 sn) değil, taramanınki (1 sn) kullanıldı.
    expect(son.hata?.mesaj).toContain('Kullanıcı adı alanı (#olmayan-kullanici) 1 sn içinde görünmedi');
    expect(Date.now() - bas).toBeLessThan(40_000);
    expect(son.adimlar.find((a) => a.anahtar === 'giris')?.durum).toBe('hata');
  } finally {
    kosuAyarlariniKaydet(vt, { taramaGirisAlanBeklemeSn: 15, taramaOturumKontrolSn: 15, girisAlanBeklemeSn: 15 });
  }
});

test('"Tarama ve akış kaydında koşu ayarlarını kullan" açıkken tarama tarayıcısı koşunun ekran boyutunu, dilini ve giriş beklemelerini alır', async () => {
  test.setTimeout(120_000);
  // Taramanın ayrı değerleri farklı: açıkken kullanılmaz (silinmez).
  kosuAyarlariniKaydet(vt, { taramaKosuAyarlariniKullan: true, taramaEkranGenisligi: 1600, taramaGirisAlanBeklemeSn: 3,
    kosuEkranGenisligi: 1440, kosuEkranYuksekligi: 810, kosuDili: 'varsayilan', oturumKontrolSn: 12, girisAlanBeklemeSn: 9 });
  try {
    const b = await api('/platform/tarama/baslat', { projeId, ekranAdi: 'Birlesik Ayar', ortamId: ortamlar.TEST, hedef: '/basvuru/', kesif: false, onay: true });
    expect(b.durum, JSON.stringify(b.y)).toBe(202);
    const isId = String(b.y.isId);
    const kayit = yonetici.isler.get(isId) as { girdi: { tarayici: Record<string, unknown> } };
    // Koşudaki "Tarayıcı varsayılanı" dili: dil verilmez (null).
    expect(kayit.girdi.tarayici).toMatchObject({ genislik: 1440, yukseklik: 810, dil: null, oturumKontrolMs: 12_000, girisAlanBeklemeMs: 9_000 });
    await bekle(isId, (d) => d.durum !== 'suruyor');
  } finally {
    kosuAyarlariniKaydet(vt, { taramaKosuAyarlariniKullan: false, taramaEkranGenisligi: 1366, taramaGirisAlanBeklemeSn: 15,
      kosuEkranGenisligi: 1280, kosuEkranYuksekligi: 720, kosuDili: 'varsayilan', oturumKontrolSn: 15, girisAlanBeklemeSn: 15 });
  }
});
