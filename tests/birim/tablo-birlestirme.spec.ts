// KORUMA TESTLERİ — TABLO BİRLEŞTİRME (Ayarlar > Test verisi > Veri sağlığı):
//  · saf: esnek başlık (büyük / küçük harf, Türkçe karakter, noktalama, sıra), sütun eşleme önerisi (kesin / öneri), tür ayrımı,
//    öneri grupları (birebir / çoğu / veri farklı), başvuru ve satır seçimi yeniden yazımı.
//  · uçtan uca (ayrı Nöbetçi, 127.0.0.1, geçici veritabanı; dış istek yok): sütun eşleme onayı, satır / karşılık çakışması (gizli
//    değer gösterilmez), ortama özel satır, yeniden eşleme (ekran bağı, servis bağı, ekran / servis senaryosu, satır seçimi, hesaplama
//    kuralı), kuru doğrulama farkta durdurur, tek işlem + yedek + geçmiş, geri al, kaynakları ayrı onayla sil, önleme uyarısı, veri
//    sağlığı. Değerler SAHTEDİR (genel e-ticaret örnekleri).
import { randomBytes } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { kasaOlustur } from '../../scripts/platform/kasa.mjs';
import { ortamKaydet, projeKaydet, veritabaniniHazirla } from '../../scripts/platform/veritabani/depo.mjs';
import { tabloKaydet, tablolariListele } from '../../scripts/platform/tablolar/tablo-deposu.mjs';
import { ekranAlanBaglari } from '../../scripts/platform/tablolar/ekran-baglari.mjs';
import { paketOnizle, sayfaEkle } from '../../scripts/platform/ekranlar/ekran-servisi.mjs';
import { servisKaydet, servisSenaryosuKaydet } from '../../scripts/platform/servisler/servis-deposu.mjs';
import { baslikNormal, birlestirmeOnerileri, benzerTablolar, sutunEslemesiOner, tabloTuru } from '../../scripts/platform/tablolar/tablo-benzerligi.mjs';
import { metniYenidenYaz, secimleriYenidenYaz, tablolariBirlestir } from '../../scripts/platform/tablolar/tablo-birlestirme.mjs';
import { zarfMi } from '../../scripts/platform/kasa.mjs';
import { akisModeli, akisPaketi } from './model-kosucu-ozellikleri-fikstur';
import { nobetciApi, nobetciBaslat, type Nobetci } from './nobetci-sunucusu';
import { HIZLI_KDF, izinleriAc } from './platform-ortak';

type Nesne = Record<string, any>;

