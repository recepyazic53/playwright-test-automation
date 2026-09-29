// KORUMA TESTLERİ — uçtan uca akış motoru (servis → ekran → SQL → servis): ${akis:Ad} değerleri adım türleri arasında taşınır
// (servis yanıt başlığından okunan sipariş numarası → ekran senaryosunun alanına; ekrandan okunan onay numarası → SQL parametresine
// ve son servis isteğinin gövdesine), gizliler raporda maskelenir, "hata olursa dur / devam", ortamda eksik adım uyarısı (hiçbir
// istek atılmadan), izinlerin toplu ve adım başına denetimi, tek koşu kaydı. Yalnız yerel sahte SOAP sunucusu + taklit veritabanı
// sürücüsü; ekran adımının koşucusu sahte (gerçek Playwright koşusu: uctan-uca-arayuz.spec.ts) ama koşu sürecinin gerçek yardımcılarını
// (tests/support/uctan-uca-adimi.ts, şifreli çıktı) kullanır.
import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { kasaOlustur } from '../../scripts/platform/kasa.mjs';
import type { Veritabani } from '../../scripts/platform/veritabani/baglanti.mjs';
import { ortamKaydet, projeKaydet, veritabaniniHazirla } from '../../scripts/platform/veritabani/depo.mjs';
import { erisimKontrolu, servisiKaydet } from '../../scripts/platform/servisler/servis-islemleri.mjs';
import { akisIceriginiDogrula, servisAkisiKaydet, servisAkisKosusuGetir, servisSenaryosuKaydet } from '../../scripts/platform/servisler/servis-deposu.mjs';
import { servisAkisiCalistir } from '../../scripts/platform/servisler/servis-akislari.mjs';
import { baglantiKaydet } from '../../scripts/platform/entegrasyonlar/depo.mjs';
import { surucuYukleyiciAyarla } from '../../scripts/platform/entegrasyonlar/veritabani-suruculeri.mjs';
import { veritabaniKaydet } from '../../scripts/platform/sql/veritabanlari.mjs';
import { sayfaEkle } from '../../scripts/platform/ekranlar/ekran-servisi.mjs';
import { izinDegistir } from '../../scripts/platform/guvenlik/izinler.mjs';
import { gerekenIzinler } from '../../scripts/platform/guvenlik/uc-denetimi.mjs';
import { ekranAdimiAkisDegerleri, ekranAdimiDogrula, ezmeleriCoz } from '../../scripts/platform/akislar/ekran-adimi.mjs';
import { akisCiktisiOku, akisCiktisiYaz, akisOrtamDegiskenleri, ciktiAnahtariUret } from '../../scripts/platform/akislar/uctan-uca-cikti.mjs';
import {
  UCTAN_UCA_GET_UCLARI, UCTAN_UCA_POST_UCLARI, uctanUcaCalistir, uctanUcaKosucusuAyarla, uctanUcaOnDenetim
} from '../../scripts/platform/akislar/uctan-uca.mjs';
import type { Kosucu, KosuIstegi } from '../../scripts/platform/senaryolar/calistirma.d.mts';
import { uctanUcaAdimi } from '../support/uctan-uca-adimi';
import { HIZLI_KDF, POSIX_IZINLERI, geciciKlasor, izinleriAc } from './platform-ortak';
import { SAHTE_TC, sahteSoapSunucusu, type SahteIstek } from './servis-fikstur';
import { ornekBasvuruPaketi } from './model-fikstur';

type Nesne = Record<string, any>;
const zarf = (ic: string) => `<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/"><s:Body><Siparis xmlns="Ornek"><Input>${ic}</Input></Siparis></s:Body></s:Envelope>`;
const ONAY_NO = 'ONAY-4411';

