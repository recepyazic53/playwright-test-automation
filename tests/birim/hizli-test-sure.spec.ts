// UÇTAN UCA (yerel) — HIZLI TEST SÜRESİ: sınır TOPLAM süre değil BOŞTA KALMA süresidir (kullanıcı işlemi / tarayıcı işi sayacı sıfırlar;
// durum yoklaması sıfırlamaz), bitmeden önce uyarı + "Süreyi uzat", süre dolunca toplananlar KAYBOLMAZ ("Kaldığın yerden devam et":
// tarayıcı yeniden açılır, zincir tekrar yürütülür; "Toplananları kaydet": tarayıcısız). Bitiş koşulu tamamlanınca tarayıcı kapanır, kayıt
// tarayıcısız yapılır; geri dönüşte tarayıcı yeniden açılıp aynı adıma gelinir.
//
// Güvenlik: şirket sitesine HİÇBİR istek gitmez — ortamın adresi 127.0.0.1'deki sahte formdur (hizli-test-fikstur.ts), tarayıcı yalnızca bu
// kökene bağlanabilir (NOBETCI_TARAMA_IZINLI_KOKENLER). Geçici veritabanı ve ayrı Nöbetçi örneği; veri/ klasörüne dokunulmaz. Değerler
// uydurmadır. Süreler testte kısadır (NOBETCI_HIZLI_BOSTA_SN).
import { randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { kasaOlustur } from '../../scripts/platform/kasa.mjs';
import { veritabaniniHazirla } from '../../scripts/platform/veritabani/depo.mjs';
import { varsayilanKosuAyarlari } from '../../scripts/platform/ayarlar/kosu-ayarlari.mjs';
import { yerelSunucu } from './giris-fikstur';
import { HizliTestUygulamasi } from './hizli-test-fikstur';
import { nobetciApi, nobetciBaslat, type Nobetci, type Yanit } from './nobetci-sunucusu';
import { HIZLI_KDF, izinleriAc } from './platform-ortak';

type Nesne = Record<string, any>;
const PAROLA = `Gecici-Sure-${randomBytes(6).toString('hex')}`;
/** Testteki boşta kalma süresi (sn): uyarı bunun yarısında (5 dk'dan kısa) başlar. */
const BOSTA_SN = 12;
const BITTI = 'Başvurunuz alındı. Başvuru no:';

let nobetci: Nobetci;
let uygulama: HizliTestUygulamasi;
let fikstur: Awaited<ReturnType<typeof yerelSunucu>>;
let klasor = '';
let projeId = '';
let ortamId = '';

const api = (yol: string, govde?: Nesne): Promise<Yanit> => nobetciApi(nobetci, yol, govde);
async function basarili(yol: string, govde: Nesne): Promise<Yanit> {
  const y = await api(yol, govde);
  expect(y.basarili, `${yol}: ${y.mesaj ?? ''} ${JSON.stringify(y).slice(0, 400)}`).toBe(true);
  return y;
}
/** Oturum durumu. Keşif toplu sorusu (sayfadaki emin olunmayan düğmeler) bu testin konusu değil: "Hiçbirine basma" ile geçilir. */
const oturum = async (id: string): Promise<Nesne> => {
  for (;;) {
    const o = (await api(`/platform/hizli-test/durum?id=${id}`)).oturum as Nesne;
    if (o?.durum !== 'kesifOnay') return o;
    await api('/platform/hizli-test/onay', { id, cevap: false });
  }
};
const bekleMs = (ms: number): Promise<void> => new Promise((c) => setTimeout(c, ms));
/** Oturum verilen durumlardan birine gelene kadar bekler (hata / iptal olursa açık hata). */
async function bekle(id: string, durumlar: string[], sn = 90): Promise<Nesne> {
  const son = Date.now() + sn * 1000;
  for (;;) {
    const o = await oturum(id);
    if (durumlar.includes(o.durum)) return o;
    if (['hata', 'iptal'].includes(o.durum) || Date.now() > son) throw new Error(`beklenen ${durumlar.join('/')}, olan ${o.durum}: ${JSON.stringify(o.hata ?? o.sonHata)} ${JSON.stringify(o.soru)}`);
    await bekleMs(250);
  }
}
/** Tarayıcı işi bitene kadar (tarama/aktif boş). */
async function isBitsin(): Promise<void> {
  for (const son = Date.now() + 30_000; Date.now() < son; await bekleMs(250)) {
    if (!(await api('/platform/tarama/aktif')).is) return;
  }
  throw new Error('tarayıcı işi bitmedi');
}
const deger = (d: string): Nesne => ({ deger: d, kaynak: 'elle' });
const alan = (o: Nesne, etiket: string): string => String((o.soru.alanlar as Nesne[]).find((a) => a.etiket === etiket)?.anahtar);
/** Keşif → ilk veri durağı → Hesapla (basış) → Ödeme şekli → karar (2 adım, 1 basış). */
async function hesaplayaKadar(ekranAdi: string): Promise<{ id: string; odeme: string }> {
  const id = String((await basarili('/platform/hizli-test/baslat', { projeId, ortamId, hedef: '/basvuru/', ekranAdi, izin: 'evet' })).id);
  let o = await bekle(id, ['veri']);
  await basarili('/platform/hizli-test/veri', { id, degerler: { [alan(o, 'Ad soyad')]: deger('Deneme Kişi'), [alan(o, 'Müşteri tipi')]: deger('bireysel') } });
  o = await bekle(id, ['karar']);
  const hesapla = (o.soru.adaylar as Nesne[]).find((a) => a.metin === 'Hesapla');
  await basarili('/platform/hizli-test/karar', { id, karar: 'bas', secici: hesapla?.secici });
  o = await bekle(id, ['veri']);
  const odeme = alan(o, 'Ödeme şekli');
  await basarili('/platform/hizli-test/veri', { id, degerler: { [odeme]: deger('kart') } });
  await bekle(id, ['karar']);
  return { id, odeme };
}
/** Boşta kalma süresi dolana kadar (yalnız durum yoklanır; yoklama sayacı sıfırlamaz). */
async function suresiDolsun(id: string): Promise<Nesne> {
  return bekle(id, ['askida'], BOSTA_SN + 30);
}

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  test.setTimeout(120_000);
  klasor = mkdtempSync(join(tmpdir(), 'hizli-sure-'));
  uygulama = new HizliTestUygulamasi();
  fikstur = await yerelSunucu(uygulama.isle);
  const vtYolu = join(klasor, 'platform.db');
  const vt = await veritabaniniHazirla(vtYolu);
  await kasaOlustur(vt, PAROLA, { kdf: HIZLI_KDF });
  izinleriAc(vt);
  vt.kapat();
  nobetci = await nobetciBaslat(klasor, vtYolu, {
    NOBETCI_KAYIT_BASSIZ: '1', NOBETCI_TARAMA_IZINLI_KOKENLER: fikstur.adres, NOBETCI_HIZLI_BOSTA_SN: String(BOSTA_SN), NOBETCI_REHBER_OTOMATIK: '0'
  });
  await basarili('/platform/kasa/ac', { parola: PAROLA });
  projeId = String(((await basarili('/platform/proje/kaydet', { ad: 'Hızlı Test Süre Projesi' })).proje as Nesne).id);
  ortamId = String(((await basarili('/platform/ortam/kaydet', { projeId, ad: 'Deneme', tabanUrl: fikstur.adres, varsayilan: true, riskli: false })).ortam as Nesne).id);
});