test.describe('tablo benzerliği (saf)', () => {
  test('esnek başlık: harf, Türkçe karakter, noktalama ve sıra fark etmez; benzeyen başlık öneridir', () => {
    expect(baslikNormal('tcKimlikNo')).toBe(baslikNormal('T.C. kimlik no'));
    expect(baslikNormal('Müşteri Adı')).toBe(baslikNormal('musteri_adi'));
    expect(baslikNormal('İŞLEM ÇEŞİDİ')).toBe('islemcesidi');
    const e = sutunEslemesiOner([{ ad: 'KARGO FİRMASI' }, { ad: 'E-posta adresi' }, { ad: 'Not' }], [{ ad: 'Kargo firması' }, { ad: 'Eposta' }]);
    expect(e).toEqual([
      { kaynak: 'KARGO FİRMASI', hedef: 'Kargo firması', kesin: true },
      { kaynak: 'E-posta adresi', hedef: 'Eposta', kesin: false },
      { kaynak: 'Not', hedef: null, kesin: false }
    ]);
  });

  test('öneri grupları: birebir / çoğu / veri farklı; tür ayrımı; tek sütunlu listeler yalnız satırları ortaksa', () => {
    const t = (id: string, ad: string, sutunlar: string[], satirlar: string[], kaynak: Nesne | null = null) => ({ id, ad, sutunlar: sutunlar.map((x) => ({ ad: x })), satirImzalari: satirlar, kaynak });
    const o = birlestirmeOnerileri([
      t('a', 'Müşteriler', ['Kod', 'Ad'], ['1', '2']), t('b', 'Müşteri listesi', ['kod', 'AD'], ['2', '1']),
      t('c', 'Kargo', ['Firma', 'Bölge'], ['x', 'y', 'z']), t('d', 'Kargo 2', ['bölge', 'firma'], ['x', 'y', 'q']),
      t('e', 'Adres', ['İl', 'İlçe'], ['1']), t('f', 'Adres eski', ['il', 'ilce'], ['9']),
      t('g', 'Sipariş formu — Durum', ['Değer'], ['a', 'b'], { tabloTuru: 'liste' }), t('h', 'Durumlar', ['Değer'], ['a', 'b'], { tabloTuru: 'liste' }),
      t('i', 'Ödeme formu — Tür', ['Değer'], ['k'], { tabloTuru: 'liste' }),
      t('j', 'Müşteri kodları', ['Kod', 'Ad'], ['1'], { tabloTuru: 'liste' }),
      t('k', 'Kişiler', ['Kod', 'Ad', 'Eposta'], ['5'])
    ]);
    const bul = (ids: string[]) => o.find((x) => JSON.stringify([...x.tablolar].sort()) === JSON.stringify(ids));
    expect(bul(['a', 'b'])).toMatchObject({ grup: 'birebir', tur: 'kayit', eslemeGerekli: false, puan: 100 });
    expect(bul(['c', 'd'])).toMatchObject({ grup: 'cogu' });
    expect(bul(['e', 'f'])).toMatchObject({ grup: 'veriFarkli' });
    expect(bul(['g', 'h'])).toMatchObject({ grup: 'birebir', tur: 'liste' });
    expect(o.some((x) => x.tablolar.includes('i'))).toBe(false);
    // Tür farklı: liste türündeki "Müşteri kodları" kayıt tablolarıyla önerilmez.
    expect(o.some((x) => x.tablolar.includes('j') && x.tablolar.some((y) => ['a', 'b'].includes(y)))).toBe(false);
    // Başlıkların çoğu aynı (3'te 2): ikili öneri, sütun eşleme gerekir.
    expect(o.find((x) => x.tablolar.includes('k'))).toMatchObject({ grup: 'cogu', eslemeGerekli: true });
    expect(tabloTuru({ id: 'x', ad: 'Sipariş formu — Durum', sutunlar: [{ ad: 'Değer' }] })).toBe('liste');
    expect(tabloTuru({ id: 'y', ad: 'Müşteriler', sutunlar: [{ ad: 'Kod' }, { ad: 'Ad' }] })).toBe('kayit');
    expect(benzerTablolar(['KOD', 'ad'], [t('a', 'Müşteriler', ['Kod', 'Ad'], [])])).toEqual([{ id: 'a', ad: 'Müşteriler', puan: 100, ayni: true }]);
    expect(benzerTablolar(['Değer'], [t('g', 'Liste', ['Değer'], [])])).toEqual([]);
  });

  test('başvuru ve satır seçimi yeniden yazımı: etiket ve biçim korunur, sütun adı çevrilir, çelişki bildirilir', () => {
    const eslem = new Map([['müşteri listesi', { yeniAd: 'Müşteriler', sutunlar: new Map([['kod', 'Kod'], ['dogum', 'Doğum tarihi']]) }]]);
    expect(metniYenidenYaz('{"k":"${Müşteri listesi.kod}","a":"${Müşteri listesi[alıcı].dogum|yyyy-MM-dd}","b":"${akis:Token}","c":"${Diğer.X}"}', eslem))
      .toBe('{"k":"${Müşteriler.Kod}","a":"${Müşteriler[alıcı].Doğum tarihi|yyyy-MM-dd}","b":"${akis:Token}","c":"${Diğer.X}"}');
    const idEslem = new Map([['kaynak', { hedefId: 'kalan', sutunlar: new Map([['kod', 'Kod']]) }]]);
    expect(secimleriYenidenYaz({ 'kaynak|': { kod: 'K-1' }, 'baska|x': { A: '1' } }, idEslem)).toEqual({ secimler: { 'baska|x': { A: '1' }, 'kalan|': { Kod: 'K-1' } }, degisti: true, cakisma: '' });
    expect(secimleriYenidenYaz({ 'kalan|': { Kod: 'K-2' }, 'kaynak|': { kod: 'K-1' } }, idEslem).cakisma).toContain('iki farklı değer');
  });
});

