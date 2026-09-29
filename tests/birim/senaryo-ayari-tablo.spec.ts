// KORUMA TESTLERİ — SENARYO AYARI ALANINI TEST VERİSİ TABLOSUNA BAĞLAMA. Ekranda karşılığı olmayan, akışı dallandıran seçenekli
// seçim alanı (ör. "Teslim şekli: kargo / mağaza"; adımlar { senaryoAyari, esit } koşuluna bağlı) bir tablo sütununa bağlanır;
// senaryoda "Tablodan" seçilince tablodaki okunur değer ("Kargo ile") koşuda seçenek KODUNA ("kargo") çevrilir (sütunun karşılığı,
// yoksa seçeneğin kodu / metni); veri güdümlü koşuda her satır kendi dalına gider. Bağ kurulmadıkça (ve sabit seçimde) hiçbir şey
// değişmez.
//  · saf: senaryo ayarı tespiti, tablo listesinin seçenekleri değiştirmemesi, koda çeviri (karşılık / kod / metin / eşleşmeyen),
//    doğrulayıcıda tablodan gelen ayarın "bilinmiyor" sayılması, yedekten içe aktarmanın bağı / karşılığı / başvuruyu taşıması;
//  · uçtan uca (127.0.0.1'deki sahte "Teslim" sayfası, ayrı Nöbetçi, geçici veritabanı; dış siteye istek yok): ortak akışta ve
//    ekranda bağ, karşılıkların modelden dolması, bağsız / sabit senaryo, iki satırla "Uyan her satır ayrı test" (iki test, iki
//    dal), eşleşmeyen değerde doğrulama hatası, arayüz (rozet, Tablodan, satır seçimi kartı; 1440 ve 390 px taşma yok).
// Değerler SAHTEDİR.
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test, type Browser, type Page } from '@playwright/test';
import { kasaOlustur } from '../../scripts/platform/kasa.mjs';
import {
  ekranKaydet, ekranModeliEkle, ortamKaydet, projeKaydet, senaryoGetir, veritabaniniHazirla
} from '../../scripts/platform/veritabani/depo.mjs';
import { modeleListeleriUygula, senaryoAyariAlanlari } from '../../scripts/platform/senaryolar/deger-listesi-modeli.mjs';
import { ekranBasvurulariniCoz, modelAlanBilgisi } from '../../scripts/platform/tablolar/ekran-basvurulari.mjs';
import { gorunurlukleriHesapla, senaryoyuDogrula, type DogrulamaModeli } from '../../scripts/dogrulama/senaryo-dogrulayici.mjs';
import { ekranAlanBaglari, ekranAlanBaglariniKaydet } from '../../scripts/platform/tablolar/ekran-baglari.mjs';
import { tabloKaydet, tablolariListele, type Tablo } from '../../scripts/platform/tablolar/tablo-deposu.mjs';
import { senaryoKaydet } from '../../scripts/platform/senaryolar/senaryo-servisi.mjs';
import { yedekOlustur } from '../../scripts/platform/yedek.mjs';
import { iceAktarmaHazirla, iceAktarmaUygula } from '../../scripts/platform/ice-aktarma.mjs';
import { korumaliTarayici, SIRKET_DESENI, yerelSunucu, type FiksturIstegi, type FiksturYaniti } from './giris-fikstur';
import { nobetciApi, nobetciBaslat, type Nobetci, type Yanit } from './nobetci-sunucusu';
import { HIZLI_KDF, izinleriAc } from './platform-ortak';

type Nesne = Record<string, unknown>;
type Secenek = { deger: string; metin: string };
type ModelAlani = Nesne & { id: string; secenekler?: Secenek[]; ekrandaAlanDegil?: boolean };
type ModelAdimi = Nesne & { id: string; gorunurluk?: unknown };
type Model = Nesne & { kosullar: Nesne; adimlar: ModelAdimi[]; senaryoDuzeyi: { alanlar: ModelAlani[] } };
/** İç içe değer (yanıtlar tipsiz JSON): al(y, 'tablo', 'id'). */
const al = (x: unknown, ...yol: Array<string | number>): unknown =>
  yol.reduce<unknown>((d, k) => (d !== null && typeof d === 'object' ? (d as Record<string | number, unknown>)[k] : undefined), x);
const ORTAK_ANAHTAR = 'teslim-ortak';
const TABLO = 'Teslim tercihleri';
const SUTUN = 'Teslim şekli';
const BASVURU = `\${${TABLO}.${SUTUN}}`;

/** Dalın düğmesi (aksiyon alanı; senaryoda ayarlanmaz). */
const dugme = (id: string, ad: string, secici: string): ModelAlani => ({ id, tip: 'buton', etiket: { ekran: ad }, yapilandirma: 'aksiyon', konum: { secici, kirilganlik: 'dusuk' } });

