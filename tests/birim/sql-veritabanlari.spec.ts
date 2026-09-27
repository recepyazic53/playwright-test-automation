// KORUMA TESTLERİ — SQL adımı ortama göre doğru veritabanına gider (Ayarlar > Entegrasyonlar > Veritabanları): mantıksal
// veritabanı { eslemeler: ortamId → bağlantı } kasada şifreli; TEST koşusu TEST bağlantısına, CANLI koşusu CANLI bağlantısına
// gider; eşleme yoksa sorgu ATILMAZ (sürücüye çağrı gitmez), anlaşılır hata; eski { baglantiId } adımları aynen çalışır; bağlantının
// ortam kısıtıyla çatışan eşleme reddedilir; farklı sürücü uyarısı; silme uyarıları (kullanan adımlar / eşli veritabanları);
// servis akışı koşusu ve model koşusu verisi (veri-oku) doğru bağlantıyı seçer. Gerçek veritabanı YOK: sürücü taklit edilir
// (surucuYukleyiciAyarla); adresler belgeleme aralığında (192.0.2.x) ve hiçbirine bağlanılmaz.
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { kasaOlustur } from '../../scripts/platform/kasa.mjs';
import type { Veritabani } from '../../scripts/platform/veritabani/baglanti.mjs';
import { ortamKaydet, projeKaydet, veritabaniniHazirla } from '../../scripts/platform/veritabani/depo.mjs';
import { baglantiKaydet, baglantiSil } from '../../scripts/platform/entegrasyonlar/depo.mjs';
import { surucuYukleyiciAyarla } from '../../scripts/platform/entegrasyonlar/veritabani-suruculeri.mjs';
import {
  kosuSqlAyari, kosuSqlVerisi, modeldekiSqlHedefleri, sqlTanimDenetle, sqlTanimiylaSorgula
} from '../../scripts/platform/sql/sorgu-bagdastirici.mjs';
import {
  baglantiEslemeleriniKaldir, baglantininVeritabanlari, veritabaniGetir, veritabaniKaydet, veritabanlariListele, VERITABANI_AYAR_ANAHTARI
} from '../../scripts/platform/sql/veritabanlari.mjs';
import { SQL_KULLANIM_POST_UCLARI, baglantiKullanimi, sqlKosuDenetimi, sqlKullanimlari } from '../../scripts/platform/sql/sql-kullanimi.mjs';
import { servisAkisiKaydet, servisKaydet, servisSenaryosuKaydet } from '../../scripts/platform/servisler/servis-deposu.mjs';
import { servisAkisiCalistir } from '../../scripts/platform/servisler/servis-akislari.mjs';
import { sayfaEkle } from '../../scripts/platform/ekranlar/ekran-servisi.mjs';
import { senaryoKaydet } from '../../scripts/platform/senaryolar/senaryo-servisi.mjs';
import { ekranModeliGetir } from '../../scripts/platform/veritabani/depo.mjs';
import { akistanKayitEnvanteri, type AkisEnvanteri } from '../../scripts/platform/tarama/akis-tasarimi.mjs';
import { kayitPaketiOlustur, type HamAlan } from '../../scripts/platform/tarama/paket-olusturucu.mjs';
import { HIZLI_KDF, geciciKlasor, izinleriAc } from './platform-ortak';

type Cagri = { host: string; sorgu: unknown };