test('gizli + açık sütun eşleşmesi: engel değil, birleşik sütun GİZLİ; önizlemede not ve maske; değerler şifreli yazılır', async () => {
  const klasor = mkdtempSync(join(tmpdir(), 'birlestir-gizli-'));
  const vt = await veritabaniniHazirla(join(klasor, 'p.db'));
  try {
    await kasaOlustur(vt, 'Gecici-Birlestir-1', { kdf: HIZLI_KDF });
    const projeId = projeKaydet(vt, { ad: 'P' });
    const kalan = tabloKaydet(vt, { projeId, ad: 'Kuponlar', sutunlar: [{ ad: 'Kod' }, { ad: 'Seri', gizli: false }], satirlar: [
      { ad: 'k1', degerler: { Kod: 'A-1', Seri: 'pin-acik-11' } }] });
    const kaynak = tabloKaydet(vt, { projeId, ad: 'Kupon listesi', sutunlar: [{ ad: 'kod' }, { ad: 'SERI', gizli: true }, { ad: 'Not' }, { ad: 'Etiket', gizli: true }], satirlar: [
      { ad: 'k2', degerler: { kod: 'B-2', SERI: 'pin-gizli-22', Not: 'x', Etiket: 'an-1' } }] });
    const ucuncu = tabloKaydet(vt, { projeId, ad: 'Kupon arşivi', sutunlar: [{ ad: 'KOD' }, { ad: 'Etiket' }], satirlar: [{ ad: 'k3', degerler: { KOD: 'C-3', Etiket: 'an-acik-3' } }] });
    const girdi: { kalanId: string; kaynakIdler: string[]; sutunEslemeleri: Record<string, Record<string, string>> } = { kalanId: kalan, kaynakIdler: [kaynak, ucuncu], sutunEslemeleri: { [kaynak]: { kod: 'Kod', SERI: 'Seri', Not: '', Etiket: '' }, [ucuncu]: { KOD: 'Kod', Etiket: '' } } };
    const o = tablolariBirlestir(vt, projeId, girdi).onizleme as Nesne;
    expect(o.engeller).toEqual([]);
    const not = 'Bu sütun gizli olacak (kaynakta gizliydi)';
    expect(o.sutunlar).toEqual(expect.arrayContaining([
      { ad: 'Seri', gizli: true, yeni: false, not }, { ad: 'Etiket', gizli: true, yeni: true, not }, { ad: 'Not', gizli: false, yeni: true }]));
    expect(o.dogrulandi).toBe(true);
    const metin = JSON.stringify(o);
    for (const g of ['pin-acik-11', 'pin-gizli-22', 'an-1', 'an-acik-3']) expect(metin.includes(g), g).toBe(false);
    const r = tablolariBirlestir(vt, projeId, { ...girdi, kip: 'uygula', beklenenImza: o.imza }) as Nesne;
    expect(r.yapilmadi).toBeUndefined();
    const t = tablolariListele(vt, projeId, { cozulsun: true }).find((x) => x.id === kalan)!;
    expect(t.sutunlar.filter((s) => s.gizli).map((s) => s.ad).sort()).toEqual(['Etiket', 'Seri']);
    const deger = (ad: string, sutun: string) => t.satirlar.find((x) => x.ad === ad)?.degerler[sutun];
    expect([deger('k1', 'Seri'), deger('k2', 'Seri'), deger('k2', 'Etiket'), deger('k3', 'Etiket')]).toEqual(['pin-acik-11', 'pin-gizli-22', 'an-1', 'an-acik-3']);
    // Diskte şifreli; şifresiz listede gizli değer dönmez.
    for (const x of vt.tumu('SELECT degerler_json FROM test_verisi_profilleri WHERE tur_id = ?', [kalan])) {
      const d = JSON.parse(String(x.degerler_json)) as Record<string, unknown>;
      for (const s of ['Seri', 'Etiket']) if (d[s] !== undefined && d[s] !== null) expect(zarfMi(d[s]), s).toBe(true);
    }
    expect(tablolariListele(vt, projeId).find((x) => x.id === kalan)!.satirlar.every((x) => x.degerler.Seri === null)).toBe(true);
  } finally {
    vt.kapat();
    rmSync(klasor, { recursive: true, force: true });
  }
});