/** Ortak akışın modeli: senaryo düzeyinde "Teslim şekli" (ekranda alan değil) ve ona bağlı iki dal (kargo / mağaza). */
function ortakModel(): Model {
  return {
    semaSurumu: 2, tur: 'ortakAkis', id: ORTAK_ANAHTAR, ad: 'Teslim (ortak)', aciklama: 'Teslim dalları (nötr fikstür).',
    kosullar: {
      kargoIle: { ifade: { senaryoAyari: 'teslimSekli', esit: 'kargo' } },
      magazaIle: { ifade: { senaryoAyari: 'teslimSekli', esit: 'magaza' } }
    },
    adimlar: [
      {
        id: 'kargoAdimi', sira: 1, baslik: 'Kargo ile gönderilir', gorunurluk: { kosul: 'kargoIle' },
        bolumler: [{ id: 'kargoBolumu', baslik: 'Kargo', alanlar: [dugme('kargoDugmesi', 'Kargo ile gönder', '#kargo')] }],
        kosu: { aksiyonlar: [{ tur: 'tikla', secici: '#kargo', aciklama: 'Kargo ile gönder' }], basariGostergesi: { tur: 'metin', deger: 'Kargo kaydı alındı', secici: '#sonuc' } }
      },
      {
        id: 'magazaAdimi', sira: 2, baslik: 'Mağazadan alınır', gorunurluk: { kosul: 'magazaIle' },
        bolumler: [{ id: 'magazaBolumu', baslik: 'Mağaza', alanlar: [dugme('magazaDugmesi', 'Mağazadan al', '#magaza')] }],
        kosu: { aksiyonlar: [{ tur: 'tikla', secici: '#magaza', aciklama: 'Mağazadan al' }], basariGostergesi: { tur: 'metin', deger: 'Mağaza kaydı alındı', secici: '#sonuc' } }
      }
    ],
    senaryoDuzeyi: {
      alanlar: [{
        id: 'teslimSekli', tip: 'secim', etiket: { ekran: null, form: 'Teslim şekli' }, zorunlu: true, yapilandirma: 'senaryo', ekrandaAlanDegil: true,
        eslesme: { senaryo: 'teslimSekli' }, secenekler: [{ deger: 'kargo', metin: 'Kargo ile' }, { deger: 'magaza', metin: 'Mağazadan teslim' }], seceneklerDurumu: 'tam'
      }]
    },
    urunDuzeyi: {}, isKurallari: [], bilinmeyenler: []
  };
}

/** Ortak akışı kullanan ekran: ad soyad → Devam → ortak akış (kargo / mağaza dalı). */
function ekranModel(): Model {
  return {
    semaSurumu: 2, tur: 'ekran', id: 'teslim-ekrani', ad: 'Teslim ekranı', aciklama: 'Ortak akışı kullanan ekran (nötr fikstür).', ekranUrl: '/teslim/', girisGerekmez: true,
    specDosyasi: 'tests/scenarios/teslim-ekrani/teslim-ekrani.spec.ts', pageObject: 'yok (model koşucusu)', veriKaynaklari: { senaryo: 'Nöbetçi > Senaryolar (teslim-ekrani)' },
    kosullar: {},
    adimlar: [
      {
        id: 'musteri', sira: 1, baslik: 'Müşteri bilgisi girilir',
        bolumler: [{ id: 'musteriBolumu', baslik: 'Müşteri', alanlar: [{
          id: 'adSoyad', tip: 'metin', etiket: { ekran: 'Ad soyad' }, zorunlu: true, yapilandirma: 'senaryo', eslesme: { senaryo: 'adSoyad' }, konum: { secici: '#ad', kirilganlik: 'dusuk' }
        }] }],
        kosu: { aksiyonlar: [{ tur: 'tikla', secici: '#devam', aciklama: 'Devam' }], basariGostergesi: { tur: 'eleman', deger: '#kargo' } }
      },
      { id: 'teslimAdimi', sira: 2, baslik: 'Teslim', ortakAkis: { dosya: `${ORTAK_ANAHTAR}.model.json` } }
    ],
    senaryoDuzeyi: { alanlar: [{ id: 'baslik', tip: 'metin', zorunlu: true, benzersiz: true, yapilandirma: 'senaryo', eslesme: { senaryo: 'baslik' } }] },
    urunDuzeyi: {}, isKurallari: [], bilinmeyenler: []
  };
}

const paket = (model: Nesne, ekran: Nesne): Nesne => ({
  tur: 'sayfa-paketi', surum: 1,
  meta: { ekran, olusturan: 'test', olusturulma: '2026-09-29T09:00:00Z', baglamProfilleri: [] },
  model, senaryoOnerileri: [], gerekenAyarlar: { girisGerekli: false, ikiAsamaliDogrulama: 'yok', captchaGoruldu: false, testVerisiTurleri: [] }, bilinmeyenler: []
});

