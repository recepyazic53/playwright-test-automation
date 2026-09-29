// SERVİS SENARYOSU SABİT DEĞERLERİNDE MASKELEME — adı maskeleme listesinde olan alan (parola, token… + Ayarlar > Güvenlik >
// Maskeleme eki) servis senaryosuna "Sabit değer" olarak yazılınca: senaryoda aynen saklanır (saklama biçimi değişmez) ve
// istekte aynen gönderilir; koşu kaydında / Dene panelinde / yanıtta, eski koşu kaydının gösteriminde ve yedek önizlemesinde maskeli.
// Geçici veritabanı, sahte REST sunucusu 127.0.0.1'de; dışarıya istek yok. Değerler sahtedir.
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { coz, kasaOlustur, sifrele, zarfMi } from '../../scripts/platform/kasa.mjs';
import { GIZLI_SABIT_MASKESI, gizliSabitiTabloyaTasi, gizliSabitleriAyir, gizliSabitleriBirlestir, gizliSabitleriGeriKoy } from '../../scripts/platform/servisler/gizli-sabitler.mjs';
import { tablolariListele } from '../../scripts/platform/tablolar/tablo-deposu.mjs';
import type { Veritabani } from '../../scripts/platform/veritabani/baglanti.mjs';
import { ortamKaydet, projeKaydet, veritabaniniHazirla } from '../../scripts/platform/veritabani/depo.mjs';
import { adaGoreMaskele, gizliAdliDegerler, maskeyiGeriKoy, servisIceriginiMaskele } from '../../scripts/platform/ayarlar/gizli-adlar.mjs';
import { ekGizliAdlariKaydet } from '../../scripts/platform/ayarlar/maskeleme.mjs';
import { restServisiKaydet } from '../../scripts/platform/servisler/rest-servisi.mjs';
import {
  servisKosulariniListele, servisKosusuGetir, servisKosusuKaydet, servisSenaryolariniListele, servisSenaryosuGetir, servisSenaryosuKaydet
} from '../../scripts/platform/servisler/servis-deposu.mjs';
import { servisSenaryosuCalistir } from '../../scripts/platform/servisler/servis-islemleri.mjs';
import { servisKosusuGosterimi } from '../../scripts/platform/sonuclar/servis-sonuclari.mjs';
import { yedekOlustur } from '../../scripts/platform/yedek.mjs';
import { iceAktarmaHazirla } from '../../scripts/platform/ice-aktarma.mjs';
import { geciciKlasor, HIZLI_KDF } from './platform-ortak';

const PAROLA = 'Sabit-Parola-4471';
const EK_DEGER = 'Ek-Anahtar-4472';
const KASA = 'Deneme-Kasa-Parolasi-44!';
const M = '•••';

test.describe('gizli adlı alan değerleri (saf)', () => {
  test('XML / JSON / başlık / yol: değerler bulunur; yer tutucu ve boş değer sır sayılmaz; ek ad kullanılır', () => {
    const xml = `<s:Body><Giris><KullaniciAdi>deneme</KullaniciAdi><ns:Password>${PAROLA}</ns:Password><Token>\${Tablo.Token}</Token><Pin></Pin></Giris></s:Body>`;
    expect(gizliAdliDegerler(xml)).toEqual([PAROLA]);
    expect(gizliAdliDegerler(`{"kullanici":"deneme","parola":"${PAROLA}","musteriAnahtari":"${EK_DEGER}"}`, ['musteriAnahtari'])).toEqual([PAROLA, EK_DEGER]);
    expect(gizliAdliDegerler('Authorization: Bearer abc\nX-Iz: 1', [], { bicim: 'basliklar' })).toEqual(['Bearer abc']);
    expect(gizliAdliDegerler('/giris?kullanici=deneme&password=gizli1', [], { bicim: 'yol' })).toEqual(['gizli1']);
  });

  test('maskele → düzenle → geri koy: maskeli kalan yere asıl değer, değiştirilen yere yeni değer; sıra kaymaz', () => {
    const govde = `<A><Password>\${Tablo.Parola}</Password><Password>${PAROLA}</Password><Ad>deneme</Ad><Token>t-1</Token></A>`;
    const m = adaGoreMaskele(govde, [], M);
    expect(m.metin).toBe(`<A><Password>\${Tablo.Parola}</Password><Password>${M}</Password><Ad>deneme</Ad><Token>${M}</Token></A>`);
    expect(maskeyiGeriKoy(m.metin, m.asillar, [], M)).toBe(govde);
    const duzenli = m.metin.replace('<Ad>deneme</Ad>', '<Ad>yeni</Ad>').replace(`<Token>${M}</Token>`, '<Token>t-2</Token>');
    expect(maskeyiGeriKoy(duzenli, m.asillar, [], M)).toBe(govde.replace('deneme', 'yeni').replace('t-1', 't-2'));
  });

  test('servis içeriği görünümü: gövde, başlıklar, yol ve akış adımları maskeli; kaynak nesne değişmez', () => {
    const icerik = {
      operasyon: 'giris', govde: `{"parola":"${PAROLA}","ad":"deneme"}`, basliklar: { Authorization: 'Bearer abc', 'X-Iz': '1' },
      http: { metot: 'GET', yol: `/giris?password=${PAROLA}` }, adimlar: { a1: { govde: `<Password>${PAROLA}</Password>` } }
    };
    const kopya = JSON.parse(JSON.stringify(icerik)) as typeof icerik;
    const g = servisIceriginiMaskele(icerik, [], M) as typeof icerik;
    expect(JSON.stringify(g)).not.toContain(PAROLA);
    expect(g.basliklar).toEqual({ Authorization: M, 'X-Iz': '1' });
    expect(g.govde).toContain('"ad":"deneme"');
    expect(icerik).toEqual(kopya);
  });
});