test.describe('uçtan uca: birleştirme, kuru doğrulama, geri al (127.0.0.1)', () => {
  test.describe.configure({ mode: 'serial' });
  const PAROLA = `Gecici-Birlestirme-${randomBytes(6).toString('hex')}`;
  const GIZLI = ['gizli-parola-11', 'gizli-parola-22', 'gizli-parola-99', 'gizli-parola-44'];
  let nobetci: Nobetci;
  let klasor = '';
  let projeId = '';
  let ortamA = '';
  let ortamB = '';
  let ekranId = '';
  let servisId = '';
  const tablo: Record<string, string> = {};
  const senaryo: Record<string, string> = {};
  let servisSenaryoId = '';
  const api = (yol: string, govde?: Nesne) => nobetciApi(nobetci, yol, govde) as Promise<Nesne>;
  const basarili = async (yol: string, govde: Nesne) => { const y = await api(yol, govde); expect(y.basarili, `${yol}: ${String(y.mesaj ?? '')} ${JSON.stringify(y.hatalar ?? '')}`).toBe(true); return y; };
  const tablolar = async () => ((await api(`/platform/tablolar?projeId=${projeId}`)).tablolar as Nesne[]);
  const detay = async (id: string, ortamId = ortamA) => (await api(`/platform/senaryo?id=${id}&ortamId=${ortamId}`)).senaryo as Nesne;
  const servis = async () => (await api(`/platform/servis?projeId=${projeId}&id=${servisId}`)) as Nesne;
  const girdi = (ek: Nesne = {}) => ({ projeId, kalanId: tablo.Musteriler, kaynakIdler: [tablo.Liste], sutunEslemeleri: { [tablo.Liste]: { kod: 'Kod', AD: 'Ad', Parola: 'Parola', 'E-posta adresi': 'Eposta' } }, ...ek });
  const gizliYok = (y: unknown) => { const m = JSON.stringify(y); for (const g of GIZLI) expect(m.includes(g), 'gizli değer yanıtta').toBe(false); };

  test.beforeAll(async () => {
    test.setTimeout(150_000);
    klasor = mkdtempSync(join(tmpdir(), 'tablo-birlestirme-'));
    const vtYolu = join(klasor, 'platform.db');
    const vt = await veritabaniniHazirla(vtYolu);
    await kasaOlustur(vt, PAROLA, { kdf: HIZLI_KDF });
    izinleriAc(vt);
    projeId = projeKaydet(vt, { ad: 'Mağaza Projesi' });
    ortamA = ortamKaydet(vt, { projeId, ad: 'Deneme', tabanUrl: 'http://127.0.0.1:9/', varsayilan: true, ayarlar: { riskli: false } });
    ortamB = ortamKaydet(vt, { projeId, ad: 'Diğer', tabanUrl: 'http://127.0.0.1:9/', ayarlar: { riskli: false } });
    tablo.Musteriler = tabloKaydet(vt, { projeId, ad: 'Müşteriler', sutunlar: [{ ad: 'Kod', karsiliklar: { 'K-1': { servis: '1' } } }, { ad: 'Ad' }, { ad: 'Parola', gizli: true }, { ad: 'Eposta' }], satirlar: [
      { ad: 'm1', degerler: { Kod: 'K-1', Ad: 'Ayşe', Parola: GIZLI[0], Eposta: 'ayse@ornek.test' } },
      { ad: 'm2', degerler: { Kod: 'K-2', Ad: 'Ali', Parola: GIZLI[1], Eposta: 'ali@ornek.test' } }
    ] });
    // Kaynak: ilk satırı kalanda yok (başvurular satır seçimiyle sabitlenmeli); m1 aynı; m2 aynı adlı farklı (çakışma); m3 yalnız B ortamında.
    tablo.Liste = tabloKaydet(vt, { projeId, ad: 'Müşteri listesi', sutunlar: [{ ad: 'kod', karsiliklar: { 'K-1': { servis: '01' } } }, { ad: 'AD' }, { ad: 'Parola', gizli: true }, { ad: 'E-posta adresi' }], satirlar: [
      { ad: 'm4', degerler: { kod: 'K-4', AD: 'Deniz', Parola: GIZLI[3], 'E-posta adresi': 'deniz@ornek.test' } },
      { ad: 'm1', degerler: { kod: 'K-1', AD: 'Ayşe', Parola: GIZLI[0], 'E-posta adresi': 'ayse@ornek.test' } },
      { ad: 'm2', degerler: { kod: 'K-2', AD: 'Ali Veli', Parola: GIZLI[2], 'E-posta adresi': 'ali@ornek.test' } },
      { ad: 'm3', ortamId: ortamB, degerler: { kod: 'K-3', AD: 'Can', 'E-posta adresi': 'can@ornek.test' } }
    ] });
    tablo.Kodlar = tabloKaydet(vt, { projeId, ad: 'Müşteri kodları', sutunlar: [{ ad: 'Kod' }, { ad: 'Ad' }], satirlar: [{ degerler: { Kod: 'K-1', Ad: 'Ayşe' } }], kaynak: { tabloTuru: 'liste' } });
    tablo.Bos = tabloKaydet(vt, { projeId, ad: 'Kargo firmaları', sutunlar: [{ ad: 'Firma' }, { ad: 'Takip adresi' }], satirlar: [{ degerler: { Firma: 'Hızlı Kargo' } }] });
    tablo.Silinecek = tabloKaydet(vt, { projeId, ad: 'Kampanyalar', sutunlar: [{ ad: 'Kod' }], satirlar: [{ degerler: { Kod: 'YAZ' } }] });
    servisId = servisKaydet(vt, { projeId, anahtar: 'siparis', ad: 'Sipariş servisi', tur: 'rest', ayarlar: {
      yol: '/api', operasyonlar: [{ ad: 'SiparisOlustur', metot: 'POST', yol: '/siparis' }],
      alanBaglari: { SiparisOlustur: { 'musteri/kod': { tablo: tablo.Liste, sutun: 'kod' } } },
      tarihKurallari: { MUSTERI_KODU: '${Müşteri listesi.kod}' }
    } });
    servisSenaryoId = servisSenaryosuKaydet(vt, { projeId, servisId, baslik: 'Sipariş oluştur', icerik: {
      operasyon: 'SiparisOlustur', govde: '{"musteri":{"kod":"${Müşteri listesi.kod}","parola":"${Müşteri listesi.Parola}"}}', kontroller: [{ tur: 'durumKodu', deger: '200' }],
      http: { metot: 'POST', yol: '/siparis', icerikTuru: 'application/json' }, tabloSecimleri: { [`${tablo.Liste}|`]: { kod: 'K-1' } }
    } });
    vt.kapat();
    nobetci = await nobetciBaslat(klasor, vtYolu, {});
    await basarili('/platform/kasa/ac', { parola: PAROLA });
    const paket = akisPaketi({ anahtar: 'siparis-formu', ad: 'Sipariş formu' });
    const model = akisModeli() as Nesne;
    model.id = 'siparis-formu';
    model.ad = 'Sipariş formu';
    const alan = (id: string, etiket: string): Nesne => ({ id, tip: 'metin', etiket: { ekran: etiket }, yapilandirma: 'senaryo', eslesme: { senaryo: id }, konum: { secici: `#${id}`, kirilganlik: 'orta' }, zorunlu: false });
    (model.adimlar[0].bolumler[0].alanlar as Nesne[]).push(alan('musteriKodu', 'Müşteri kodu'), alan('musteriAdi', 'Müşteri adı'), alan('kampanya', 'Kampanya'));
    paket.model = model;
    await basarili('/platform/sayfa-paketi/ekle', { projeId, paket, senaryoIndeksleri: [], ortamIdleri: [ortamA] });
    const liste = await api(`/platform/senaryolar?projeId=${projeId}&ortamId=${ortamA}`) as { ekranlar: Nesne[] };
    ekranId = String(liste.ekranlar.find((e) => e.ad === 'Sipariş formu')?.id);
    const kaydet = async (baslik: string, veri: Nesne, ek: Nesne = {}) =>
      String((await basarili('/platform/senaryo/kaydet', { projeId, ekranId, baslik, ortamIdleri: [ortamA, ortamB], veri: { baslik, kategori: 'K1', urun: 'Ürün A', ...veri }, ...ek })).id);
    senaryo.S1 = await kaydet('Kodla sipariş', { musteriKodu: '${Müşteri listesi.kod}', musteriAdi: '${Müşteri listesi.AD}' });
    senaryo.S2 = await kaydet('Seçili müşteri', { musteriAdi: '${Müşteri listesi.AD}' }, { tabloSecimleri: { [`${tablo.Liste}|`]: { kod: 'K-2' } } });
    senaryo.S3 = await kaydet('Kalan tablodan', { musteriAdi: '${Müşteriler.Ad}' }, { tabloSecimleri: { [`${tablo.Musteriler}|`]: { Kod: 'K-2' } } });
    senaryo.S4 = await kaydet('Kampanyalı', { kampanya: '${Kampanyalar.Kod}' });
    await basarili('/platform/ekran/alan-baglari/kaydet', { projeId, ekranId, baglar: { musteriKodu: { tablo: tablo.Liste, sutun: 'kod' } } });
    // Kırık başvuru: senaryonun kullandığı tablo silinir.
    await basarili('/platform/tablo/sil', { projeId, id: tablo.Silinecek });
  });

  test.afterAll(async () => {
    nobetci?.surec.kill('SIGTERM');
    if (klasor) rmSync(klasor, { recursive: true, force: true });
  });

  test('veri sağlığı: benzer tablolar (tür ayrımıyla), kullanılmayan tablo, boş sütun, kırık başvuru; değer dönmez', async () => {
    const s = await api(`/platform/tablolar/veri-sagligi?projeId=${projeId}`);
    gizliYok(s);
    expect((s.benzer as Nesne[]).map((x) => [...x.adlar].sort())).toContainEqual(['Müşteri listesi', 'Müşteriler']);
    expect((s.benzer as Nesne[]).some((x) => x.adlar.includes('Müşteri kodları'))).toBe(false);
    expect((s.kullanilmayan as Nesne[]).map((x) => x.ad)).toEqual(expect.arrayContaining(['Müşteri kodları', 'Kargo firmaları']));
    expect((s.kullanilmayan as Nesne[]).map((x) => x.ad)).not.toContain('Müşteri listesi');
    expect(s.bosSutunlar).toContainEqual({ tabloId: tablo.Bos, tablo: 'Kargo firmaları', sutun: 'Takip adresi' });
    expect(s.kirikBasvurular).toContainEqual(expect.objectContaining({ tur: 'ekran-senaryosu', yer: 'Ekran senaryosu: Kampanyalı', neden: '"Kampanyalar" adında tablo yok', git: `#/senaryolar/duzenle/${senaryo.S4}` }));
    expect(s.kullanim[tablo.Liste]).toMatchObject({ ekranBaglari: 1, servisBaglari: 1, satirSecimleri: 2, hesapKurallari: 1 });
    expect(s.sonBirlestirme).toBeNull();
  });

  test('önleme: aynı başlıklı tablo varsa "benzer tablo" döner', async () => {
    const y = await basarili('/platform/tablo/benzer', { projeId, sutunlar: ['KOD', 'ad', 'parola', 'e-posta'] });
    expect((y.benzerler as Nesne[]).map((x) => x.ad)).toContain('Müşteriler');
    expect((await basarili('/platform/tablo/benzer', { projeId, sutunlar: ['Ürün', 'Fiyat'] })).benzerler).toEqual([]);
  });

  test('önizleme: emin olunamayan sütun onay bekler; çakışmalar maskeli; kuru doğrulama; hiçbir şey yazılmaz', async () => {
    const once = JSON.stringify(await tablolar());
    const onayBekleyen = (await basarili('/platform/tablo/birlestir', { projeId, kalanId: tablo.Musteriler, kaynakIdler: [tablo.Liste] })).onizleme as Nesne;
    expect(onayBekleyen.onayBekleyenEslemeler).toEqual([{ kaynakId: tablo.Liste, kaynak: 'E-posta adresi' }]);
    expect(onayBekleyen.eslemeler).toContainEqual(expect.objectContaining({ kaynak: 'E-posta adresi', onerilen: 'Eposta', kesin: false }));
    expect(onayBekleyen.imza).toBeUndefined();
    const y = await basarili('/platform/tablo/birlestir', girdi());
    gizliYok(y);
    const o = y.onizleme as Nesne;
    expect(o.engeller).toEqual([]);
    expect(o.onerilenKalan).toBe(tablo.Liste);
    expect(o.satirlar).toMatchObject({ kalan: 2, eklenecek: 3, ayni: 1, cakisan: 1, toplam: 5, ortamaOzel: 1 });
    const c = (o.satirCakismalari as Nesne[])[0];
    expect(c).toMatchObject({ satir: 'm2', secim: 'ikisi' });
    expect(c.sutunlar).toContainEqual({ sutun: 'Parola', gizli: true, ayni: false, kalan: '•••', kaynak: '•••' });
    expect(c.sutunlar).toContainEqual({ sutun: 'Ad', gizli: false, ayni: false, kalan: 'Ali', kaynak: 'Ali Veli' });
    expect(o.karsilikCakismalari).toEqual([expect.objectContaining({ sutun: 'Kod', deger: 'K-1', kalan: { servis: '1' }, kaynak: { servis: '01' }, secim: 'kalan' })]);
    expect(o.yenidenEsleme).toMatchObject({ ekranBaglari: 1, servisBaglari: 1, ekranSenaryolari: 2, servisSenaryolari: 1, hesapKurallari: 1 });
    expect(o.yenidenEsleme.sabitlenen).toBeGreaterThan(0);
    // Karşılık "kalan"da (servis "1") kaynağı kullanan servis isteği değişirdi ("01"): kuru doğrulama farkı bildirir.
    expect(o.dogrulandi).toBe(false);
    expect(o.farklar).toContainEqual(expect.objectContaining({ tur: 'servis', baslik: 'Sipariş oluştur', neden: 'koşuda giden değer değişir' }));
    expect(JSON.stringify(await tablolar())).toBe(once);
  });

  test('kuru doğrulama farkta durdurur: kalan tablonun satırını değiştiren seçim yazılmaz', async () => {
    const onizleme = (await basarili('/platform/tablo/birlestir', girdi({ satirSecimleri: { [`${tablo.Liste}|${(await tablolar()).find((t) => t.id === tablo.Liste)?.satirlar[2].id}`]: 'kaynak' }, karsilikSecimleri: { 'Kod|K-1': 'kaynak' } }))).onizleme as Nesne;
    // S3 kalan tablonun m2 satırını kullanıyor: "kaynak" seçimiyle Ad değişir → fark.
    expect(onizleme.farklar).toContainEqual(expect.objectContaining({ tur: 'ekran', baslik: 'Kalan tablodan', alanlar: ['musteriAdi'], neden: 'koşuda giden değer değişir' }));
    const once = JSON.stringify(await tablolar());
    const y = await basarili('/platform/tablo/birlestir', { ...girdi({ satirSecimleri: { [`${tablo.Liste}|${(await tablolar()).find((t) => t.id === tablo.Liste)?.satirlar[2].id}`]: 'kaynak' }, karsilikSecimleri: { 'Kod|K-1': 'kaynak' } }), kip: 'uygula', beklenenImza: onizleme.imza });
    expect(y.yapilmadi).toBe(true);
    expect(y.uygulandi).toBeUndefined();
    expect(JSON.stringify(await tablolar())).toBe(once);
  });

  test('uygula: tek işlem, yeniden eşleme her türde, önce yedek + geçmiş; koşuda aynı değerler', async () => {
    const g = girdi({ karsilikSecimleri: { 'Kod|K-1': 'kaynak' }, yeniAd: 'Müşteri kayıtları' });
    // Karşılıkta kaynak seçilir: servis isteği değişmez; kalanın K-1 karşılığını kullanan başvuru yok.
    const on = (await basarili('/platform/tablo/birlestir', g)).onizleme as Nesne;
    expect(on.farklar).toEqual([]);
    expect(on.dogrulandi).toBe(true);
    // İmza tutmazsa (önizlemeden sonra değişti) yazılmaz.
    const imzasiz = await basarili('/platform/tablo/birlestir', { ...g, kip: 'uygula', beklenenImza: 'eski' });
    expect(imzasiz.onayGerekli).toBe(true);
    const y = await basarili('/platform/tablo/birlestir', { ...g, kip: 'uygula', beklenenImza: on.imza });
    gizliYok(y);
    expect(y.uygulandi).toBe(true);
    expect(readdirSync(join(klasor, 'yedekler')).some((d) => d.startsWith('otomatik-'))).toBe(true);
    const ts = await tablolar();
    const t = ts.find((x) => x.id === tablo.Musteriler) as Nesne;
    expect(t.ad).toBe('Müşteri kayıtları');
    expect((t.satirlar as Nesne[]).map((r) => [r.ad, r.degerler.Kod, r.ortamId])).toEqual([
      ['m1', 'K-1', null], ['m2', 'K-2', null], ['m4', 'K-4', null], ['m2 (Müşteri listesi)', 'K-2', null], ['m3', 'K-3', ortamB]
    ]);
    expect(t.sutunlar.find((s: Nesne) => s.ad === 'Kod').karsiliklar).toEqual({ 'K-1': { servis: '01' } });
    expect(ts.some((x) => x.id === tablo.Liste)).toBe(true); // kaynak silinmez
    const s1 = await detay(senaryo.S1);
    expect(s1.veri).toMatchObject({ musteriKodu: '${Müşteri kayıtları.Kod}', musteriAdi: '${Müşteri kayıtları.Ad}' });
    // Kaynağın ilk satırı (m4) birleşik tabloda ilk değil: satır seçimi eklenir (gizli değer yazılmaz).
    expect(s1.tabloSecimleri).toEqual({ [`${tablo.Musteriler}|`]: { Kod: 'K-4', Ad: 'Deniz', Eposta: 'deniz@ornek.test' } });
    const s2 = await detay(senaryo.S2);
    expect(s2.tabloSecimleri[`${tablo.Musteriler}|`]).toMatchObject({ Kod: 'K-2', Ad: 'Ali Veli' });
    expect((await detay(senaryo.S3)).veri.musteriAdi).toBe('${Müşteri kayıtları.Ad}');
    const baglar = (await api(`/platform/ekran/alan-baglari?projeId=${projeId}&ekranId=${ekranId}`)).baglar as Nesne;
    expect(baglar.musteriKodu).toEqual({ tablo: tablo.Musteriler, sutun: 'Kod' });
    const sv = await servis();
    const ayarlar = (sv.servis ?? sv).ayarlar as Nesne;
    expect(ayarlar.alanBaglari.SiparisOlustur['musteri/kod']).toEqual({ tablo: tablo.Musteriler, sutun: 'Kod' });
    expect(ayarlar.tarihKurallari.MUSTERI_KODU).toBe('${Müşteri kayıtları.Kod}');
    const ss = ((sv.senaryolar ?? []) as Nesne[]).find((x) => x.id === servisSenaryoId) as Nesne;
    expect(ss.icerik.govde).toContain('${Müşteri kayıtları.Kod}');
    expect(ss.icerik.tabloSecimleri).toEqual({ [`${tablo.Musteriler}|`]: { Kod: 'K-1' } });
    const gecmis = (await api(`/platform/senaryo/gecmis?id=${senaryo.S1}`)).kayitlar as Nesne[];
    expect(gecmis.length).toBeGreaterThan(1);
    const s = await api(`/platform/tablolar/veri-sagligi?projeId=${projeId}`);
    expect(s.sonBirlestirme).toMatchObject({ kalan: 'Müşteri kayıtları', kaynaklar: ['Müşteri listesi'], kaynaklarSilindi: false });
    expect((s.kullanilmayan as Nesne[]).map((x) => x.ad)).toContain('Müşteri listesi');
  });

  test('kaynak tablolar ayrı onayla silinir; geri al kaynakları ve önceki hâli getirir', async () => {
    const on = await basarili('/platform/tablo/birlestirme/kaynaklari-sil', { projeId });
    expect(on.onizleme).toEqual({ tablolar: [{ ad: 'Müşteri listesi', satir: 4 }] });
    expect((await tablolar()).some((x) => x.id === tablo.Liste)).toBe(true);
    await basarili('/platform/tablo/birlestirme/kaynaklari-sil', { projeId, onay: true });
    expect((await tablolar()).some((x) => x.id === tablo.Liste)).toBe(false);
    const geri = await basarili('/platform/tablo/birlestirme/geri-al', { projeId });
    expect(geri.onizleme).toMatchObject({ kalan: 'Müşteri kayıtları', kaynaklar: ['Müşteri listesi'] });
    await basarili('/platform/tablo/birlestirme/geri-al', { projeId, onay: true });
    const ts = await tablolar();
    expect(ts.find((x) => x.id === tablo.Musteriler)?.ad).toBe('Müşteriler');
    expect(ts.find((x) => x.id === tablo.Musteriler)?.satirlar).toHaveLength(2);
    expect(ts.find((x) => x.id === tablo.Liste)?.satirlar).toHaveLength(4);
    const s1 = await detay(senaryo.S1);
    expect(s1.veri.musteriKodu).toBe('${Müşteri listesi.kod}');
    expect(s1.tabloSecimleri ?? {}).toEqual({});
    const baglar = (await api(`/platform/ekran/alan-baglari?projeId=${projeId}&ekranId=${ekranId}`)).baglar as Nesne;
    expect(baglar.musteriKodu).toEqual({ tablo: tablo.Liste, sutun: 'kod' });
    expect((await api(`/platform/tablolar/veri-sagligi?projeId=${projeId}`)).sonBirlestirme).toBeNull();
  });

  test('birleştirmeden sonra değişen kayıt varsa geri alınmaz (yedek önerilir)', async () => {
    const g = girdi({ karsilikSecimleri: { 'Kod|K-1': 'kaynak' } });
    const on = (await basarili('/platform/tablo/birlestir', g)).onizleme as Nesne;
    expect((await basarili('/platform/tablo/birlestir', { ...g, kip: 'uygula', beklenenImza: on.imza })).uygulandi).toBe(true);
    await basarili('/platform/senaryo/kaydet', { projeId, id: senaryo.S1, baslik: 'Kodla sipariş (düzenlendi)' });
    const y = await basarili('/platform/tablo/birlestirme/geri-al', { projeId, onay: true });
    expect(y.geriAlinamaz).toBe(true);
    expect(y.degisenler).toContain('ekran senaryosu');
    expect(existsSync(join(klasor, 'yedekler', String(y.yedek)))).toBe(true);
  });
});