/** Kargo / mağaza dallı girişsiz sahte sayfa; her kaydı (ad + seçilen yol) saklar. */
class TeslimUygulamasi {
  readonly kayitlar: Array<{ ad: string; yol: string }> = [];
  readonly isle = (i: FiksturIstegi): FiksturYaniti => {
    if (i.yol === '/teslim/kaydet' && i.yontem === 'POST') {
      this.kayitlar.push(JSON.parse(i.govde || '{}') as { ad: string; yol: string });
      return { tur: 'application/json', govde: '{"tamam":true}' };
    }
    if (i.yol === '/teslim' || i.yol === '/teslim/') {
      return {
        tur: 'text/html; charset=utf-8',
        govde: `<!doctype html><html lang="tr"><head><meta charset="utf-8"><title>Teslim</title></head><body>
<label>Ad soyad <input id="ad"></label> <button id="devam" type="button">Devam</button>
<div id="secim" hidden><button id="kargo" type="button">Kargo ile gönder</button> <button id="magaza" type="button">Mağazadan al</button></div>
<p id="sonuc" role="status"></p>
<script>
const $ = (s) => document.querySelector(s);
$('#devam').addEventListener('click', () => { $('#secim').hidden = false; });
const gonder = async (yol) => {
  await fetch('/teslim/kaydet', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ad: $('#ad').value, yol }) });
  $('#sonuc').textContent = yol === 'kargo' ? 'Kargo kaydı alındı' : 'Mağaza kaydı alındı';
};
$('#kargo').addEventListener('click', () => gonder('kargo'));
$('#magaza').addEventListener('click', () => gonder('magaza'));
</script></body></html>`
      };
    }
    return { durum: 404, tur: 'text/plain', govde: 'yok' };
  };
}

// ---------------------------------------------------------------------------------------------------------------------------
// Saf
// ---------------------------------------------------------------------------------------------------------------------------

