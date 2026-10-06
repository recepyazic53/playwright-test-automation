// HIZLI TEST: "Veri girmeye devam et" (veri → düğme → veri). Bir düğme (Sorgula) daha önce yazılan bir alanı (Tip) siler; kullanıcı
// "Şimdi ne yapayım?"da veri girmeye devam eder: ekranın şu anki hâli açılır (önceki adımın alanı sayfadaki değeriyle, önceki değer yalnız
// bilgi), değiştirilen alan bu adıma alınır:
//  - değer aynıysa TAŞINIR (koşu onu düğmeden sonra yazar);
//  - değer farklıysa sorulur (409 TEKRAR): "Taşı" ya da "İkinci kez yaz" (aynı ekran kutusu iki alan; senaryoda iki değer, koşu ikisini de yazar).
// Güvenlik: yalnız 127.0.0.1'deki sahte sayfa (veri-duragi-fikstur.ts > /arac-sorgu/); geçici veritabanı. Değerler UYDURMADIR.
import { randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { kasaOlustur } from '../../scripts/platform/kasa.mjs';
import { veritabaniniHazirla } from '../../scripts/platform/veritabani/depo.mjs';
import { yerelSunucu } from './giris-fikstur';
import { nobetciApi, nobetciBaslat, type Nobetci, type Yanit } from './nobetci-sunucusu';
import { HIZLI_KDF, izinleriAc } from './platform-ortak';
import { VeriDuragiUygulamasi } from './veri-duragi-fikstur';

type Nesne = Record<string, any>;

test.describe('veri girmeye devam et (127.0.0.1)', () => {
  test.describe.configure({ mode: 'serial' });
  const PAROLA = `Gecici-Devam-${randomBytes(6).toString('hex')}`;
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
  const alanBul = (o: Nesne, etiket: string): Nesne => {
    const a = (o.soru.alanlar as Nesne[]).find((x) => x.etiket === etiket);
    if (!a) throw new Error(`“${etiket}” yok: ${JSON.stringify((o.soru.alanlar as Nesne[]).map((x) => x.etiket))}`);
    return a;
  };
  async function bas(id: string, o: Nesne, metin: string): Promise<Nesne> {
    const aday = (o.soru.adaylar as Nesne[]).find((a) => a.metin === metin);
    expect(aday, JSON.stringify((o.soru.adaylar as Nesne[]).map((a) => a.metin))).toBeTruthy();
    await basarili('/platform/hizli-test/karar', { id, karar: 'bas', secici: aday?.secici });
    return bekle(id, ['karar']);
  }
  async function bitirVeKaydet(id: string, baslik: string): Promise<string> {
    await basarili('/platform/hizli-test/karar', { id, karar: 'bitir' });
    const o = await bekle(id, ['bitis']);
    const bitti = Object.keys(o.soru.etiketler).find((m) => m.startsWith('Kayıt alındı')) as string;
    await basarili('/platform/hizli-test/bitis', { id, etiketler: { ...o.soru.etiketler, [bitti]: 'bitti' } });
    await bekle(id, ['kaydet']);
    const k = await basarili('/platform/hizli-test/kaydet', { id, baslik });
    expect(k.kaydedildi).toBe(true);
    return String(k.senaryoId);
  }
  async function kos(senaryoId: string): Promise<void> {
    const y = await api('/platform/senaryolar/calistir', { projeId, kosuId: `kosu-${randomBytes(6).toString('hex')}`, senaryoId, ortamId });
    expect(y.basarili, y.mesaj).toBe(true);
    const sonuc = (await api(`/platform/sonuclar/sonuc?id=${String(y.sonucId)}`)).sonuc as Nesne;
    expect(sonuc.durum, JSON.stringify(sonuc.hataMesaji).slice(0, 400)).toBe('basarili');
  }
  async function baslat(): Promise<{ id: string; o: Nesne }> {
    const id = String((await basarili('/platform/hizli-test/baslat', {
      projeId, ortamId, hedef: '/arac-sorgu/', ekranAdi: `Araç ${randomBytes(3).toString('hex')}`, izin: 'evet', cumle: '"Kayıt alındı" görünce bitir'
    })).id);
    return { id, o: await bekle(id, ['veri'], 300) };
  }

  test.beforeAll(async () => {
    test.setTimeout(120_000);
    klasor = mkdtempSync(join(tmpdir(), 'veri-devam-'));
    fikstur = await yerelSunucu((i) => u.isle(i) ?? { durum: 404, tur: 'text/plain', govde: 'yok' });
    const vtYolu = join(klasor, 'platform.db');
    const vt = await veritabaniniHazirla(vtYolu);
    await kasaOlustur(vt, PAROLA, { kdf: HIZLI_KDF });
    izinleriAc(vt);
    vt.kapat();
    nobetci = await nobetciBaslat(klasor, vtYolu, { NOBETCI_KAYIT_BASSIZ: '1', NOBETCI_TARAMA_IZINLI_KOKENLER: fikstur.adres, NOBETCI_KAYIT_ZAMAN_ASIMI_SN: '900', NOBETCI_REHBER_OTOMATIK: '0' });
    await basarili('/platform/kasa/ac', { parola: PAROLA });
    projeId = String(((await basarili('/platform/proje/kaydet', { ad: 'Devam Projesi' })).proje as Nesne).id);
    ortamId = String(((await basarili('/platform/ortam/kaydet', { projeId, ad: 'Deneme', tabanUrl: fikstur.adres, varsayilan: true, riskli: false })).ortam as Nesne).id);
  });
  test.afterAll(async () => {
    nobetci?.surec.kill('SIGTERM');
    await fikstur?.kapat();
    if (klasor) rmSync(klasor, { recursive: true, force: true });
  });

  test('aynı değer taşınır: Sorgula Tip’i silince Tip düğmeden sonraki adımda yeniden yazılır; normal koşu Tip’i aramadan sonra seçer', async () => {
    test.setTimeout(600_000);
    let { id, o } = await baslat();
    await basarili('/platform/hizli-test/veri', { id, degerler: { [alanBul(o, 'Kod').anahtar]: { deger: 'K1', kaynak: 'elle' }, [alanBul(o, 'Tip').anahtar]: { deger: '1', kaynak: 'elle' } } });
    o = await bekle(id, ['karar']);
    o = await bas(id, o, 'Sorgula');
    // Veri girmeye devam et: ekranın şu anki hâli — Tip silinmiş (sayfada hazır değil), önceki değer yalnız bilgi.
    await basarili('/platform/hizli-test/karar', { id, karar: 'veriDevam' });
    o = await bekle(id, ['veri']);
    const tip = alanBul(o, 'Tip');
    expect(tip).toMatchObject({ deger: null, onceki: { adim: 1, deger: '1' } });
    expect(tip.hazir).toBe(false);
    expect(alanBul(o, 'Kod')).toMatchObject({ deger: null, onceki: { adim: 1, deger: 'K1' }, hazir: true });
    // Yalnız Tip yeniden seçilir (aynı değer: sorulmadan taşınır); Kod'a dokunulmaz.
    await basarili('/platform/hizli-test/veri', { id, degerler: { [tip.anahtar]: { deger: '1', kaynak: 'elle' } } });
    o = await bekle(id, ['karar']);
    expect((o.adimlar as Nesne[]).map((a) => (a.alanlar as Nesne[]).map((x) => x.etiket))).toEqual([['Kod'], ['Tip']]);
    o = await bas(id, o, 'Kaydet');
    expect(u.aracKayitlari.at(-1)).toEqual({ kod: 'K1', tip: '1', marka: 'MARKA-K1' });
    const senaryoId = await bitirVeKaydet(id, 'Araç — taşı');
    const once = u.aracKayitlari.length;
    await kos(senaryoId);
    expect(u.aracKayitlari.slice(once)).toEqual([{ kod: 'K1', tip: '1', marka: 'MARKA-K1' }]);
  });

  test('farklı değer sorulur (409 TEKRAR): Kod ikinci kez yazılır (iki alan, iki değer), Tip taşınır; normal koşu iki sorgu yapar', async () => {
    test.setTimeout(600_000);
    let { id, o } = await baslat();
    const kod = alanBul(o, 'Kod').anahtar;
    const tipAnahtari = alanBul(o, 'Tip').anahtar;
    await basarili('/platform/hizli-test/veri', { id, degerler: { [kod]: { deger: 'A1', kaynak: 'elle' }, [tipAnahtari]: { deger: '2', kaynak: 'elle' } } });
    o = await bekle(id, ['karar']);
    o = await bas(id, o, 'Sorgula');
    await basarili('/platform/hizli-test/karar', { id, karar: 'veriDevam' });
    o = await bekle(id, ['veri']);
    // Farklı değer: karar verilmeden hiçbir şey değişmez.
    const y = await api('/platform/hizli-test/veri', { id, degerler: { [kod]: { deger: 'B2', kaynak: 'elle' } } });
    expect(y.basarili).toBe(false);
    expect(y.kod).toBe('TEKRAR');
    expect(y.tekrarlar).toEqual([expect.objectContaining({ anahtar: kod, etiket: 'Kod', adim: 1, onceki: 'A1', yeni: 'B2' })]);
    await basarili('/platform/hizli-test/veri', { id, degerler: { [kod]: { deger: 'B2', kaynak: 'elle' } }, tekrarKararlari: { [kod]: 'ikinci' } });
    o = await bekle(id, ['karar']);
    expect((o.adimlar as Nesne[]).map((a) => (a.alanlar as Nesne[]).map((x) => x.etiket)), JSON.stringify(o.gunluk.slice(-6))).toEqual([['Kod', 'Tip'], ['Kod (2. kez)']]);
    o = await bas(id, o, 'Sorgula');
    // Tip ikinci sorgudan sonra: önceki değer 2, yeni 1 → Taşı.
    await basarili('/platform/hizli-test/karar', { id, karar: 'veriDevam' });
    o = await bekle(id, ['veri']);
    await basarili('/platform/hizli-test/veri', { id, degerler: { [tipAnahtari]: { deger: '1', kaynak: 'elle' } }, tekrarKararlari: { [tipAnahtari]: 'tasi' } });
    o = await bekle(id, ['karar']);
    expect((o.adimlar as Nesne[]).map((a) => (a.alanlar as Nesne[]).map((x) => x.etiket))).toEqual([['Kod'], ['Kod (2. kez)'], ['Tip']]);
    o = await bas(id, o, 'Kaydet');
    const senaryoId = await bitirVeKaydet(id, 'Araç — ikinci kez');
    // Senaryo: Kod iki ayrı alan (iki ayrı değer / başvuru).
    const s = (await basarili(`/platform/senaryo?id=${senaryoId}&ortamId=${ortamId}`)).senaryo as Nesne;
    const kodlar = Object.entries(s.veri as Nesne).filter(([, v]) => /Kod/.test(String(v)) || ['A1', 'B2'].includes(String(v)));
    expect(kodlar.length, JSON.stringify(s.veri)).toBe(2);
    expect(new Set(kodlar.map(([, v]) => String(v))).size).toBe(2);
    const sorguOnce = u.aracSorgulari.length;
    const once = u.aracKayitlari.length;
    await kos(senaryoId);
    expect(u.aracSorgulari.slice(sorguOnce)).toEqual(['A1', 'B2']);
    expect(u.aracKayitlari.slice(once)).toEqual([{ kod: 'B2', tip: '1', marka: 'MARKA-B2' }]);
  });
});
