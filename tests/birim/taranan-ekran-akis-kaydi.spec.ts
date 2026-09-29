// TARANAN EKRANIN AKIŞI KAYDEDİLİR: otomatik tarama modeli (sürüm 1) akış diyagramında düzenlenip kaydedilince adımlara koşu
// tanımı ("kosu": aksiyon / başarı göstergesi) yazılır; bu sürüm 2 özelliğidir. Kayıt modeli kendiliğinden sürüm 2'ye yükseltir
// (sürüm 2, sürüm 1'in üst kümesidir) ve kullanıcıya anlaşılır bir not döner. Sürüm 1 model kaydedilmedikçe aynen kalır.
// Gerçek tarama: 127.0.0.1'deki sahte uygulama (tarama-fikstur), geçici veritabanı; dışarıya istek yok.
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { join, resolve } from 'node:path';
import { expect, test } from '@playwright/test';
import { kasaOlustur } from '../../scripts/platform/kasa.mjs';
import type { Veritabani } from '../../scripts/platform/veritabani/baglanti.mjs';
import {
  baglamProfiliKaydet, ekranModeliGetir, girisProfiliKaydet, ortamKaydet, projeKaydet, veritabaniniHazirla
} from '../../scripts/platform/veritabani/depo.mjs';
import { girisTarifiKaydet } from '../../scripts/platform/giris/tarif-deposu.mjs';
import { EkranDogrulamaHatasi, modeliDogrula, sayfaEkle } from '../../scripts/platform/ekranlar/ekran-servisi.mjs';
import { anlasilirDogrulamaIletisi, semaSurumunuYukselt } from '../../scripts/dogrulama/ekran-modeli-dogrulayici.mjs';
import { akisKaydet, akisTasarimi } from '../../scripts/platform/ekranlar/akis-servisi.mjs';
import type { AkisBlogu } from '../../scripts/platform/tarama/akis-tasarimi.mjs';
import { taramaIsteginiIsle, taramaYoneticisiOlustur, type IsGorunumu, type TaramaYoneticisi } from '../../scripts/platform/tarama/yonetici.mjs';
import { yerelSunucu } from './giris-fikstur';
import { HIZLI_KDF, geciciKlasor, izinleriAc } from './platform-ortak';
import { TARAMA_KULLANICI, TARAMA_PAROLA, TaramaFiksturu, YASAKLI_GORSEL_HOST, taramaGirisTarifi } from './tarama-fikstur';

type Nesne = Record<string, unknown>;
const KOK = resolve(__dirname, '..', '..');
const TOKEN = 'oturum-tokeni-sema';
const kopya = <T>(d: T): T => JSON.parse(JSON.stringify(d)) as T;

test.describe.configure({ mode: 'serial' });

let klasor: ReturnType<typeof geciciKlasor>;
let vt: Veritabani;
let projeId = '';
let fs1: Awaited<ReturnType<typeof yerelSunucu>>;
let yonetici: TaramaYoneticisi;
let sunucu: Server;
let adres = '';
let paket: Nesne = {};

function jsonGonder(res: ServerResponse, durum: number, govde: unknown): void {
  res.writeHead(durum, { 'content-type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(govde));
}
function govdeOku(req: IncomingMessage): Promise<string> {
  return new Promise((coz) => { const p: Buffer[] = []; req.on('data', (b: Buffer) => p.push(b)); req.on('end', () => coz(Buffer.concat(p).toString('utf8'))); });
}
async function api(yol: string, govde?: Nesne): Promise<{ durum: number; y: Nesne }> {
  const r = await fetch(`${adres}${yol}`, govde
    ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...govde, token: TOKEN }) }
    : { headers: { 'x-test-sunucu-token': TOKEN } });
  return { durum: r.status, y: (await r.json()) as Nesne };
}