test('ekran adımı (saf): yapısal doğrulama, kullanılan ${akis:Ad}, ezme çözümü; çıktı kanalı şifreli ve anahtara bağlı', () => {
  const d = ekranAdimiDogrula({ ad: ' Sipariş ekranı ', senaryoId: 's-1', ezmeler: { adSoyad: 'Kişi ${akis:SiparisNo}', not: 7 },
    okumalar: [{ ad: 'OnayNo', yol: '#onay' }, { ad: 'Kod', kaynak: 'ekran', yol: '.kod', gizli: true }] }, '2. adım', 'e1');
  expect(d.hatalar).toEqual([]);
  expect(d.tanim).toEqual({ id: 'e1', ad: 'Sipariş ekranı', tur: 'ekran', senaryoId: 's-1', ezmeler: { adSoyad: 'Kişi ${akis:SiparisNo}', not: '7' },
    okumalar: [{ ad: 'OnayNo', kaynak: 'ekran', yol: '#onay' }, { ad: 'Kod', kaynak: 'ekran', yol: '.kod', gizli: true }] });
  expect(ekranAdimiAkisDegerleri(d.tanim)).toEqual(['SiparisNo']);
  const kotu = ekranAdimiDogrula({ senaryoId: '', ezmeler: { 'kötü anahtar': 'x', a: 'x\ny' }, okumalar: [{ ad: '1x', yol: '#a' }, { ad: 'B', kaynak: 'xml', yol: '//B' }, { ad: 'C', yol: '' }] }, '1. adım', 'x');
  expect(kotu.tanim).toBeNull();
  expect(kotu.hatalar.join(' | ')).toMatch(/senaryosu seçilmedi.*geçerli bir alan anahtarı değil.*tek satır.*ad geçersiz.*yalnız ekrandan okunur.*seçici boş olamaz/);
  expect(ezmeleriCoz({ a: '${akis:X}-${akis:Y}', b: 'sabit' }, { X: '1' })).toEqual({ degerler: { a: '1-', b: 'sabit' }, eksik: ['Y'] });

  const klasor = geciciKlasor('uctan-cikti');
  try {
    const yol = join(klasor.yol, 'cikti');
    const anahtar = ciktiAnahtariUret();
    akisCiktisiYaz(yol, anahtar, { okunanlar: { OnayNo: ONAY_NO }, gizliOkunanlar: [] });
    expect(readFileSync(yol, 'utf8')).not.toContain(ONAY_NO);
    if (POSIX_IZINLERI) expect(statSync(yol).mode & 0o777).toBe(0o600);
    expect(akisCiktisiOku(yol, anahtar)).toEqual({ okunanlar: { OnayNo: ONAY_NO }, gizliOkunanlar: [] });
    expect(akisCiktisiOku(yol, ciktiAnahtariUret())).toBeNull();
    writeFileSync(yol, 'bozuk');
    expect(akisCiktisiOku(yol, anahtar)).toBeNull();
    expect(akisCiktisiOku(join(klasor.yol, 'yok'), anahtar)).toBeNull();
  } finally { klasor.temizle(); }
  // Koşucuya yalnız akış kanalının değişkenleri geçer.
  expect(akisOrtamDegiskenleri({ NOBETCI_AKIS_ADIMI: '{}', PLATFORM_KASA_ANAHTARI: 'x', NOBETCI_AKIS_X: 5, PATH: '/' })).toEqual({ NOBETCI_AKIS_ADIMI: '{}' });
});

