// Arayüz taraması fikstürü (spec DEĞİL): gerçekçi, SAHTE veriyle dolu geçici bir Nöbetçi kurar — uzun adlı ekranlar ve
// senaryolar, SOAP + REST servisler, servis / uçtan uca akışlar, çok sütunlu tablolar (gizli sütun, ortama özel satır,
// karşılık), taban adresleri, veritabanı eşlemesi, giriş profilleri, planlı koşu kuralları ve sahte koşu sonuçları.
// Yalnız 127.0.0.1 (sahte SOAP sunucusu) ve geçici veritabanı; gerçek Nöbetçi'ye ve veri/ klasörüne dokunulmaz.
// Koşu sonuçları sunucu durdurulup sonuç deposu işlevleriyle doğrudan yazılır (gerçek koşu yok), sonra sunucu yeniden başlar.
import { randomBytes } from 'node:crypto';
import { join } from 'node:path';
import { expect } from '@playwright/test';
import { kasaAc, kasaOlustur } from '../../scripts/platform/kasa.mjs';
import { veritabaniniHazirla } from '../../scripts/platform/veritabani/depo.mjs';
import { kosuKaydet, kosuyuBitir, sonucKaydet } from '../../scripts/platform/veritabani/sonuc-deposu.mjs';
import { servisAkisKosusuKaydet, servisKosusuKaydet } from '../../scripts/platform/servisler/servis-deposu.mjs';
import { nobetciApi, nobetciBaslat, type Nobetci } from './nobetci-sunucusu';
import { HIZLI_KDF, izinleriAc } from './platform-ortak';
import { sahteSoapSunucusu } from './servis-fikstur';
import { siparisModeli, siparisPaketi, TELEFON } from './senaryo-onerileri-fikstur';

type Nesne = Record<string, any>;

export type ZenginNobetci = {
  nobetci: Nobetci; parola: string; projeId: string; testId: string; canliId: string;
  ekranIdleri: string[]; senaryoIdleri: string[]; servisIdleri: string[]; soapServisId: string; restServisId: string;
  servisAkisId: string; uctanUcaId: string; kosuIdleri: string[]; kapat: () => Promise<void>;
};

const EKRAN_ADLARI = [
  'Kurumsal müşteri sipariş ve teslimat bilgileri formu',
  'Bireysel müşteri başvuru ve kimlik doğrulama ekranı (akış)',
  'Toplu ürün fiyat güncelleme ve onay süreci',
  'Kampanya tanımlama, hedef kitle seçimi ve bütçe dağıtımı (akış)',
  'İade talebi oluşturma',
  'Cari hesap ekstresi ve ödeme planı görüntüleme ekranı',
  'Stok transfer talebi (akış)',
  'Kullanıcı yetki ve rol atama yönetimi'
];

const SENARYO_KOKLERI = [
  'Geçerli bilgilerle sipariş oluşturulur ve teslimat tarihi ileri bir güne ayarlanır',
  'Zorunlu alanlar boş bırakıldığında uyarı mesajı gösterilir',
  'Giyim kategorisinde beden seçimi yapılmadan ilerlenemez',
  'Elektronik kategorisinde renk listesi kategoriye göre değişir',
  'Kupon kodu yanlış biçimde girildiğinde reddedilir',
  'Adet alanına sınır dışı değer girildiğinde iş kuralı uyarısı çıkar',
  'Hediye paketi seçildiğinde hediye notu zorunlu olur',
  'Teslimat tarihi geçmiş bir gün seçilemez',
  'Uzun sipariş notu kaydedilir ve özet ekranında kısaltılmadan görünür',
  'Telefon numarası eksik haneli girildiğinde kayıt engellenir',
  'Kitap siparişi en az adetle tamamlanır',
  'Çoklu veri tablosundaki her satır için sipariş denenir',
  'Aynı ürün ikinci kez eklendiğinde adet toplanır',
  'Oturum süresi dolduktan sonra form yeniden açılır',
  'Kategori değiştirildiğinde önceki renk seçimi temizlenir'
];

