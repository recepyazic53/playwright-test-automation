// SEÇİM DEĞERİ ↔ SAYFA KARŞILIĞI (hızlı test kaydı). Gerçek ekranda görülen sorunun koruması (genel; siteye özgü sabit yok): iç içe bir
// kontrol seçimi (üst seçim "Evet"te açılan "Kişi tipi (2)": value O / T, metin Özel / Tüzel) kullanıcının yolunda (üst seçim "Hayır")
// görünmediği hâlde senaryoya sayfanın iç koduyla ("O") yazılıyordu; tablo ise seçenekleri görünen adla tuttuğu için kayıt doğrulaması
// reddediyordu ("“Kişi tipi (2)” için “O” geçerli değil. Geçerli değerler: Özel, Tüzel").
//  - Tablo: ekranın TÜM seçim alanlarının seçenekleri (yalnız başka dalda açılanlar dahil) görünen adla; iç kod sütunun karşılığında.
//  - Senaryo: yalnız koşulan yoldaki alanlar; üst seçimi bu dalda olmayan iç içe alan HİÇ yazılmaz; seçim değerleri adla / tablo başvurusuyla.
//  - Normal koşu: sayfada karşılıktaki kod seçilir. Diğer dal önerisi (Evet · Tüzel) değerleri adla kaydedilir ve doğru seçilir.
// Güvenlik: yalnız 127.0.0.1'deki sahte sayfa (veri-duragi-fikstur.ts); geçici veritabanı; veri/ klasörüne dokunulmaz. Değerler UYDURMADIR.
import { randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { secimDegerleriniUydur } from '../../scripts/platform/hizli-test/akis.mjs';
import { planKur, senaryoOnerileri } from '../../scripts/platform/hizli-test/kayit-plani.mjs';
import { kasaOlustur } from '../../scripts/platform/kasa.mjs';
import { veritabaniniHazirla } from '../../scripts/platform/veritabani/depo.mjs';
import { yerelSunucu } from './giris-fikstur';
import { nobetciApi, nobetciBaslat, type Nobetci, type Yanit } from './nobetci-sunucusu';
import { HIZLI_KDF, izinleriAc } from './platform-ortak';
import { VeriDuragiUygulamasi } from './veri-duragi-fikstur';

type Nesne = Record<string, any>;

test.describe('kural (saf)', () => {
  const radyo = (anahtar: string, etiket: string, secenekler: Array<[string, string]>, ek: Nesne = {}): Nesne => ({
    anahtar, etiket, tur: 'radio', secici: `[name=${anahtar}]`, radyolar: secenekler.map(([deger, metin]) => ({ deger, metin, secici: `#${anahtar}${deger}` })), ...ek
  });
  const alanlar = [
    radyo('farkli', 'Farklı kişi', [['H', 'Hayır'], ['E', 'Evet']], { mevcut: 'Hayır' }),
    radyo('tip2', 'Kişi tipi (2)', [['O', 'Özel'], ['T', 'Tüzel']], { mevcut: 'Özel', kosul: { secim: 'farkli', degerler: ['E'] }, dalDisi: true }),
    { anahtar: 'dogum2', etiket: 'Doğum tarihi (2)', tur: 'text', secici: '#dogum2', kosul: { secim: 'tip2', degerler: ['O'] }, dalDisi: true }
  ];

  test('dalda olmayan iç içe seçim senaryoya bağlanmaz; seçenekleri adla tabloda, kod karşılıkta; üst kontrol adla', () => {
    const plan = planKur({ baslik: 'Başvuru', alanlar, degerler: {} });
    const tip = plan.tablolar.find((t) => t.alanlar.some((a) => a.oturumAnahtar === 'tip2'));
    expect(tip, JSON.stringify(plan.tablolar)).toBeTruthy();
    expect(tip?.alanlar.find((a) => a.oturumAnahtar === 'tip2')?.degerli).toBe(false);
    const sutun = tip?.alanlar.find((a) => a.oturumAnahtar === 'tip2')?.sutun as string;
    expect(tip?.satirlar.map((r) => r[sutun])).toEqual(['Özel', 'Tüzel']);
    expect(tip?.sutunlar.find((s) => s.ad === sutun)?.karsiliklar).toEqual({ Özel: { sayfa: 'O' }, Tüzel: { sayfa: 'T' } });
    // Üst kontrol (yolda; kullanıcı değiştirmedi): senaryoya sayfadaki değeriyle, tabloda adla bağlanır.
    const farkli = plan.tablolar.find((t) => t.alanlar.some((a) => a.oturumAnahtar === 'farkli'));
    expect(farkli?.alanlar.find((a) => a.oturumAnahtar === 'farkli')?.degerli).toBe(true);
    expect(Object.values(farkli?.secilen ?? {})).toEqual(['Hayır']);
    // Evet dalı önerisi iç içe seçimi açıkça (adla) yazar: kaydedilen senaryoda değeri yoktur.
    const oneriler = senaryoOnerileri(plan, 'Başvuru', { alanlar });
    const tuzel = oneriler.find((x) => x.baslik.includes('Kişi tipi (2): Tüzel'));
    const ozel = oneriler.find((x) => x.baslik.includes('Kişi tipi (2): Özel'));
    expect(tuzel?.alt?.degisiklikler.map((d) => [d.oturumAnahtar, d.deger])).toEqual([['farkli', 'Evet'], ['tip2', 'Tüzel']]);
    expect(ozel?.alt?.degisiklikler.map((d) => [d.oturumAnahtar, d.deger])).toEqual([['farkli', 'Evet'], ['tip2', 'Özel']]);
  });

  test('düz seçim değeri modelin senaryo değerine çevrilir (tabloya bağlıysa ad, değilse kod); başvuru ve geçerli değer değişmez', () => {
    const model = {
      adimlar: [{ bolumler: [{ alanlar: [
        { id: 'a', tip: 'radyo', eslesme: { senaryo: 'a' }, secenekler: [{ deger: 'O', senaryoDegeri: 'Özel', metin: 'Özel' }, { deger: 'T', senaryoDegeri: 'Tüzel', metin: 'Tüzel' }] },
        { id: 'b', tip: 'radyo', eslesme: { senaryo: 'b' }, secenekler: [{ deger: 'H', metin: 'Hayır' }, { deger: 'E', metin: 'Evet' }] },
        { id: 'c', tip: 'secim', eslesme: { senaryo: 'c' }, secenekler: [{ deger: '1', senaryoDegeri: 'Bir', metin: 'Bir' }] }
      ] }] }]
    };
    expect(secimDegerleriniUydur(model, { a: 'T', b: 'Evet', c: '${Tablo.Sütun}', d: 'O' })).toEqual({ a: 'Tüzel', b: 'E', c: '${Tablo.Sütun}', d: 'O' });
    expect(secimDegerleriniUydur(model, { a: 'Özel', b: 'H' })).toEqual({ a: 'Özel', b: 'H' });
  });
});

test.describe('hızlı test kaydı ve normal koşu (127.0.0.1)', () => {
  test.describe.configure({ mode: 'serial' });
  const PAROLA = `Gecici-Karsilik-${randomBytes(6).toString('hex')}`;
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
  async function kos(senaryoId: string): Promise<void> {
    const y = await api('/platform/senaryolar/calistir', { projeId, kosuId: `kosu-${randomBytes(6).toString('hex')}`, senaryoId, ortamId });
    expect(y.basarili, y.mesaj).toBe(true);
    const sonuc = (await api(`/platform/sonuclar/sonuc?id=${String(y.sonucId)}`)).sonuc as Nesne;
    expect(sonuc.durum, JSON.stringify(sonuc.hataMesaji).slice(0, 400)).toBe('basarili');
  }

  test.beforeAll(async () => {
    test.setTimeout(120_000);
    klasor = mkdtempSync(join(tmpdir(), 'secim-karsilik-'));
    fikstur = await yerelSunucu((i) => u.isle(i) ?? { durum: 404, tur: 'text/plain', govde: 'yok' });
    const vtYolu = join(klasor, 'platform.db');
    const vt = await veritabaniniHazirla(vtYolu);
    await kasaOlustur(vt, PAROLA, { kdf: HIZLI_KDF });
    izinleriAc(vt);
    vt.kapat();
    nobetci = await nobetciBaslat(klasor, vtYolu, { NOBETCI_KAYIT_BASSIZ: '1', NOBETCI_TARAMA_IZINLI_KOKENLER: fikstur.adres, NOBETCI_KAYIT_ZAMAN_ASIMI_SN: '900', NOBETCI_REHBER_OTOMATIK: '0' });
    await basarili('/platform/kasa/ac', { parola: PAROLA });
    projeId = String(((await basarili('/platform/proje/kaydet', { ad: 'Karşılık Projesi' })).proje as Nesne).id);
    ortamId = String(((await basarili('/platform/ortam/kaydet', { projeId, ad: 'Deneme', tabanUrl: fikstur.adres, varsayilan: true, riskli: false })).ortam as Nesne).id);
  });
  test.afterAll(async () => {
    nobetci?.surec.kill('SIGTERM');
    await fikstur?.kapat();
    if (klasor) rmSync(klasor, { recursive: true, force: true });
  });

  test('üst seçim Hayır: kayıt hatasız; iç içe seçimin seçenekleri tabloda adla + kod karşılığı; senaryoda yok; normal koşu kodu seçer; Evet · Tüzel önerisi adla kaydedilir ve doğru seçilir', async () => {
    test.setTimeout(600_000);
    const id = String((await basarili('/platform/hizli-test/baslat', {
      projeId, ortamId, hedef: '/ic-ice/', ekranAdi: 'Karşılık', izin: 'evet', cumle: 'Kaydet düğmesine bas, "Kayıt alındı" görünce bitir'
    })).id);
    let o = await bekle(id, ['veri'], 300);
    expect(alanBul(o, 'Farklı kişi')).toMatchObject({ kontrol: true, sayfadaki: 'H' });
    // Yalnız Ad; Farklı kişi sayfadaki "Hayır"da kalır (iç içe "Kişi tipi (2)" bu yolda görünmez).
    await basarili('/platform/hizli-test/veri', { id, degerler: { [alanBul(o, 'Ad').anahtar]: { deger: 'Deneme Hayır', kaynak: 'elle' } } });
    o = await bekle(id, ['karar'], 180);
    if (!u.icIceKayitlar.length) {
      const aday = (o.soru.adaylar as Nesne[]).find((a) => a.metin === 'Kaydet');
      await basarili('/platform/hizli-test/karar', { id, karar: 'bas', secici: aday?.secici });
      o = await bekle(id, ['karar']);
    }
    expect(u.icIceKayitlar.at(-1)).toEqual({ ad: 'Deneme Hayır', farkli: 'H' });
    await basarili('/platform/hizli-test/karar', { id, karar: 'bitir' });
    o = await bekle(id, ['bitis']);
    const bitti = Object.keys(o.soru.etiketler).find((m) => m.startsWith('Kayıt alındı')) as string;
    await basarili('/platform/hizli-test/bitis', { id, etiketler: { ...o.soru.etiketler, [bitti]: 'bitti' } });
    await bekle(id, ['kaydet']);

    const baslik = 'Karşılık — Hayır';
    const oz = (await basarili('/platform/hizli-test/ozet', { id, baslik })).ozet as Nesne;
    expect(oz.sorunlar).toEqual([]);
    const oneri = (oz.senaryolar as Nesne[]).find((x) => String(x.baslik).includes('Farklı kişi: Evet') && String(x.baslik).includes('Kişi tipi (2): Tüzel'));
    expect(oneri, JSON.stringify((oz.senaryolar as Nesne[]).map((x) => x.baslik))).toBeTruthy();
    const k = await basarili('/platform/hizli-test/kaydet', { id, baslik, senaryoIndeksleri: [oneri?.indeks] });
    expect(k.kaydedildi).toBe(true);

    // Tablo: iç içe seçimin seçenekleri görünen adla, iç kod karşılıkta.
    const tablolar = (await basarili(`/platform/tablolar?projeId=${projeId}`)).tablolar as Nesne[];
    const tipTablosu = tablolar.find((t) => (t.satirlar as Nesne[]).some((r) => Object.values(r.degerler).includes('Tüzel'))) as Nesne;
    expect(tipTablosu, JSON.stringify(tablolar.map((t) => t.ad))).toBeTruthy();
    const tipSutunu = (tipTablosu.sutunlar as Nesne[]).find((s) => (tipTablosu.satirlar as Nesne[]).some((r) => r.degerler[s.ad] === 'Tüzel')) as Nesne;
    expect((tipTablosu.satirlar as Nesne[]).map((r) => r.degerler[tipSutunu.ad])).toEqual(['Özel', 'Tüzel']);
    expect(tipSutunu.karsiliklar).toMatchObject({ Özel: { sayfa: 'O' }, Tüzel: { sayfa: 'T' } });

    // Kaydedilen senaryo: iç içe alan yok, iç kod yok.
    const senaryolar = (await basarili(`/platform/senaryolar?projeId=${projeId}`)).senaryolar as Nesne[];
    const ana = senaryolar.find((x) => x.baslik === baslik) as Nesne;
    const anaDetay = (await basarili(`/platform/senaryo?id=${String(ana.id)}&ortamId=${ortamId}`)).senaryo as Nesne;
    const anaVeri = JSON.stringify(anaDetay.veri);
    expect(anaVeri).not.toContain(`\${${String(tipTablosu.ad)}`);
    expect(anaDetay.veri.tip2, anaVeri).toBeUndefined();
    expect(String(anaDetay.veri.farkli), anaVeri).toMatch(/^\$\{/);
    for (const kod of ['O', 'T', 'H', 'E']) expect(Object.values(anaDetay.veri), anaVeri).not.toContain(kod);

    // Normal koşu: Hayır dalı (sayfaya kod gider).
    const once = u.icIceKayitlar.length;
    await kos(String(ana.id));
    expect(u.icIceKayitlar.slice(once)).toEqual([{ ad: 'Deneme Hayır', farkli: 'H' }]);

    // Evet · Tüzel önerisi: iç içe seçim tablo başvurusuyla, satır seçimi adla ("Tüzel"); alanları "veri bekliyor" — doldurulup koşulur.
    const dal = senaryolar.find((x) => x.baslik === oneri?.baslik) as Nesne;
    expect(dal, JSON.stringify(senaryolar.map((x) => x.baslik))).toBeTruthy();
    const dalDetay = (await basarili(`/platform/senaryo?id=${String(dal.id)}&ortamId=${ortamId}`)).senaryo as Nesne;
    expect(JSON.stringify(dalDetay.veri)).toContain(`\${${String(tipTablosu.ad)}.${String(tipSutunu.ad)}}`);
    const secimler = Object.entries(dalDetay.tabloSecimleri as Record<string, Nesne>).filter(([a]) => a.startsWith(String(tipTablosu.id)));
    expect(secimler.map(([, v]) => v), JSON.stringify(dalDetay.tabloSecimleri)).toEqual([{ [String(tipSutunu.ad)]: 'Tüzel' }]);
    for (const kod of ['O', 'T', 'H', 'E']) expect(Object.values(dalDetay.veri)).not.toContain(kod);
    const bekleyen = (dalDetay.veriBekliyor?.bekleyen ?? []) as Nesne[];
    expect(bekleyen.map((x) => x.etiket)).toEqual(expect.arrayContaining(['Vergi no (2)', 'İş telefonu (2)']));
    const kayitTablosu = tablolar.find((t) => t.id === bekleyen[0].tabloId) as Nesne;
    const satirlar = (kayitTablosu.satirlar as Nesne[]).map((r) => (r.id === bekleyen[0].satirId
      ? { ...r, degerler: { ...r.degerler, ...Object.fromEntries(bekleyen.map((b) => [b.sutun, /^(Vergi|Kimlik)/.test(String(b.etiket)) ? '1234567890' : '2125550000'])) } }
      : r));
    await basarili('/platform/tablo/kaydet', { projeId, id: kayitTablosu.id, ad: kayitTablosu.ad, sutunlar: kayitTablosu.sutunlar, satirlar });
    const once2 = u.icIceKayitlar.length;
    await kos(String(dal.id));
    expect(u.icIceKayitlar.slice(once2)).toEqual([{ ad: 'Deneme Hayır', farkli: 'E', tip2: 'T', telefon2: '2125550000', kimlik2: '1234567890' }]);
  });
});