test.afterAll(async () => {
  nobetci?.surec.kill('SIGTERM');
  await fikstur?.kapat();
  if (klasor) rmSync(klasor, { recursive: true, force: true });
});

test('ayarlar: boşta kalma 30 dk, en uzun süre 240 dk (Ayarlar > Koşu > Tarama ve akış kaydı; değiştirilebilir)', async () => {
  expect(varsayilanKosuAyarlari()).toMatchObject({ hizliBostaKalmaDk: 30, hizliUstSinirDk: 240 });
  const a = (await api('/platform/kosu-ayarlari')) as Nesne;
  expect(a.ayarlar).toMatchObject({ hizliBostaKalmaDk: 30, hizliUstSinirDk: 240 });
  expect((a.tanimlar as Nesne[]).find((t) => t.anahtar === 'hizliBostaKalmaDk')).toMatchObject({ grup: 'Tarama ve akış kaydı', birim: 'dk', enAz: 5 });
  expect((a.tanimlar as Nesne[]).find((t) => t.anahtar === 'hizliUstSinirDk')).toMatchObject({ grup: 'Tarama ve akış kaydı', birim: 'dk' });
  const k = await basarili('/platform/kosu-ayarlari/kaydet', { ayarlar: { hizliBostaKalmaDk: 45, hizliUstSinirDk: 300 } });
  expect(k.ayarlar).toMatchObject({ hizliBostaKalmaDk: 45, hizliUstSinirDk: 300 });
  expect(await api('/platform/kosu-ayarlari/kaydet', { ayarlar: { hizliBostaKalmaDk: 2 } })).toMatchObject({ basarili: false });
  // Testte ortam değişkeni (NOBETCI_HIZLI_BOSTA_SN) önceliklidir; ayar yine geri alınır.
  await basarili('/platform/kosu-ayarlari/kaydet', { ayarlar: { hizliBostaKalmaDk: 30, hizliUstSinirDk: 240 } });
});