/** Taranan paketten ayrı bir ekran ekler (her deneme sürüm 1 modelle başlasın). */
async function ekranEkle(anahtar: string, ad: string): Promise<string> {
  const p = kopya(paket) as Nesne & { meta: { ekran: Nesne }; model: Nesne };
  p.meta.ekran.anahtar = anahtar;
  p.meta.ekran.ad = ad;
  p.model.id = anahtar;
  p.model.ad = ad;
  return (await sayfaEkle(vt, projeId, p, { medyaKlasoru: join(klasor.yol, 'medya') })).ekranId;
}
const model = (ekranId: string): Nesne => (ekranModeliGetir(vt, ekranId) as { model: Nesne }).model;

/** Diyagramda düzenleme: elle "Başvuruyu gönder" düğmesi eklenir ve bitişten önce aksiyon bloğu olarak yerleştirilir. */
function duzenle(bloklar: AkisBlogu[], dugmeSayisi: number): AkisBlogu[] {
  const b = kopya(bloklar);
  const aksiyon = { tur: 'aksiyon', dugme: dugmeSayisi, istegeBagli: false } as unknown as AkisBlogu;
  const son = b.length && b[b.length - 1].tur === 'bitir' ? b.length - 1 : b.length;
  b.splice(son, 0, aksiyon);
  return b;
}
const ELLE = { dugmeler: [{ metin: 'Başvuruyu gönder', secici: '#gonder' }] };

test.beforeAll(async () => {
  klasor = geciciKlasor('tarama-sema');
  const fikstur = new TaramaFiksturu();
  fs1 = await yerelSunucu(fikstur.isle);
  vt = await veritabaniniHazirla(join(klasor.yol, 'platform.db'));
  await kasaOlustur(vt, 'Gecici-Sema-Parolasi-1', { kdf: HIZLI_KDF });
  izinleriAc(vt);
  projeId = projeKaydet(vt, { ad: 'Şema Deneme' });
  const ortamId = ortamKaydet(vt, { projeId, ad: 'TEST', tabanUrl: fs1.adres, varsayilan: true, ayarlar: { riskli: false } });
  girisProfiliKaydet(vt, { projeId, ortamId, ad: 'TEST kullanıcısı', kullaniciAdi: TARAMA_KULLANICI, parola: TARAMA_PAROLA, ikiAsamaliTur: 'yok', smsAyari: {} });
  girisTarifiKaydet(vt, projeId, ortamId, taramaGirisTarifi());
  baglamProfiliKaydet(vt, { projeId, tur: 'Profil', ad: 'Standart', alanlar: { profilKodu: 'P1' } });
  yonetici = taramaYoneticisiOlustur({
    projeKoku: KOK, zamanAsimiMs: 120_000,
    ortamDegiskenleri: { ...process.env, NOBETCI_TARAMA_IZINLI_KOKENLER: fs1.adres, NOBETCI_YASAK_ADRESLER: `*yasak-ornek*,${YASAKLI_GORSEL_HOST}` }
  });
  sunucu = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://127.0.0.1');
    void taramaIsteginiIsle(req, res, {
      token: TOKEN,
      disTokenGecerli: req.headers['x-test-sunucu-token'] === TOKEN || url.searchParams.get('token') === TOKEN,
      jsonGonder,
      jsonGovde: async () => { const m = await govdeOku(req); return m ? JSON.parse(m) as Nesne : {}; },
      acikVeritabani: async () => vt,
      projeKoku: KOK,
      yonetici
    }).then((eslesti) => { if (!eslesti) jsonGonder(res, 404, { basarili: false }); })
      .catch((h: unknown) => jsonGonder(res, 400, { basarili: false, mesaj: h instanceof Error ? h.message : String(h) }));
  });
  await new Promise<void>((coz) => sunucu.listen(0, '127.0.0.1', coz));
  adres = `http://127.0.0.1:${(sunucu.address() as AddressInfo).port}`;

  // Sahte uygulamayı tara → paket.
  const b = await api('/platform/tarama/baslat', { projeId, ekranAdi: 'Örnek Başvuru', ortamId, baglamProfilleri: ['Standart'], hedef: '/basvuru/', kesif: false, onay: true });
  expect(b.durum, JSON.stringify(b.y)).toBe(202);
  const isId = String(b.y.isId);
  const son = Date.now() + 120_000;
  for (;;) {
    const d = (await api(`/platform/tarama/durum?id=${isId}`)).y.is as IsGorunumu;
    if (d.durum !== 'suruyor') { expect(d.hata).toBeNull(); break; }
    if (Date.now() > son) throw new Error('Tarama bitmedi.');
    await new Promise((c) => setTimeout(c, 250));
  }
  paket = (await api(`/platform/tarama/paket?id=${isId}`)).y.paket as Nesne;
});