test.describe('uçtan uca akış motoru', () => {
  test.describe.configure({ mode: 'serial' });
  const klasor = geciciKlasor('uctan-uca');
  let vt: Veritabani;
  let soap: { adres: string; istekler: SahteIstek[]; kapat: () => Promise<void> };
  let projeId = '';
  let TEST = '';
  let HAZIRLIK = '';
  let CANLI = '';
  let servisId = '';
  let girisId = '';
  let siparisId = '';
  let ekranSenaryoId = '';
  let veritabaniId = '';
  let akisId = '';
  const sorgular: Array<{ sorgu: unknown }> = [];
  /** Sahte ekran koşucusu: koşu sürecinin gerçek yardımcısıyla girdiyi okur, çıktıyı şifreli yazar. */
  const kosular: Array<{ istek: KosuIstegi; adim: ReturnType<typeof uctanUcaAdimi> }> = [];
  let ekranDavranisi: 'gecer' | 'kalir' = 'gecer';
  const sahteKosucu: Kosucu = {
    calistir: async (istek) => {
      const ortam = akisOrtamDegiskenleri(istek.ekOrtam);
      const adim = uctanUcaAdimi(ortam);
      kosular.push({ istek, adim });
      if (ekranDavranisi === 'kalir') return { govde: { basarili: true, durum: 'failed', sureMs: 7, hataMesaji: `Kalınan adım: ${adim?.ezmeler.adSoyad ?? ''} ${adim?.gizliDegerler.join(',') ?? ''}`, sonucId: 'sonuc-kalan' } };
      akisCiktisiYaz(ortam.NOBETCI_AKIS_CIKTI_DOSYASI, ortam.NOBETCI_AKIS_CIKTI_ANAHTARI, { okunanlar: { OnayNo: ONAY_NO }, gizliOkunanlar: [] });
      return { govde: { basarili: true, durum: 'passed', sureMs: 12, sonucId: 'sonuc-1', ekranGoruntusuId: 'medya-1', videoId: null } };
    },
    modelDene: async () => ({ govde: {} })
  };

  test.beforeAll(async () => {
    surucuYukleyiciAyarla(async (paket: string) => {
      if (paket !== 'pg') throw new Error(`beklenmeyen sürücü: ${paket}`);
      return { Client: class {
        async connect() { /* sahte */ }
        async query(q: unknown) { sorgular.push({ sorgu: q }); return { fields: [{ name: 'durum' }], rows: [['ONAYLI']] }; }
        async end() { /* sahte */ }
      } };
    });
    soap = await sahteSoapSunucusu();
    vt = await veritabaniniHazirla(join(klasor.yol, 'platform.db'));
    await kasaOlustur(vt, 'Gecici-UctanUca-1', { kdf: HIZLI_KDF });
    izinleriAc(vt);
    projeId = projeKaydet(vt, { ad: 'Uçtan uca projesi' });
    TEST = ortamKaydet(vt, { projeId, ad: 'TEST', tabanUrl: soap.adres, varsayilan: true, ayarlar: { riskli: false } });
    HAZIRLIK = ortamKaydet(vt, { projeId, ad: 'HAZIRLIK', tabanUrl: soap.adres, ayarlar: { riskli: false } });
    CANLI = ortamKaydet(vt, { projeId, ad: 'CANLI', tabanUrl: soap.adres, ayarlar: { canli: true } });
    const e = await erisimKontrolu(vt, projeId, { ortamId: TEST, yol: '/Servis/ornek.asmx' });
    if (!e.erisilebilir) throw new Error('erişim yok');
    servisId = servisiKaydet(vt, projeId, { anahtar: 'ornek', ad: 'Ornek', yol: '/Servis/ornek.asmx', erisimKimligi: e.erisimKimligi, tabanlar: { [HAZIRLIK]: '' } });
    const senaryo = (baslik: string, govde: string) => servisSenaryosuKaydet(vt, { projeId, servisId, baslik, icerik: { operasyon: 'Siparis', govde: zarf(govde), kontroller: [{ tur: 'icerir', deger: '<Durum>OK</Durum>' }] } });
    girisId = senaryo('Giriş', '<Giris/>');
    siparisId = senaryo('Sipariş kaydı', `<IdentityNumber>${SAHTE_TC}</IdentityNumber><Not>\${akis:OnayNo}</Not>`);
    await sayfaEkle(vt, projeId, ornekBasvuruPaketi(), { senaryoIndeksleri: [0], ortamIdleri: [TEST, CANLI], medyaKlasoru: join(klasor.yol, 'medya') });
    ekranSenaryoId = String(vt.tek('SELECT id FROM senaryolar WHERE proje_id = ?', [projeId])?.id);
    const b = baglantiKaydet(vt, projeId, { tur: 'veritabani', ad: 'siparis-TEST', ortamIdleri: [TEST], alanlar: { surucu: 'postgres', sunucu: '192.0.2.10', veritabani: 'uyg', kullanici: 'okur', parola: 'vt-parola-9' } }).id;
    veritabaniId = veritabaniKaydet(vt, projeId, { ad: 'Sipariş veritabanı', eslemeler: { [TEST]: b } }).veritabani.id;
    uctanUcaKosucusuAyarla({ kosucu: () => sahteKosucu, secenekler: () => ({ yasakDesenleri: [] }) });
  });
  test.afterAll(async () => { uctanUcaKosucusuAyarla(null); surucuYukleyiciAyarla(null); vt?.kapat(); await soap?.kapat(); klasor.temizle(); });

  const icerik = (ekranDevam = false) => ({
    adimlar: [
      { id: 's1', ad: 'Giriş', servisId, senaryoId: girisId, okumalar: [{ ad: 'SiparisNo', kaynak: 'baslik', yol: 'x-oturum' }, { ad: 'Token', yol: '//Sonuc/Token' }] },
      { id: 'e1', ad: 'Başvuru ekranı', tur: 'ekran', senaryoId: ekranSenaryoId, ezmeler: { adSoyad: 'Kişi ${akis:SiparisNo}', indirimOrani: '${akis:Token}' },
        okumalar: [{ ad: 'OnayNo', yol: '#onay-sonuc' }], ...(ekranDevam ? { hataOlursaDevam: true } : {}) },
      { id: 'q1', ad: 'Kayıt veritabanında', tur: 'sql', sql: { veritabaniId, sql: 'SELECT durum FROM siparis WHERE no = ${akis:OnayNo}', beklenen: { tur: 'sutunDegeri', sutun: 'durum', deger: 'ONAYLI' }, okumalar: [{ ad: 'Durum', sutun: 'durum' }] } },
      { id: 's2', ad: 'Sipariş kaydı', servisId, senaryoId: siparisId, okumalar: [] }
    ]
  });

  test('kayıt ve denetim: ekran adımı yalnız uçtan uca akışta; tanımsız ${akis:X} ve modelde olmayan alan reddedilir; liste ve ekran senaryoları', async () => {
    expect(() => akisIceriginiDogrula(icerik(), 'akis')).toThrow('ekran adımı yalnız uçtan uca akışta');
    const kaydet = new Map(UCTAN_UCA_POST_UCLARI).get('/platform/uctan-uca/kaydet') as (db: Veritabani, g: Nesne) => Nesne;
    const sirasiz = icerik();
    sirasiz.adimlar = [sirasiz.adimlar[1], sirasiz.adimlar[0], sirasiz.adimlar[2], sirasiz.adimlar[3]];
    expect(() => kaydet(vt, { projeId, baslik: 'Sırasız', icerik: sirasiz })).toThrow('${akis:SiparisNo}, ${akis:Token} önceki adımlarda okunmuyor');
    const yabanci = icerik();
    (yabanci.adimlar[1] as Nesne).ezmeler = { olmayanAlan: 'x' };
    expect(() => kaydet(vt, { projeId, baslik: 'Yabancı', icerik: yabanci })).toThrow('"olmayanAlan" alanı "Örnek Başvuru" ekranının');
    akisId = String((kaydet(vt, { projeId, baslik: 'Sipariş uçtan uca', kapsam: 'ikisi', icerik: icerik() }) as Nesne).id);
    const get = new Map(UCTAN_UCA_GET_UCLARI);
    const q = (x: Record<string, string>) => new URLSearchParams(x);
    const liste = get.get('/platform/uctan-uca/akislar')!(vt, q({ projeId })) as Nesne;
    expect(liste.akislar).toEqual([expect.objectContaining({ id: akisId, baslik: 'Sipariş uçtan uca', adimSayisi: 4, adimTurleri: ['servis', 'ekran', 'SQL', 'servis'], sonKosu: null })]);
    const es = get.get('/platform/uctan-uca/ekran-senaryolari')!(vt, q({ projeId })) as Nesne;
    expect(es.senaryolar).toHaveLength(1);
    expect(es.senaryolar[0]).toMatchObject({ id: ekranSenaryoId, ekranAd: 'Örnek Başvuru', ortamIdleri: expect.arrayContaining([TEST, CANLI]) });
    expect(es.senaryolar[0].alanlar.map((a: Nesne) => a.anahtar)).toEqual(expect.arrayContaining(['adSoyad', 'indirimOrani', 'urun']));
    // Servis akışı uçları uçtan uca akışı koşmaz (planlı koşu uctanUcaCalistir ile koşar); servis akış senaryosunda da seçilemez.
    await expect(servisAkisiCalistir(vt, projeId, { akisId, ortamId: TEST, tur: 'kosu' })).rejects.toThrow('Uçtan uca akışlar ekranından koşulur');
    expect(soap.istekler.filter((x) => x.yontem === 'POST')).toHaveLength(0);
  });

  test('ön denetim: ortamda eksik adımlar (servis taban adresi, ekran senaryosu, veritabanı eşlemesi) → koşu başlamaz, istek atılmaz', async () => {
    const d = uctanUcaOnDenetim(vt, projeId, { akisId, ortamId: HAZIRLIK });
    expect(d.kosulabilir).toBe(false);
    expect(d.hatalar).toEqual([]);
    expect(d.uyarilar).toEqual([
      '1. adım (Giriş): "Ornek" servisi "HAZIRLIK" ortamında tanımlı değil (taban adres yok).',
      '2. adım (Başvuru ekranı): "Yetkili / Ekspres / peşin / onaylı" senaryosu "HAZIRLIK" ortamında tanımlı değil.',
      '3. adım (Kayıt veritabanında): "Sipariş veritabanı" için HAZIRLIK ortamında bağlantı tanımlı değil (Ayarlar > Entegrasyonlar > Veritabanları).',
      '4. adım (Sipariş kaydı): "Ornek" servisi "HAZIRLIK" ortamında tanımlı değil (taban adres yok).'
    ]);
    const once = soap.istekler.length;
    await expect(uctanUcaCalistir(vt, projeId, { akisId, ortamId: HAZIRLIK })).rejects.toThrow(/^Koşu başlamadı: 1\. adım/);
    expect(soap.istekler.length).toBe(once);
    expect(kosular).toHaveLength(0);
    expect(sorgular).toHaveLength(0);
  });

  test('izinler: uçta adım türlerine göre toplu (riskli ortamda canlı onayı); ön denetim listesi; koşuda adım başına (kapalıysa adım istek atmadan hata)', async () => {
    const g = gerekenIzinler(vt, '/platform/uctan-uca/kos', { projeId, ortamId: TEST, akisId });
    expect(new Set(g.izinler)).toEqual(new Set(['web-erisimi', 'servis-istekleri', 'veritabani-okuma']));
    expect(g.canliOnayGerekli).toBe(false);
    const c = gerekenIzinler(vt, '/platform/uctan-uca/kos', { projeId, ortamId: CANLI, akisId });
    expect(c.izinler).toContain('canli-ortam');
    expect(c.canliOnayGerekli).toBe(true);
    // Taslak içerikten de (kaydedilmemiş hâl) hesaplanır: yalnız SQL adımı → yalnız veritabanı okuma.
    expect(gerekenIzinler(vt, '/platform/uctan-uca/kos', { projeId, ortamId: TEST, icerik: { adimlar: [icerik().adimlar[2]] } }).izinler).toEqual(['veritabani-okuma']);
    izinDegistir(vt, 'web-erisimi', false, { onay: true });
    try {
      const d = uctanUcaOnDenetim(vt, projeId, { akisId, ortamId: TEST });
      expect(d.izinler).toEqual([
        { anahtar: 'web-erisimi', etiket: 'Web uygulamasına erişim', acik: false, adimlar: ['2. ekran'] },
        { anahtar: 'servis-istekleri', etiket: 'Servis istekleri', acik: true, adimlar: ['1. servis', '4. servis'] },
        { anahtar: 'veritabani-okuma', etiket: 'Veritabanı okuma', acik: true, adimlar: ['3. SQL'] }
      ]);
      // Koşu sürerken kapalı izin: servis adımı koşar, ekran adımı tarayıcı açmadan "hata"; sonrakiler atlanır.
      const r = await uctanUcaCalistir(vt, projeId, { akisId, ortamId: TEST });
      expect(r.adimlar.map((x) => x.durum)).toEqual(['basarili', 'hata', 'atlandi', 'atlandi']);
      expect(r.adimlar[1].neden).toContain('"Web uygulamasına erişim"');
      expect(kosular).toHaveLength(0);
    } finally {
      izinDegistir(vt, 'web-erisimi', true, { onay: true });
    }
  });

  test('zincir: servis → ekran → SQL → servis; değerler taşınır, gizliler maskeli; tek koşu kaydı (ekran sonucu, SQL tablosu, taşınan değerler)', async () => {
    const once = soap.istekler.length;
    const r = await uctanUcaCalistir(vt, projeId, { akisId, ortamId: TEST });
    expect(r.durum, r.ozet).toBe('basarili');
    expect(r.adimlar.map((x) => [x.tur ?? 'senaryo', x.durum])).toEqual([['senaryo', 'basarili'], ['ekran', 'basarili'], ['sql', 'basarili'], ['senaryo', 'basarili']]);
    // Servis yanıtından okunan değer ekrana: ezme çözülmüş olarak koşu sürecine gider; gizli değer maskelenecekler listesinde.
    expect(kosular).toHaveLength(1);
    const { istek, adim } = kosular[0];
    expect(istek).toMatchObject({ senaryoId: ekranSenaryoId, genel: { projeId, ortamId: TEST }, etiket: `@model-${ekranSenaryoId}` });
    expect(adim?.ezmeler.adSoyad).toMatch(/^Kişi oturum-\d+$/);
    expect(adim?.gizliDegerler).toEqual([expect.stringMatching(/^tok-\d+$/)]);
    expect(adim?.ezmeler.indirimOrani).toBe(adim?.gizliDegerler[0]);
    expect(adim?.okumalar).toEqual([{ ad: 'OnayNo', yol: '#onay-sonuc', gizli: false }]);
    // Ekrandan okunan değer SQL parametresine (SQL metnine eklenmez) ve son servis isteğinin gövdesine.
    const sorgu = JSON.stringify(sorgular.at(-1)?.sorgu);
    expect(sorgu).toContain(ONAY_NO);
    expect(sorgu).not.toContain(`no = ${ONAY_NO}`);
    const son = soap.istekler.slice(once).at(-1);
    expect(son?.govde).toContain(`<Not>${ONAY_NO}</Not>`);
    // Kayıt: tek koşu; ekran adımı sonuç / ekran görüntüsü kimlikleri; gizli değer hiçbir yerde açık değil.
    const k = servisAkisKosusuGetir(vt, r.kosuId);
    expect(k?.sonuc.uctanUca).toBe(true);
    const ekranAdimi = k?.sonuc.adimlar[1];
    expect(ekranAdimi).toMatchObject({ tur: 'ekran', servis: 'Ekran', senaryo: 'Yetkili / Ekspres / peşin / onaylı', okunanlar: { OnayNo: ONAY_NO },
      ekran: { senaryoId: ekranSenaryoId, sonucId: 'sonuc-1', ekranGoruntusuId: 'medya-1' }, ezmeler: { adSoyad: expect.stringMatching(/^Kişi oturum-\d+$/), indirimOrani: '•••' } });
    expect(k?.sonuc.adimlar[0].okunanlar).toMatchObject({ Token: '***' });
    expect(k?.sonuc.adimlar[2]).toMatchObject({ tur: 'sql', okunanlar: { Durum: 'ONAYLI' }, sql: { sutunlar: ['durum'], satirlar: [['ONAYLI']] } });
    expect(k?.sonuc.tasinanDegerler).toEqual([
      { ad: 'SiparisNo', deger: expect.stringMatching(/^oturum-\d+$/), adim: 1 }, { ad: 'Token', deger: '***', adim: 1 },
      { ad: 'OnayNo', deger: ONAY_NO, adim: 2 }, { ad: 'Durum', deger: 'ONAYLI', adim: 3 }
    ]);
    expect(JSON.stringify(k?.sonuc)).not.toMatch(/tok-\d/);
    // Sonuçlar ekranının uçları: koşu listesi ve ayrıntısı.
    const get = new Map(UCTAN_UCA_GET_UCLARI);
    const kosuListesi = get.get('/platform/uctan-uca/kosular')!(vt, new URLSearchParams({ projeId })) as Nesne;
    expect(kosuListesi.kosular[0]).toMatchObject({ id: r.kosuId, akisBaslik: 'Sipariş uçtan uca', ortam: 'TEST', durum: 'basarili' });
    const ayrinti = get.get('/platform/uctan-uca/kosu')!(vt, new URLSearchParams({ projeId, id: r.kosuId })) as Nesne;
    expect(ayrinti.kosu.sonuc.adimlar).toHaveLength(4);
    expect(JSON.stringify(ayrinti)).not.toMatch(/tok-\d/);
    // Geçici çıktı dosyası silindi.
    expect(existsSync(String(istek.ekOrtam?.NOBETCI_AKIS_CIKTI_DOSYASI))).toBe(false);
    // Çoklu veri koşusu ile birlikte: ekran adımı senaryoyu tek satırla (tek test) koşturur (NOBETCI_VERI_KIPI=tek; test-sunucu bu adı geçirir).
    expect(istek.ekOrtam?.NOBETCI_VERI_KIPI).toBe('tek');
  });

  test('hata olursa dur / devam: ekran adımı kalırsa sonrakiler atlanır; "kalırsa devam" işaretliyse sonrakiler koşar (eksik değer adımı hata olur)', async () => {
    ekranDavranisi = 'kalir';
    try {
      const r1 = await uctanUcaCalistir(vt, projeId, { akisId, ortamId: TEST });
      expect(r1.durum).toBe('basarisiz');
      expect(r1.adimlar.map((x) => x.durum)).toEqual(['basarili', 'basarisiz', 'atlandi', 'atlandi']);
      expect(r1.adimlar[2].neden).toBe('önceki adım başarısız');
      // Kalan adımın hata metni gizli değeri içermez (maskeli).
      expect(r1.adimlar[1].neden).toMatch(/^Kalınan adım: Kişi oturum-\d+ •••$/);
      // Taslak (kaydedilmemiş hâl) "Dene" olarak koşar: ekran adımı "kalırsa devam" → SQL adımı OnayNo'suz hata, son servis adımı ${akis:OnayNo}'suz hata.
      const r2 = await uctanUcaCalistir(vt, projeId, { akisId, icerik: icerik(true), baslik: 'Sipariş uçtan uca', ortamId: TEST });
      expect(r2.adimlar.map((x) => x.durum)).toEqual(['basarili', 'basarisiz', 'hata', 'atlandi']);
      const k = servisAkisKosusuGetir(vt, r2.kosuId);
      expect(k?.tur).toBe('dene');
      expect(k?.akisId).toBe(akisId);
    } finally {
      ekranDavranisi = 'gecer';
    }
  });
});