test('boşta kalma: yoklama sayacı sıfırlamaz, kullanıcı işlemi ve "Süreyi uzat" sıfırlar; süre dolunca toplananlar kalır, "Kaldığın yerden devam et" zinciri yeniden kurar; kaydet aşamasında tarayıcı kapanır, geri dönüşte yeniden açılır, kayıt tarayıcısız', async () => {
  test.setTimeout(300_000);
  const once = { h: uygulama.hesaplamalar.length, o: uygulama.onaylar.length };
  const id = String((await basarili('/platform/hizli-test/baslat', { projeId, ortamId, hedef: '/basvuru/', ekranAdi: 'Süre formu', izin: 'evet' })).id);
  let o = await bekle(id, ['veri']);
  expect(o.tarayici).toBe('acik');
  expect(o.sure).toMatchObject({ bostaMs: BOSTA_SN * 1000, sebep: 'bosta', uyari: false, uzatilabilir: true });
  // Durum yoklaması kullanıcı işlemi değildir: sayaç akar.
  await bekleMs(4_000);
  o = await oturum(id);
  expect(o.sure.kalanMs).toBeLessThan((BOSTA_SN - 3) * 1000);
  // Kullanıcı işlemi (reddedilen bir veri gönderimi bile) sayacı sıfırlar.
  expect(await api('/platform/hizli-test/veri', { id, degerler: {} })).toMatchObject({ basarili: false, kod: 'EKSIK' });
  o = await oturum(id);
  expect(o.sure.kalanMs).toBeGreaterThan((BOSTA_SN - 1.5) * 1000);
  // Bitmeden önce uyarı (boşta kalma süresinin yarısı; 5 dk'dan kısa) → "Süreyi uzat".
  for (const son = Date.now() + BOSTA_SN * 1000; !o.sure?.uyari && Date.now() < son; o = await oturum(id)) await bekleMs(250);
  expect(o.sure).toMatchObject({ uyari: true, sebep: 'bosta', uzatilabilir: true });
  expect(o.durum).toBe('veri');
  const u = await basarili('/platform/hizli-test/uzat', { id });
  expect((u.sure as Nesne).uyari).toBe(false);
  expect((u.sure as Nesne).kalanMs).toBeGreaterThan((BOSTA_SN - 1.5) * 1000);

  // Zincir: veri → Hesapla → Ödeme şekli → karar.
  await basarili('/platform/hizli-test/veri', { id, degerler: { [alan(o, 'Ad soyad')]: deger('Deneme Kişi'), [alan(o, 'Müşteri tipi')]: deger('bireysel') } });
  o = await bekle(id, ['karar']);
  await basarili('/platform/hizli-test/karar', { id, karar: 'bas', secici: (o.soru.adaylar as Nesne[]).find((a) => a.metin === 'Hesapla')?.secici });
  o = await bekle(id, ['veri']);
  expect(uygulama.hesaplamalar.length).toBe(once.h + 1);
  await basarili('/platform/hizli-test/veri', { id, degerler: { [alan(o, 'Ödeme şekli')]: deger('kart') } });
  await bekle(id, ['karar']);

  // Süre doldu: tarayıcı kapandı, toplananlar duruyor (askıda).
  o = await suresiDolsun(id);
  expect(o.tarayici).toBe('kapali');
  expect(o.sure).toBeNull();
  expect(o.soru).toMatchObject({ tur: 'askida', kod: 'ZAMAN_ASIMI', hedef: 'karar', kaydedilebilir: true, toplanan: { adim: 2, basis: 1 } });
  expect(o.soru.mesaj).toMatch(/işlem yapılmadı; tarayıcı kapatıldı/);
  expect(o.adimlar).toHaveLength(2);
  expect(o.adimlar[0].bas.metin).toBe('Hesapla');
  await isBitsin();
  // Tarayıcı gerektiren işlem açık hatayla reddedilir; oturum değişmez.
  expect(await api('/platform/hizli-test/karar', { id, karar: 'bitir' })).toMatchObject({ basarili: false, kod: 'DURUM' });
  expect(await api('/platform/hizli-test/uzat', { id })).toMatchObject({ basarili: false, kod: 'TARAYICI_KAPALI' });

  // "Kaldığın yerden devam et": tarayıcı yeniden açılır, zincir (Hesapla + uygulanmış Ödeme şekli) tekrar yürütülür, karar adımına gelinir.
  // Zincirde basış var: açık onay olmadan tarayıcı açılmaz; yeniden basılacak düğmeler adlarıyla döner (oturum değişmez).
  const onaysiz = await api('/platform/hizli-test/devam', { id, kip: 'tarayici' });
  expect(onaysiz).toMatchObject({ basarili: false, kod: 'ONAY_GEREKLI', onayGerekli: true, dugmeler: ['Hesapla'] });
  expect(String(onaysiz.mesaj)).toContain('şu düğmelere yeniden basılacak: “Hesapla”');
  expect((await oturum(id)).durum).toBe('askida');
  await basarili('/platform/hizli-test/devam', { id, kip: 'tarayici', onay: true });
  expect((await oturum(id)).durum).toMatch(/^(yeniden|karar)$/);
  o = await bekle(id, ['karar'], 120);
  expect(o.tarayici).toBe('acik');
  expect(uygulama.hesaplamalar.length).toBe(once.h + 2);
  expect(uygulama.hesaplamalar.at(-1)).toEqual({ tip: 'bireysel', vergi: '' });
  expect(o.gunluk.map((g: Nesne) => g.metin).join('\n')).toContain('zincir tekrar yürütüldü');
  // Ödeme şekli yeniden dolduruldu: Onayla başarılı olur.
  const onayla = (o.soru.adaylar as Nesne[]).find((a) => a.metin === 'Onayla');
  expect(onayla).toBeTruthy();
  await basarili('/platform/hizli-test/karar', { id, karar: 'bas', secici: onayla?.secici });
  o = await bekle(id, ['karar', 'hataSorusu']);
  expect(o.durum).toBe('karar');
  expect(uygulama.onaylar.length).toBe(once.o + 1);
  await basarili('/platform/hizli-test/karar', { id, karar: 'bitir' });
  o = await bekle(id, ['bitis']);
  const bitti = (o.soru.gorulenler as Nesne[]).find((g) => String(g.metin).startsWith(BITTI))?.metin;
  expect(bitti).toBeTruthy();
  await basarili('/platform/hizli-test/bitis', { id, etiketler: { ...o.soru.etiketler, [bitti]: 'bitti' } });
  // Kaydet aşaması: tarayıcı kapatıldı (tarayıcı işi yok), süre sınırı işlemez.
  o = await bekle(id, ['kaydet']);
  expect(o.tarayici).toBe('kapali');
  await isBitsin();

  // Geri dönüş ("Bitiş koşulunu düzenle"): tarayıcı yeniden açılır, zincir tekrar yürütülür (Onayla dahil), bitiş adımına gelinir.
  expect(await api('/platform/hizli-test/geri', { id, hedef: 'bitis' })).toMatchObject({ basarili: false, kod: 'ONAY_GEREKLI', dugmeler: ['Hesapla', 'Onayla'] });
  await basarili('/platform/hizli-test/geri', { id, hedef: 'bitis', onay: true });
  expect((await api('/platform/tarama/aktif')).is).toBeTruthy();
  o = await bekle(id, ['bitis'], 120);
  expect(o.tarayici).toBe('acik');
  expect(uygulama.onaylar.length).toBe(once.o + 2);
  expect((o.soru.gorulenler as Nesne[]).some((g) => g.metin === bitti)).toBe(true);
  await basarili('/platform/hizli-test/bitis', { id, etiketler: { ...o.soru.etiketler, [bitti]: 'bitti' } });
  o = await bekle(id, ['kaydet']);
  await isBitsin();

  // Kaydet ekranında boşta kalma süresinden uzun beklenir: oturum ve kayıt düğmesi çalışır (tarayıcı yok).
  await bekleMs((BOSTA_SN + 2) * 1000);
  o = await oturum(id);
  expect(o.durum).toBe('kaydet');
  expect(o.sure).toBeNull();
  const k = await basarili('/platform/hizli-test/kaydet', { id, baslik: 'Süre formu — devam', tabloOlustur: false });
  expect(k).toMatchObject({ kaydedildi: true, dogrulandi: false });
  expect((await oturum(id)).durum).toBe('kaydedildi');
});