test.afterAll(async () => {
  yonetici?.kapat();
  sunucu?.closeAllConnections();
  await new Promise<void>((coz) => (sunucu ? sunucu.close(() => coz()) : coz()));
  await fs1?.kapat();
  vt?.kapat();
  klasor?.temizle();
});

test('tarama sürüm 1 model üretir; diyagramda düğme eklenip kaydedilince model sürüm 2 olur (ana akış)', async () => {
  test.setTimeout(180_000);
  expect((paket.model as Nesne).semaSurumu).toBe(1);
  const ekranId = await ekranEkle('taranan-ana', 'Taranan ana');
  const once = model(ekranId);
  expect(once.semaSurumu).toBe(1);
  const t = akisTasarimi(vt, projeId, ekranId, { akisId: 'ana' });
  const bloklar = duzenle(t.bloklar, t.palet.dugmeler.length);
  const govde = { akisId: 'ana', ad: 'Ana akış', bloklar, elleOgeler: ELLE };
  // Önizleme (onaysız): kaydetmez, yükseltmeyi haber verir.
  const on = akisKaydet(vt, projeId, ekranId, kopya(govde)) as { etki: Nesne };
  expect(on.etki.semaYukseltme).toBe(true);
  expect(model(ekranId).semaSurumu).toBe(1);
  const y = akisKaydet(vt, projeId, ekranId, { ...kopya(govde), onay: true }) as Nesne;
  expect(y.semaYukseltme).toBe(true);
  const sonra = model(ekranId);
  expect(sonra.semaSurumu).toBe(2);
  const adimlar = sonra.adimlar as Nesne[];
  expect(adimlar.some((a) => (a.kosu as { aksiyonlar?: Array<{ secici?: string }> } | undefined)?.aksiyonlar?.some((x) => x.secici === '#gonder'))).toBe(true);
  // Alanlar ve koşullar korunur.
  expect(JSON.stringify(sonra.kosullar)).toBe(JSON.stringify(once.kosullar));

  // Artık sürüm 2: ikinci kayıtta yükseltme notu çıkmaz.
  const t2 = akisTasarimi(vt, projeId, ekranId, { akisId: 'ana' });
  const y2 = akisKaydet(vt, projeId, ekranId, { akisId: 'ana', ad: 'Ana akış', bloklar: kopya(t2.bloklar), onay: true }) as Nesne;
  expect(y2.semaYukseltme).toBeUndefined();
});

test('taranan ekranda yeni akış açılıp kaydedilince de model sürüm 2 olur', async () => {
  test.setTimeout(60_000);
  const ekranId = await ekranEkle('taranan-yeni', 'Taranan yeni');
  const t = akisTasarimi(vt, projeId, ekranId, { kopya: 'ana' });
  const y = akisKaydet(vt, projeId, ekranId, { ad: 'Gönderimli akış', bloklar: duzenle(t.bloklar, t.palet.dugmeler.length), elleOgeler: ELLE, onay: true }) as Nesne;
  expect(y.semaYukseltme).toBe(true);
  const m = model(ekranId);
  expect(m.semaSurumu).toBe(2);
  expect((m.akislar as Nesne[]).map((a) => a.ad)).toEqual(['Ana akış', 'Gönderimli akış']);
});

