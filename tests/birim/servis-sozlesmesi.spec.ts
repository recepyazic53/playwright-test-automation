// KORUMA TESTLERİ — servis sözleşmesi (veri + koşu): kaynaklar (kayıtlı WSDL yanıt şeması, yerel OpenAPI, JSON Schema, başarılı
// yanıttan taslak) önizleme olarak döner ve YAZMAZ; kayıt kasada şifreli, var olanı değiştirmek / silmek onayla, geçmişe yazılır.
// "Yanıt sözleşmeye uymalı" varsayılan KAPALI (bugünkü davranış değişmez); açıkken uyum geçer, uyumsuzluk senaryoyu kaldırır ve
// rapora "Sözleşme: Başarısız — N uyumsuzluk" + yol bazında liste yazılır (SOAP: XML yolları, REST: JSON yolları); değerler rapora
// yazılmaz. Yalnız 127.0.0.1'deki sahte servis ve geçici veri kökü.
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { kasaOlustur } from '../../scripts/platform/kasa.mjs';
import type { Veritabani } from '../../scripts/platform/veritabani/baglanti.mjs';
import { ortamKaydet, projeKaydet, veritabaniniHazirla } from '../../scripts/platform/veritabani/depo.mjs';
import { senaryoIceriginiDogrula, servisGetir, servisKosusuGetir, servisSenaryosuGetir, servisSenaryosuKaydet } from '../../scripts/platform/servisler/servis-deposu.mjs';
import { erisimKontrolu, servisiKaydet, servisSenaryosuCalistir } from '../../scripts/platform/servisler/servis-islemleri.mjs';
import { restServisiKaydet } from '../../scripts/platform/servisler/rest-servisi.mjs';
import { sozlesmeBilgisi, sozlesmeKaydet, sozlesmeOnizle, sozlesmeSil } from '../../scripts/platform/servisler/servis-sozlesmesi.mjs';
import { alanZorunluAyarla } from '../../scripts/platform/servisler/sozlesme-dogrulayici.mjs';
import { HIZLI_KDF, geciciKlasor } from './platform-ortak';
import { GIZLI_DEGER, sahteMagaza, soapIstegi, type SahteMagaza } from './sozlesme-fikstur';

const OPENAPI = JSON.stringify({
  openapi: '3.0.0', info: { title: 'Magaza', version: '1' },
  paths: { '/api/siparis/{id}': { get: { operationId: 'siparisOku', responses: { 200: { content: { 'application/json': { schema: { $ref: '#/components/schemas/Siparis' } } } } } } } },
  components: { schemas: { Siparis: { type: 'object', required: ['orderId', 'name', 'total'], properties: {
    orderId: { type: 'integer' }, name: { type: 'string' }, total: { type: 'number' }, note: { type: 'string', nullable: true },
    items: { type: 'array', items: { type: 'object', required: ['sku'], properties: { sku: { type: 'string' }, qty: { type: 'integer' } } } }
  } } } }
});