test.describe('senaryo ayarı tablo bağı (saf)', () => {
  const sutunlu = (karsiliklar?: Record<string, { sayfa?: string }>): Tablo => ({
    id: 't1', ad: TABLO, guncellenme: 'x',
    sutunlar: [{ ad: SUTUN, gizli: false, tip: 'metin', ...(karsiliklar ? { karsiliklar } : {}) }],
    satirlar: [
      { id: 'r1', ad: 'Kargo ile', ortamId: null, degerler: { [SUTUN]: 'Kargo ile' }, doluGizli: [] },
      { id: 'r2', ad: 'Mağazadan teslim', ortamId: null, degerler: { [SUTUN]: 'Mağazadan teslim' }, doluGizli: [] },
      { id: 'r3', ad: 'Kod', ortamId: null, degerler: { [SUTUN]: 'MAGAZA' }, doluGizli: [] },
      { id: 'r4', ad: 'Uçak', ortamId: null, degerler: { [SUTUN]: 'Uçakla' }, doluGizli: [] }
    ]
  });
  const coz = (tablo: Tablo, satir: string) => ekranBasvurulariniCoz({ teslimSekli: BASVURU }, {
    tablolar: [tablo], ...modelAlanBilgisi(ortakModel()), ortamId: null, tabloSecimleri: { 't1|': { [SUTUN]: satir } }
  });

  test('tespit: ekrandaAlanDegil ya da senaryoAyari koşulunda başvurulan seçenekli seçim alanı; ekran alanı ve seçeneksiz alan değil', () => {
    expect([...senaryoAyariAlanlari(ortakModel()).keys()]).toEqual(['teslimSekli']);
    // İşaretsiz ama koşulda başvurulan alan da senaryo ayarıdır.
    const m = ortakModel();
    delete m.senaryoDuzeyi.alanlar[0].ekrandaAlanDegil;
    expect([...senaryoAyariAlanlari(m).keys()]).toEqual(['teslimSekli']);
    // Koşulda da işarette de yoksa (ya da seçenek listesi boşsa) değil.
    m.kosullar = {};
    for (const a of m.adimlar) delete a.gorunurluk;
    expect(senaryoAyariAlanlari(m).size).toBe(0);
    expect(senaryoAyariAlanlari(ekranModel()).size).toBe(0);
  });

  test('tablo listesi senaryo ayarının seçeneklerini değiştirmez (kodlar kalır); ekran alanlarına aynen uygulanır', () => {
    const liste = { hedef: { alan: 'teslimSekli' }, kosullar: [], degerler: [{ deger: 'Kargo ile', ekranDegeri: 'kargo' }, { deger: 'Mağazadan teslim' }] };
    const yeni = modeleListeleriUygula(ortakModel(), [liste]);
    expect(yeni.senaryoDuzeyi.alanlar[0].secenekler).toEqual(ortakModel().senaryoDuzeyi.alanlar[0].secenekler);
    const ekran = ortakModel();
    delete ekran.senaryoDuzeyi.alanlar[0].ekrandaAlanDegil;
    ekran.kosullar = {};
    for (const a of ekran.adimlar) delete a.gorunurluk;
    expect(modeleListeleriUygula(ekran, [liste]).senaryoDuzeyi.alanlar[0].secenekler.map((s: Nesne) => s.senaryoDegeri ?? s.deger)).toEqual(['Kargo ile', 'Mağazadan teslim']);
  });

  test('koda çeviri: karşılık (sayfa değeri) → kod; karşılık yoksa kod ya da seçenek metni; eşleşmeyen değer açık hata', () => {
    expect(coz(sutunlu({ 'Kargo ile': { sayfa: 'kargo' } }), 'Kargo ile')).toMatchObject({ veri: { teslimSekli: 'kargo' }, hatalar: [], cozulen: 1 });
    // Karşılık yok: seçenek metni (büyük / küçük harf fark etmez) ya da kodun kendisi.
    expect(coz(sutunlu(), 'Mağazadan teslim').veri.teslimSekli).toBe('magaza');
    expect(coz(sutunlu(), 'MAGAZA').veri.teslimSekli).toBe('magaza');
    const h = coz(sutunlu(), 'Uçakla');
    expect(h.cozulen).toBe(0);
    expect(h.hatalar).toHaveLength(1);
    expect(h.hatalar[0].mesaj).toContain('tablodaki "Uçakla" değeri "Teslim şekli" seçeneklerinden hiçbirine karşılık gelmiyor');
    // Karşılık yanlış koda gidiyorsa (modelde olmayan) da hata.
    expect(coz(sutunlu({ 'Kargo ile': { sayfa: 'kurye' } }), 'Kargo ile').hatalar[0].mesaj).toContain('hiçbirine karşılık gelmiyor');
  });

  test('bağlı senaryo ayarının SABİT kodu aynı tablodaki diğer başvurunun satırını seçer (kod → tablodaki okunur değer)', () => {
    const tablo: Tablo = {
      id: 't2', ad: 'Teslim adresleri', guncellenme: 'x',
      sutunlar: [{ ad: SUTUN, gizli: false, tip: 'metin' }, { ad: 'Adres', gizli: false, tip: 'metin' }],
      satirlar: [
        { id: 'a1', ad: 'Kargo', ortamId: null, degerler: { [SUTUN]: 'Kargo ile', Adres: 'Depo 1' }, doluGizli: [] },
        { id: 'a2', ad: 'Mağaza', ortamId: null, degerler: { [SUTUN]: 'Mağazadan teslim', Adres: 'Mağaza 7' }, doluGizli: [] }
      ]
    };
    const s = { tablolar: [tablo], baglar: { teslimSekli: { tablo: 't2', sutun: SUTUN } }, ...modelAlanBilgisi(ortakModel()), ortamId: null };
    expect(ekranBasvurulariniCoz({ teslimSekli: 'magaza', adres: '${Teslim adresleri.Adres}' }, s).veri).toEqual({ teslimSekli: 'magaza', adres: 'Mağaza 7' });
    expect(ekranBasvurulariniCoz({ teslimSekli: 'kargo', adres: '${Teslim adresleri.Adres}' }, s).veri.adres).toBe('Depo 1');
  });

  test('doğrulayıcı: tablodan gelen senaryo ayarı kabul edilir; dallar "bilinmiyor" (ikisi de gizlenmez); sabit seçim bugünkü gibi', () => {
    const baglam = { model: ortakModel() as unknown as DogrulamaModeli, kaynak: 'kayit' as const, tablolar: [{ ad: TABLO, sutunlar: [{ ad: SUTUN }] }] };
    expect(senaryoyuDogrula({ teslimSekli: BASVURU }, baglam).hatalar).toEqual([]);
    expect(gorunurlukleriHesapla({ teslimSekli: BASVURU }, baglam).adimlar).toEqual({ kargoAdimi: null, magazaAdimi: null });
    expect(gorunurlukleriHesapla({ teslimSekli: 'kargo' }, baglam).adimlar).toEqual({ kargoAdimi: true, magazaAdimi: false });
    expect(senaryoyuDogrula({ teslimSekli: 'kurye' }, baglam).hatalar[0]?.alan).toBe('teslimSekli');
  });

  test('yedekten içe aktarma: senaryo ayarının bağı, sütun karşılıkları ve senaryodaki başvuru taşınır; koşu çözümü aynı kodu verir', async () => {
    const parola = `Gecici-Ayar-Yedek-${randomBytes(4).toString('hex')}`;
    const a = await veritabaniniHazirla(null);
    const b = await veritabaniniHazirla(null);
    try {
      await kasaOlustur(a, parola, { kdf: HIZLI_KDF });
      izinleriAc(a);
      const proje = projeKaydet(a, { ad: 'Yedek projesi' });
      const ortam = ortamKaydet(a, { projeId: proje, ad: 'Deneme', tabanUrl: 'http://127.0.0.1:9', varsayilan: true, ayarlar: { riskli: false } });
      const ortak = ekranKaydet(a, { projeId: proje, anahtar: ORTAK_ANAHTAR, ad: 'Teslim (ortak)' });
      ekranModeliEkle(a, { ekranId: ortak, model: ortakModel() });
      const ekran = ekranKaydet(a, { projeId: proje, anahtar: 'teslim-ekrani', ad: 'Teslim ekranı' });
      ekranModeliEkle(a, { ekranId: ekran, model: ekranModel() });
      const tablo = tabloKaydet(a, {
        projeId: proje, ad: TABLO, sutunlar: [{ ad: SUTUN, karsiliklar: { 'Kargo ile': { sayfa: 'kargo' } } }],
        satirlar: [{ ad: 'Kargo ile', degerler: { [SUTUN]: 'Kargo ile' } }]
      });
      ekranAlanBaglariniKaydet(a, proje, ortak, { teslimSekli: { tablo, sutun: SUTUN } });
      const s = senaryoKaydet(a, { projeId: proje, ekranId: ekran, baslik: 'Tablodan teslim', ortamIdleri: [ortam], veri: { baslik: 'Tablodan teslim', adSoyad: 'Deneme Kişi', teslimSekli: BASVURU } });

      const h = await iceAktarmaHazirla(b, yedekOlustur(a).veri, parola);
      iceAktarmaUygula(b, h, { tumu: true }, { yapan: 'birim-test' });
      expect(ekranAlanBaglari(b, ortak)).toEqual({ teslimSekli: { tablo, sutun: SUTUN } });
      const [t] = tablolariListele(b, proje, { cozulsun: true });
      expect(t.sutunlar[0].karsiliklar).toEqual({ 'Kargo ile': { sayfa: 'kargo' } });
      const icerik = senaryoGetir(b, s.id)?.icerik as Nesne;
      expect(al(icerik, 'ortamlar', ortam, 'veri', 'teslimSekli')).toBe(BASVURU);
      expect(ekranBasvurulariniCoz({ teslimSekli: BASVURU }, { tablolar: [t], ...modelAlanBilgisi(ortakModel()), ortamId: ortam }).veri.teslimSekli).toBe('kargo');
    } finally {
      a.kapat(); b.kapat();
    }
  });
});