test('sürüm 1 model: koşu tanımı yoksa yükseltilmez; ortak akış / alt model / sürüm 2 dokunulmaz; v1 model geçerli kalır', () => {
  const v1 = kopya(paket.model) as Nesne;
  expect(semaSurumunuYukselt(v1)).toBe(false);
  expect(v1.semaSurumu).toBe(1);
  expect(() => modeliDogrula(vt, projeId, kopya(v1), 'taranan.model.json')).not.toThrow();
  // Koşu tanımı yalnız başka bir akışta olsa da yükseltilir.
  const akisli = { ...kopya(v1), akislar: [
    { id: 'ana', ad: 'Ana akış', varsayilan: true, adimlar: kopya(v1.adimlar) },
    { id: 'diger', ad: 'Diğer', adimlar: [{ ...(kopya(v1.adimlar) as Nesne[])[0], kosu: { aksiyonlar: [{ tur: 'tikla', secici: '#gonder' }] } }] }
  ] };
  expect(semaSurumunuYukselt(akisli)).toBe(true);
  expect(akisli.semaSurumu).toBe(2);
  const kosulu = { ...kopya(v1), adimlar: [{ ...(kopya(v1.adimlar) as Nesne[])[0], kosu: {} }] };
  for (const tur of ['ortakAkis', 'altModel']) expect(semaSurumunuYukselt({ ...kopya(kosulu), tur })).toBe(false);
  expect(semaSurumunuYukselt({ ...kopya(kosulu), semaSurumu: 2 })).toBe(false);
  expect(semaSurumunuYukselt(null)).toBe(false);
});

test('doğrulama iletisi anlaşılır Türkçeye çevrilir; teknik ileti "ayrinti"de kalır', () => {
  const m = kopya(paket.model) as Nesne & { adimlar: Nesne[] };
  const baslik = String(m.adimlar[0].baslik);
  expect(anlasilirDogrulamaIletisi('adimlar[0](form): adımın koşu tanımı ("kosu") "semaSurumu": 2 gerektirir', m))
    .toBe(`“${baslik}” adımı: bu adımdaki düğme / beklenen sonuç tanımı modelin yeni biçimini gerektiriyor; ekranın modeli eski biçimde (kaydedince kendiliğinden güncellenir, mevcut senaryolar etkilenmez)`);
  const akisli = { ...m, akislar: [{ id: 'gonderim', ad: 'Gönderim', adimlar: m.adimlar }] };
  expect(anlasilirDogrulamaIletisi('akislar[1](gonderim): adimlar[0](form).kosu.aksiyonlar[0]: "secici" zorunlu', akisli))
    .toBe(`“Gönderim” akışı › “${baslik}” adımı: “seçici” zorunlu`);
  expect(anlasilirDogrulamaIletisi('taranan.model.json: bilinmeyen anahtar "fazla"', m)).toBe('Ekran modeli: tanınmayan özellik “fazla”');
  expect(anlasilirDogrulamaIletisi('kosullar.kurumsalIse.ifade: başvurulan alan "sorguTipi" modelde yok')).toBe('“kurumsalIse” koşulu: başvurulan alan "sorguTipi" modelde yok');

  // Sunucu: model doğrulama hatası anlaşılır ileti + teknik ayrıntıyla döner.
  const bozuk = kopya(m);
  delete bozuk.adimlar[0].baslik;
  let hatalar: Array<{ yer: string; mesaj: string; ayrinti?: string }> = [];
  try { modeliDogrula(vt, projeId, bozuk, 'taranan.model.json'); } catch (e) { if (e instanceof EkranDogrulamaHatasi) hatalar = e.hatalar; else throw e; }
  expect(hatalar).toEqual([{ yer: 'model', mesaj: '“form” adımı: “başlık” zorunlu', ayrinti: 'adimlar[0](form): "baslik" zorunlu' }]);
});