test.describe('önleme: sayfa paketinde "benzer tablo var — onu kullan"', () => {
  test('aynı başlıklı (esnek) tablo önerilir; hedefId ile ona birleştirilir, yeni tablo oluşmaz, bağ oraya kurulur', async () => {
    const klasor = mkdtempSync(join(tmpdir(), 'paket-onleme-'));
    const vt = await veritabaniniHazirla(join(klasor, 'platform.db'));
    try {
      await kasaOlustur(vt, `Gecici-Onleme-${randomBytes(4).toString('hex')}`, { kdf: HIZLI_KDF });
      const projeId = projeKaydet(vt, { ad: 'Önleme' });
      const V1 = JSON.parse(readFileSync(join(__dirname, 'fixtures', 'sayfa-paketi', 'ornek-rota-v1.json'), 'utf-8')) as Nesne;
      const hedef = tabloKaydet(vt, { projeId, ad: 'Teslimat seçenekleri', sutunlar: [{ ad: 'KAPSAM' }, { ad: 'alternatif' }], satirlar: [{ degerler: { KAPSAM: 'EKSPRES', alternatif: 'HIZLI TESLİMAT' } }] });
      const paket = { ...V1, testVerisi: { tablolar: [{ ad: 'Kapsam - Alternatif', sutunlar: [{ ad: 'Kapsam' }, { ad: 'Alternatif' }], satirlar: [['EKSPRES', 'HIZLI TESLİMAT'], ['STANDART', 'ADRESE TESLİM']] }],
        baglantilar: [{ alanId: 'kapsam', tablo: 'Kapsam - Alternatif', sutun: 'Kapsam' }] } };
      const tv = (paketOnizle(vt, projeId, paket).onizleme as Nesne).testVerisi as Nesne;
      expect(tv.tablolar[0].mevcut).toBeNull();
      expect(tv.tablolar[0].benzer).toEqual([{ id: hedef, ad: 'Teslimat seçenekleri', puan: 100, eklenecekSatir: 1 }]);
      const ek = await sayfaEkle(vt, projeId, paket, { senaryoIndeksleri: [], ortamIdleri: [], medyaKlasoru: join(klasor, 'medya'),
        testVerisi: { tablolar: { 'Kapsam - Alternatif': { islem: 'birlestir', hedefId: hedef } }, baglantilar: ['kapsam'] } });
      expect(ek.testVerisi.tablolar.map((t) => [t.ad, t.islem, t.eklenenSatir, t.eklenenSutun])).toEqual([['Teslimat seçenekleri', 'birlestir', 1, 0]]);
      const ts = tablolariListele(vt, projeId);
      expect(ts.map((t) => t.ad)).toEqual(['Teslimat seçenekleri']);
      expect(ts[0].satirlar.map((r) => r.degerler.KAPSAM)).toEqual(['EKSPRES', 'STANDART']);
      expect(ekranAlanBaglari(vt, ek.ekranId)).toEqual({ kapsam: { tablo: hedef, sutun: 'KAPSAM' } });
    } finally { vt.kapat(); rmSync(klasor, { recursive: true, force: true }); }
  });
});