test.describe('koşu kaydı ve gösterimleri (sahte sunucu)', () => {
  const klasor = geciciKlasor('sabit-gizli');
  let vt: Veritabani;
  let sunucu: Server;
  const govdeler: string[] = [];
  test.afterAll(async () => { vt?.kapat(); klasor.temizle(); await new Promise((c) => sunucu?.close(c)); });

  test('sabit parola aynen gönderilir ve saklanır; koşu kaydı, yanıt, eski kayıt ve yedek önizlemesi maskeli', async () => {
    // Sahte sunucu gövdeyi yankılar (yanıttaki parola da maskelenmeli).
    sunucu = createServer((q, r) => { let g = ''; q.on('data', (p) => { g += p; }); q.on('end', () => { govdeler.push(g); r.writeHead(200, { 'Content-Type': 'application/json' }); r.end(g || '{}'); }); });
    await new Promise<void>((c) => sunucu.listen(0, '127.0.0.1', () => c()));
    const adres = `http://127.0.0.1:${(sunucu.address() as AddressInfo).port}`;
    vt = await veritabaniniHazirla(join(klasor.yol, 'p.db'));
    await kasaOlustur(vt, KASA, { kdf: HIZLI_KDF });
    ekGizliAdlariKaydet(vt, ['musteriAnahtari']);
    const projeId = projeKaydet(vt, { ad: 'P' });
    const ortamId = ortamKaydet(vt, { projeId, ad: 'TEST', tabanUrl: adres, varsayilan: true, ayarlar: { riskli: false } });
    const uc = { ad: 'giris', metot: 'POST', yol: '/giris', icerikTuru: 'application/json', govdeOrnegi: '{"kullanici":"x","parola":"x","musteriAnahtari":"x"}' };
    const r = restServisiKaydet(vt, projeId, { anahtar: 'giris', ad: 'Giriş', tabanlar: { [ortamId]: adres }, uclar: [uc], senaryolar: ['giris'] });
    const [ilk] = servisSenaryolariniListele(vt, r.id);
    const govde = `{"kullanici":"deneme","parola":"${PAROLA}","musteriAnahtari":"${EK_DEGER}"}`;
    servisSenaryosuKaydet(vt, { id: ilk.id, projeId, servisId: r.id, baslik: ilk.baslik, icerik: { ...ilk.icerik, govde } });
    // Depo okuması tam değeri verir (koşucular değişmez); diskte ise değer içerikten ayrı, gizli değer olarak durur.
    expect(servisSenaryosuGetir(vt, ilk.id)?.icerik.govde).toBe(govde);
    const ham = JSON.parse(coz(vt, String(vt.tek('SELECT icerik_json FROM servis_senaryolari WHERE id = ?', [ilk.id])?.icerik_json)));
    expect(JSON.stringify(ham)).not.toContain(PAROLA);
    expect(ham.govde).toContain('"parola":"••••••"');
    expect(zarfMi(ham.gizliSabitler)).toBe(true);

    const k = await servisSenaryosuCalistir(vt, projeId, { servisId: r.id, ortamId, tur: 'dene', senaryoId: ilk.id });
    expect(k.durum, String(k.hata)).toBe('basarili');
    expect(govdeler[govdeler.length - 1]).toBe(govde); // istek aynen gönderildi
    const [kayit] = servisKosulariniListele(vt, { servisId: r.id });
    const tam = servisKosusuGetir(vt, kayit.id);
    const metin = JSON.stringify(tam?.sonuc);
    expect(metin).not.toContain(PAROLA);
    expect(metin).not.toContain(EK_DEGER);
    expect(String(tam?.sonuc.istek)).toContain('"kullanici":"deneme"');
    expect(JSON.stringify(k)).not.toContain(PAROLA);

    // Eski (maskesiz saklanmış) koşu kaydı da gösterimde adıyla maskelenir.
    const eskiId = servisKosusuKaydet(vt, {
      projeId, servisId: r.id, senaryoId: ilk.id, ortamId, tur: 'dene', durum: 'basarili', baslangic: new Date().toISOString(), sureMs: 1,
      sonuc: { istek: `<Password>${PAROLA}</Password><Ad>deneme</Ad>` }
    });
    const eski = servisKosusuGetir(vt, eskiId);
    expect(JSON.stringify(eski)).toContain(PAROLA); // kayıt değişmez
    const gosterim = JSON.stringify(servisKosusuGosterimi(eski as NonNullable<typeof eski>, []));
    expect(gosterim).not.toContain(PAROLA);
    expect(gosterim).toContain('deneme');

    // Yedek önizlemesi (içe aktarma): servis senaryosu içeriğinde parola maskeli.
    const hedef = await veritabaniniHazirla(join(klasor.yol, 'hedef.db'));
    try {
      const hazirlik = await iceAktarmaHazirla(hedef, yedekOlustur(vt).veri, KASA);
      const onizleme = JSON.stringify(hazirlik.onizleme);
      expect(onizleme).toContain('"kullanici\\":\\"deneme');
      expect(onizleme).not.toContain(PAROLA);
    } finally { hedef.kapat(); }
  });
});