const SOAP_ADLARI = [
  'Müşteri Kimlik Doğrulama ve Risk Skorlama Servisi', 'Sipariş Oluşturma', 'Sipariş Onaylama ve Faturalandırma Servisi (v2)',
  'Teslimat Planlama', 'Kampanya Uygunluk Sorgulama Servisi', 'Cari Hesap Bakiye Sorgulama', 'Stok Rezervasyon ve Serbest Bırakma',
  'Eski Ödeme Geçidi Uyum Katmanı'
];
const REST_ADLARI = [
  'Ürün Kataloğu Arama API', 'Fiyat Listesi', 'Müşteri Adres Defteri Yönetimi API (kurumsal ve bireysel)', 'Bildirim Gönderimi',
  'Kullanıcı Oturumu ve Token Yenileme', 'Rapor Dışa Aktarma', 'İade Talepleri API', 'Belge Yükleme ve Doğrulama Servisi',
  'Döviz Kurları', 'Şube ve Bayi Listesi', 'Kargo Takip Entegrasyonu', 'Denetim Kaydı Sorgulama API'
];

const TABLO_ADLARI = [
  'Kurumsal müşteriler', 'Bireysel müşteriler (kimlik doğrulamalı)', 'Ürün kataloğu', 'Fiyat listesi 2026 dönem 1', 'Kampanya kodları',
  'Teslimat adresleri', 'Kargo firmaları', 'Şube listesi', 'Bayi listesi (bölge müdürlükleri ile)', 'Döviz kurları', 'Vergi oranları',
  'Ödeme tipleri', 'Taksit seçenekleri', 'Kart bilgileri (test)', 'İade nedenleri', 'Stok depoları', 'Kullanıcı rolleri',
  'Yetki grupları', 'Uygulama kullanıcıları', 'Servis kanal kodları', 'Hata kodları sözlüğü', 'Bildirim şablonları', 'Belge türleri',
  'Ülke ve il kodları', 'Posta kodları', 'Sektör kodları', 'Müşteri segmentleri', 'Risk skor eşikleri', 'Kampanya hedef kitleleri',
  'Bütçe kalemleri', 'Onay akışı seviyeleri', 'Fatura tipleri', 'E-posta alan adları', 'Telefon operatör kodları', 'Ürün kategorileri',
  'Beden ve renk eşlemesi', 'Kupon kodları (tek kullanımlık)', 'Tatil günleri', 'Çalışma saatleri', 'Ekran listesi çok sütunlu uzun adlı tablo örneği'
];

const sahteTc = (n: number): string => `1${String(1000000000 + n * 7919).slice(-9)}${n % 10}`.slice(0, 11);