test.describe('SQL veritabanları (ortama göre bağlantı)', () => {
  test.describe.configure({ mode: 'serial' });
  const klasor = geciciKlasor('sql-veritabanlari');
  let vt: Veritabani;
  let projeId = '';
  let TEST = '';
  let CANLI = '';
  let HAZIRLIK = '';
  let bTest = '';
  let bCanli = '';
  let bMysql = '';
  let vKayit = '';
  const cagrilar: Cagri[] = [];
  const PAROLA = 'vt-parola-gizli-3c1e';

  test.beforeAll(async () => {
    // Sahte sürücüler: hangi sunucuya sorgu gittiğini kaydeder; gerçek bağlantı yok.
    const istemci = class {
      ayar: Record<string, unknown>;
      constructor(ayar: Record<string, unknown>) { this.ayar = ayar; }
      async connect() { /* sahte */ }
      async query(q: unknown) {
        cagrilar.push({ host: String(this.ayar.host), sorgu: q });
        return { fields: [{ name: 'durum' }], rows: [[String(this.ayar.host) === '192.0.2.10' ? 'TEST-VERISI' : 'CANLI-VERISI']] };
      }
      async end() { /* sahte */ }
    };
    surucuYukleyiciAyarla(async (paket: string) => {
      if (paket === 'pg') return { Client: istemci };
      throw new Error(`beklenmeyen sürücü: ${paket}`);
    });
    vt = await veritabaniniHazirla(join(klasor.yol, 'platform.db'));
    await kasaOlustur(vt, 'Gecici-SqlVt-1', { kdf: HIZLI_KDF });
    // İzinlerden bağımsız davranış sınanıyor: Ayarlar > İzinler (varsayılan kapalı) açılır.
    izinleriAc(vt);
    projeId = projeKaydet(vt, { ad: 'Veritabanı projesi' });
    TEST = ortamKaydet(vt, { projeId, ad: 'TEST', tabanUrl: 'http://127.0.0.1:9', varsayilan: true, ayarlar: { riskli: false } });
    CANLI = ortamKaydet(vt, { projeId, ad: 'CANLI', tabanUrl: 'http://127.0.0.1:9', ayarlar: { canli: true } });
    HAZIRLIK = ortamKaydet(vt, { projeId, ad: 'HAZIRLIK', tabanUrl: 'http://127.0.0.1:9' });
    const pg = (ad: string, sunucu: string, ortamIdleri: string[]) => baglantiKaydet(vt, projeId, {
      tur: 'veritabani', ad, ortamIdleri, alanlar: { surucu: 'postgres', sunucu, veritabani: 'uyg', kullanici: 'okur', parola: PAROLA }
    }).id;
    bTest = pg('kayit-TEST', '192.0.2.10', [TEST]);
    bCanli = pg('kayit-CANLI', '192.0.2.20', [CANLI]);
    bMysql = baglantiKaydet(vt, projeId, { tur: 'veritabani', ad: 'kayit-MYSQL', alanlar: { surucu: 'mysql', sunucu: '192.0.2.30', parola: PAROLA } }).id;
  });
  test.afterAll(() => { surucuYukleyiciAyarla(null); vt?.kapat(); klasor.temizle(); });

  test('kayıt: eşlemeler kasada şifreli; ortam kısıtı çatışması reddedilir; farklı sürücü uyarısı; ad tekil', () => {
    const { veritabani, uyarilar } = veritabaniKaydet(vt, projeId, { ad: 'Kayıt veritabanı', aciklama: 'Başvuru kayıtları', eslemeler: { [TEST]: bTest, [CANLI]: bCanli, [HAZIRLIK]: '' } });
    vKayit = veritabani.id;
    expect(veritabani.eslemeler).toEqual({ [TEST]: bTest, [CANLI]: bCanli });
    expect(uyarilar).toEqual([]);
    expect(String(vt.tek('SELECT deger_json FROM ayarlar WHERE anahtar = ?', [VERITABANI_AYAR_ANAHTARI])?.deger_json)).toMatch(/^kasa:v1:/);
    // Bağlantının "Ortamlar" seçimi (yalnız TEST) CANLI eşlemesiyle çatışır.
    expect(() => veritabaniKaydet(vt, projeId, { ad: 'Çatışan', eslemeler: { [CANLI]: bTest } })).toThrow('"kayit-TEST" bağlantısı CANLI ortamında kullanılamaz');
    expect(() => veritabaniKaydet(vt, projeId, { ad: 'kayıt VERİTABANI', eslemeler: {} })).toThrow('zaten var');
    expect(() => veritabaniKaydet(vt, projeId, { ad: 'Yok', eslemeler: { [TEST]: 'olmayan' } })).toThrow('bulunamadı');
    // Farklı sürücü türleri eşlenebilir ama uyarı döner.
    const k = veritabaniKaydet(vt, projeId, { ad: 'Karma', eslemeler: { [TEST]: bTest, [HAZIRLIK]: bMysql } });
    expect(k.uyarilar.join(' ')).toContain('farklı sürücüler');
    expect(veritabanlariListele(vt, projeId).map((v) => v.ad)).toEqual(['Karma', 'Kayıt veritabanı']);
  });

  test('koşu çözümü: TEST → kayit-TEST, CANLI → kayit-CANLI; eşleme yoksa sürücüye hiç gidilmez; eski baglantiId aynen çalışır', async () => {
    cagrilar.length = 0;
    const t = { veritabaniId: vKayit };
    const r1 = await sqlTanimiylaSorgula(vt, t, 'SELECT durum FROM kayit', {}, { projeId, ortamId: TEST });
    const r2 = await sqlTanimiylaSorgula(vt, t, 'SELECT durum FROM kayit', {}, { projeId, ortamId: CANLI });
    expect([r1.satirlar[0][0], r2.satirlar[0][0]]).toEqual(['TEST-VERISI', 'CANLI-VERISI']);
    expect(cagrilar.filter((c) => !String(c.sorgu).includes('READ ONLY')).map((c) => c.host)).toEqual(['192.0.2.10', '192.0.2.20']);
    // HAZIRLIK'ta eşleme yok: anlaşılır hata, sürücüye çağrı YOK.
    const once = cagrilar.length;
    await expect(sqlTanimiylaSorgula(vt, t, 'SELECT 1', {}, { projeId, ortamId: HAZIRLIK }))
      .rejects.toThrow('"Kayıt veritabanı" için HAZIRLIK ortamında bağlantı tanımlı değil (Ayarlar > Entegrasyonlar > Veritabanları).');
    expect(cagrilar.length).toBe(once);
    // Eski adım (doğrudan bağlantı): TEST'te çalışır, CANLI'da bağlantının ortam kısıtı hatası (mevcut davranış).
    const r3 = await sqlTanimiylaSorgula(vt, { baglantiId: bTest }, 'SELECT durum FROM kayit', {}, { projeId, ortamId: TEST });
    expect(r3.satirlar[0][0]).toBe('TEST-VERISI');
    await expect(sqlTanimiylaSorgula(vt, { baglantiId: bTest }, 'SELECT 1', {}, { projeId, ortamId: CANLI })).rejects.toThrow('bu ortamda kullanılamaz');
    expect(cagrilar.length).toBe(once + 2);   // READ ONLY + sorgu (yalnız TEST çağrısı)
    // Kayıt doğrulaması: veritabanı projede mi (eşleme koşuda denetlenir).
    expect(sqlTanimDenetle(vt, projeId, { veritabaniId: vKayit })).toBeNull();
    expect(sqlTanimDenetle(vt, projeId, { veritabaniId: 'yok' })).toContain('veritabanı bulunamadı');
    expect(sqlTanimDenetle(vt, projeId, { baglantiId: bTest })).toBeNull();
  });

  test('model koşusu verisi (veri-oku): ortamın eşlemesi çözülür, parola yalnız ayarda; eşleme yoksa { hata }; adı raporda', () => {
    const model = { adimlar: [{ id: 'a', sqlKontrolu: { veritabaniId: vKayit, sql: 'SELECT 1', beklenen: { tur: 'bosDegil' } } }, { id: 'b', sqlKontrolu: { baglantiId: bMysql } }] };
    const h = modeldekiSqlHedefleri([model, {}]);
    expect([[...h.veritabaniIdleri], [...h.baglantiIdleri]]).toEqual([[vKayit], [bMysql]]);
    const test1 = kosuSqlVerisi(vt, projeId, TEST, h);
    const a1 = kosuSqlAyari(test1, { veritabaniId: vKayit });
    expect(a1).toMatchObject({ baglantiId: bTest, baglantiAdi: 'kayit-TEST', veritabaniAdi: 'Kayıt veritabanı', ayar: { sunucu: '192.0.2.10' } });
    const canli = kosuSqlVerisi(vt, projeId, CANLI, h);
    expect(kosuSqlAyari(canli, { veritabaniId: vKayit })).toMatchObject({ baglantiAdi: 'kayit-CANLI', ayar: { sunucu: '192.0.2.20' } });
    const hazirlik = kosuSqlVerisi(vt, projeId, HAZIRLIK, h);
    expect(kosuSqlAyari(hazirlik, { veritabaniId: vKayit })).toEqual({ hata: '"Kayıt veritabanı" için HAZIRLIK ortamında bağlantı tanımlı değil (Ayarlar > Entegrasyonlar > Veritabanları).' });
    expect(kosuSqlAyari(hazirlik, { baglantiId: bMysql })).toMatchObject({ baglantiAdi: 'kayit-MYSQL' });
    // Adlar ve veritabanı çözümü parola içermez (parola yalnız bağlantı ayarında, koşu belleğinde).
    expect(JSON.stringify([test1.sqlVeritabanlari, test1.sqlBaglantiAdlari])).not.toContain(PAROLA);
  });

  test('servis akışı koşusu: aynı akış TEST ve CANLI\'da doğru bağlantıya gider; eşleme yoksa adım sorgusuz hata; eski adım çalışır', async () => {
    const icerik = { adimlar: [
      { ad: 'Kayıt yazıldı', tur: 'sql', sql: { veritabaniId: vKayit, sql: 'SELECT durum FROM kayit', beklenen: { tur: 'bosDegil' } } },
      { ad: 'Eski adım', tur: 'sql', hataOlursaDevam: true, sql: { baglantiId: bTest, sql: 'SELECT durum FROM kayit', beklenen: { tur: 'bosDegil' } } }
    ] };
    const akisId = servisAkisiKaydet(vt, { projeId, baslik: 'Kayıt kontrolü', kapsam: 'ikisi', icerik });
    cagrilar.length = 0;
    const t = await servisAkisiCalistir(vt, projeId, { akisId, ortamId: TEST, tur: 'kosu' });
    expect(t.adimlar.map((a) => [a.durum, a.senaryo])).toEqual([['basarili', 'SQL sorgusu · Kayıt veritabanı → kayit-TEST'], ['basarili', 'SQL sorgusu · kayit-TEST']]);
    const c = await servisAkisiCalistir(vt, projeId, { akisId, ortamId: CANLI, tur: 'kosu' });
    expect(c.adimlar[0]).toMatchObject({ durum: 'basarili', senaryo: 'SQL sorgusu · Kayıt veritabanı → kayit-CANLI', sqlHedefi: { baglanti: 'kayit-CANLI', veritabani: 'Kayıt veritabanı' } });
    expect(c.adimlar[1]).toMatchObject({ durum: 'hata' });
    expect(String(c.adimlar[1].neden)).toContain('bu ortamda kullanılamaz');
    expect(cagrilar.filter((x) => !String(x.sorgu).includes('READ ONLY')).map((x) => x.host)).toEqual(['192.0.2.10', '192.0.2.10', '192.0.2.20']);
    // Eşlemesi olmayan ortam: sorgu atılmaz, adım anlaşılır hatayla kalır. (HAZIRLIK varsayılan test ortamı olmadığından riskli
    // sayılır — tek tanım ortam-riski.mjs — Dene yalnız test ortamında; koşu aynı yoldan geçer.)
    const once = cagrilar.length;
    const h = await servisAkisiCalistir(vt, projeId, { akisId, ortamId: HAZIRLIK, tur: 'kosu' });
    expect(h.adimlar[0]).toMatchObject({ durum: 'hata', neden: '"Kayıt veritabanı" için HAZIRLIK ortamında bağlantı tanımlı değil (Ayarlar > Entegrasyonlar > Veritabanları).' });
    expect(cagrilar.length).toBe(once);
    expect(JSON.stringify([t, c, h])).not.toContain(PAROLA);
  });

  test('silme uyarıları: kullanan SQL adımları listelenir, onaysız silinmez; bağlantı silinince eşlemesi kalkar', async () => {
    const kullanim = sqlKullanimlari(vt, projeId);
    expect(kullanim).toEqual(expect.arrayContaining([
      { kaynak: 'servisAkisi', yer: 'Kayıt kontrolü (servis akışı) › Kayıt yazıldı', veritabaniId: vKayit },
      { kaynak: 'servisAkisi', yer: 'Kayıt kontrolü (servis akışı) › Eski adım', baglantiId: bTest }
    ]));
    const uc = (yol: string) => SQL_KULLANIM_POST_UCLARI.find(([y]) => y === yol)?.[1] as (db: Veritabani, g: Record<string, unknown>) => Record<string, unknown>;
    expect(uc('/platform/sql/veritabani/kullanim')(vt, { projeId, id: vKayit })).toEqual({ adimlar: ['Kayıt kontrolü (servis akışı) › Kayıt yazıldı'] });
    expect(() => uc('/platform/sql/veritabani/sil')(vt, { projeId, id: vKayit })).toThrow('şu SQL adımlarında kullanılıyor: Kayıt kontrolü (servis akışı) › Kayıt yazıldı');
    expect(veritabaniGetir(vt, projeId, vKayit)).toBeDefined();
    // Bağlantı silme uyarısı: eşli olduğu veritabanları (ortam adlarıyla) + doğrudan kullanan adımlar.
    expect(baglantiKullanimi(vt, projeId, bTest)).toEqual({
      veritabanlari: expect.arrayContaining([{ id: vKayit, ad: 'Kayıt veritabanı', ortamlar: ['TEST'] }]),
      adimlar: ['Kayıt kontrolü (servis akışı) › Eski adım']
    });
    expect(baglantininVeritabanlari(vt, projeId, bCanli)).toEqual([{ id: vKayit, ad: 'Kayıt veritabanı', ortamIdleri: [CANLI] }]);
    baglantiSil(vt, projeId, bCanli);
    expect(baglantiEslemeleriniKaldir(vt, projeId, bCanli)).toBe(1);
    expect(veritabaniGetir(vt, projeId, vKayit)?.eslemeler).toEqual({ [TEST]: bTest });
    await expect(sqlTanimiylaSorgula(vt, { veritabaniId: vKayit }, 'SELECT 1', {}, { projeId, ortamId: CANLI })).rejects.toThrow('CANLI ortamında bağlantı tanımlı değil');
    // Onayla silinir; adımlar sonra "veritabanı bulunamadı" hatasıyla kalır.
    expect(uc('/platform/sql/veritabani/sil')(vt, { projeId, id: vKayit, onay: true })).toMatchObject({ silindi: true, etkilenenAdimlar: ['Kayıt kontrolü (servis akışı) › Kayıt yazıldı'] });
    await expect(sqlTanimiylaSorgula(vt, { veritabaniId: vKayit }, 'SELECT 1', {}, { projeId, ortamId: TEST })).rejects.toThrow('veritabanı bulunamadı');
  });

  test('koşu öncesi denetim: servis akış senaryosunun kullandığı veritabanları', () => {
    const { veritabani } = veritabaniKaydet(vt, projeId, { ad: 'Denetim veritabanı', eslemeler: { [TEST]: bTest } });
    const akisId = servisAkisiKaydet(vt, { projeId, baslik: 'Denetim akışı', icerik: { adimlar: [
      { ad: 'Kontrol', tur: 'sql', sql: { veritabaniId: veritabani.id, sql: 'SELECT 1', beklenen: { tur: 'bosDegil' } } }] } });
    const servisId = servisKaydet(vt, { projeId, anahtar: 'denetim', ad: 'Denetim', ayarlar: { yol: '/x' } });
    const senaryoId = servisSenaryosuKaydet(vt, { projeId, servisId, baslik: 'Akış senaryosu', icerik: { tur: 'akis', akisId, adimlar: {} } });
    const d = sqlKosuDenetimi(vt, projeId);
    expect(d.servisSenaryolari[senaryoId]).toEqual([veritabani.id]);
    expect(d.veritabanlari.find((v) => v.id === veritabani.id)?.eslemeler).toEqual({ [TEST]: bTest });
  });

  test('ekran akışı: modeldeki SQL adımı (veritabaniId) kullanım listesinde ve koşu denetiminde; model koşusu verisi doğru bağlantıyı çözer', async () => {
    const { veritabani } = veritabaniKaydet(vt, projeId, { ad: 'Ekran veritabanı', eslemeler: { [TEST]: bTest, [CANLI]: bMysql } });
    const env: AkisEnvanteri = {
      kip: 'kayit', bicim: 'akis', profil: null, baslik: 'Kayıt', alanlar: [{ alan: alan('#no', 'Kayıt no'), secili: true }],
      dugmeler: [{ secici: '#kaydet', metin: 'Kaydet' }], mesajlar: [], olaylar: [], engellenenler: [], notlar: []
    };
    const { envanter } = akistanKayitEnvanteri(env, [
      { tur: 'alanlar', ad: 'Kayıt', alanlar: ['#no'], zorunlu: [] }, { tur: 'aksiyon', dugme: 0, istegeBagli: false },
      { tur: 'sql', ad: 'Veritabanına yazıldı', sql: { veritabaniId: veritabani.id, sql: 'SELECT durum FROM kayit WHERE no = ${no}', beklenen: { tur: 'bosDegil' } } },
      { tur: 'bitir' }
    ]);
    const meta = { ekranAnahtari: 'kayit', ekranAdi: 'Kayıt ekranı', urlYolu: '/kayit/', girisGerekli: false, girissiz: true, ikiAsamali: 'yok' as const, baglamTuru: null };
    const paket = kayitPaketiOlustur(meta, envanter as NonNullable<typeof envanter>).paket;
    const { ekranId } = await sayfaEkle(vt, projeId, paket, { senaryoIndeksleri: [], ortamIdleri: [TEST, CANLI], medyaKlasoru: join(klasor.yol, 'medya') });
    const senaryoId = senaryoKaydet(vt, { projeId, ekranId, baslik: 'Kayıt 1', ortamIdleri: [TEST, CANLI], veri: { baslik: 'Kayıt 1', no: '1' } }).id;
    expect(sqlKullanimlari(vt, projeId)).toContainEqual({ kaynak: 'ekran', yer: 'Kayıt ekranı › Veritabanına yazıldı', veritabaniId: veritabani.id });
    expect(sqlKosuDenetimi(vt, projeId).ekranSenaryolari[senaryoId]).toEqual([veritabani.id]);
    const h = modeldekiSqlHedefleri([ekranModeliGetir(vt, ekranId)?.model, {}]);
    expect(kosuSqlAyari(kosuSqlVerisi(vt, projeId, TEST, h), { veritabaniId: veritabani.id })).toMatchObject({ baglantiAdi: 'kayit-TEST', ayar: { surucu: 'postgres', sunucu: '192.0.2.10' } });
    expect(kosuSqlAyari(kosuSqlVerisi(vt, projeId, CANLI, h), { veritabaniId: veritabani.id })).toMatchObject({ baglantiAdi: 'kayit-MYSQL', ayar: { surucu: 'mysql', sunucu: '192.0.2.30' } });
    expect(kosuSqlAyari(kosuSqlVerisi(vt, projeId, HAZIRLIK, h), { veritabaniId: veritabani.id })).toEqual({ hata: '"Ekran veritabanı" için HAZIRLIK ortamında bağlantı tanımlı değil (Ayarlar > Entegrasyonlar > Veritabanları).' });
  });
});

const alan = (anahtar: string, etiket: string): HamAlan => ({
  anahtar, tur: 'text', etiket, etiketKaynagi: 'label', kimlik: anahtar.slice(1), ad: null, secici: anahtar, kirilganlik: 'dusuk', adaySeciciler: [anahtar],
  zorunlu: false, devreDisi: false, saltOkunur: false, coklu: false, bolum: { anahtar: 'b', baslik: 'Kayıt' }
});