test.describe('servis sözleşmesi', () => {
  test.describe.configure({ mode: 'serial' });
  const klasor = geciciKlasor('servis-sozlesmesi');
  let vt: Veritabani;
  let magaza: SahteMagaza;
  let projeId = '';
  let ortamId = '';
  let soapId = '';
  let restId = '';
  const senaryo = (servisId: string, baslik: string, icerik: Record<string, unknown>) => servisSenaryosuKaydet(vt, { projeId, servisId, baslik, kapsam: 'ikisi', icerik });
  const kos = (servisId: string, senaryoId: string) => servisSenaryosuCalistir(vt, projeId, { servisId, ortamId, tur: 'dene', senaryoId });

  test.beforeAll(async () => {
    magaza = await sahteMagaza();
    vt = await veritabaniniHazirla(join(klasor.yol, 'platform.db'));
    await kasaOlustur(vt, 'Gecici-Sozlesme-1', { kdf: HIZLI_KDF });
    projeId = projeKaydet(vt, { ad: 'Sözleşme projesi' });
    ortamId = ortamKaydet(vt, { projeId, ad: 'TEST', tabanUrl: magaza.adres, varsayilan: true, ayarlar: { riskli: false } });
    const e = await erisimKontrolu(vt, projeId, { ortamId, yol: '/Magaza/servis.asmx' });
    if (!e.erisilebilir) throw new Error('erişim yok');
    soapId = servisiKaydet(vt, projeId, { anahtar: 'magaza', ad: 'Magaza', yol: '/Magaza/servis.asmx', erisimKimligi: e.erisimKimligi });
    restId = restServisiKaydet(vt, projeId, { anahtar: 'magaza-api', ad: 'Magaza API', tabanlar: { [ortamId]: magaza.adres }, uclar: [{ ad: 'siparis', metot: 'GET', yol: '/api/siparis/1' }] }).id;
  });
  test.afterAll(async () => { vt?.kapat(); await magaza?.kapat(); klasor.temizle(); });

  test('WSDL yanıt şeması erişim kontrolünde alınır; önizleme yazmaz; kayıt şifreli, geçmişe yazılır', () => {
    const s = servisGetir(vt, soapId)!;
    expect(s.ayarlar.operasyonSemalari?.SiparisGetir.yanit?.kok).toBe('SiparisGetirResponse');
    expect(sozlesmeBilgisi(vt, projeId, { servisId: soapId, operasyon: 'SiparisGetir' })).toMatchObject({ sozlesme: null, wsdlYanitiVar: true, gecmis: [] });
    const o = sozlesmeOnizle(vt, projeId, { servisId: soapId, operasyon: 'SiparisGetir', kaynak: 'wsdl' });
    expect(o.taslak).toMatchObject({ kaynak: 'wsdl', bicim: 'xml', xmlKok: 'SiparisGetirResponse', kaynakBilgisi: 'Kayıtlı WSDL' });
    expect(o.taslak!.sema).toEqual({ type: 'object', required: ['SiparisNo', 'Tutar'], properties: {
      SiparisNo: { type: 'integer' }, Tutar: { type: ['number', 'null'] },
      Kalemler: { type: 'object', properties: { Kalem: { type: 'array', items: { type: 'object', required: ['Urun', 'Adet'], properties: { Urun: { type: 'string' }, Adet: { type: 'integer' } } } } } }
    } });
    // Önizleme hiçbir şey yazmaz.
    expect(servisGetir(vt, soapId)!.ayarlar.sozlesmeler).toBeUndefined();
    expect(() => sozlesmeOnizle(vt, projeId, { servisId: soapId, operasyon: 'Yok', kaynak: 'wsdl' })).toThrow('operasyonu bu serviste yok');
    expect(() => sozlesmeOnizle(vt, projeId, { servisId: restId, operasyon: 'siparis', kaynak: 'wsdl' })).toThrow('REST servisinde WSDL yok');
    const r = sozlesmeKaydet(vt, projeId, { servisId: soapId, operasyon: 'SiparisGetir', sozlesme: o.taslak });
    expect(r.kaydedildi).toBe(true);
    const b = sozlesmeBilgisi(vt, projeId, { servisId: soapId, operasyon: 'SiparisGetir' });
    expect(b.sozlesme).toMatchObject({ kaynak: 'wsdl', bicim: 'xml', xmlKok: 'SiparisGetirResponse' });
    expect(b.gecmis.map((g) => g.islem)).toEqual(['olustur']);
    expect(String(vt.tek('SELECT ayarlar_json FROM servisler WHERE id = ?', [soapId])?.ayarlar_json)).toMatch(/^kasa:v1:/);
    expect(() => sozlesmeKaydet(vt, projeId, { servisId: soapId, operasyon: 'SiparisGetir', sozlesme: { kaynak: 'baska', sema: {} } })).toThrow('Geçersiz sözleşme kaynağı');
  });

  test('varsayılan KAPALI: sözleşmeye uymayan yanıt senaryoyu etkilemez (bugünkü davranış); içerik alanı yazılmaz', async () => {
    const id = senaryo(soapId, 'Kötü yanıt (kapalı)', { operasyon: 'SiparisGetir', govde: soapIstegi('kotu'), kontroller: [{ tur: 'soapYaniti' }] });
    expect(servisSenaryosuGetir(vt, id)!.icerik).not.toHaveProperty('sozlesmeDogrula');
    const r = await kos(soapId, id);
    expect(r.durum).toBe('basarili');
    expect(r.sozlesme).toBeUndefined();
    expect(r.kontroller!.map((k) => k.tur)).toEqual(['soapYaniti']);
    expect(() => senaryoIceriginiDogrula({ operasyon: 'SiparisGetir', govde: '<a/>', kontroller: [], sozlesmeDogrula: 'evet' })).toThrow('sozlesmeDogrula');
    expect(senaryoIceriginiDogrula({ operasyon: 'SiparisGetir', govde: '<a/>', kontroller: [], sozlesmeDogrula: false })).not.toHaveProperty('sozlesmeDogrula');
  });

  test('SOAP açık: uyan yanıt geçer; uymayan kalır, rapor "Sözleşme: Başarısız — 3 uyumsuzluk" + XML yolları; değer yazılmaz', async () => {
    const iyi = senaryo(soapId, 'İyi yanıt', { operasyon: 'SiparisGetir', govde: soapIstegi('iyi'), kontroller: [{ tur: 'soapYaniti' }], sozlesmeDogrula: true });
    const kotu = senaryo(soapId, 'Kötü yanıt', { operasyon: 'SiparisGetir', govde: soapIstegi('kotu'), kontroller: [{ tur: 'soapYaniti' }], sozlesmeDogrula: true });
    const r1 = await kos(soapId, iyi);
    expect(r1.durum).toBe('basarili');
    expect(r1.kontroller!.at(-1)).toMatchObject({ tur: 'sozlesme', ad: 'Sözleşme: Geçti', gecti: true });
    expect(r1.sozlesme).toEqual({ durum: 'gecti', toplam: 0, uyumsuzluklar: [] });
    const r2 = await kos(soapId, kotu);
    expect(r2.durum).toBe('basarisiz');
    const k = r2.kontroller!.at(-1)!;
    expect(k).toMatchObject({ tur: 'sozlesme', ad: 'Sözleşme: Başarısız — 3 uyumsuzluk', gecti: false });
    expect(k.alt!.map((a) => [a.ad, a.aciklama])).toEqual([
      ['/SiparisGetirResponse/Tutar', 'zorunlu alan yok'],
      ['/SiparisGetirResponse/SiparisNo', 'tam sayı bekleniyordu, metin geldi'],
      ['/SiparisGetirResponse/Kalemler/Kalem[2]/Adet', 'zorunlu alan yok']
    ]);
    const kayit = servisKosusuGetir(vt, r2.kosuId)!;
    expect(kayit.sonuc.sozlesme).toMatchObject({ durum: 'kaldi', toplam: 3 });
    expect(JSON.stringify(kayit.sonuc.sozlesme)).not.toContain(GIZLI_DEGER);
    expect(JSON.stringify(kayit.sonuc.kontroller)).not.toContain(GIZLI_DEGER);
  });

  test('değiştirme ve silme onayla; fark ve geçmiş; sözleşme silinince açık senaryo "tanımlı değil" ile kalır', async () => {
    const mevcut = servisGetir(vt, soapId)!.ayarlar.sozlesmeler!.SiparisGetir;
    const yeni = JSON.parse(JSON.stringify(mevcut.sema));
    alanZorunluAyarla(yeni, ['Tutar'], false);
    delete yeni.properties.Kalemler;
    const on = sozlesmeKaydet(vt, projeId, { servisId: soapId, operasyon: 'SiparisGetir', sozlesme: { ...mevcut, sema: yeni } });
    expect(on.onayGerekli).toBe(true);
    expect(on.fark).toMatchObject({ kaldirilan: ['Kalemler', 'Kalemler.Kalem', 'Kalemler.Kalem[]', 'Kalemler.Kalem[].Urun', 'Kalemler.Kalem[].Adet'], degisen: ['Tutar'] });
    expect(servisGetir(vt, soapId)!.ayarlar.sozlesmeler!.SiparisGetir.sema).toEqual(mevcut.sema);   // onaysız yazılmadı
    expect(sozlesmeKaydet(vt, projeId, { servisId: soapId, operasyon: 'SiparisGetir', sozlesme: { ...mevcut, sema: yeni }, onay: true }).kaydedildi).toBe(true);
    const b = sozlesmeBilgisi(vt, projeId, { servisId: soapId, operasyon: 'SiparisGetir' });
    expect(b.gecmis.map((g) => g.islem)).toEqual(['degistir', 'olustur']);
    expect(b.gecmis[0].fark).toEqual({ eklenen: 0, kaldirilan: 5, degisen: 1 });
    expect(b.senaryoSayisi).toBe(2);
    expect(sozlesmeSil(vt, projeId, { servisId: soapId, operasyon: 'SiparisGetir' })).toEqual({ onayGerekli: true, senaryoSayisi: 2 });
    expect(sozlesmeSil(vt, projeId, { servisId: soapId, operasyon: 'SiparisGetir', onay: true })).toEqual({ silindi: true });
    expect(sozlesmeBilgisi(vt, projeId, { servisId: soapId, operasyon: 'SiparisGetir' }).gecmis.map((g) => g.islem)).toEqual(['sil', 'degistir', 'olustur']);
    const iyi = servisSenaryosuKaydet(vt, { projeId, servisId: soapId, baslik: 'Tanımsız', icerik: { operasyon: 'SiparisGetir', govde: soapIstegi('iyi'), kontroller: [], sozlesmeDogrula: true } });
    const r = await kos(soapId, iyi);
    expect(r.durum).toBe('basarisiz');
    expect(r.kontroller!.at(-1)).toMatchObject({ ad: 'Sözleşme: tanımlı değil', gecti: false });
  });

  test('REST: yerel OpenAPI (öneri + seçim) → sözleşme; JSON yolları; JSON Schema önizlemesi', async () => {
    const liste = sozlesmeOnizle(vt, projeId, { servisId: restId, operasyon: 'siparis', kaynak: 'openapi', metin: OPENAPI, dosyaAdi: 'magaza.json' });
    expect(liste.operasyonlar!.map((o) => [o.anahtar, o.semaVar])).toEqual([['GET /api/siparis/{id}', true]]);
    expect(liste.oneri).toBe('GET /api/siparis/{id}');
    const o = sozlesmeOnizle(vt, projeId, { servisId: restId, operasyon: 'siparis', kaynak: 'openapi', metin: OPENAPI, dosyaAdi: 'magaza.json', openapiAnahtari: 'GET /api/siparis/{id}' });
    expect(o.taslak).toMatchObject({ kaynak: 'openapi', bicim: 'json', kaynakBilgisi: 'magaza.json · GET /api/siparis/{id} (200)' });
    expect(sozlesmeKaydet(vt, projeId, { servisId: restId, operasyon: 'siparis', sozlesme: o.taslak }).kaydedildi).toBe(true);
    const iyi = senaryo(restId, 'REST iyi', { operasyon: 'siparis', govde: '', kontroller: [{ tur: 'durumKodu', deger: '200' }], http: { metot: 'GET', yol: '/api/siparis/1' }, sozlesmeDogrula: true });
    const kotu = senaryo(restId, 'REST kötü', { operasyon: 'siparis', govde: '', kontroller: [{ tur: 'durumKodu', deger: '200' }], http: { metot: 'GET', yol: '/api/siparis/2' }, sozlesmeDogrula: true });
    expect((await kos(restId, iyi)).durum).toBe('basarili');
    const r = await kos(restId, kotu);
    expect(r.durum).toBe('basarisiz');
    expect(r.kontroller!.at(-1)!.ad).toBe('Sözleşme: Başarısız — 4 uyumsuzluk');
    expect(r.sozlesme!.uyumsuzluklar).toEqual([
      { yol: 'response.name', mesaj: 'zorunlu alan yok' },
      { yol: 'response.orderId', mesaj: 'tam sayı bekleniyordu, metin geldi' },
      { yol: 'response.total', mesaj: 'null izinli değil' },
      { yol: 'response.items[0].sku', mesaj: 'zorunlu alan yok' }
    ]);
    expect(JSON.stringify(r)).not.toContain(`Görülen: "${GIZLI_DEGER}`);
    const j = sozlesmeOnizle(vt, projeId, { servisId: restId, operasyon: 'siparis', kaynak: 'jsonSchema', metin: 'type: object\nrequired: [orderId]\nproperties:\n  orderId: { type: integer }\n' });
    expect(j.taslak).toMatchObject({ kaynak: 'jsonSchema', sema: { type: 'object', required: ['orderId'], properties: { orderId: { type: 'integer' } } } });
    expect(() => sozlesmeOnizle(vt, projeId, { servisId: restId, operasyon: 'siparis', kaynak: 'jsonSchema', metin: '{"properties":{"a":{"$ref":"dosya.json"}}}' })).toThrow('Dış $ref desteklenmez');
  });

  test('başarılı yanıttan taslak: yalnız bu ucun başarılı yanıtları; tek örnek uyarısı; düzenlenip onayla kaydedilir', async () => {
    const b = sozlesmeBilgisi(vt, projeId, { servisId: restId, operasyon: 'siparis' });
    const basarili = b.ornekler.filter((x) => x.baslik === 'REST iyi');
    expect(basarili.length).toBe(1);
    expect(b.ornekler.some((x) => x.baslik === 'REST kötü')).toBe(false);   // başarısız yanıt aday değil
    const t = sozlesmeOnizle(vt, projeId, { servisId: restId, operasyon: 'siparis', kaynak: 'taslak', kosuIdleri: [basarili[0].kosuId] });
    expect(t.taslak!.uyarilar[0]).toContain('Tek örnekten zorunluluk kesin değildir');
    expect(t.taslak!.sema.properties!.note).toEqual({ nullable: true });
    expect(t.taslak!.sema.required).toEqual(['orderId', 'name', 'total', 'note', 'items']);
    // Kullanıcı düzenler (note zorunlu değil) ve onaylar: var olan (OpenAPI) sözleşme değiştiği için onay gerekir.
    const sema = JSON.parse(JSON.stringify(t.taslak!.sema));
    alanZorunluAyarla(sema, ['note'], false);
    expect(sozlesmeKaydet(vt, projeId, { servisId: restId, operasyon: 'siparis', sozlesme: { ...t.taslak, sema } }).onayGerekli).toBe(true);
    expect(sozlesmeKaydet(vt, projeId, { servisId: restId, operasyon: 'siparis', sozlesme: { ...t.taslak, sema }, onay: true }).kaydedildi).toBe(true);
    expect(servisGetir(vt, restId)!.ayarlar.sozlesmeler!.siparis).toMatchObject({ kaynak: 'taslak', kaynakBilgisi: '1 başarılı yanıt' });
    const soapKosu = servisKosusuGetir(vt, (await kos(soapId, senaryo(soapId, 'SOAP iyi 2', { operasyon: 'SiparisGetir', govde: soapIstegi('iyi'), kontroller: [] }))).kosuId)!;
    expect(() => sozlesmeOnizle(vt, projeId, { servisId: restId, operasyon: 'siparis', kaynak: 'taslak', kosuIdleri: [soapKosu.id] })).toThrow('bu serviste bulunamadı');
    expect(() => sozlesmeOnizle(vt, projeId, { servisId: restId, operasyon: 'siparis', kaynak: 'taslak', kosuIdleri: [] })).toThrow('En az bir başarılı yanıt');
    // SOAP taslağı: XML yanıttan (kök öğe sözleşmeye yazılır).
    const st = sozlesmeOnizle(vt, projeId, { servisId: soapId, operasyon: 'SiparisGetir', kaynak: 'taslak', kosuIdleri: [soapKosu.id] });
    expect(st.taslak).toMatchObject({ bicim: 'xml', xmlKok: 'SiparisGetirResponse' });
    expect(st.taslak!.sema.properties!.Kalemler).toEqual({ type: 'object', required: ['Kalem'], properties: { Kalem: { type: 'array', items: { type: 'object', required: ['Urun', 'Adet'], properties: { Urun: { type: 'string' }, Adet: { type: 'integer' } } } } } });
  });
});
