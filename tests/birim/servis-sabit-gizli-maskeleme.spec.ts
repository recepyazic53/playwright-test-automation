// SERVİS SENARYOSU SABİT DEĞERLERİNDE MASKELEME — adı maskeleme listesinde olan alan (parola, token… + Ayarlar > Güvenlik >
// Maskeleme eki) servis senaryosuna "Sabit değer" olarak yazılınca: senaryoda aynen saklanır (saklama biçimi değişmez) ve
// istekte aynen gönderilir; koşu kaydında / Dene panelinde / yanıtta, eski koşu kaydının gösteriminde ve yedek önizlemesinde maskeli.
// Geçici veritabanı, sahte REST sunucusu 127.0.0.1'de; dışarıya istek yok. Değerler sahtedir.
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { kasaOlustur } from '../../scripts/platform/kasa.mjs';
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
    // Saklama biçimi değişmez: senaryoda değer aynen durur.
    expect(servisSenaryosuGetir(vt, ilk.id)?.icerik.govde).toBe(govde);

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
