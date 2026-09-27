// KORUMA TESTLERİ — Ayarlar > Entegrasyonlar: bağlantılar kasada şifreli saklanır, gizli alanlar API görünümünde maskelidir;
// webhook bildirimi ve hata kaydı YALNIZ yerel sahte HTTP sunucusuna (127.0.0.1, rastgele port) gider; yasak adres kalıbına uyan
// host'a istek gitmez; veritabanı sürücüsü taklit edilir (gerçek veritabanına bağlanılmaz); DBeaver dosyasından parola alınmaz.
import { createServer, type IncomingMessage, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { kasaOlustur } from '../../scripts/platform/kasa.mjs';
import { ortamKaydet, projeKaydet, veritabaniniHazirla } from '../../scripts/platform/veritabani/depo.mjs';
import { kosuKaydet, kosuyuBitir, sonucKaydet } from '../../scripts/platform/veritabani/sonuc-deposu.mjs';
import { yasakAdresleriKaydet } from '../../scripts/platform/guvenlik/yasak-adresler.mjs';
import { baglantiKaydet, baglantilariListele, baglantiSil } from '../../scripts/platform/entegrasyonlar/depo.mjs';
import { baglantiDene, dbeaverEkle, dbeaverOnizle, hataKaydiAc, hataKaydiOnizle, kosuBittiBildir, sorguCalistir } from '../../scripts/platform/entegrasyonlar/servis.mjs';
import { parametreleriDonustur, surucuYukleyiciAyarla, yalnizOkumaDenetle } from '../../scripts/platform/entegrasyonlar/veritabani-suruculeri.mjs';
import { HIZLI_KDF, geciciKlasor, izinleriAc } from './platform-ortak';

type Alinan = { yontem: string; yol: string; basliklar: IncomingMessage['headers']; govde: string };

async function sahteSunucu(yanit: (a: Alinan) => { kod: number; govde: string }): Promise<{ adres: string; alinanlar: Alinan[]; kapat: () => Promise<void> }> {
  const alinanlar: Alinan[] = [];
  const sunucu: Server = createServer((req, res) => {
    const parcalar: Buffer[] = [];
    req.on('data', (p: Buffer) => parcalar.push(p));
    req.on('end', () => {
      const a = { yontem: req.method ?? '', yol: req.url ?? '', basliklar: req.headers, govde: Buffer.concat(parcalar).toString('utf8') };
      alinanlar.push(a);
      const y = yanit(a);
      res.writeHead(y.kod, { 'Content-Type': 'application/json' });
      res.end(y.govde);
    });
  });
  await new Promise<void>((coz) => sunucu.listen(0, '127.0.0.1', () => coz()));
  const { port } = sunucu.address() as AddressInfo;
  return { adres: `http://127.0.0.1:${port}`, alinanlar, kapat: () => new Promise<void>((coz) => sunucu.close(() => coz())) };
}

test('şifreli saklama, maskeli görünüm, webhook koşu bildirimi, hata kaydı, yasak adres', async () => {
  const klasor = geciciKlasor('entegrasyon');
  const vt = await veritabaniniHazirla(join(klasor.yol, 'platform.db'));
  const GIZLI_YOL = '/hook/GIZLI-ANAHTAR-7f3a';
  const TOKEN = 'gizli-belirtec-9c1e';
  const webhook = await sahteSunucu(() => ({ kod: 200, govde: '{}' }));
  const takip = await sahteSunucu((a) => (a.yol.startsWith('/rest/api/2/project/') ? { kod: 200, govde: '{"name":"Deneme projesi"}' }
    : a.yol === '/rest/api/2/issue' ? { kod: 201, govde: '{"key":"HATA-12"}' } : { kod: 404, govde: `{"errorMessages":["yok ${TOKEN}"]}` }));
  try {
    await kasaOlustur(vt, 'Gecici-Entegrasyon-1', { kdf: HIZLI_KDF });
    // İzinlerden bağımsız davranış sınanıyor: Ayarlar > İzinler (varsayılan kapalı) açılır.
    izinleriAc(vt);
    const projeId = projeKaydet(vt, { ad: 'Örnek proje' });
    const ortamId = ortamKaydet(vt, { projeId, ad: 'TEST', tabanUrl: 'https://uygulama.ornek.invalid', varsayilan: true, ayarlar: { riskli: false } });

    // Webhook: adres gizli alan → görünümde maskeli, diskte şifreli.
    const w = baglantiKaydet(vt, projeId, { tur: 'webhook', ad: 'Ekip kanalı', alanlar: { adres: `${webhook.adres}${GIZLI_YOL}`, bicim: 'ayrintili' }, olaylar: ['kosu-bitti'] });
    expect(w.alanlar.adres).toEqual({ dolu: true, maske: '••••••' });
    expect(w.durum).toBeNull();
    const ham = String(vt.tek("SELECT deger_json FROM ayarlar WHERE anahtar = 'entegrasyonlar'")?.deger_json);
    expect(ham).toMatch(/^kasa:v1:/);
    expect(ham).not.toContain('GIZLI-ANAHTAR');
    expect(JSON.stringify(baglantilariListele(vt, projeId))).not.toContain('GIZLI-ANAHTAR');
    // Düzenlemede boş gizli alan mevcut değeri korur.
    baglantiKaydet(vt, projeId, { id: w.id, ad: 'Ekip kanalı', alanlar: { adres: '', bicim: 'ayrintili' }, olaylar: ['kosu-bitti'], ortamIdleri: [ortamId] });
    expect(() => baglantiKaydet(vt, projeId, { tur: 'webhook', ad: 'Hatalı', alanlar: { adres: 'ftp://x.ornek.invalid' } })).toThrow('http');
    await expect(baglantiDene(vt, projeId, { id: w.id })).rejects.toThrow('onay');

    // Deneme (onaylı) yalnız yerel sahte sunucuya gider; mesajda gizli yol yok.
    const d = await baglantiDene(vt, projeId, { id: w.id, onay: true });
    expect(d.sonuc?.sonuc).toBe('bagli');
    expect(d.sonuc?.mesaj).not.toContain('GIZLI');
    expect(webhook.alinanlar[0].yol).toBe(GIZLI_YOL);

    // Koşu bitti → bildirim (proje, ortam, başarı oranı, kalan; test verisi yok).
    const kosuId = 'kosu-entegrasyon-1';
    kosuKaydet(vt, { id: kosuId, projeId, ortamId, tur: 'tam' });
    sonucKaydet(vt, { kosuId, projeId, senaryoBaslik: 'Geçen senaryo', durum: 'basarili' });
    const kalan = sonucKaydet(vt, { kosuId, projeId, senaryoBaslik: 'Kalan senaryo', durum: 'basarisiz', hataMesaji: 'Beklenen metin görünmedi' });
    kosuyuBitir(vt, kosuId, { durum: 'tamamlandi' });
    const bildirim = await kosuBittiBildir(vt, kosuId);
    expect(bildirim).toHaveLength(1);
    expect(bildirim[0].basarili).toBe(true);
    const giden = JSON.parse(webhook.alinanlar[1].govde);
    expect(giden.text).toContain('Örnek proje');
    expect(giden.text).toContain('TEST');
    expect(giden.nobetci).toMatchObject({ basarili: 1, kalan: 1, basariOrani: 50 });

    // Hata kaydı: önizleme istek göndermez; açma onaylı ve yalnız yerel sunucuya.
    const t = baglantiKaydet(vt, projeId, {
      tur: 'is-takip', ad: 'Takip', alanlar: { bicim: 'jira', tabanAdres: takip.adres, projeAnahtari: 'HATA', kayitTuru: 'Hata', kullanici: 'test@ornek.invalid', apiToken: TOKEN }
    });
    expect(JSON.stringify(t)).not.toContain(TOKEN);
    const onizleme = hataKaydiOnizle(vt, projeId, kalan.id, t.id);
    expect(takip.alinanlar).toHaveLength(0);
    expect(onizleme.aciklama).toContain('Beklenen metin görünmedi');
    const acilan = await hataKaydiAc(vt, projeId, { sonucId: kalan.id, baglantiId: t.id, baslik: onizleme.baslik, aciklama: onizleme.aciklama, onay: true }, { medyaKlasoru: klasor.yol });
    expect(acilan.anahtar).toBe('HATA-12');
    expect(acilan.adres).toBe(`${takip.adres}/browse/HATA-12`);
    expect(JSON.parse(takip.alinanlar[0].govde).fields).toMatchObject({ project: { key: 'HATA' }, issuetype: { name: 'Hata' } });
    // Hata yanıtındaki gizli değer durum mesajına yazılmaz.
    baglantiKaydet(vt, projeId, { id: t.id, ad: 'Takip', alanlar: { bicim: 'jira', tabanAdres: `${takip.adres}/yanlis`, projeAnahtari: 'HATA', kayitTuru: 'Hata', kullanici: 'test@ornek.invalid' } });
    const hatali = await baglantiDene(vt, projeId, { id: t.id, onay: true });
    expect(hatali.sonuc?.sonuc).toBe('hata');
    expect(hatali.sonuc?.mesaj).toContain('404');
    expect(hatali.sonuc?.mesaj).not.toContain(TOKEN);

    // Yasak adres: istek gitmez, durum "hata".
    const oncekiSayi = webhook.alinanlar.length;
    yasakAdresleriKaydet(vt, ['127.0.0.1']);
    const yasak = await baglantiDene(vt, projeId, { id: w.id, onay: true });
    expect(yasak.sonuc?.sonuc).toBe('hata');
    expect(yasak.sonuc?.mesaj).toContain('yasak');
    expect(webhook.alinanlar.length).toBe(oncekiSayi);
    yasakAdresleriKaydet(vt, []);

    expect(baglantiSil(vt, projeId, w.id)).toBe(true);
    expect(baglantilariListele(vt, projeId).map((b) => b.ad)).toEqual(['Takip']);
  } finally {
    await webhook.kapat();
    await takip.kapat();
    vt.kapat();
    klasor.temizle();
  }
});

test('veritabanı bağlantısı: yalnız okuma, parametre bağlama, taklit sürücü, DBeaver içe aktarma (parola alınmaz)', async () => {
  expect(() => yalnizOkumaDenetle('SELECT * FROM t WHERE ad = \'x; DROP\'')).not.toThrow();
  expect(() => yalnizOkumaDenetle('WITH a AS (SELECT 1) SELECT * FROM a')).not.toThrow();
  expect(() => yalnizOkumaDenetle('DELETE FROM t')).toThrow('SELECT');
  expect(() => yalnizOkumaDenetle('SELECT 1; DROP TABLE t')).toThrow('tek');
  expect(() => yalnizOkumaDenetle('SELECT * INTO yedek FROM t')).toThrow('INTO');
  expect(parametreleriDonustur('postgres', "SELECT :a, :b::text, ':c', :a", { a: 1, b: 'x' })).toEqual({ sql: "SELECT $1, $2::text, ':c', $1", degerler: [1, 'x'], adlar: { a: 1, b: 'x' } });
  expect(parametreleriDonustur('mssql', 'SELECT :a', { a: 1 }).sql).toBe('SELECT @a');

  const klasor = geciciKlasor('entegrasyon-vt');
  const vt = await veritabaniniHazirla(join(klasor.yol, 'platform.db'));
  const PAROLA = 'vt-parolasi-5d2b';
  const cagrilar: Array<{ ayar: Record<string, unknown>; sorgu: unknown }> = [];
  surucuYukleyiciAyarla(async (paket) => {
    expect(paket).toBe('pg');
    return {
      Client: class {
        ayar: Record<string, unknown>;
        constructor(ayar: Record<string, unknown>) { this.ayar = ayar; }
        async connect() { if (this.ayar.host === 'hatali.ornek.invalid') throw new Error(`parola hatalı: ${PAROLA}`); }
        async query(q: unknown) {
          cagrilar.push({ ayar: this.ayar, sorgu: q });
          return { fields: [{ name: 'id' }, { name: 'ad' }], rows: [[1, 'a'], [2, 'b'], [3, 'c']] };
        }
        async end() { /* yok */ }
      }
    };
  });
  try {
    await kasaOlustur(vt, 'Gecici-Entegrasyon-2', { kdf: HIZLI_KDF });
    // İzinlerden bağımsız davranış sınanıyor: Ayarlar > İzinler (varsayılan kapalı) açılır.
    izinleriAc(vt);
    const projeId = projeKaydet(vt, { ad: 'Örnek proje' });
    const b = baglantiKaydet(vt, projeId, { tur: 'veritabani', ad: 'Test veritabanı', alanlar: { surucu: 'postgres', sunucu: 'db.ornek.invalid', veritabani: 'uyg', kullanici: 'okur', parola: PAROLA } });
    expect(b.alanlar.yalnizOkuma).toBe(true);
    expect(JSON.stringify(b)).not.toContain(PAROLA);
    const r = await sorguCalistir(vt, b.id, 'SELECT id, ad FROM kayit WHERE id > :enAz', { enAz: 0 }, { satirSiniri: 2 });
    expect(r).toEqual({ sutunlar: ['id', 'ad'], satirlar: [[1, 'a'], [2, 'b']], kesildi: true });
    expect(cagrilar.at(-1)?.sorgu).toMatchObject({ text: 'SELECT id, ad FROM kayit WHERE id > $1', values: [0] });
    expect(cagrilar.some((c) => String(c.sorgu).includes('READ ONLY'))).toBe(true);
    await expect(sorguCalistir(vt, b.id, 'UPDATE kayit SET ad = 1', {})).rejects.toThrow('SELECT');
    // Sürücü hatasında parola maskelenir.
    const h = baglantiKaydet(vt, projeId, { tur: 'veritabani', ad: 'Hatalı', alanlar: { surucu: 'postgres', sunucu: 'hatali.ornek.invalid', parola: PAROLA } });
    const hata = await sorguCalistir(vt, h.id, 'SELECT 1', {}).catch((e: Error) => e);
    expect(String(hata)).toContain('Veritabanı hatası');
    expect(String(hata)).not.toContain(PAROLA);

    // DBeaver: yalnız ad / sürücü / sunucu / port / veritabanı / kullanıcı; parola alınmaz.
    const dosya = JSON.stringify({ connections: {
      'pg-1': { provider: 'postgresql', driver: 'postgres-jdbc', name: 'Yerel PG', configuration: { host: 'pg.ornek.invalid', port: '5433', database: 'uyg', user: 'okur', password: 'ALINMAMALI' } },
      'ora-1': { provider: 'oracle', driver: 'oracle_thin', name: 'Oracle', configuration: { url: 'jdbc:oracle:thin:@//ora.ornek.invalid:1522/SERVIS' } },
      'x-1': { provider: 'sqlite', driver: 'sqlite_jdbc', name: 'Yerel dosya', configuration: { database: 'a.db' } }
    } });
    const { baglantilar } = dbeaverOnizle(dosya);
    expect(baglantilar.map((x) => [x.ad, x.surucu, x.sunucu, x.port, x.veritabani, x.destekleniyor])).toEqual([
      ['Yerel PG', 'postgres', 'pg.ornek.invalid', 5433, 'uyg', true], ['Oracle', 'oracle', 'ora.ornek.invalid', 1522, 'SERVIS', true], ['Yerel dosya', null, '', null, 'a.db', false]
    ]);
    expect(JSON.stringify(baglantilar)).not.toContain('ALINMAMALI');
    const { eklenen } = dbeaverEkle(vt, projeId, dosya, ['pg-1', 'ora-1', 'x-1']);
    expect(eklenen.map((x) => [x.ad, x.alanlar.parola])).toEqual([['Yerel PG', { dolu: false, maske: '••••••' }], ['Oracle', { dolu: false, maske: '••••••' }]]);
  } finally {
    surucuYukleyiciAyarla(null);
    vt.kapat();
    klasor.temizle();
  }
});