test.describe('gizli sabitler kasada ayrı saklanır (geriye uyumlu)', () => {
  test.describe.configure({ mode: 'serial' });
  const klasor = geciciKlasor('gizli-sabitler');
  let vt: Veritabani;
  test.afterAll(() => { vt?.kapat(); klasor.temizle(); });
  const hamIcerik = (id: string): Record<string, any> => JSON.parse(coz(vt, String(vt.tek('SELECT icerik_json FROM servis_senaryolari WHERE id = ?', [id])?.icerik_json)));

  test('ayır → birleştir: gövde, başlık, yol ve akış adımları; maskeli gelen yer kayıtlı değerle dolar, değiştirilen yer yeni değer', async () => {
    vt = await veritabaniniHazirla(join(klasor.yol, 'p.db'));
    await kasaOlustur(vt, KASA, { kdf: HIZLI_KDF });
    const icerik = {
      operasyon: 'giris', govde: `<A><Password>${PAROLA}</Password><Ad>deneme</Ad><Token>\${akis:Token}</Token></A>`,
      basliklar: { Authorization: 'Bearer sahte-jeton-1', 'X-Iz': '1' }, http: { metot: 'GET', yol: `/giris?password=${PAROLA}&ad=x` },
      adimlar: { a1: { govde: `{"parola":"${EK_DEGER}"}` } }
    };
    const ayri = gizliSabitleriAyir(vt, icerik, []) as Record<string, any>;
    const metin = JSON.stringify({ ...ayri, gizliSabitler: undefined, adimlar: { a1: { ...ayri.adimlar.a1, gizliSabitler: undefined } } });
    for (const sir of [PAROLA, EK_DEGER, 'sahte-jeton-1']) expect(metin).not.toContain(sir);
    expect(ayri.govde).toContain('<Token>${akis:Token}</Token>'); // yer tutucu sır değildir
    expect(zarfMi(ayri.gizliSabitler)).toBe(true);
    expect(gizliSabitleriBirlestir(vt, ayri)).toEqual(icerik);
    // Arayüzden maskeli dönen içerik: maskeli yer kayıtlı değerle, değiştirilen yer yeni değerle.
    const arayuzden: Record<string, any> = { ...ayri, govde: ayri.govde.replace('deneme', 'yeni'), basliklar: { Authorization: 'Bearer yeni-jeton', 'X-Iz': '1' } };
    delete arayuzden.gizliSabitler;
    const geri = gizliSabitleriGeriKoy(arayuzden, icerik, []) as Record<string, any>;
    expect(geri.govde).toBe(icerik.govde.replace('deneme', 'yeni'));
    expect(geri.basliklar.Authorization).toBe('Bearer yeni-jeton');
    expect(geri.http.yol).toBe(icerik.http.yol);
    expect(GIZLI_SABIT_MASKESI).toBe('••••••');
  });

  test('eski düz kayıt okunur; ilk kaydedilişte gizliye çevrilir; kopya kaynağından dolar', async () => {
    const projeId = projeKaydet(vt, { ad: 'P' });
    const ortamId = ortamKaydet(vt, { projeId, ad: 'TEST', tabanUrl: 'http://127.0.0.1:9', varsayilan: true, ayarlar: { riskli: false } });
    const r = restServisiKaydet(vt, projeId, { anahtar: 'giris', ad: 'Giriş', tabanlar: { [ortamId]: 'http://127.0.0.1:9' },
      uclar: [{ ad: 'giris', metot: 'POST', yol: '/giris', icerikTuru: 'application/json', govdeOrnegi: '{"kullanici":"x","parola":"x"}' }], senaryolar: ['giris'] });
    const [ilk] = servisSenaryolariniListele(vt, r.id);
    const govde = `{"kullanici":"deneme","parola":"${PAROLA}"}`;
    // Eski biçim: değer içerikte düz (yalnız bütün içerik şifreli) — doğrudan yazılır.
    vt.calistir('UPDATE servis_senaryolari SET icerik_json = ? WHERE id = ?', [sifrele(vt, JSON.stringify({ ...ilk.icerik, govde })), ilk.id]);
    expect(hamIcerik(ilk.id).govde).toContain(PAROLA);
    expect(servisSenaryosuGetir(vt, ilk.id)?.icerik.govde).toBe(govde); // okunur
    // Arayüzden maskeli gelen içerikle kaydet: değer korunur ve artık gizli saklanır.
    const maskeli = servisIceriginiMaskele(servisSenaryosuGetir(vt, ilk.id)?.icerik, [], GIZLI_SABIT_MASKESI) as Record<string, any>;
    expect(JSON.stringify(maskeli)).not.toContain(PAROLA);
    servisSenaryosuKaydet(vt, { id: ilk.id, projeId, servisId: r.id, baslik: ilk.baslik, icerik: maskeli });
    expect(JSON.stringify(hamIcerik(ilk.id))).not.toContain(PAROLA);
    expect(servisSenaryosuGetir(vt, ilk.id)?.icerik.govde).toBe(govde);
    // Kopya (arayüzde maskeli içerik + kaynak senaryo): değer kaynaktan kopyalanır.
    const kopyaId = servisSenaryosuKaydet(vt, { projeId, servisId: r.id, baslik: 'Kopya', icerik: maskeli, kaynakSenaryoId: ilk.id });
    expect(servisSenaryosuGetir(vt, kopyaId)?.icerik.govde).toBe(govde);
    // Kaynaksız yeni senaryoda maske değer sayılmaz ama sır da değildir: olduğu gibi kalır (yanlışlıkla asıl değer uydurulmaz).
    const yalinId = servisSenaryosuKaydet(vt, { projeId, servisId: r.id, baslik: 'Kaynaksız', icerik: maskeli });
    expect(servisSenaryosuGetir(vt, yalinId)?.icerik.govde).toContain('"parola":"••••••"');
  });

  test('"Tabloya gizli sütun olarak taşı": değer gizli sütuna yazılır, listede görünmez; aynı değer aynı sütunu kullanır', () => {
    const projeId = projeKaydet(vt, { ad: 'Taşıma' });
    const icerik = { govde: `<Giris><Password>${PAROLA}</Password></Giris>` };
    const servis = { ad: 'Kimlik Servisi', anahtar: 'kimlik' };
    const a = gizliSabitiTabloyaTasi(vt, projeId, { servis, icerik, alanAdi: 'Password', ekler: [] });
    expect(a).toEqual({ tablo: 'Kimlik Servisi gizli değerleri', sutun: 'Password', basvuru: 'Kimlik Servisi gizli değerleri.Password', yeniSutun: true });
    const [t] = tablolariListele(vt, projeId);
    expect(t.sutunlar).toEqual([expect.objectContaining({ ad: 'Password', gizli: true })]);
    expect(JSON.stringify(t)).not.toContain(PAROLA);
    expect(tablolariListele(vt, projeId, { cozulsun: true })[0].satirlar[0].degerler.Password).toBe(PAROLA);
    expect(gizliSabitiTabloyaTasi(vt, projeId, { servis, icerik, alanAdi: 'Password', ekler: [] }).yeniSutun).toBe(false);
    // Farklı (yeni yazılan) değer: ayrı sütun.
    expect(gizliSabitiTabloyaTasi(vt, projeId, { servis, alanAdi: 'Password', deger: 'Baska-Deger-1', ekler: [] }).sutun).toBe('Password_2');
    expect(() => gizliSabitiTabloyaTasi(vt, projeId, { servis, icerik, alanAdi: 'KullaniciAdi', ekler: [] })).toThrow(/adı gizli sayılan/);
    expect(() => gizliSabitiTabloyaTasi(vt, projeId, { servis, icerik: {}, alanAdi: 'Password', ekler: [] })).toThrow(/Taşınacak değer yok/);
  });
});
