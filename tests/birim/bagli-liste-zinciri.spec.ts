// BAĞLI LİSTE ZİNCİRİ (zincir-kesfi.mjs + zincir-motoru.ts): bir liste seçilince seçenekleri gelen / beliren başka listeler (il → ilçe →
// mahalle → sokak, marka → model) alan adından değil sayfanın davranışından bulunur ve zincirin sonuna kadar izlenir.
//  1) Saf kurallar (örnek değerler, değişen listeler, ilişkiler, özet ve bulgu cümleleri, bağımlılık haritası).
//  2) Otomatik tarama: zincir + kasıtlı sayfa hataları bulgu olur; pakette çok düzeyli bagimlilik ve tablo.
//  3) Hızlı test (Nöbetçi sunucusu): keşif zinciri bulur; veri durağı zinciri üstten alta SIRAYLA sorar (alt liste üst seçilince gelen
//     gerçek seçeneklerle); düğmeye doğru değerlerle basılır; kaydedilen modelde bağımlılıklar vardır.
//  4) Arayüz: üst seçilince seçim anında sayfaya uygulanır (yedek: yerinde "↓ “İlçe” seçeneklerini getir" düğmesi); alt liste üstünün altında belirir, odak seçimde kalır ve
//     duyurulur; üst değişince alt temizlenir; bağlı listeler zorunlu sayılmaz: "Devam et" hep etkin, zincir yarımsa engellemeyen bilgi; zincirsiz sayfada
//     eski davranış.
// Güvenlik: şirket sitesine HİÇBİR istek gitmez — sahte sayfa 127.0.0.1'dedir (bagli-liste-fikstur.ts), tarayıcı DNS çözümlemez ve
// yalnız fikstürün kökenine bağlanır. Geçici veritabanı; veri/ klasörüne dokunulmaz. Tüm değerler uydurmadır.
import { randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test, type Browser } from '@playwright/test';
import { kasaOlustur } from '../../scripts/platform/kasa.mjs';
import { veritabaniniHazirla } from '../../scripts/platform/veritabani/depo.mjs';
import { sutunSecenekleri } from '../../scripts/platform/tablolar/tablo-secimi.mjs';
import { sayfaPaketiniDogrula } from '../../scripts/platform/ekranlar/sayfa-paketi.mjs';
import { taramaPaketiOlustur, type TaramaEnvanteri } from '../../scripts/platform/tarama/paket-olusturucu.mjs';
import type { TaramaGirdisi } from '../../scripts/platform/tarama/protokol.mjs';
import { taramayiYurut } from '../../scripts/platform/tarama/tarama-motoru';
import {
  birinciDuzeyIliskiler, bulguMetni, degisenSecimler, gercekSecenekler, ornekDegerler, tekrarlayanSecenekler, zincirBagimliliklari, zincirMetni
} from '../../scripts/platform/tarama/zincir-kesfi.mjs';
import { BagliListeUygulamasi } from './bagli-liste-fikstur';
import { korumaliTarayici, yerelSunucu } from './giris-fikstur';

import { nobetciApi, nobetciBaslat, type Nobetci, type Yanit } from './nobetci-sunucusu';
import { HIZLI_KDF, izinleriAc } from './platform-ortak';

type Nesne = Record<string, any>;
const s = (deger: string, metin = deger) => ({ deger, metin });
const liste = (anahtar: string, secenekler: Array<{ deger: string; metin: string }>, ek: Nesne = {}) => ({ anahtar, tur: 'select', secenekler, ...ek });

test.describe('saf kurallar', () => {
  test('örnek değerler: yer tutucu atlanır; ilk, son ve aradan eşit aralıklı (her seferinde aynı)', () => {
    const l = [s('', 'Seçiniz'), ...['a', 'b', 'c', 'd', 'e', 'f', 'g'].map((x) => s(x))];
    expect(gercekSecenekler(l).map((x) => x.deger)).toEqual(['a', 'b', 'c', 'd', 'e', 'f', 'g']);
    expect(ornekDegerler(l, 3).map((x) => x.deger)).toEqual(['a', 'd', 'g']);
    expect(ornekDegerler(l, 1).map((x) => x.deger)).toEqual(['a']);
    expect(ornekDegerler(l.slice(0, 3), 5).map((x) => x.deger)).toEqual(['a', 'b']);
    expect(ornekDegerler(l, 3)).toEqual(ornekDegerler(l, 3));
  });

  test('değişen listeler: seçenekleri değişen, etkinleşen ve gerçek seçenekle beliren açılır listeler; seçilen alan ve metin kutuları hariç', () => {
    const once = [liste('#il', [s('1')]), liste('#ilce', [s('', 'Seçiniz')]), liste('#kat', [s('x')], { devreDisi: true }), { anahtar: '#ad', tur: 'text' }];
    const sonra = [liste('#il', [s('1')]), liste('#ilce', [s('', 'Seçiniz'), s('a')]), liste('#kat', [s('x')]), liste('#model', [s('m')]), liste('#bos', [s('', 'Seçiniz')]), { anahtar: '#ad', tur: 'text' }];
    expect(degisenSecimler(once, sonra, new Set(['#il'])).map((x) => [x.anahtar, x.neden])).toEqual([['#ilce', 'secenek'], ['#kat', 'etkinlesti'], ['#model', 'belirdi']]);
  });

  test('birinci düzey ilişkiler: açılır listeye bağlı listeler (radyoya bağlı beliren alan zincir değildir); kökler sayfa sırasıyla', () => {
    const alanlar = [liste('#marka', [s('m1')]), liste('#il', [s('1')]), liste('#ilce', []), { anahtar: 'radyo:tip', tur: 'radio' }];
    const kesifler = [
      { secim: '#il', tur: 'secim', degerler: [{ deger: '1', gorunenler: [], secenekler: { '#ilce': [s('a')] } }] },
      { secim: '#marka', tur: 'secim', degerler: [{ deger: 'm1', gorunenler: [liste('#model', [s('x')])] }] },
      { secim: 'radyo:tip', tur: 'radyo', degerler: [{ deger: 'k', gorunenler: [liste('#vergi', [s('v')])] }] }
    ];
    expect(birinciDuzeyIliskiler(kesifler, alanlar)).toEqual({ iliskiler: [{ ust: '#il', alt: '#ilce' }, { ust: '#marka', alt: '#model' }], kokler: ['#marka', '#il'] });
  });

  test('özet, bulgu cümleleri, tekrarlayan seçenek ve bağımlılık haritası', () => {
    const ad = (k: string) => ({ '#il': 'İl', '#ilce': 'İlçe', '#mah': 'Mahalle', '#marka': 'Marka', '#model': 'Model' } as Record<string, string>)[k] ?? k;
    expect(zincirMetni([{ ust: '#il', alt: '#ilce' }, { ust: '#ilce', alt: '#mah' }, { ust: '#marka', alt: '#model' }], ad)).toEqual(['İl → İlçe → Mahalle', 'Marka → Model']);
    expect(bulguMetni({ tur: 'bosListe', alan: '#ilce', secimler: [{ anahtar: '#il', deger: '99', metin: 'Boşil' }], beklenenMs: 8000 }, ad))
      .toBe('İl = “Boşil” seçilince “İlçe” listesi boş kaldı (8 sn beklendi; başka değerlerde seçenek geliyor).');
    expect(bulguMetni({ tur: 'secilemedi', alan: '#mah', secimler: [{ anahtar: '#il', deger: '1', metin: 'Adana' }], metin: 'Toros' }, ad))
      .toBe('İl = “Adana” seçildikten sonra “Mahalle” listesinde “Toros” seçilemedi.');
    expect(tekrarlayanSecenekler([s('', 'Seçiniz'), s('1', 'Toros'), s('2', 'Lale'), s('3', 'TOROS ')])).toEqual(['Toros']);
    const b = zincirBagimliliklari([{ ust: '#il', alt: '#ilce' }], [
      { anahtar: '#ilce', secimler: { '#il': '1' }, secenekler: [s('a')] }, { anahtar: '#ilce', secimler: { '#il': '2' }, secenekler: [s('b')] },
      { anahtar: '#ilce', secimler: { '#il': '3' }, secenekler: [] }
    ]);
    expect([...(b.get('#ilce')?.harita ?? new Map())]).toEqual([['1', [s('a')]], ['2', [s('b')]]]);
  });
});

