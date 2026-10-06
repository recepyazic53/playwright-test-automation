// DAL BİRLEŞTİRME — "Hızlı testle güncelle" başka bir dalın alanlarını silmez (dal-birlestirme.mjs). Sahte sayfa (/plaka-dal/): Kod "X"
// içeriyorsa Sorgula'dan sonra "Yıl", içermiyorsa "Belge no" belirir. Önce X'li dal hızlı testle kaydedilir; sonra aynı ekran X'siz dalla
// güncellenir. Modelde iki alan da "ekranda görünürse" koşuluyla durur; iki senaryo da koşar (her biri kendi dalının alanını yazar).
// Güvenlik: yalnız 127.0.0.1'deki sahte sayfa; geçici veritabanı. Değerler UYDURMADIR.
import { randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { EKRANDA_GORUNURSE, dallariBirlestir } from '../../scripts/platform/hizli-test/dal-birlestirme.mjs';
import { kasaOlustur } from '../../scripts/platform/kasa.mjs';
import { veritabaniniHazirla } from '../../scripts/platform/veritabani/depo.mjs';
import { yerelSunucu } from './giris-fikstur';
import { nobetciApi, nobetciBaslat, type Nobetci, type Yanit } from './nobetci-sunucusu';
import { HIZLI_KDF, izinleriAc } from './platform-ortak';
import { VeriDuragiUygulamasi } from './veri-duragi-fikstur';

type Nesne = Record<string, any>;

const alan = (id: string, secici: string, ek: Nesne = {}): Nesne => ({ id, tip: 'metin', etiket: { ekran: id }, yapilandirma: 'senaryo', eslesme: { senaryo: id }, konum: { secici }, ...ek });
const model = (adimlar: Array<[string, Nesne[]]>): Nesne => ({ adimlar: adimlar.map(([id, alanlar]) => ({ id, baslik: id, bolumler: [{ id: `${id}B`, baslik: '', alanlar }] })) });

test('saf: görünmeyen eski alan eski adımına (komşusunun ardına) koşullu geri konur; yeni alan koşullu olur; boşa düşen tetik kalkar', () => {
  const eski = model([['a1', [alan('kod', '#kod')]], ['a2', [alan('yil', '#yil'), alan('marka', '#marka', { tetik: { alan: 'yil', olay: 'doldu' } })]]]);
  const yeni = model([['a1', [alan('kod', '#kod')]], ['a2', [alan('belge', '#belge'), alan('marka', '#marka', { tetik: { alan: 'yil', olay: 'doldu' } })]]]);
  const r = dallariBirlestir(yeni, eski);
  expect(r).toEqual({ korunan: ['yil'], kosullanan: ['belge'] });
  expect(yeni.adimlar[1].bolumler[0].alanlar.map((a: Nesne) => [a.id, a.gorunurluk?.kosul ?? null])).toEqual([['belge', EKRANDA_GORUNURSE], ['yil', EKRANDA_GORUNURSE], ['marka', null]]);
  expect(yeni.kosullar[EKRANDA_GORUNURSE].ifade).toEqual({ calismaZamani: 'gorunurse' });
  // Yıl geri geldiği için Marka'nın tetiği geçerli kalır.
  expect(yeni.adimlar[1].bolumler[0].alanlar[2].tetik).toEqual({ alan: 'yil', olay: 'doldu' });
  // Eski model yoksa / alanı yoksa hiçbir şey değişmez.
  const y2 = model([['a1', [alan('kod', '#kod')]]]);
  expect(dallariBirlestir(y2, null)).toEqual({ korunan: [], kosullanan: [] });
  expect(y2.kosullar).toBeUndefined();
});

test.describe('hızlı testle güncelleme iki dalı birleştirir (127.0.0.1)', () => {
  test.describe.configure({ mode: 'serial' });
  const PAROLA = `Gecici-Dal-${randomBytes(6).toString('hex')}`;
  let nobetci: Nobetci;
  const u = new VeriDuragiUygulamasi();
  let fikstur: Awaited<ReturnType<typeof yerelSunucu>>;
  let klasor = '';
  let projeId = '';
  let ortamId = '';
  const api = (yol: string, govde?: Nesne): Promise<Yanit> => nobetciApi(nobetci, yol, govde);
  async function basarili(yol: string, govde?: Nesne): Promise<Yanit> {
    const y = await api(yol, govde);
    expect(y.basarili, `${yol}: ${y.mesaj ?? ''} ${JSON.stringify(y).slice(0, 600)}`).toBe(true);
    return y;
  }
  async function bekle(id: string, durumlar: string[], sn = 120): Promise<Nesne> {
    const son = Date.now() + sn * 1000;
    for (;;) {
      const o = (await api(`/platform/hizli-test/durum?id=${id}`)).oturum as Nesne;
      if (durumlar.includes(o.durum)) return o;
      if (o.durum === 'kesifOnay') { await api('/platform/hizli-test/onay', { id, cevap: false }); continue; }
      if (['hata', 'iptal'].includes(o.durum) || Date.now() > son) throw new Error(`beklenen ${durumlar.join('/')}, olan ${o.durum}: ${JSON.stringify(o.hata ?? o.sonHata)} ${JSON.stringify(o.gunluk?.slice(-6))}`);
      await new Promise((c) => setTimeout(c, 300));
    }
  }
  const alanBul = (o: Nesne, etiket: string): string => {
    const a = (o.soru.alanlar as Nesne[]).find((x) => x.etiket === etiket);
    if (!a) throw new Error(`“${etiket}” yok: ${JSON.stringify((o.soru.alanlar as Nesne[]).map((x) => x.etiket))}`);
    return String(a.anahtar);
  };
  async function bas(id: string, o: Nesne, metin: string, durumlar = ['karar']): Promise<Nesne> {
    const aday = (o.soru.adaylar as Nesne[]).find((a) => a.metin === metin);
    expect(aday, JSON.stringify((o.soru.adaylar as Nesne[]).map((a) => a.metin))).toBeTruthy();
    await basarili('/platform/hizli-test/karar', { id, karar: 'bas', secici: aday?.secici });
    return bekle(id, durumlar);
  }
  /** Bir dal: Kod → Sorgula → (beliren alan) → Kaydet → bitir; kayıt bilgisi döner. */
  async function dal(kod: string, beliren: string, deger: string, baslik: string, ekranId?: string): Promise<Nesne> {
    const id = String((await basarili('/platform/hizli-test/baslat', {
      projeId, ortamId, hedef: '/plaka-dal/', ...(ekranId ? { ekranId } : { ekranAdi: 'Dal ekranı' }), izin: 'evet', cumle: '"Kayıt alındı" görünce bitir'
    })).id);
    let o = await bekle(id, ['veri'], 300);
    await basarili('/platform/hizli-test/veri', { id, degerler: { [alanBul(o, 'Kod')]: { deger: kod, kaynak: 'elle' } } });
    o = await bekle(id, ['karar']);
    o = await bas(id, o, 'Sorgula', ['veri']);
    await basarili('/platform/hizli-test/veri', { id, degerler: { [alanBul(o, beliren)]: { deger, kaynak: 'elle' } } });
    o = await bekle(id, ['karar']);
    o = await bas(id, o, 'Kaydet');
    await basarili('/platform/hizli-test/karar', { id, karar: 'bitir' });
    o = await bekle(id, ['bitis']);
    const bitti = Object.keys(o.soru.etiketler).find((m) => m.startsWith('Kayıt alındı')) as string;
    await basarili('/platform/hizli-test/bitis', { id, etiketler: { ...o.soru.etiketler, [bitti]: 'bitti' } });
    await bekle(id, ['kaydet']);
    let k = await basarili('/platform/hizli-test/kaydet', { id, baslik });
    if (k.onayGerekli) k = await basarili('/platform/hizli-test/kaydet', { id, baslik, onay: true });
    expect(k.kaydedildi, JSON.stringify(k).slice(0, 400)).toBe(true);
    const son = (await api(`/platform/hizli-test/durum?id=${id}`)).oturum as Nesne;
    return { ...k, gunluk: son.gunluk };
  }
  async function kos(senaryoId: string): Promise<void> {
    const y = await api('/platform/senaryolar/calistir', { projeId, kosuId: `kosu-${randomBytes(6).toString('hex')}`, senaryoId, ortamId });
    expect(y.basarili, y.mesaj).toBe(true);
    const sonuc = (await api(`/platform/sonuclar/sonuc?id=${String(y.sonucId)}`)).sonuc as Nesne;
    expect(sonuc.durum, JSON.stringify(sonuc.hataMesaji).slice(0, 400)).toBe('basarili');
  }

  test.beforeAll(async () => {
    test.setTimeout(120_000);
    klasor = mkdtempSync(join(tmpdir(), 'dal-birlestirme-'));
    fikstur = await yerelSunucu((i) => u.isle(i) ?? { durum: 404, tur: 'text/plain', govde: 'yok' });
    const vtYolu = join(klasor, 'platform.db');
    const vt = await veritabaniniHazirla(vtYolu);
    await kasaOlustur(vt, PAROLA, { kdf: HIZLI_KDF });
    izinleriAc(vt);
    vt.kapat();
    nobetci = await nobetciBaslat(klasor, vtYolu, { NOBETCI_KAYIT_BASSIZ: '1', NOBETCI_TARAMA_IZINLI_KOKENLER: fikstur.adres, NOBETCI_KAYIT_ZAMAN_ASIMI_SN: '900', NOBETCI_REHBER_OTOMATIK: '0' });
    await basarili('/platform/kasa/ac', { parola: PAROLA });
    projeId = String(((await basarili('/platform/proje/kaydet', { ad: 'Dal Projesi' })).proje as Nesne).id);
    ortamId = String(((await basarili('/platform/ortam/kaydet', { projeId, ad: 'Deneme', tabanUrl: fikstur.adres, varsayilan: true, riskli: false })).ortam as Nesne).id);
  });
  test.afterAll(async () => {
    nobetci?.surec.kill('SIGTERM');
    await fikstur?.kapat();
    if (klasor) rmSync(klasor, { recursive: true, force: true });
  });

  test('X\'li dal kaydedilir, X\'siz dalla güncellenir: Yıl korunur, Belge no eklenir (ikisi ekranda görünürse); iki senaryo da koşar', async () => {
    test.setTimeout(900_000);
    const ilk = await dal('A-X-1', 'Yıl', '2020', 'Dal — X');
    const ekranId = String(ilk.ekranId);
    const ikinci = await dal('B-2', 'Belge no', 'BN-7', 'Dal — belge', ekranId);
    expect(JSON.stringify(ikinci.gunluk)).toContain('Dal birleştirme');
    const m = ((await basarili(`/platform/ekran?projeId=${projeId}&id=${ekranId}`)) as Nesne).model as Nesne;
    const tum = (m.adimlar as Nesne[]).flatMap((a) => (a.bolumler as Nesne[]).flatMap((b) => b.alanlar as Nesne[]));
    const bul = (secici: string): Nesne => tum.find((a) => a.konum?.secici === secici) as Nesne;
    expect(bul('#yil')?.gorunurluk, JSON.stringify(tum.map((a) => [a.id, a.konum?.secici]))).toEqual({ kosul: 'ekrandaGorunurse' });
    expect(bul('#belge')?.gorunurluk).toEqual({ kosul: 'ekrandaGorunurse' });
    expect(bul('#kod')?.gorunurluk ?? null).toBeNull();
    const senaryolar = ((await basarili(`/platform/senaryolar?projeId=${projeId}`)).senaryolar as Nesne[]).filter((x) => x.ekranId === ekranId);
    const sid = (b: string): string => String(senaryolar.find((x) => x.baslik === b)?.id);
    let once = u.plakaDalKayitlari.length;
    await kos(sid('Dal — X'));
    expect(u.plakaDalKayitlari.slice(once)).toEqual([{ kod: 'A-X-1', yil: '2020', belge: '' }]);
    once = u.plakaDalKayitlari.length;
    await kos(sid('Dal — belge'));
    expect(u.plakaDalKayitlari.slice(once)).toEqual([{ kod: 'B-2', yil: '', belge: 'BN-7' }]);
  });
});