/** Zengin sahte veriyle geçici Nöbetçi. klasor: geçici kök (veritabanı, loglar, yedekler burada). */
export async function zenginNobetciKur(klasor: string, secenek: { sonuclar?: boolean } = {}): Promise<ZenginNobetci> {
  const parola = `Gecici-Tarama-${randomBytes(6).toString('hex')}`;
  const vtYolu = join(klasor, 'platform.db');
  const vt = await veritabaniniHazirla(vtYolu);
  await kasaOlustur(vt, parola, { kdf: HIZLI_KDF });
  izinleriAc(vt);
  vt.kapat();
  const soap = await sahteSoapSunucusu();
  let nobetci = await nobetciBaslat(klasor, vtYolu, { NOBETCI_REHBER_OTOMATIK: '0' });
  const api = (yol: string, govde?: Nesne) => nobetciApi(nobetci, yol, govde) as Promise<Nesne>;
  const basarili = async (yol: string, govde?: Nesne): Promise<Nesne> => {
    const y = await api(yol, govde);
    expect(y.basarili, `${yol}: ${String(y.mesaj ?? '')}`).toBe(true);
    return y;
  };
  await basarili('/platform/kasa/ac', { parola });

  const projeId = String((await basarili('/platform/proje/kaydet', { ad: 'Kurumsal Müşteri İşlemleri ve Sipariş Yönetimi' })).proje.id);
  const testId = String((await basarili('/platform/ortam/kaydet', { projeId, ad: 'TEST', tabanUrl: 'http://127.0.0.1:9/uygulama/', varsayilan: true, riskli: false })).ortam.id);
  const canliId = String((await basarili('/platform/ortam/kaydet', { projeId, ad: 'CANLI', tabanUrl: 'http://127.0.0.1:9/canli/', riskli: true })).ortam.id);
  const ortamlar = [testId, canliId];

  // Giriş profilleri (sahte kullanıcılar).
  await basarili('/platform/giris-profili/kaydet', { projeId, ortamId: testId, ad: 'Test operatörü (tam yetkili)', kullaniciAdi: 'test.operator', parola: 'Sahte-Parola-1' });
  await basarili('/platform/giris-profili/kaydet', { projeId, ortamId: testId, ad: 'Salt okunur denetçi', kullaniciAdi: 'denetci.kullanici', parola: 'Sahte-Parola-2' });
  await basarili('/platform/giris-profili/kaydet', { projeId, ortamId: canliId, ad: 'Canlı gözlem hesabı', kullaniciAdi: 'canli.gozlem', parola: 'Sahte-Parola-3' });

  // Tablolar (40): kişi tabloları, gizli sütunlar, ortama özel satırlar, karşılıklar, çok sütunlu tablo.
  for (const [i, ad] of TABLO_ADLARI.entries()) {
    let sutunlar: Nesne[] = [{ ad: 'Kod' }, { ad: 'Açıklama' }, { ad: 'Durum' }];
    let satirlar: Nesne[] = Array.from({ length: 3 + (i % 5) }, (_, n) => ({ ad: `kayit-${n + 1}`, degerler: { Kod: `K${i}-${n}`, Açıklama: `${ad} için sahte açıklama ${n + 1}`, Durum: n % 2 ? 'Pasif' : 'Etkin' } }));
    if (ad.includes('müşteriler') || ad.includes('kullanıcıları')) {
      sutunlar = [{ ad: 'Kimlik no' }, { ad: 'Ad soyad' }, { ad: 'Telefon' }, { ad: 'E-posta' }, { ad: 'Parola', gizli: true }];
      satirlar = Array.from({ length: 6 }, (_, n) => ({
        ad: `kisi-${n + 1}`, ...(n === 5 ? { ortamId: canliId } : {}),
        degerler: { 'Kimlik no': sahteTc(i * 10 + n), 'Ad soyad': `Deneme Kişi ${n + 1}`, Telefon: `555000${String(1000 + n)}`, 'E-posta': `kisi${n + 1}@ornek.invalid`, Parola: `gizli-${n}` }
      }));
    } else if (ad.includes('Kart')) {
      sutunlar = [{ ad: 'Kart no', gizli: true }, { ad: 'Son kullanma' }, { ad: 'CVV', gizli: true }, { ad: 'Kart tipi', karsiliklar: { Kredi: { sayfa: 'Kredi kartı', servis: 'CC' }, Banka: { sayfa: 'Banka kartı', servis: 'DC' } } }];
      satirlar = [{ ad: 'kart-1', degerler: { 'Kart no': '4000000000000002', 'Son kullanma': '12/30', CVV: '123', 'Kart tipi': 'Kredi' } },
        { ad: 'kart-2', ortamId: testId, degerler: { 'Kart no': '4000000000000010', 'Son kullanma': '11/29', CVV: '456', 'Kart tipi': 'Banka' } }];
    } else if (ad.includes('çok sütunlu')) {
      sutunlar = Array.from({ length: 18 }, (_, n) => ({ ad: `Uzun sütun başlığı ${n + 1} (açıklamalı)` }));
      satirlar = Array.from({ length: 12 }, (_, r) => ({ ad: `satir-${r + 1}`, degerler: Object.fromEntries(sutunlar.map((s, n) => [s.ad, `Değer ${r + 1}.${n + 1} — uzun hücre içeriği örneği`])) }));
    } else if (ad.includes('Ödeme tipleri') || ad.includes('Kargo')) {
      sutunlar = [{ ad: 'Kod', karsiliklar: { P: { sayfa: 'Peşin', servis: 'CASH' }, T: { sayfa: 'Taksitli', servis: 'INST' } } }, { ad: 'Açıklama' }];
      satirlar = [{ ad: 'pesin', degerler: { Kod: 'P', Açıklama: 'Peşin ödeme' } }, { ad: 'taksit', ortamId: testId, degerler: { Kod: 'T', Açıklama: 'Taksitli ödeme (yalnız TEST)' } }];
    }
    await basarili('/platform/tablo/kaydet', { projeId, ad, sutunlar, satirlar });
  }

  // Ekranlar (8) ve senaryolar (5–15).
  const ekranIdleri: string[] = [];
  const senaryoIdleri: string[] = [];
  for (const [i, ad] of EKRAN_ADLARI.entries()) {
    const model = siparisModeli();
    model.id = `ekran-${i + 1}`;
    model.ad = ad;
    const paket = siparisPaketi(model);
    paket.meta.ekran.urlYolu = `/ekran-${i + 1}/`;
    await basarili('/platform/sayfa-paketi/ekle', { projeId, paket, senaryoIndeksleri: [], ortamIdleri: ortamlar });
    const liste = await basarili(`/platform/senaryolar?projeId=${projeId}&ortamId=${testId}`);
    const ekranId = String((liste.ekranlar as Nesne[]).find((e) => e.ad === ad)?.id);
    ekranIdleri.push(ekranId);
    const adet = 5 + ((i * 3) % 11);
    for (let n = 0; n < adet; n++) {
      const baslik = `${SENARYO_KOKLERI[n % SENARYO_KOKLERI.length]}${n >= SENARYO_KOKLERI.length ? ` (${n})` : ''}`;
      const veri: Nesne = { baslik, urunAdi: 'Roman', adet: 2, kategori: 'kitap', renk: 'standart', teslimatTarihi: '15.10.2026', telefon: TELEFON };
      if (n === 11) veri.urunAdi = '${Ürün kataloğu.Kod}';
      const y = await basarili('/platform/senaryo/kaydet', { projeId, ekranId, baslik, ortamIdleri: n % 4 === 3 ? [testId] : ortamlar, veri });
      senaryoIdleri.push(String(y.id));
    }
  }

  // Servisler: SOAP (sahte SOAP sunucusu, WSDL 127.0.0.1) + REST.
  const servisIdleri: string[] = [];
  const soapIdleri: string[] = [];
  for (const [i, ad] of SOAP_ADLARI.entries()) {
    const tabanlar = { [testId]: soap.adres, [canliId]: i % 3 === 0 ? '' : soap.adres };
    const e = await basarili('/platform/servis/erisim', { projeId, ortamId: testId, yol: '/Servis/ornek.asmx', tabanlar });
    const id = String((await basarili('/platform/servis/kaydet', { projeId, anahtar: `soap-${i + 1}`, ad, yol: '/Servis/ornek.asmx', tabanlar, erisimKimligi: e.erisimKimligi })).id);
    servisIdleri.push(id);
    soapIdleri.push(id);
    const zarf = (ic: string) => `<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/"><s:Body><Siparis xmlns="Ornek"><Input>${ic}</Input></Siparis></s:Body></s:Envelope>`;
    for (let n = 0; n < 2 + (i % 5); n++) {
      await basarili('/platform/servis/senaryo/kaydet', {
        projeId, servisId: id, baslik: n === 0 ? 'Giriş' : `${ad} — senaryo ${n + 1}: geçerli kimlik ile başarılı yanıt beklenir`,
        icerik: { operasyon: 'Siparis', govde: n === 0 ? zarf('<Giris/>') : zarf(`<IdentityNumber>${sahteTc(n)}</IdentityNumber>`), kontroller: [{ tur: 'icerir', deger: '<Durum>OK</Durum>' }] }
      });
    }
  }
  const restIdleri: string[] = [];
  for (const [i, ad] of REST_ADLARI.entries()) {
    const uclar = [{ ad: 'listele', metot: 'GET', yol: `/api/v1/kaynak-${i + 1}` }, { ad: 'olustur', metot: 'POST', yol: `/api/v1/kaynak-${i + 1}` },
      ...(i % 2 ? [{ ad: 'guncelle-uzun-uc-adi-ornegi', metot: 'PUT', yol: `/api/v1/kaynak-${i + 1}/{id}/ayrintilar/alt-kaynak` }] : [])];
    const s = await basarili('/platform/servis/rest/kaydet', { projeId, anahtar: `rest-${i + 1}`, ad, uclar });
    const id = String(s.id ?? s.servis?.id);
    servisIdleri.push(id);
    restIdleri.push(id);
    for (let n = 0; n < 1 + (i % 4); n++) {
      await basarili('/platform/servis/senaryo/kaydet', {
        projeId, servisId: id, baslik: `${ad}: ${n ? 'kayıt oluşturulur ve 201 döner' : 'liste 200 ile döner'}`,
        icerik: { operasyon: n ? 'olustur' : 'listele', govde: n ? '{"ad":"Deneme"}' : '', http: { metot: n ? 'POST' : 'GET', yol: `/api/v1/kaynak-${i + 1}` }, kontroller: [{ tur: 'durumKodu', deger: n ? '201' : '200' }] }
      });
    }
  }
  const soapServisId = soapIdleri[0];
  const restServisId = restIdleri[0];

  // Taban adresleri: adlandırılmış gruplar.
  await basarili('/platform/servis-tabanlari/uygula', {
    projeId, onay: true,
    degisiklikler: Object.fromEntries(restIdleri.map((id, i) => [id, { tabanlar: { [testId]: 'http://127.0.0.1:9', [canliId]: i % 4 === 0 ? '' : 'http://127.0.0.1:9' }, grup: i % 3 === 0 ? 'Ortak API ağ geçidi (kurumsal)' : i % 3 === 1 ? 'Katalog' : null }]))
  });

  // Servis akışları + akış senaryosu.
  const soapServis = await basarili(`/platform/servis?projeId=${projeId}&id=${soapServisId}`);
  const giris = (soapServis.senaryolar as Nesne[]).find((x) => x.baslik === 'Giriş');
  const oturum = await basarili('/platform/servis-akisi/kaydet', { projeId, baslik: 'Kurumsal giriş oturumu (token)', tur: 'oturum', icerik: {
    adimlar: [{ ad: 'Giriş', servisId: soapServisId, senaryoId: giris?.id, okumalar: [{ ad: 'Token', yol: '//Sonuc/Token' }] }], omurSaniye: 600 } });
  const servisAkis = await basarili('/platform/servis-akisi/kaydet', { projeId, baslik: 'Sipariş oluştur → onayla → faturalandır (uzun akış adı)', tur: 'akis', kapsam: 'ikisi', icerik: { adimlar: [
    { id: 'a1', ad: 'Sipariş oluştur', tur: 'operasyon', servisId: soapIdleri[1], operasyon: 'Siparis', okumalar: [{ ad: 'SiparisNo', yol: '//Sonuc/Durum' }] },
    { id: 'a2', ad: 'Sipariş onayla', tur: 'operasyon', servisId: soapIdleri[2], operasyon: 'Onayla' }
  ] } });
  await basarili('/platform/servis-akisi/kaydet', { projeId, baslik: 'Stok rezervasyonu', tur: 'akis', kapsam: 'test', icerik: { adimlar: [
    { id: 'b1', ad: 'Rezerve et', tur: 'operasyon', servisId: soapIdleri[6], operasyon: 'Siparis' }] } });
  await basarili('/platform/servis/akis-senaryosu/kaydet', { projeId, servisId: soapIdleri[1], baslik: 'Sipariş ve onay akış senaryosu', icerik: { tur: 'akis', akisId: servisAkis.id, adimlar: {} } });
  void oturum;

  // Uçtan uca akış: servis → ekran → servis.
  const ekranSenaryoId = senaryoIdleri[0];
  const uctanUca = await basarili('/platform/uctan-uca/kaydet', { projeId, baslik: 'Kurumsal sipariş: servis girişinden ekran kaydına ve fatura kontrolüne', kapsam: 'ikisi', icerik: { adimlar: [
    { id: 's1', ad: 'Giriş', servisId: soapServisId, senaryoId: giris?.id, okumalar: [{ ad: 'Token', yol: '//Sonuc/Token' }] },
    { id: 'e1', ad: 'Sipariş formu', tur: 'ekran', senaryoId: ekranSenaryoId, ezmeler: { siparisNotu: 'Not ${akis:Token}' }, okumalar: [{ ad: 'OnayNo', yol: '#onay' }] },
    { id: 's2', ad: 'Onay kontrolü', servisId: soapServisId, senaryoId: giris?.id, okumalar: [] }
  ] } });

  // Veritabanı bağlantıları + veritabanı eşlemesi (bağlantı kurulmaz).
  const bag = async (ad: string, ortamId: string) => String((await basarili('/platform/entegrasyon/kaydet', {
    projeId, tur: 'veritabani', ad, ortamIdleri: [ortamId], alanlar: { surucu: 'postgres', sunucu: '127.0.0.1', veritabani: 'uyg', kullanici: 'okur', parola: 'sahte-parola', yalnizOkuma: true }
  })).baglanti.id);
  const bTest = await bag('siparis-veritabani-TEST', testId);
  const bCanli = await bag('siparis-veritabani-CANLI', canliId);
  await basarili('/platform/sql/veritabani/kaydet', { projeId, ad: 'Sipariş veritabanı (raporlama kopyası)', eslemeler: { [testId]: bTest, [canliId]: bCanli } });

  // Planlı koşu kuralları (pasif: gerçek tetikleme olmaz).
  await basarili('/platform/zamanlanmis-kosu/kaydet', { projeId, kural: { ad: 'Gece tam koşu (tüm ekranlar ve servisler)', ortamId: testId, zaman: { tur: 'gunluk', saat: '02:30' }, etkin: false } });
  await basarili('/platform/zamanlanmis-kosu/kaydet', { projeId, kural: { ad: 'Canlı duman testi', ortamId: canliId, zaman: { tur: 'haftalik', saat: '07:00', gunler: [1, 3, 5] }, etkin: false, canliOnay: true } });

  // İzinlerin bir kısmı kapalı.
  for (const anahtar of ['veritabani-yazma', 'dis-gonderim', 'canli-ortam']) await api('/platform/izin/degistir', { anahtar, acik: false, onay: true });

  // Sahte koşu sonuçları: sunucu durdurulur, sonuç deposuna doğrudan yazılır, sunucu yeniden başlar.
  const kosuIdleri: string[] = [];
  if (secenek.sonuclar !== false) {
    const liste = await basarili(`/platform/senaryolar?projeId=${projeId}`);
    const ekranlar = (liste.ekranlar as Nesne[]).map((e): Nesne => ({ ...e, senaryolar: (liste.senaryolar as Nesne[]).filter((s) => s.ekranId === e.id) }));
    nobetci.surec.kill('SIGTERM');
    await new Promise((r) => setTimeout(r, 800));
    const db = await veritabaniniHazirla(vtYolu);
    await kasaAc(db, parola);
    const z = (gun: number, dk: number): string => new Date(Date.UTC(2026, 8, 20 + gun, 8, dk)).toISOString();
    const hataMesajlari = [
      'Error: expect(locator).toBeVisible() failed\nLocator: getByRole(\'button\', { name: \'Kaydet\' })\nExpected: visible\nReceived: hidden',
      'TimeoutError: page.waitForURL: Timeout 15000ms exceeded.',
      'Error: İş kuralı uyarısı beklenmiyordu: "Lütfen adet giriniz."'
    ];
    for (let k = 0; k < 4; k++) {
      const id = `tarama-kosu-${k + 1}`;
      kosuIdleri.push(id);
      kosuKaydet(db, { id, projeId, ortamId: k === 3 ? canliId : testId, tur: 'tam', kapsam: 'Genel', baslangic: z(k, 0), ...(k === 2 ? { tekrarKaynagi: 'tarama-kosu-2' } : {}) });
      for (const [ei, e] of ekranlar.entries()) {
        for (const [si, s] of (e.senaryolar as Nesne[]).entries()) {
          if (k === 2 && (si + ei) % 3) continue; // tekrar koşusu: yalnız bir kısmı
          const durum = (si + k + ei) % 7 === 0 ? 'basarisiz' : (si + k) % 11 === 5 ? 'atlanan' : 'basarili';
          const veriKosusu = si === 11 ? { anahtar: `vk-${ei}`, ad: 'Ürün kataloğu · kayit-1', modelSurumu: 1, satirlar: [{ grup: 'Ürün kataloğu', tablo: 'Ürün kataloğu', satirId: 'satir1', satirAdi: 'kayit-1', degerler: { Kod: 'K2-0' }, gizliSutunlar: [] }] } : undefined;
          sonucKaydet(db, {
            kosuId: id, projeId, senaryoId: String(s.id), senaryoBaslik: String(s.baslik), urunAdi: String(e.ad), senaryoAnahtari: `${e.anahtar ?? e.id}::${s.baslik}`,
            durum, testKimligi: `${s.id}-${k}`, bitis: z(k, 1 + si), sureMs: 1500 + si * 230 + k * 100,
            ...(durum === 'basarisiz' ? { hataMesaji: hataMesajlari[(si + ei) % 3] } : {}),
            adimlar: [{ ad: 'Ürün seçimi', durum: 'basarili', sureMs: 400 }, { ad: 'Teslimat bilgileri', durum: durum === 'basarisiz' ? 'basarisiz' : durum === 'atlanan' ? 'atlanan' : 'basarili', sureMs: 700 }],
            ...(veriKosusu ? { veriKosusu } : {})
          });
        }
      }
      kosuyuBitir(db, id, { durum: 'tamamlandi', bitis: z(k, 40) });
    }
    // Servis koşuları ve servis akış koşuları.
    for (let k = 0; k < 2; k++) {
      for (const [i, sid] of servisIdleri.slice(0, 10).entries()) {
        servisKosusuKaydet(db, {
          projeId, servisId: sid, ortamId: testId, tur: 'kosu', durum: (i + k) % 4 === 0 ? 'basarisiz' : (i + k) % 9 === 0 ? 'hata' : 'basarili',
          baslangic: new Date(Date.UTC(2026, 8, 22 + k, 9, i)).toISOString(), sureMs: 300 + i * 40, baslik: `Senaryo ${i + 1}: yanıt denetimi`,
          sonuc: { durumKodu: (i + k) % 4 === 0 ? 500 : 200, kontroller: [{ ad: 'Durum kodu', tur: 'durumKodu', gecti: (i + k) % 4 !== 0, aciklama: (i + k) % 4 === 0 ? 'beklenen 200, gelen 500' : '200' }], istek: '<Giris/>', yanit: '<Durum>OK</Durum>', ozet: 'özet' }
        });
      }
      servisAkisKosusuKaydet(db, {
        projeId, akisId: String(servisAkis.id), ortamId: testId, tur: 'kosu', durum: k ? 'basarili' : 'basarisiz', baslangic: new Date(Date.UTC(2026, 8, 22 + k, 10, 0)).toISOString(), sureMs: 1200,
        sonuc: { adimlar: [{ ad: 'Sipariş oluştur', durum: 'basarili' }, { ad: 'Sipariş onayla', durum: k ? 'basarili' : 'basarisiz', hata: k ? undefined : 'beklenen OK' }] }
      });
    }
    db.kapat();
    nobetci = await nobetciBaslat(klasor, vtYolu, { NOBETCI_REHBER_OTOMATIK: '0' });
    await nobetciApi(nobetci, '/platform/kasa/ac', { parola });
  }

  return {
    get nobetci() { return nobetci; }, parola, projeId, testId, canliId, ekranIdleri, senaryoIdleri, servisIdleri, soapServisId, restServisId,
    servisAkisId: String(servisAkis.id), uctanUcaId: String(uctanUca.id ?? uctanUca.akis?.id ?? ''), kosuIdleri,
    kapat: async () => { nobetci?.surec.kill('SIGTERM'); await soap.kapat(); }
  };
}