test('"Toplananları kaydet": süre dolduktan sonra tarayıcı açılmadan bitiş koşulu ve kayıt (doğrulanmadı)', async () => {
  test.setTimeout(240_000);
  const { id } = await hesaplayaKadar('Süre formu 2');
  let o = await suresiDolsun(id);
  expect(o.soru).toMatchObject({ tur: 'askida', kaydedilebilir: true, bitisVar: false });
  await isBitsin();
  const d = await basarili('/platform/hizli-test/devam', { id, kip: 'kaydet' });
  expect(d.durum).toBe('bitis');
  o = await oturum(id);
  expect(o.durum).toBe('bitis');
  expect(o.tarayici).toBe('kapali');
  // Tarayıcı gerektiren işlem (sayfayı yeniden tara) açık hatayla reddedilir; adım değişmez.
  expect(await api('/platform/hizli-test/yeniden-tara', { id, etiketler: {} })).toMatchObject({ basarili: false, kod: 'TARAYICI_KAPALI' });
  o = await oturum(id);
  expect(o.durum).toBe('bitis');
  const tutar = (o.soru.gorulenler as Nesne[]).find((g) => String(g.metin).startsWith('Tutar:'))?.metin;
  expect(tutar).toBeTruthy();
  await basarili('/platform/hizli-test/bitis', { id, etiketler: { [tutar]: 'bitti' } });
  o = await oturum(id);
  expect(o.durum).toBe('kaydet');
  expect((await api('/platform/tarama/aktif')).is).toBeNull();
  const k = await basarili('/platform/hizli-test/kaydet', { id, baslik: 'Süre formu 2 — toplananlar', tabloOlustur: false });
  expect(k).toMatchObject({ kaydedildi: true, dogrulandi: false });
});