test.describe('otomatik tarama', () => {
  let tarayici: Browser;
  test.beforeAll(async () => { tarayici = await korumaliTarayici(); });
  test.afterAll(async () => { await tarayici?.close(); });

  test('zincir sonuna kadar izlenir (İl → İlçe → Mahalle → Sokak, Marka → Model); kasıtlı hatalar bulgu; pakette çok düzeyli bağımlılık', async () => {
    test.setTimeout(240_000);
    const uygulama = new BagliListeUygulamasi();
    const sunucu = await yerelSunucu((i) => uygulama.isle(i) ?? { durum: 404, tur: 'text/plain', govde: 'yok' });
    let envanter: TaramaEnvanteri;
    try {
      const g: TaramaGirdisi = {
        tabanUrl: sunucu.adres, hedefAdres: `${sunucu.adres}/adres/`, hedefYol: '/adres/', tarif: null, kimlik: null,
        profiller: [{ ad: null, degerler: null }], kesif: true, yasakKaliplari: ['*yasak-ornek*'], izinliKokenler: [sunucu.adres], zamanAsimiMs: 200_000
      };
      envanter = await taramayiYurut(tarayici, g, async () => undefined);
    } finally {
      await sunucu.kapat();
    }
    // Hiçbir düğmeye basılmadı (hesaplama isteği yok).
    expect(uygulama.hesaplamalar).toEqual([]);
    const p = envanter.profiller[0];
    const z = p.zincir;
    expect(z, JSON.stringify(p.notlar)).toBeTruthy();
    const ad = (k: string) => p.alanlar.find((a) => a.anahtar === k)?.etiket ?? k;
    expect(zincirMetni(z?.iliskiler ?? [], (k) => ({ '#il': 'İl', '#ilce': 'İlçe', '#mahalle': 'Mahalle', '#sokak': 'Sokak', '#marka': 'Marka', '#model': 'Model' } as Record<string, string>)[k] ?? k))
      .toEqual(['İl → İlçe → Mahalle → Sokak', 'Marka → Model']);
    const bulgular = (z?.bulgular ?? []).map((b) => bulguMetni(b, ad));
    // Tekrarlayan seçenek bulgudur; bazı üst değerlerde boş gelen liste (ilçesi olmayan il, sokağı olmayan mahalle) bulgu DEĞİL, liste başına
    // tek özet nottur (çoğu zaman verinin kendisi).
    expect(bulgular).toEqual(['İl = “Adana”, İlçe = “Çukurova” seçilince “Mahalle” listesinde aynı seçenek birden çok kez var: “Toros”.']);
    expect(z?.notlar).toEqual(expect.arrayContaining([
      expect.stringMatching(/^“İlçe” bazı “İl” değerlerinde boş geliyor \(1\/\d+ denenen değerde boş; sayfa hatası sayılmadı\)\.$/),
      expect.stringMatching(/^“Sokak” bazı “Mahalle” değerlerinde boş geliyor \(1\/\d+ denenen değerde boş/)
    ]));
    // "Yapı tarzı" bağımsız: hiçbir zincire girmez.
    expect((z?.iliskiler ?? []).some((i) => i.ust === '#yapi' || i.alt === '#yapi')).toBe(false);

    const { paket } = taramaPaketiOlustur({ ekranAnahtari: 'adres', ekranAdi: 'Adres', urlYolu: '/adres/', girisGerekli: false, ikiAsamali: 'yok', baglamTuru: null }, envanter);
    expect(sayfaPaketiniDogrula(paket).hatalar).toEqual([]);
    const alanlar = ((paket as Nesne).model.adimlar as Nesne[]).flatMap((a) => (a.bolumler as Nesne[]).flatMap((b) => b.alanlar as Nesne[]));
    const alan = (id: string) => alanlar.find((a) => a.id === id) as Nesne;
    expect(alan('ilce').bagimlilik.alan).toBe('il');
    expect(alan('mahalle').bagimlilik).toMatchObject({ alan: 'ilce', secenekHaritasi: { '0101': [s('Reşatbey'), s('Kurtuluş')] } });
    expect(alan('sokak').bagimlilik).toMatchObject({ alan: 'mahalle', secenekHaritasi: { 'Reşatbey': [s('1. Sokak'), s('2. Sokak')] } });
    // Kısmi harita: birleşik liste yazılmaz (denenmemiş üst değerlerin alt seçenekleri doğrulamada reddedilmesin).
    expect(alan('sokak').secenekler).toBeNull();
    expect((paket as Nesne).bilinmeyenler).toEqual(expect.arrayContaining([expect.stringContaining('Bağlı liste bulgusu — İl = “Adana”, İlçe = “Çukurova”')]));
    expect((paket as Nesne).model.bilinmeyenler).toEqual(expect.arrayContaining([expect.stringContaining('Bağlı liste bulgusu — İl = “Adana”')]));
    expect(JSON.stringify((paket as Nesne).bilinmeyenler)).not.toContain('boş kaldı');
    // Test verisi: çok düzeyli tablo (il, ilçe, mahalle, sokak birlikte; satır = geçerli kombinasyon).
    const tablolar = (paket as Nesne).testVerisi?.tablolar as Nesne[];
    const adres = tablolar.find((t) => (t.sutunlar as Nesne[]).map((c) => c.ad).join('|').startsWith('İl|İlçe|Mahalle|Sokak'));
    expect(adres, JSON.stringify(tablolar.map((t) => [t.ad, t.sutunlar.map((c: Nesne) => c.ad)]))).toBeTruthy();
    expect(adres?.satirlar).toEqual(expect.arrayContaining([['Adana', 'Seyhan', 'Reşatbey', '1. Sokak'], ['İstanbul', 'Kadıköy', 'Moda', 'Moda Sokak']]));
  });
});

test.describe('Nöbetçi taraması', () => {
  test.describe.configure({ mode: 'serial' });
  const PAROLA = `Gecici-Zincir-${randomBytes(6).toString('hex')}`;
  let nobetci: Nobetci;
  let uygulama: BagliListeUygulamasi;
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
  async function bekle(id: string, durumlar: string[], sn = 120): Promise<Nesne> {
    const son = Date.now() + sn * 1000;
    for (;;) {
      const o = (await api(`/platform/hizli-test/durum?id=${id}`)).oturum as Nesne;
      // Keşif toplu sorusu bu testin konusu değil: "Hiçbirine basma".
      if (o.durum === 'kesifOnay' && !durumlar.includes('kesifOnay')) { await api('/platform/hizli-test/onay', { id, cevap: false }); continue; }
      if (durumlar.includes(o.durum)) return o;
      if (['hata', 'iptal'].includes(o.durum) || Date.now() > son) throw new Error(`beklenen ${durumlar.join('/')}, olan ${o.durum}: ${JSON.stringify(o.hata ?? o.sonHata)} ${JSON.stringify(o.gunluk?.slice(-5))}`);
      await new Promise((c) => setTimeout(c, 300));
    }
  }
  const deger = (d: string): Nesne => ({ deger: d, kaynak: 'elle' });

  test.beforeAll(async () => {
    test.setTimeout(120_000);
    klasor = mkdtempSync(join(tmpdir(), 'bagli-liste-'));
    uygulama = new BagliListeUygulamasi();
    fikstur = await yerelSunucu((i) => uygulama.isle(i) ?? { durum: 404, tur: 'text/plain', govde: 'yok' });
    const vtYolu = join(klasor, 'platform.db');
    const vt = await veritabaniniHazirla(vtYolu);
    await kasaOlustur(vt, PAROLA, { kdf: HIZLI_KDF });
    izinleriAc(vt);
    vt.kapat();
    nobetci = await nobetciBaslat(klasor, vtYolu, { NOBETCI_KAYIT_BASSIZ: '1', NOBETCI_TARAMA_IZINLI_KOKENLER: fikstur.adres, NOBETCI_KAYIT_ZAMAN_ASIMI_SN: '600', NOBETCI_REHBER_OTOMATIK: '0' });
    await basarili('/platform/kasa/ac', { parola: PAROLA });
    projeId = String(((await basarili('/platform/proje/kaydet', { ad: 'Bağlı Liste Projesi' })).proje as Nesne).id);
    ortamId = String(((await basarili('/platform/ortam/kaydet', { projeId, ad: 'Deneme', tabanUrl: fikstur.adres, varsayilan: true, riskli: false })).ortam as Nesne).id);
  });
  test.afterAll(async () => {
    nobetci?.surec.kill('SIGTERM');
    await fikstur?.kapat();
    if (klasor) rmSync(klasor, { recursive: true, force: true });
  });

  test('süslü listelerle: keşif zinciri bulur; veri durağı üstten alta sırayla sorar; düğmeye doğru değerlerle basılır; modelde bağımlılıklar; normal koşu liste dolana kadar bekler', async () => {
    test.setTimeout(500_000);
    const id = String((await basarili('/platform/hizli-test/baslat', {
      projeId, ortamId, hedef: '/adres/?suslu=1', ekranAdi: 'Adres', izin: 'evet', cumle: 'Hesapla düğmesine bas, "Sonuç hazır" görünce bitir'
    })).id);
    let o = await bekle(id, ['veri'], 240);
    expect(uygulama.hesaplamalar).toEqual([]);
    expect(o.zincir).toEqual(['İl → İlçe → Mahalle → Sokak', 'Marka → Model']);
    // Tekrarlayan seçenek bulgu; bazı değerlerde boş gelen listeler bulgu değil, günlükte liste başına tek not.
    expect(o.bulgular).toEqual([expect.stringContaining('“Mahalle” listesinde aynı seçenek birden çok kez var: “Toros”')]);
    const gunlukMetni = (o.gunluk as Nesne[]).map((g) => g.metin).join('\n');
    expect(gunlukMetni).toContain('“İlçe” bazı “İl” değerlerinde boş geliyor');
    expect(gunlukMetni).toContain('“Sokak” bazı “Mahalle” değerlerinde boş geliyor');
    const alan = (etiket: string): Nesne => o.soru.alanlar.find((a: Nesne) => a.etiket === etiket);
    for (const [alt, ust] of [['İlçe', 'İl'], ['Mahalle', 'İlçe'], ['Sokak', 'Mahalle']]) expect(alan(alt).bagli, alt).toMatchObject({ ustEtiket: ust, bekliyor: true });
    expect(alan('Model').bagli).toMatchObject({ ustEtiket: 'Marka' });
    // Seçenekleri henüz gelmemiş zorunsuz bağlı listeler sorun değil; 1. tur: İl, Marka, Yapı tarzı.
    await basarili('/platform/hizli-test/veri', { id, degerler: { [alan('İl').anahtar]: deger('06'), [alan('Marka').anahtar]: deger('m2'), [alan('Yapı tarzı').anahtar]: deger('b') } });
    o = await bekle(id, ['veri', 'karar']);
    expect(o.durum).toBe('veri');
    expect(o.soru.not).toMatch(/“İlçe”.*seçenekleri geldi|seçenekleri geldi/);
    expect(alan('İlçe').secenekler.map((x: Nesne) => x.metin)).toEqual(['Çankaya', 'Keçiören']);
    expect(alan('İlçe').bagli.bekliyor).toBe(false);
    expect(alan('Model').secenekler.map((x: Nesne) => x.metin)).toEqual(['Beta Bir']);
    // 2. tur: İlçe + Model → Mahalle gelir.
    await basarili('/platform/hizli-test/veri', { id, degerler: { [alan('İlçe').anahtar]: deger('0602'), [alan('Model').anahtar]: deger('Beta Bir') } });
    o = await bekle(id, ['veri', 'karar']);
    expect(alan('Mahalle').secenekler.map((x: Nesne) => x.metin), JSON.stringify({ d: o.durum, not: o.soru?.not, hatalar: o.soru?.alanlar?.filter((a: Nesne) => a.hata).map((a: Nesne) => [a.etiket, a.hata]), g: o.gunluk?.slice(-4) })).toEqual(['Etlik']);
    // Üst değiştirilirse alttaki eski değer gönderilmez: İl = İstanbul → İlçe yeniden sorulur (Ankara'nın ilçesi Kadıköy listesinde yok).
    await basarili('/platform/hizli-test/veri', { id, degerler: { [alan('İl').anahtar]: deger('34') } });
    o = await bekle(id, ['veri', 'karar']);
    expect(alan('İlçe').deger).toBeNull();
    expect(alan('İlçe').secenekler.map((x: Nesne) => x.metin)).toEqual(['Kadıköy']);
    await basarili('/platform/hizli-test/veri', { id, degerler: { [alan('İlçe').anahtar]: deger('3401') } });
    o = await bekle(id, ['veri', 'karar']);
    await basarili('/platform/hizli-test/veri', { id, degerler: { [alan('Mahalle').anahtar]: deger('Moda') } });
    o = await bekle(id, ['veri', 'karar']);
    expect(alan('Sokak').secenekler.map((x: Nesne) => x.metin)).toEqual(['Bahariye Sokak', 'Moda Sokak']);
    // Son tur: Sokak → zincir tamam; Evet + tek aday → "Hesapla"a basılır.
    await basarili('/platform/hizli-test/veri', { id, degerler: { [alan('Sokak').anahtar]: deger('Moda Sokak') } });
    o = await bekle(id, ['karar', 'hataSorusu', 'veri'], 120);
    expect(o.durum, JSON.stringify({ soru: o.soru, gunluk: o.gunluk })).toBe('karar');
    expect(uygulama.hesaplamalar).toEqual([{ il: '34', ilce: '3401', mahalle: 'Moda', sokak: 'Moda Sokak', model: 'Beta Bir' }]);
    await basarili('/platform/hizli-test/karar', { id, karar: 'bitir' });
    o = await bekle(id, ['bitis']);
    const bitti = Object.keys(o.soru.etiketler).find((m) => m.startsWith('Sonuç hazır')) as string;
    await basarili('/platform/hizli-test/bitis', { id, etiketler: { ...o.soru.etiketler, [bitti]: 'bitti' } });
    await bekle(id, ['kaydet']);
    // Senaryo önerileri: bağlı listeler gözlenen geçerli bir yolla BİRLİKTE değişir (il değişip ilçe / mahalle / sokak eski kalmaz); zincirin
    // kökü farklı her satırı (aynı kökten ikinci satır yok) tek başına öneri değil, bağımsız seçimi (Yapı tarzı) değişen önerilere katılır.
    const ozet = ((await basarili('/platform/hizli-test/ozet', { id, baslik: 'Adres — Nöbetçi taraması' })).ozet as Nesne);
    const oneriler = (ozet.senaryolar as Nesne[]).slice(1);
    const degisim = (x: Nesne): Record<string, string> => Object.fromEntries((x.alt?.degisiklikler ?? []).map((d: Nesne) => [d.etiket, d.deger]));
    expect(oneriler.length, JSON.stringify(ozet.senaryolar)).toBeGreaterThan(0);
    for (const x of oneriler) { const d = degisim(x); if (d['İl']) expect([d['İlçe'], d['Mahalle'], d['Sokak']].every(Boolean), JSON.stringify(d)).toBe(true); }
    for (const x of oneriler) expect(degisim(x)['Yapı tarzı'], JSON.stringify(degisim(x))).toBeTruthy();
    const iller = oneriler.map((x) => degisim(x)['İl']).filter(Boolean);
    expect(new Set(iller).size).toBe(iller.length);
    const adana = oneriler.find((x) => degisim(x)['İl'] === 'Adana') as Nesne;
    expect(degisim(adana), JSON.stringify(ozet.senaryolar)).toMatchObject({ 'İl': 'Adana', 'İlçe': 'Seyhan', 'Mahalle': 'Reşatbey', 'Sokak': '2. Sokak' });
    expect(adana.gerekce).toContain('adres: farklı il');
    expect(adana.baslik).toContain('İl: Adana / Seyhan / Reşatbey / 2. Sokak');
    const k = await basarili('/platform/hizli-test/kaydet', { id, baslik: 'Adres — Nöbetçi taraması', senaryoIndeksleri: [adana.indeks] });
    // Test verisi: zincir TEK tablo (sütun = halka, satır = gözlenen geçerli kombinasyon); halkalar ayrı ekran listesi değil.
    const tablolar = (await api(`/platform/tablolar?projeId=${projeId}`)).tablolar as Nesne[];
    const zt = tablolar.find((t) => t.ad === 'İl - İlçe - Mahalle - Sokak') as Nesne;
    expect(zt, JSON.stringify(tablolar.map((t) => t.ad))).toBeTruthy();
    expect(zt.sutunlar.map((c: Nesne) => c.ad)).toEqual(['İl', 'İlçe', 'Mahalle', 'Sokak']);
    const kombinasyonlar = (zt.satirlar as Nesne[]).map((r) => [r.degerler['İl'], r.degerler['İlçe'], r.degerler.Mahalle, r.degerler.Sokak]);
    expect(kombinasyonlar).toEqual(expect.arrayContaining([['İstanbul', 'Kadıköy', 'Moda', 'Moda Sokak'], ['Adana', 'Seyhan', 'Reşatbey', '2. Sokak']]));
    for (const r of kombinasyonlar) expect(r.every(Boolean), JSON.stringify(r)).toBe(true); // yalnız tam kombinasyonlar
    expect(tablolar.some((t) => ['İl', 'İlçe', 'Mahalle', 'Sokak'].includes(t.ad))).toBe(false);
    expect(tablolar.find((t) => t.ad === 'Marka - Model')?.sutunlar.map((c: Nesne) => c.ad)).toEqual(['Marka', 'Model']);
    // Senaryo formu: İl seçilince İlçe yalnız o ilin satırlarından süzülür.
    expect(sutunSecenekleri(zt as Parameters<typeof sutunSecenekleri>[0], { 'İl': 'İstanbul' }, 'İlçe')).toEqual(['Kadıköy']);
    expect(sutunSecenekleri(zt as Parameters<typeof sutunSecenekleri>[0], { 'İl': 'Adana' }, 'İlçe')).not.toContain('Kadıköy');
    const model = ((await api(`/platform/ekran?projeId=${projeId}&id=${String(k.ekranId)}`)) as Nesne).model as Nesne;
    const alanlar = (model.adimlar as Nesne[]).flatMap((a) => (a.bolumler as Nesne[]).flatMap((b) => b.alanlar as Nesne[]));
    const m = (secici: string) => alanlar.find((a) => a.konum?.secici === secici) as Nesne;
    expect(m('#ilce').bagimlilik.alan).toBe(m('#il').id);
    expect(m('#mahalle').bagimlilik.alan).toBe(m('#ilce').id);
    expect(m('#sokak').bagimlilik.alan).toBe(m('#mahalle').id);
    expect(m('#model').bagimlilik.alan).toBe(m('#marka').id);
    // Olağan yüklenme süresi gözlendi (sahte sayfa 400 ms gecikmeyle doldurur) ve modele yazıldı.
    for (const x of ['#ilce', '#mahalle', '#sokak']) expect(m(x).bagimlilik.yuklenmeMs, x).toBeGreaterThanOrEqual(300);
    expect(model.bilinmeyenler).toEqual(expect.arrayContaining([expect.stringContaining('Bağlı liste bulgusu')]));
    // Sıra: üst her zaman altından önce (koşu bu sırayla doldurur).
    const sira = alanlar.map((a) => a.konum?.secici);
    expect(sira.indexOf('#il')).toBeLessThan(sira.indexOf('#ilce'));
    expect(sira.indexOf('#ilce')).toBeLessThan(sira.indexOf('#mahalle'));
    expect(sira.indexOf('#mahalle')).toBeLessThan(sira.indexOf('#sokak'));
    const kos = async (senaryoId: string): Promise<Nesne> => {
      const y = await api('/platform/senaryolar/calistir', { projeId, kosuId: `kosu-${randomBytes(6).toString('hex')}`, senaryoId, ortamId });
      expect(y.basarili, y.mesaj).toBe(true);
      return (await api(`/platform/sonuclar/sonuc?id=${String(y.sonucId)}`)).sonuc as Nesne;
    };
    // Normal koşu: liste seçenekleri gecikmeli gelir; koşucu her bağlı listede seçeneğin gelmesini bekler (hemen "listede yok" demez).
    let once = uygulama.hesaplamalar.length;
    let sonuc = await kos(String(k.senaryoId));
    expect(sonuc.durum, JSON.stringify(sonuc.hataMesaji)).toBe('basarili');
    expect(uygulama.hesaplamalar.slice(once)).toEqual([{ il: '34', ilce: '3401', mahalle: 'Moda', sokak: 'Moda Sokak', model: 'Beta Bir' }]);
    expect(JSON.stringify(sonuc)).not.toContain('yavaşlama');
    // Önerilen senaryo geçerli birleşimle koşar ve başarılı olur.
    const ekSenaryo = (k.ekSenaryolar as Nesne[])[0];
    expect(ekSenaryo, JSON.stringify(k.ekSenaryolar)).toBeTruthy();
    once = uygulama.hesaplamalar.length;
    sonuc = await kos(String(ekSenaryo.id));
    expect(sonuc.durum, JSON.stringify(sonuc.hataMesaji)).toBe('basarili');
    // (Adana önerisi yalnız adres zincirini ve Yapı tarzını değiştirir; araç zinciri kaydedilen değerde kalır.)
    expect(uygulama.hesaplamalar.slice(once)).toEqual([{ il: '01', ilce: '0101', mahalle: 'Reşatbey', sokak: '2. Sokak', model: 'Beta Bir' }]);
    // Listeler yavaşlarsa (olağandan çok uzun) koşu yine bekler ve başarılı olur; adım ayrıntısına "yavaşlama" notu düşülür.
    // Gecikme ölçülen olağan sürenin 4 katı: yavaşlama eşiğinin (3 kat) üstünde, bekleme sınırının (5 kat, en az +5 sn) altında.
    const olaganlar = ['#ilce', '#mahalle', '#sokak', '#model'].map((x) => Number(m(x).bagimlilik.yuklenmeMs));
    uygulama.gecikmeMs = Math.max(...olaganlar) * 4;
    try {
      sonuc = await kos(String(k.senaryoId));
    } finally { uygulama.gecikmeMs = 400; }
    expect(sonuc.durum, JSON.stringify(sonuc.hataMesaji)).toBe('basarili');
    expect(JSON.stringify(sonuc)).toMatch(/listesinin seçenekleri [\d,]+ sn'de geldi \(olağan ≈ [\d,]+ sn\): yavaşlama/);
  });

  test('arayüz: üst seçilince alt listenin seçenekleri anında (getir beklenmeden) gelir, zincir adım adım; üst değişince alt temizlenir; Devam hep etkin, zincir yarımsa bilgi; atla bağlantısı yok; 1440/390 px taşma yok', async () => {
    test.setTimeout(300_000);
    const testInfo = test.info();
    for (const son = Date.now() + 30_000; (await api('/platform/tarama/aktif')).is && Date.now() < son;) await new Promise((c) => setTimeout(c, 250));
    const id = String((await basarili('/platform/hizli-test/baslat', { projeId, ortamId, hedef: '/adres/', ekranAdi: 'Adres arayüz', izin: 'sor' })).id);
    let o = await bekle(id, ['veri'], 240);
    // Sunucu ucu: bağlı altı olmayan alan için yerinde istek reddedilir; değeri girilmemiş üst için de.
    const alan = (etiket: string): Nesne => o.soru.alanlar.find((a: Nesne) => a.etiket === etiket);
    let y = await api('/platform/hizli-test/veri', { id, degerler: {}, zincir: alan('Yapı tarzı').anahtar });
    expect(y.basarili).toBe(false);
    expect(y.mesaj).toContain('bağlı alanı yok');
    y = await api('/platform/hizli-test/veri', { id, degerler: {}, zincir: alan('İl').anahtar });
    expect(y.basarili).toBe(false);
    expect(y.mesaj).toContain('Önce “İl” seçin');
    const hesaplamalar = uygulama.hesaplamalar.length;
    const tarayici = await korumaliTarayici();
    try {
      const page = await (await tarayici.newContext({ baseURL: nobetci.adres, viewport: { width: 1440, height: 900 } })).newPage();
      const hatalar: string[] = [];
      page.on('pageerror', (e) => hatalar.push(String(e)));
      await page.goto(`/#/hizli-test/o/${id}`);
      const soru = page.locator('.hizli-soru');
      await expect(soru.getByRole('heading', { name: 'Devam etmek için veri gerekli' })).toBeVisible({ timeout: 30_000 });
      const il = soru.getByLabel('İl', { exact: true });
      const ilce = soru.getByLabel('İlçe', { exact: true });
      const mahalle = soru.getByLabel('Mahalle', { exact: true });
      await expect(ilce).toBeDisabled();
      await expect(ilce).toHaveText('Önce “İl” seçin');
      await expect(mahalle).toBeDisabled();
      // Yan kart (zincir keşfi) korunur.
      const yan = page.locator('.hizli-bulgular');
      await expect(yan).toContainText('İl → İlçe → Mahalle → Sokak');
      await expect(yan).toContainText('1 bulgu');
      // Kartın üstünde zincir göstergesi.
      const gosterge = soru.locator('.hizli-zincir-gostergesi');
      await expect(gosterge).toContainText('Bağlı alanlar: İl → İlçe → Mahalle → Sokak (0/4 tamam)');
      // Yerinde düğme: İl seçilmeden pasif ve ipucu; erişilebilir adı görünen metinle başlar.
      const ilceGetir = soru.getByRole('button', { name: '“İlçe” seçeneklerini getir', exact: true });
      await expect(ilceGetir).toBeDisabled();
      await expect(soru.locator('.hizli-zincir-getir').getByText('Önce “İl” seçin', { exact: true })).toBeVisible();
      await expect(ilceGetir).toHaveAccessibleDescription('Önce “İl” seçin');
      expect((await ilceGetir.textContent())?.replace(/^↓\s*/, '')).toBe('“İlçe” seçeneklerini getir');
      // Devam et: bağlı listeler zorunlu sayılmaz → hep etkin; zincir yarımken yanında engellemeyen kısa bilgi. "Atla" bağlantısı yok.
      const devam = soru.getByRole('button', { name: 'Devam et', exact: true });
      await expect(devam).toBeEnabled();
      await expect(devam).toHaveAccessibleDescription(/^İlçe, Mahalle, Sokak.* boş; sayfa bunları zorunlu sayarsa düğmeye basınca hata gösterir\.$/);
      await expect(soru.getByRole('button', { name: /Bağlı alanları atla/ })).toHaveCount(0);

      // 1) İl = Ankara → seçim anında (getir düğmesine basmadan) sayfaya uygulanır; yalnız İl uygulanır; İlçe seçenekleriyle İl'in hemen
      //    altında belirir; odak seçimde (İl) kalır, canlı durum satırında duyurulur.
      await il.focus();
      await il.selectOption({ label: 'Ankara' });
      await expect(ilce).toBeEnabled({ timeout: 60_000 });
      await expect(ilce.locator('option')).toHaveText(['Seçin', 'Çankaya', 'Keçiören']);
      await expect(il).toBeFocused();
      await expect(page.getByRole('status').filter({ hasText: 'seçenekleri geldi' }).first()).toContainText('“İlçe” seçenekleri geldi');
      await expect(soru.locator('.hizli-zincir-tamam').first()).toHaveText('✓ “İlçe” seçenekleri geldi (2 seçenek)');
      await expect(gosterge).toContainText('(1/4 tamam)');
      // Aynı kartta, İl satırının hemen ardından, girintili zincir satırı.
      const sira = await soru.locator('.hizli-alan').evaluateAll((l) => l.map((x) => [x.querySelector('label')?.textContent?.replace(/^↳\s*/, '').replace(/\s*\(zorunlu\)$/, '') ?? '', x.className]));
      const ilSira = sira.findIndex(([ad]) => ad === 'İl');
      expect(sira[ilSira + 1][0]).toBe('İlçe');
      expect(sira[ilSira + 1][1]).toContain('hizli-alan-bagli');
      expect(sira[ilSira + 2][0]).toBe('Mahalle');
      expect(sira[ilSira + 2][1]).toContain('zd-2');
      // Sunucu: hâlâ veri durağı; düğmeye basılmadı.
      o = await bekle(id, ['veri']);
      expect(alan('İl').deger).toBe('06');
      expect(alan('İlçe').bagli.getirildi).toBe(true);
      expect(uygulama.hesaplamalar.length).toBe(hesaplamalar);
      await expect(devam).toBeEnabled();
      await expect(devam).toHaveAccessibleDescription(/^İlçe, Mahalle, Sokak.* boş; sayfa bunları zorunlu sayarsa/);

      // 2) İlçe = Keçiören → Mahalle seçenekleri anında (Etlik).
      await ilce.focus();
      await ilce.selectOption({ label: 'Keçiören' });
      await expect(mahalle).toBeEnabled({ timeout: 60_000 });
      await expect(mahalle.locator('option')).toHaveText(['Seçin', 'Etlik']);
      await expect(ilce).toBeFocused();
      await expect(gosterge).toContainText('(2/4 tamam)');
      // İlçe değeri yeniden çizimde korunur.
      await expect(ilce).toHaveValue('0602');

      // Taşma yok (1440 ve 390 px); ekran görüntüsü.
      const tasma = (): Promise<number> => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(await tasma()).toBeLessThanOrEqual(0);
      await page.screenshot({ path: testInfo.outputPath('zincir-yerinde-dugme-1440.png'), fullPage: true });
      await page.setViewportSize({ width: 390, height: 900 });
      await expect(soru.locator('.hizli-zincir-gostergesi')).toBeVisible();
      expect(await tasma()).toBeLessThanOrEqual(0);
      await page.screenshot({ path: testInfo.outputPath('zincir-yerinde-dugme-390.png'), fullPage: true });
      await page.setViewportSize({ width: 1440, height: 900 });

      // 3) Üst değişince alt temizlenir; yeni üstün seçenekleri anında gelir (eski Ankara ilçeleri kalmaz), alt-alt kilitli.
      await il.selectOption({ label: 'Adana' });
      await expect(mahalle).toBeDisabled();
      await expect(ilce).toBeEnabled({ timeout: 60_000 });
      await expect(ilce.locator('option', { hasText: 'Keçiören' })).toHaveCount(0);
      await expect(ilce).toHaveValue('');
      await expect(gosterge).toContainText('(1/4 tamam)');
      await expect(devam).toBeEnabled();

      // 4) Boş gelen liste (sayfanın kendi hatası): "seçenek gelmedi" söylenir, Devam etkin kalır (zorunluluk sayfanın işi).
      await il.focus();
      await il.selectOption({ label: 'Boşil' });
      await expect(soru.getByText('Bu seçimde “İlçe” için seçenek gelmedi; başka bir “İl” seçin.')).toBeVisible({ timeout: 60_000 });
      await expect(page.getByRole('status').filter({ hasText: 'seçenek gelmedi' }).first()).toContainText('“İlçe” için seçenek gelmedi');
      await expect(il).toBeFocused();
      await expect(devam).toBeEnabled();

      // 5) Zincir yarımken "Devam et": boş bağlı alanlar sorulmadan ilerlenir (izin "Bana sor" → "Şimdi ne yapayım?").
      await il.focus();
      await il.selectOption({ label: 'Ankara' });
      await expect(ilce).toBeEnabled({ timeout: 60_000 });
      await devam.click();
      await expect(page.locator('.hizli-soru').getByRole('heading', { name: 'Şimdi ne yapayım?' })).toBeVisible({ timeout: 60_000 });
      expect(uygulama.hesaplamalar.length).toBe(hesaplamalar);
      expect(hatalar).toEqual([]);
    } finally {
      await tarayici.close();
      await api('/platform/hizli-test/iptal', { id });
    }
  });

  test('arayüz: zincir yoksa veri durağı eski davranışta (Devam et etkin, gösterge ve zincir bilgisi yok)', async () => {
    test.setTimeout(240_000);
    for (const son = Date.now() + 30_000; (await api('/platform/tarama/aktif')).is && Date.now() < son;) await new Promise((c) => setTimeout(c, 250));
    const id = String((await basarili('/platform/hizli-test/baslat', { projeId, ortamId, hedef: '/zincirsiz/', ekranAdi: 'Zincirsiz', izin: 'sor' })).id);
    await bekle(id, ['veri'], 240);
    const tarayici = await korumaliTarayici();
    try {
      const page = await (await tarayici.newContext({ baseURL: nobetci.adres, viewport: { width: 1440, height: 900 } })).newPage();
      await page.goto(`/#/hizli-test/o/${id}`);
      const soru = page.locator('.hizli-soru');
      await expect(soru.getByRole('heading', { name: 'Devam etmek için veri gerekli' })).toBeVisible({ timeout: 30_000 });
      const devam = soru.getByRole('button', { name: 'Devam et', exact: true });
      await expect(devam).toBeEnabled();
      await expect(soru.locator('.hizli-zincir-gostergesi')).toBeHidden();
      await expect(devam).not.toHaveAttribute('aria-describedby', /.+/);
      await expect(soru.locator('.hizli-zincir-dugmesi')).toHaveCount(0);
      await soru.getByLabel('Ad', { exact: true }).fill('Deneme');
      await devam.click();
      await expect(soru.getByRole('heading', { name: 'Şimdi ne yapayım?' })).toBeVisible({ timeout: 60_000 });
    } finally {
      await tarayici.close();
      await api('/platform/hizli-test/iptal', { id });
    }
  });

  test('zincir yarımken Devam etkin: boş bağlı listeler sayfaya / senaryoya yazılmaz; doğrulama, kayıt ve normal koşu geçer', async () => {
    test.setTimeout(400_000);
    for (const son = Date.now() + 30_000; (await api('/platform/tarama/aktif')).is && Date.now() < son;) await new Promise((c) => setTimeout(c, 250));
    const id = String((await basarili('/platform/hizli-test/baslat', {
      projeId, ortamId, hedef: '/adres/?kismi=1', ekranAdi: 'Kısmi zincir', izin: 'evet', cumle: 'Hesapla düğmesine bas, "Sonuç hazır" görünce bitir'
    })).id);
    let o = await bekle(id, ['veri'], 240);
    const alan = (etiket: string): Nesne => o.soru.alanlar.find((a: Nesne) => a.etiket === etiket);
    // Sayfa bağlı listeleri zorunlu saymıyor: Nöbetçi de saymaz.
    for (const e of ['İlçe', 'Mahalle', 'Sokak']) expect(alan(e).zorunlu, e).toBe(false);
    const once = uygulama.hesaplamalar.length;
    const tarayici = await korumaliTarayici();
    try {
      const page = await (await tarayici.newContext({ baseURL: nobetci.adres, viewport: { width: 1440, height: 900 } })).newPage();
      const hatalar: string[] = [];
      page.on('pageerror', (e) => hatalar.push(String(e)));
      await page.goto(`/#/hizli-test/o/${id}`);
      const soru = page.locator('.hizli-soru');
      await expect(soru.getByRole('heading', { name: 'Devam etmek için veri gerekli' })).toBeVisible({ timeout: 30_000 });
      const devam = soru.getByRole('button', { name: 'Devam et', exact: true });
      await expect(devam).toBeEnabled();
      // İl = Ankara → İlçe seçenekleri gelir; İlçe ve altları boş bırakılır. Devam etkin, yanında engellemeyen bilgi.
      await soru.getByLabel('İl', { exact: true }).selectOption({ label: 'Ankara' });
      const ilce = soru.getByLabel('İlçe', { exact: true });
      await expect(ilce).toBeEnabled({ timeout: 60_000 });
      await expect(soru.locator('.hizli-zincir-gostergesi')).toContainText('(1/4 tamam)');
      await expect(devam).toBeEnabled();
      const bilgi = soru.locator('.hizli-devam-ipucu');
      await expect(bilgi).toHaveText(/^İlçe, Mahalle, Sokak.* boş; sayfa bunları zorunlu sayarsa düğmeye basınca hata gösterir\.$/);
      await expect(devam).toHaveAccessibleDescription(await bilgi.innerText());
      await page.screenshot({ path: test.info().outputPath('zincir-yarim-devam-1440.png'), fullPage: true });
      await devam.click();
      // Evet + tek aday → "Hesapla"ya basılır; boş bağlı listelere dokunulmadı.
      await expect(soru.getByRole('heading', { name: 'Şimdi ne yapayım?' })).toBeVisible({ timeout: 90_000 });
      expect(hatalar).toEqual([]);
    } finally {
      await tarayici.close();
    }
    o = await bekle(id, ['karar']);
    expect(uygulama.hesaplamalar.slice(once)).toEqual([{ il: '06', ilce: '', mahalle: '', sokak: '', model: '' }]);
    await basarili('/platform/hizli-test/karar', { id, karar: 'bitir' });
    o = await bekle(id, ['bitis']);
    const bitti = Object.keys(o.soru.etiketler).find((m) => m.startsWith('Sonuç hazır')) as string;
    await basarili('/platform/hizli-test/bitis', { id, etiketler: { ...o.soru.etiketler, [bitti]: 'bitti' } });
    await bekle(id, ['kaydet']);
    // Doğrulama koşusu: baştan sona; boş bağlı listeler yine yazılmaz.
    await basarili('/platform/hizli-test/dogrula', { id });
    o = await bekle(id, ['kaydet'], 180);
    expect(o.soru.dogrulama, JSON.stringify(o.soru.dogrulama)).toMatchObject({ durum: 'basarili' });
    expect(uygulama.hesaplamalar.slice(once)).toEqual([{ il: '06', ilce: '', mahalle: '', sokak: '', model: '' }, { il: '06', ilce: '', mahalle: '', sokak: '', model: '' }]);
    const k = await basarili('/platform/hizli-test/kaydet', { id, baslik: 'Kısmi zincir' });
    // Senaryo verisinde yalnız girilen değer (İl) var; boş bağlı listeler yazılmadı.
    const senaryo = (await api(`/platform/senaryo?id=${String(k.senaryoId)}&ortamId=${ortamId}`)).senaryo as Nesne;
    expect(Object.keys(senaryo.veri).sort(), JSON.stringify(senaryo.veri)).toEqual(['baslik', 'il']);
    // Normal koşu: İl doldurulur, boş bağlı listelere dokunulmaz; başarılı.
    const kosuOnce = uygulama.hesaplamalar.length;
    const y = await api('/platform/senaryolar/calistir', { projeId, kosuId: `kosu-${randomBytes(6).toString('hex')}`, senaryoId: String(k.senaryoId), ortamId });
    expect(y.basarili, y.mesaj).toBe(true);
    const sonuc = (await api(`/platform/sonuclar/sonuc?id=${String(y.sonucId)}`)).sonuc as Nesne;
    expect(sonuc.durum, JSON.stringify(sonuc.hataMesaji)).toBe('basarili');
    expect(uygulama.hesaplamalar.slice(kosuOnce)).toEqual([{ il: '06', ilce: '', mahalle: '', sokak: '', model: '' }]);
  });

  test('sayfada zorunlu (required) bağlı liste boşsa "Zorunlu alanlar boş" denetimi sürer', async () => {
    test.setTimeout(300_000);
    for (const son = Date.now() + 30_000; (await api('/platform/tarama/aktif')).is && Date.now() < son;) await new Promise((c) => setTimeout(c, 250));
    const id = String((await basarili('/platform/hizli-test/baslat', { projeId, ortamId, hedef: '/adres/?kismi=1&zorunlu=1', ekranAdi: 'Zorunlu ilçe', izin: 'sor' })).id);
    let o = await bekle(id, ['veri'], 240);
    const alan = (etiket: string): Nesne => o.soru.alanlar.find((a: Nesne) => a.etiket === etiket);
    expect(alan('İlçe').zorunlu).toBe(true);
    expect(alan('Mahalle').zorunlu).toBe(false);
    const once = uygulama.hesaplamalar.length;
    const tarayici = await korumaliTarayici();
    try {
      const page = await (await tarayici.newContext({ baseURL: nobetci.adres, viewport: { width: 1440, height: 900 } })).newPage();
      await page.goto(`/#/hizli-test/o/${id}`);
      const soru = page.locator('.hizli-soru');
      await expect(soru.getByRole('heading', { name: 'Devam etmek için veri gerekli' })).toBeVisible({ timeout: 30_000 });
      await soru.getByLabel('İl', { exact: true }).selectOption({ label: 'Ankara' });
      const ilce = soru.getByLabel(/^İlçe/);
      await expect(ilce).toBeEnabled({ timeout: 60_000 });
      const devam = soru.getByRole('button', { name: 'Devam et', exact: true });
      await expect(devam).toBeEnabled();
      await devam.click();
      await expect(soru.getByText(/Zorunlu alanlar boş: İlçe\./)).toBeVisible();
      await expect(soru.getByRole('heading', { name: 'Devam etmek için veri gerekli' })).toBeVisible();
      // Sunucu da aynı kuralı uygular (arayüz atlansa bile).
      o = await bekle(id, ['veri']);
      const y = await api('/platform/hizli-test/veri', { id, degerler: { [alan('İl').anahtar]: deger('06') } });
      expect(y.basarili).toBe(false);
      expect(y.mesaj).toContain('Zorunlu alanlar boş: İlçe');
      // İlçe seçilince ilerlenir (Mahalle, Sokak boş kalabilir).
      await ilce.selectOption({ label: 'Çankaya' });
      await expect(soru.getByLabel('Mahalle', { exact: true })).toBeEnabled({ timeout: 60_000 });
      await devam.click();
      await expect(soru.getByRole('heading', { name: 'Şimdi ne yapayım?' })).toBeVisible({ timeout: 60_000 });
      expect(uygulama.hesaplamalar.length).toBe(once);
    } finally {
      await tarayici.close();
      await api('/platform/hizli-test/iptal', { id });
    }
  });
});