// ---------------------------------------------------------------------------------------------------------------------------
// Uçtan uca
// ---------------------------------------------------------------------------------------------------------------------------

test.describe('senaryo ayarı tablo bağı (uçtan uca)', () => {
  test.describe.configure({ mode: 'serial' });
  const PAROLA = `Gecici-Ayar-Tablo-${randomBytes(6).toString('hex')}`;
  let nobetci: Nobetci;
  let uygulama: TeslimUygulamasi;
  let fikstur: Awaited<ReturnType<typeof yerelSunucu>>;
  let tarayici: Browser;
  let klasor = '';
  let projeId = '';
  let ortamId = '';
  let ortakId = '';
  let ekranId = '';
  let tabloId = '';
  let tabloSenaryosu = '';

  const api = (yol: string, govde?: Nesne): Promise<Yanit> => nobetciApi(nobetci, yol, govde);
  async function basarili(yol: string, govde: Nesne): Promise<Nesne> {
    const y = await api(yol, govde);
    expect(y.basarili, `${yol}: ${y.mesaj ?? ''} ${JSON.stringify(y.hatalar ?? '')}`).toBe(true);
    return y;
  }
  const baglar = async (id: string): Promise<Nesne> => (await api(`/platform/ekran/alan-baglari?projeId=${projeId}&ekranId=${id}`)) as Nesne;
  const tablo = async (): Promise<Nesne> => ((await api(`/platform/tablolar?projeId=${projeId}`)).tablolar as Nesne[]).find((t) => t.id === tabloId) as Nesne;
  const kos = async (senaryoId: string): Promise<{ y: Yanit; sonuclar: Nesne[] }> => {
    const kosuKimligi = `kosu-${randomUUID()}`;
    const y = await api('/platform/senaryolar/calistir', { projeId, kosuId: `k-${randomUUID()}`, senaryoId, ortamId, kosuTuru: 'tekil', kosuKimligi });
    expect(y.basarili, String(y.mesaj ?? '')).toBe(true);
    const detay = await api(`/platform/sonuclar/kosu?id=${kosuKimligi}`);
    return { y, sonuclar: detay.sonuclar as Nesne[] };
  };

  test.beforeAll(async () => {
    test.setTimeout(120_000);
    klasor = mkdtempSync(join(tmpdir(), 'senaryo-ayari-tablo-'));
    uygulama = new TeslimUygulamasi();
    fikstur = await yerelSunucu(uygulama.isle);
    const vtYolu = join(klasor, 'platform.db');
    const vt = await veritabaniniHazirla(vtYolu);
    await kasaOlustur(vt, PAROLA, { kdf: HIZLI_KDF });
    izinleriAc(vt);
    vt.kapat();
    nobetci = await nobetciBaslat(klasor, vtYolu, {});
    await basarili('/platform/kasa/ac', { parola: PAROLA });
    projeId = String(al(await basarili('/platform/proje/kaydet', { ad: 'Teslim Projesi' }), 'proje', 'id'));
    ortamId = String(al(await basarili('/platform/ortam/kaydet', { projeId, ad: 'Deneme', tabanUrl: fikstur.adres, varsayilan: true, riskli: false }), 'ortam', 'id'));
    await basarili('/platform/sayfa-paketi/ekle', { projeId, paket: paket(ortakModel(), { anahtar: ORTAK_ANAHTAR, ad: 'Teslim (ortak)' }), senaryoIndeksleri: [], ortamIdleri: [] });
    await basarili('/platform/sayfa-paketi/ekle', { projeId, paket: paket(ekranModel(), { anahtar: 'teslim-ekrani', ad: 'Teslim ekranı', urlYolu: '/teslim/' }), senaryoIndeksleri: [], ortamIdleri: [ortamId] });
    const ekranlar = (await api(`/platform/ekranlar?projeId=${projeId}`)).ekranlar as Nesne[];
    ortakId = String(ekranlar.find((e) => e.anahtar === ORTAK_ANAHTAR)?.id);
    ekranId = String(ekranlar.find((e) => e.anahtar === 'teslim-ekrani')?.id);
    tarayici = await korumaliTarayici();
  });

  test.afterAll(async () => {
    await tarayici?.close();
    nobetci?.surec.kill('SIGTERM');
    await fikstur?.kapat();
    if (klasor) rmSync(klasor, { recursive: true, force: true });
  });

  test('bağsız: senaryo ayarı sabit seçimle bugünkü gibi koşar (seçilen dala gider)', async () => {
    test.setTimeout(120_000);
    const s = await basarili('/platform/senaryo/kaydet', {
      projeId, ekranId, baslik: 'Sabit mağaza', ortamIdleri: [ortamId], veri: { baslik: 'Sabit mağaza', adSoyad: 'Sabit Kişi', teslimSekli: 'magaza' }
    });
    const { y } = await kos(String(s.id));
    expect(y.durum, JSON.stringify(y.hataMesaji)).toBe('passed');
    expect(uygulama.kayitlar.at(-1)).toEqual({ ad: 'Sabit Kişi', yol: 'magaza' });
  });

  test('ortak akışta bağ: alan Test verisi sekmesinde senaryo ayarı olarak listelenir; bağ kurulunca karşılıklar modelden dolar', async () => {
    tabloId = String(al(await basarili('/platform/tablo/kaydet', {
      projeId, ad: TABLO, sutunlar: [{ ad: SUTUN }],
      satirlar: [{ ad: 'Kargo ile', degerler: { [SUTUN]: 'Kargo ile' } }, { ad: 'Mağazadan teslim', degerler: { [SUTUN]: 'Mağazadan teslim' } }]
    }), 'tablo', 'id'));
    const o = await baglar(ortakId);
    expect(o.ortakAkis).toBe(true);
    expect(o.girdiler).toEqual([expect.objectContaining({ id: 'teslimSekli', etiket: 'Teslim şekli', tip: 'secim', senaryoAyari: true })]);
    const y = await basarili('/platform/ekran/alan-baglari/kaydet', { projeId, ekranId: ortakId, baglar: { teslimSekli: { tablo: tabloId, sutun: SUTUN } } });
    expect(y.karsiliklar).toMatchObject({ eklenen: 2, tablolar: [TABLO] });
    expect(al(await tablo(), 'sutunlar', 0, 'karsiliklar')).toEqual({ 'Kargo ile': { sayfa: 'kargo' }, 'Mağazadan teslim': { sayfa: 'magaza' } });
    // Kullanan ekranda ortak akıştan gelen bağla (ekranın kendi bağı yok) listelenir.
    const e = await baglar(ekranId);
    expect((e.girdiler as Nesne[]).find((g) => g.id === 'teslimSekli')).toMatchObject({ senaryoAyari: true });
    expect(e.ortakBaglar).toMatchObject({ teslimSekli: { tablo: tabloId, sutun: SUTUN, ortakAkis: { id: ortakId } } });
    // Senaryo formu: "Tablodan" için liste (baglanti) var; alanın seçenekleri modelin kodları kalır.
    const form = await api(`/platform/senaryo/form?projeId=${projeId}&ekranId=${ekranId}&ortamId=${ortamId}`) as Nesne;
    const liste = (form.degerListeleri as Nesne[]).find((l) => al(l, 'hedef', 'alan') === 'teslimSekli');
    expect(liste).toMatchObject({ senaryoAyari: true, baglanti: { tablo: TABLO, sutun: SUTUN } });
    const alan = (al(form, 'model', 'senaryoDuzeyi', 'alanlar') as Nesne[]).find((a) => a.id === 'teslimSekli') as Nesne;
    expect(alan.secenekler).toEqual(ortakModel().senaryoDuzeyi.alanlar[0].secenekler);
  });

  test('bağdan sonra sabit seçim de aynen geçerli (seçenekler değişmez)', async () => {
    const s = await basarili('/platform/senaryo/kaydet', {
      projeId, ekranId, baslik: 'Sabit kargo', ortamIdleri: [ortamId], veri: { baslik: 'Sabit kargo', adSoyad: 'Sabit Kişi', teslimSekli: 'kargo' }
    });
    expect(s.uyarilar ?? []).toEqual([]);
  });

  test('"Uyan her satır ayrı test": iki satır → iki test ("[Kargo ile]", "[Mağazadan teslim]"), her biri kendi dalına gider', async () => {
    test.setTimeout(240_000);
    tabloSenaryosu = String((await basarili('/platform/senaryo/kaydet', {
      projeId, ekranId, baslik: 'Teslim tablodan', ortamIdleri: [ortamId], veri: { baslik: 'Teslim tablodan', adSoyad: 'Tablo Kişi', teslimSekli: BASVURU },
      veriKosulari: { gruplar: { [`${tabloId}|`]: { kip: 'tumu' } } }
    })).id);
    const once = uygulama.kayitlar.length;
    const { y, sonuclar } = await kos(tabloSenaryosu);
    expect(y.durum, JSON.stringify(y.hataMesaji)).toBe('passed');
    expect((y.veriKosulari as Nesne[]).map((x) => [x.baslik, x.durum]).sort()).toEqual([
      ['Teslim tablodan [Kargo ile]', 'basarili'], ['Teslim tablodan [Mağazadan teslim]', 'basarili']
    ]);
    expect(sonuclar.map((x) => x.senaryoBaslik).sort()).toEqual(['Teslim tablodan [Kargo ile]', 'Teslim tablodan [Mağazadan teslim]']);
    expect(uygulama.kayitlar.slice(once).map((k) => k.yol).sort()).toEqual(['kargo', 'magaza']);
  });

  test('ekranda (kendi bağıyla) da bağlanır; karşılığı olmayan metin seçenek metniyle çevrilir', async () => {
    test.setTimeout(120_000);
    // Karşılıkları sil; ekranın kendi bağı (ortak akışınkini ezer) → yeniden kaydedilince karşılıklar ekrandan da dolar.
    await basarili('/platform/tablo/kaydet', { projeId, id: tabloId, ad: TABLO, sutunlar: [{ ad: SUTUN, eskiAd: SUTUN, karsiliklar: {} }] });
    expect(al(await tablo(), 'sutunlar', 0, 'karsiliklar')).toBeUndefined();
    const s = await basarili('/platform/senaryo/kaydet', {
      projeId, ekranId, baslik: 'Karşılıksız mağaza', ortamIdleri: [ortamId], veri: { baslik: 'Karşılıksız mağaza', adSoyad: 'Metin Kişi', teslimSekli: BASVURU },
      tabloSecimleri: { [`${tabloId}|`]: { [SUTUN]: 'Mağazadan teslim' } }
    });
    const { y } = await kos(String(s.id));
    expect(y.durum, JSON.stringify(y.hataMesaji)).toBe('passed');
    expect(uygulama.kayitlar.at(-1)).toEqual({ ad: 'Metin Kişi', yol: 'magaza' });
    const e = await basarili('/platform/ekran/alan-baglari/kaydet', { projeId, ekranId, baglar: { teslimSekli: { tablo: tabloId, sutun: SUTUN } } });
    expect(e.karsiliklar).toMatchObject({ eklenen: 2 });
    expect((await baglar(ekranId)).baglar).toEqual({ teslimSekli: { tablo: tabloId, sutun: SUTUN } });
  });

  test('eşleşmeyen tablo değeri: senaryo doğrulaması açık hatayla reddeder', async () => {
    const t = await tablo();
    await basarili('/platform/tablo/kaydet', {
      projeId, id: tabloId, ad: TABLO, sutunlar: [{ ad: SUTUN, eskiAd: SUTUN }],
      satirlar: [...(t.satirlar as Nesne[]).map((r) => ({ id: r.id })), { ad: 'Uçak', degerler: { [SUTUN]: 'Uçakla' } }]
    });
    const y = await api('/platform/senaryo/kaydet', {
      projeId, ekranId, baslik: 'Eşleşmeyen', ortamIdleri: [ortamId], veri: { baslik: 'Eşleşmeyen', adSoyad: 'Kişi', teslimSekli: BASVURU }
    });
    expect(y.basarili).toBe(false);
    expect(JSON.stringify(y.hatalar)).toContain('tablodaki \\"Uçakla\\" değeri \\"Teslim şekli\\" seçeneklerinden hiçbirine karşılık gelmiyor');
    expect((y.hatalar as Nesne[])[0].alan).toBe('teslimSekli');
    // Satır seçimi eşleşen satırı seçiyorsa kaydedilir (yalnız koşuya girecek satırlar denetlenir).
    await basarili('/platform/senaryo/kaydet', {
      projeId, ekranId, baslik: 'Eşleşen satır', ortamIdleri: [ortamId], veri: { baslik: 'Eşleşen satır', adSoyad: 'Kişi', teslimSekli: BASVURU },
      tabloSecimleri: { [`${tabloId}|`]: { [SUTUN]: 'Kargo ile' } }
    });
  });

  async function sayfa(genislik: number): Promise<{ page: Page; istekler: string[] }> {
    const baglam = await tarayici.newContext({ baseURL: nobetci.adres, viewport: { width: genislik, height: 1000 }, colorScheme: 'dark' });
    const istekler: string[] = [];
    baglam.on('request', (r) => { istekler.push(r.url()); });
    const page = await baglam.newPage();
    const hatalar: string[] = [];
    page.on('pageerror', (e) => hatalar.push(String(e)));
    page.on('close', () => expect(hatalar, 'sayfa hataları').toEqual([]));
    return { page, istekler };
  }
  const tasmaYok = async (page: Page): Promise<void> => {
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
  };

  for (const genislik of [1440, 390]) {
    test(`arayüz (${genislik} px): Test verisi sekmesinde senaryo ayarı rozeti; senaryo formunda Tablodan + satır seçimi kartı; taşma yok`, async () => {
      test.setTimeout(90_000);
      const { page, istekler } = await sayfa(genislik);
      await page.goto(`/#/ekranlar/e/${encodeURIComponent(ortakId)}/veri`);
      const kart = page.getByRole('region', { name: 'Ekranın test verisi bağlantıları' });
      await expect(kart.getByText('Ekranda alan değil · senaryo ayarı')).toBeVisible();
      await expect(kart.getByRole('combobox', { name: 'Teslim şekli tablo sütunu' }).locator('option:checked')).toHaveText(`${TABLO} → ${SUTUN}`);
      await tasmaYok(page);
      await page.goto(`/#/ekranlar/e/${encodeURIComponent(ekranId)}/veri`);
      await expect(page.getByRole('region', { name: 'Ekranın test verisi bağlantıları' }).getByText('Ekranda alan değil · senaryo ayarı')).toBeVisible();
      await tasmaYok(page);

      // Senaryo formu (tablodan senaryo): alanın seçimi "Tablodan: …"; satır seçimi / çalıştırma biçimi kartı görünür.
      await page.goto(`/#/senaryolar/duzenle/${encodeURIComponent(tabloSenaryosu)}`);
      const secim = page.getByRole('combobox', { name: /^Teslim şekli/ });
      await expect(secim.locator('option:checked')).toHaveText(`Tablodan: ${TABLO} › ${SUTUN}`);
      // Sabit seçenekler modelin kodlarıdır (tablodan değişmez).
      await expect(secim.locator('option[value="kargo"]')).toHaveText('Kargo ile');
      await expect(secim.locator('option[value="magaza"]')).toHaveText('Mağazadan teslim');
      await expect(page.locator('.satir-secimi-karti')).toBeVisible();
      await expect(page.locator('.satir-secimi-karti')).toContainText(TABLO);
      await expect(page.locator('.satir-secimi-karti').getByRole('checkbox', { name: 'Uyan her satır ayrı test' })).toBeChecked();
      await tasmaYok(page);

      // Yeni senaryo: sabit seçimden "Tablodan"a geçince satır seçimi / çalıştırma biçimi kartı açılır.
      await page.goto(`/#/senaryolar/yeni/${encodeURIComponent(ekranId)}`);
      const yeniSecim = page.getByRole('combobox', { name: /^Teslim şekli/ });
      await yeniSecim.selectOption('kargo');
      await expect(page.locator('.satir-secimi-karti')).toBeHidden();
      await yeniSecim.selectOption({ label: `Tablodan: ${TABLO} › ${SUTUN}` });
      await expect(page.locator('.satir-secimi-karti')).toBeVisible();
      await expect(page.locator('.satir-secimi-karti').getByRole('checkbox', { name: 'Uyan her satır ayrı test' })).not.toBeChecked();
      await tasmaYok(page);
      expect(istekler.filter((u) => SIRKET_DESENI.test(u))).toEqual([]);
      expect(istekler.filter((u) => !u.startsWith(nobetci.adres) && !u.startsWith('data:'))).toEqual([]);
      await page.close();
    });
  }
});
